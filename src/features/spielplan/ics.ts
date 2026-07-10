import type { EventKind } from '../../lib/types'

/**
 * ICS-Parser (iCalendar) für den Spielplan-Import.
 * Reine Funktionen ohne Seiteneffekte — getestet in ics.test.ts.
 */

/** Geparster VEVENT-Block (nur die Felder, die wir brauchen). */
export interface IcsVevent {
  uid?: string
  summary?: string
  location?: string
  /** ISO-Datum YYYY-MM-DD. */
  date?: string
  /** Uhrzeit HH:MM (lokal). */
  time?: string
}

/** Import-Kandidat — gemeinsames Format für ICS- und handball.net-Import. */
export interface ImportCandidate {
  externalId?: string
  kind: EventKind
  date: string
  time?: string
  home?: boolean
  opponentName?: string
  hall?: string
  /** Original-Titel zur Anzeige in der Vorschau. */
  title: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Entfaltet "gefaltete" ICS-Zeilen (RFC 5545): Zeilen, die mit Space/Tab
 * beginnen, sind Fortsetzungen der Vorzeile. CRLF und LF werden akzeptiert.
 */
export function unfoldIcsLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out.filter((l) => l.trim().length > 0)
}

/** Hebt ICS-Escaping auf (\n, \, \; \\). */
export function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/**
 * Parst einen DTSTART-Wert.
 * Unterstützt: YYYYMMDD, YYYYMMDDTHHMMSS, YYYYMMDDTHHMMSSZ.
 * Trailing Z = UTC → wird in lokale Zeit umgerechnet; sonst wörtlich
 * übernommen (auch bei TZID-Param — pragmatisch, da Spielpläne lokal sind).
 */
export function parseDtStart(value: string): { date: string; time?: string } | null {
  const m = value
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, , z] = m
  if (h === undefined || mi === undefined) {
    return { date: `${y}-${mo}-${d}` }
  }
  if (z) {
    const dt = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)),
    )
    return {
      date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
      time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
    }
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }
}

/**
 * Parst einen kompletten ICS-Text in VEVENT-Objekte.
 * Unbekannte Properties werden ignoriert; Events ohne DTSTART verworfen.
 */
export function parseIcs(text: string): IcsVevent[] {
  const lines = unfoldIcsLines(text)
  const events: IcsVevent[] = []
  let current: IcsVevent | null = null

  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const left = line.slice(0, colon)
    const value = line.slice(colon + 1).trim()
    const name = (left.split(';')[0] ?? '').trim().toUpperCase()

    if (name === 'BEGIN' && value.toUpperCase() === 'VEVENT') {
      current = {}
      continue
    }
    if (name === 'END' && value.toUpperCase() === 'VEVENT') {
      if (current && current.date) events.push(current)
      current = null
      continue
    }
    if (!current) continue

    switch (name) {
      case 'UID':
        current.uid = value
        break
      case 'SUMMARY':
        current.summary = unescapeIcsText(value)
        break
      case 'LOCATION':
        current.location = unescapeIcsText(value)
        break
      case 'DTSTART': {
        const parsed = parseDtStart(value)
        if (parsed) {
          current.date = parsed.date
          current.time = parsed.time
        }
        break
      }
      default:
        break
    }
  }
  return events
}

/** Trennt "A - B" bzw. "A vs B" in zwei Teams, sonst null. */
function splitTeams(summary: string): [string, string] | null {
  const dash = summary.split(/\s+[-–]\s+/)
  if (dash.length >= 2 && dash[0] && dash[1]) {
    return [dash[0].trim(), dash.slice(1).join(' - ').trim()]
  }
  const vs = summary.split(/\s+vs\.?\s+/i)
  if (vs.length >= 2 && vs[0] && vs[1]) {
    return [vs[0].trim(), vs.slice(1).join(' vs ').trim()]
  }
  return null
}

/** Beginnt der Name mit einem Fragment des eigenen Vereinsnamens? */
export function startsWithOwnClub(name: string, clubName: string): boolean {
  const n = name.trim().toLowerCase()
  if (!n) return false
  const club = clubName.trim().toLowerCase()
  if (club && n.startsWith(club)) return true
  const frag = (clubName.trim().split(/\s+/)[0] ?? '').toLowerCase()
  return frag.length >= 2 && n.startsWith(frag)
}

/** Spiel oder Training? " - " oder "vs" im Titel ⇒ Spiel. */
export function detectKind(summary: string): EventKind {
  if (summary.includes(' - ') || /\bvs\b/i.test(summary)) return 'match'
  return 'training'
}

/**
 * Mappt VEVENTs auf Import-Kandidaten.
 * Heim/Auswärts-Heuristik: Titel beginnt mit eigenem Vereinsnamen ⇒ Heim.
 * Gegnername = bereinigter Rest des Titels.
 */
export function icsToCandidates(events: IcsVevent[], clubName: string): ImportCandidate[] {
  const out: ImportCandidate[] = []
  for (const ev of events) {
    if (!ev.date) continue
    const summary = (ev.summary ?? '').trim()
    const kind = detectKind(summary || '')
    const cand: ImportCandidate = {
      externalId: ev.uid,
      kind,
      date: ev.date,
      time: ev.time,
      hall: ev.location?.trim() || undefined,
      title: summary || 'Termin',
    }
    if (kind === 'match') {
      const teams = splitTeams(summary)
      if (teams) {
        const [a, b] = teams
        if (startsWithOwnClub(a, clubName)) {
          cand.home = true
          cand.opponentName = b
        } else if (startsWithOwnClub(b, clubName)) {
          cand.home = false
          cand.opponentName = a
        } else {
          cand.home = startsWithOwnClub(summary, clubName)
          cand.opponentName = cand.home ? b : a
        }
      } else {
        cand.home = startsWithOwnClub(summary, clubName)
        cand.opponentName = summary || undefined
      }
    }
    out.push(cand)
  }
  return out
}
