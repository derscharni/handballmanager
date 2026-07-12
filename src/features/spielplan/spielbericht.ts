import type { Player } from '../../lib/types'

/**
 * PDF-Spielbericht-Parser (nuLiga/nuScore) — reine Funktionen, testbar.
 *
 * Pipeline:
 * 1. pdf.ts extrahiert Text-Items MIT Koordinaten (pdfjs getTextContent).
 * 2. reconstructLines() baut daraus Zeilen: Items pro Seite nach gerundetem y
 *    gruppieren, innerhalb der Zeile nach x sortieren (nuLiga ist tabellarisch).
 * 3. parseRow() erkennt Spielerinnen-Zeilen ("7 Köhler, Marie 4/2 2" u.Ä.).
 * 4. extractBlocks() gruppiert aufeinanderfolgende Zeilen zu Team-Blöcken
 *    (Heim/Gast), findOwnBlockIndex() wählt unseren Block via Vereinsname.
 * 5. matchPlayer() ordnet PDF-Namen tolerant dem Kader zu (Normalisierung,
 *    startsWith, Levenshtein ≤ 2, Trikotnummer als Fallback).
 */

export interface PdfTextItem {
  str: string
  /** x-Koordinate (linke Kante) in PDF-Punkten. */
  x: number
  /** y-Koordinate (Grundlinie) in PDF-Punkten — wächst nach OBEN. */
  y: number
  /** Breite des Items, falls bekannt (für lückenlose Fragmente wie "4","/","2"). */
  width?: number
}

export interface BerichtRow {
  /** Trikotnummer, falls in der Zeile vorhanden. */
  number?: number
  lastName: string
  firstName: string
  /** Tore gesamt (inkl. 7m). */
  goals: number
  /** Davon 7-Meter, falls als "4/2" notiert. */
  goals7m?: number
  /** Anzahl 2-Minuten-Strafen, falls erkennbar. */
  twoMin?: number
  /** Originalzeile für Anzeige/Debug. */
  raw: string
}

export interface BerichtBlock {
  rows: BerichtRow[]
  /** Bis zu 6 Zeilen unmittelbar vor dem Block (für Team-Erkennung). */
  context: string[]
}

/* ---------- 1) Zeilen-Rekonstruktion ---------- */

/** Wie viel y-Abstand noch als "gleiche Zeile" gilt (PDF-Punkte). */
const Y_TOLERANCE = 2.5
/** Ab dieser x-Lücke zwischen Items wird ein Leerzeichen eingefügt. */
const GAP_SPACE = 1.5

function joinLine(items: PdfTextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  let out = ''
  let prevEnd: number | null = null
  for (const it of sorted) {
    const gap = prevEnd == null ? Number.POSITIVE_INFINITY : it.x - prevEnd
    if (out !== '' && gap > GAP_SPACE) out += ' '
    out += it.str
    // Fallback-Breite, falls pdfjs keine liefert (grobe Schätzung reicht hier)
    prevEnd = it.x + (it.width ?? it.str.length * 5)
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Gruppiert Text-Items einer Seite zu Zeilen (y gerundet, Toleranz),
 * sortiert innerhalb der Zeile nach x. Ergebnis: oben → unten.
 */
export function reconstructLines(items: PdfTextItem[], yTol = Y_TOLERANCE): string[] {
  const usable = items.filter((i) => i.str.trim() !== '')
  // y absteigend (PDF: oben = großes y), bei Gleichstand x aufsteigend
  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; items: PdfTextItem[] }[] = []
  for (const it of sorted) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(line.y - it.y) <= yTol) line.items.push(it)
    else lines.push({ y: it.y, items: [it] })
  }
  return lines.map((l) => joinLine(l.items)).filter((s) => s !== '')
}

/* ---------- 2) Zeilen-Parser ---------- */

/** Wörter, die auf Tabellenköpfe statt Namen hindeuten. */
const HEADER_WORDS = new Set([
  'nr', 'name', 'nachname', 'vorname', 'tore', 'spieler', 'spielerin',
  'verwarnung', 'zeitstrafe', 'hinausstellung',
])

/** "4" oder "4/2" (Tore gesamt / davon 7m) bzw. 2-min-Anzahl. */
const STAT_TOKEN = /^\d{1,2}(?:\/\d{1,2})?$/
/** Minutenangabe wie "12:33" (2-min-/Verwarnungs-Spalten). */
const TIME_TOKEN = /^\d{1,2}:\d{2}$/

