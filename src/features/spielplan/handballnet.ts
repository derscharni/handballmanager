import type { ImportCandidate } from './ics'

/**
 * handball.net-Import: URL-Ableitung + defensiver Parser für die
 * öffentliche Spielplan-API. Reine Funktionen (bis auf fetchSchedule).
 */

/**
 * Extrahiert die Team-ID aus einer handball.net-Mannschafts-URL,
 * z.B. https://www.handball.net/mannschaften/tus-koeln-ehrenfeld-1 → tus-koeln-ehrenfeld-1
 */
export function extractTeamId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  let path: string
  try {
    path = new URL(trimmed).pathname
  } catch {
    path = trimmed
  }
  const segs = path.split('/').filter(Boolean)
  const idx = segs.indexOf('mannschaften')
  const id = idx >= 0 && segs[idx + 1] ? segs[idx + 1] : segs[segs.length - 1]
  return id && id !== 'mannschaften' ? id : null
}

/** Kandidaten-URL der öffentlichen Spielplan-API. */
export function buildScheduleApiUrl(teamId: string): string {
  return `https://www.handball.net/a/sportdata/1/teams/${encodeURIComponent(teamId)}/schedule?ca=0`
}

/** Fetch mit kurzem Timeout — scheitert im Browser häufig an CORS. */
export async function fetchSchedule(apiUrl: string, timeoutMs = 6000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(apiUrl, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Liest einen Team-/Hallennamen aus string oder {name}-Objekt. */
function readName(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (isRecord(v) && typeof v.name === 'string' && v.name.trim()) return v.name.trim()
  return undefined
}

/** startsAt (ISO-String oder Epoch-ms) → lokales Datum + Uhrzeit. */
export function parseStartsAt(v: unknown): { date: string; time?: string } | null {
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{10,}$/.test(v.trim()))) {
    const dt = new Date(Number(v))
    if (Number.isNaN(dt.getTime())) return null
    return {
      date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
      time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
    }
  }
  if (typeof v !== 'string') return null
  const s = v.trim()
  // ISO ohne Zeitzonen-Angabe → wörtlich übernehmen
  const literal = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/)
  if (literal) return { date: literal[1], time: literal[2] }
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (dateOnly) return { date: dateOnly[1] }
  // Mit Z/Offset → in lokale Zeit umrechnen
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return null
  return {
    date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
    time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`,
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-zä-ü0-9]+/gi, ' ').trim()
}

/** Wie viele Tokens des Vereinsnamens kommen im Teamnamen vor? */
function clubMatchScore(teamName: string, clubName: string): number {
  const name = ` ${norm(teamName)} `
  const tokens = norm(clubName).split(' ').filter((t) => t.length >= 2)
  let score = 0
  for (const t of tokens) if (name.includes(` ${t} `)) score++
  return score
}

/**
 * Parst die handball.net-Antwort defensiv.
 * Akzeptiert {data:[...]} oder [...]; wirft Error mit verständlicher
 * Meldung bei unbekanntem Format ("Format nicht erkannt"-Anzeige).
 */
export function parseHandballNetSchedule(raw: unknown, clubName: string): ImportCandidate[] {
  let input: unknown = raw
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input) as unknown
    } catch (e) {
      throw new Error(`Kein gültiges JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  let games: unknown[]
  if (Array.isArray(input)) {
    games = input
  } else if (isRecord(input) && Array.isArray(input.data)) {
    games = input.data
  } else if (isRecord(input) && isRecord(input.data) && Array.isArray(input.data.games)) {
    games = input.data.games
  } else {
    throw new Error('Weder ein Array noch ein Objekt mit "data"-Liste gefunden.')
  }

  const out: ImportCandidate[] = []
  let firstError: string | null = null
  for (const g of games) {
    if (!isRecord(g)) {
      firstError ??= 'Eintrag ist kein Objekt.'
      continue
    }
    const when = parseStartsAt(g.startsAt)
    if (!when) {
      firstError ??= `Kein lesbares "startsAt" (Wert: ${JSON.stringify(g.startsAt)}).`
      continue
    }
    const homeName = readName(g.homeTeam)
    const awayName = readName(g.awayTeam)
    const hall = readName(g.field) ?? readName(g.hall)

    let home: boolean | undefined
    let opponentName: string | undefined
    if (homeName || awayName) {
      const hs = homeName ? clubMatchScore(homeName, clubName) : 0
      const as = awayName ? clubMatchScore(awayName, clubName) : 0
      if (hs >= as && hs > 0) {
        home = true
        opponentName = awayName
      } else if (as > 0) {
        home = false
        opponentName = homeName
      } else {
        home = true
        opponentName = awayName ?? homeName
      }
    }

    out.push({
      externalId: typeof g.id === 'string' || typeof g.id === 'number' ? String(g.id) : undefined,
      kind: 'match',
      date: when.date,
      time: when.time,
      home,
      opponentName,
      hall,
      title: homeName && awayName ? `${homeName} - ${awayName}` : (homeName ?? awayName ?? 'Spiel'),
    })
  }
  if (out.length === 0) {
    throw new Error(firstError ?? 'Liste enthält keine lesbaren Spiele.')
  }
  return out
}