/**
 * Erkennt eine Spielerinnen-Zeile, tolerant gegenüber Varianten:
 * "1 Köhler, Marie", "Köhler, Marie 4/2 2", "13 Müller-Lüdenscheidt, Anna-Lena 3".
 * Gibt null zurück, wenn die Zeile keine Kader-Zeile ist.
 */
export function parseRow(line: string): BerichtRow | null {
  // "4 / 2" (PDF-Fragmente) → "4/2"
  const cleaned = line.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2').trim()
  const m = /^(?:(\d{1,2})\s+)?([A-ZÄÖÜ][A-Za-zÄÖÜäöüß' .-]{0,34}?)\s*,\s*(\S.*)$/.exec(cleaned)
  if (!m) return null
  const lastName = m[2].trim()

  const tokens = m[3].trim().split(/\s+/)
  const nameTokens: string[] = []
  const statTokens: string[] = []
  let inStats = false
  for (const t of tokens) {
    if (!inStats && (STAT_TOKEN.test(t) || TIME_TOKEN.test(t))) inStats = true
    if (inStats) statTokens.push(t)
    else nameTokens.push(t)
  }
  if (nameTokens.length === 0) return null
  const firstName = nameTokens.join(' ').trim()
  if (!/^[A-Za-zÄÖÜäöü]/.test(firstName)) return null

  // Tabellenkopf-Zeilen wie "Nr Name, Vorname Tore" aussortieren
  const words = `${lastName} ${firstName}`.toLowerCase().split(/[^a-zäöüß]+/)
  if (words.some((w) => HEADER_WORDS.has(w))) return null

  let goals = 0
  let goals7m: number | undefined
  let twoMin: number | undefined
  let goalsSeen = false
  let timeCount = 0
  for (const t of statTokens) {
    if (TIME_TOKEN.test(t)) {
      timeCount += 1
      continue
    }
    if (!STAT_TOKEN.test(t)) continue
    if (!goalsSeen) {
      const [g, s] = t.split('/')
      goals = Number.parseInt(g, 10)
      if (s != null) goals7m = Number.parseInt(s, 10)
      goalsSeen = true
    } else if (twoMin == null) {
      twoMin = Number.parseInt(t, 10)
    }
  }
  // Explizite Minutenangaben (je Eintrag eine 2-min-Strafe) schlagen die Zählspalte
  if (timeCount > 0) twoMin = timeCount

  return {
    number: m[1] != null ? Number.parseInt(m[1], 10) : undefined,
    lastName,
    firstName,
    goals,
    goals7m,
    twoMin,
    raw: line.trim(),
  }
}

/* ---------- 3) Team-Blöcke ---------- */

/** Maximal so viele Nicht-Spielerinnen-Zeilen dürfen INNERHALB eines Blocks liegen. */
const MAX_HOLE = 1
/** Ein Block muss mindestens so viele Zeilen haben (filtert Einzeltreffer/Fehlalarme). */
const MIN_BLOCK_ROWS = 2
/** So viele Zeilen vor dem Block werden als Kontext (Teamname etc.) mitgenommen. */
const CONTEXT_LINES = 6

/** Gruppiert erkannte Spielerinnen-Zeilen zu Team-Blöcken (typisch: Heim + Gast). */
export function extractBlocks(lines: string[]): BerichtBlock[] {
  const hits: { idx: number; row: BerichtRow }[] = []
  lines.forEach((l, idx) => {
    const row = parseRow(l)
    if (row) hits.push({ idx, row })
  })

  const blocks: BerichtBlock[] = []
  let cur: { start: number; lastIdx: number; rows: BerichtRow[] } | null = null
  const flush = () => {
    if (cur && cur.rows.length >= MIN_BLOCK_ROWS) {
      blocks.push({
        rows: cur.rows,
        context: lines.slice(Math.max(0, cur.start - CONTEXT_LINES), cur.start),
      })
    }
  }
  for (const h of hits) {
    if (cur && h.idx - cur.lastIdx <= MAX_HOLE + 1) {
      cur.rows.push(h.row)
      cur.lastIdx = h.idx
    } else {
      flush()
      cur = { start: h.idx, lastIdx: h.idx, rows: [h.row] }
    }
  }
  flush()
  return blocks
}

/** Generische Vereins-Kürzel, die bei der Vereinsnamen-Suche nichts aussagen. */
const GENERIC_CLUB_WORDS = new Set([
  'tus', 'tsv', 'tv', 'sv', 'sc', 'sg', 'hsg', 'hc', 'vfl', 'vfb', 'djk', 'fc',
  'ev', 'damen', 'herren', 'jugend', 'handball', 'verein',
])

/** Aussagekräftige Namensfragmente aus dem Vereinsnamen (z.B. "koeln", "ehrenfeld"). */
export function clubFragments(clubName: string): string[] {
  return normalizeName(clubName)
    .split(' ')
    .filter((w) => w.length >= 4 && !GENERIC_CLUB_WORDS.has(w))
}

/**
 * Findet den Block unseres Vereins über Namensfragmente im Block-Kontext.
 * -1 = nicht eindeutig (dann in der UI Block A/B wählen lassen).
 */
export function findOwnBlockIndex(blocks: BerichtBlock[], clubName: string): number {
  const frags = clubFragments(clubName)
  if (frags.length === 0 || blocks.length === 0) return -1
  const scores = blocks.map((b) => {
    const ctx = normalizeName(b.context.join(' '))
    return frags.filter((f) => ctx.includes(f)).length
  })
  const max = Math.max(...scores)
  if (max === 0) return -1
  const best = scores.flatMap((s, i) => (s === max ? [i] : []))
  return best.length === 1 ? best[0] : -1
}

/** Versucht, aus dem Block-Kontext den Teamnamen zu erraten (für die Blockwahl-UI). */
export function guessBlockTeam(block: BerichtBlock): string | null {
  for (let i = block.context.length - 1; i >= 0; i--) {
    const line = block.context[i].trim()
    if (line.length < 5) continue
    if (/vorname|nachname|tore|geb\.|zeitstrafe|verwarnung|hinausstellung/i.test(line)) continue
    if (!/[A-Za-zÄÖÜäöü]{3}/.test(line)) continue
    const stripped = line.replace(/^(heimmannschaft|gastmannschaft|heim|gast)\s*:?\s*/i, '').trim()
    return stripped || line
  }
  return null
}

/* ---------- 4) Kader-Zuordnung ---------- */

/** Normalisiert Namen für Vergleiche: klein, Umlaute ausgeschrieben, nur Buchstaben. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Klassische Levenshtein-Distanz (klein & ausreichend für Namen). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * Ordnet eine Spielbericht-Zeile tolerant einer Kader-Spielerin zu.
 * Reihenfolge: exakter Treffer → startsWith beim Vornamen → eindeutiger
 * Nachname → Levenshtein ≤ 2 → eindeutige Trikotnummer. null = kein Treffer.
 */
export function matchPlayer(row: BerichtRow, players: Player[]): Player | null {
  const rl = normalizeName(row.lastName)
  const rf = normalizeName(row.firstName)
  if (rl === '') return null

  const sameLast = players.filter((p) => normalizeName(p.lastName) === rl)
  const exact = sameLast.find((p) => normalizeName(p.firstName) === rf)
  if (exact) return exact
  const starts = sameLast.filter((p) => {
    const pf = normalizeName(p.firstName)
    return pf !== '' && rf !== '' && (pf.startsWith(rf) || rf.startsWith(pf))
  })
  if (starts.length === 1) return starts[0]
  // Nachname eindeutig im Kader → akzeptieren, wenn der Vorname nicht klar widerspricht
  if (sameLast.length === 1) {
    const pf = normalizeName(sameLast[0].firstName)
    if (rf === '' || pf === '' || pf[0] === rf[0]) return sameLast[0]
  }

  const fuzzy = players.filter((p) => {
    if (levenshtein(normalizeName(p.lastName), rl) > 2) return false
    const pf = normalizeName(p.firstName)
    return pf.startsWith(rf) || rf.startsWith(pf) || levenshtein(pf, rf) <= 2
  })
  if (fuzzy.length === 1) return fuzzy[0]

  if (row.number != null) {
    const byNumber = players.filter((p) => p.number === row.number)
    if (byNumber.length === 1) return byNumber[0]
  }
  return null
}
