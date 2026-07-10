import type { Absence, Appearance, MatchEvent, Note } from '../../lib/types'
import { daysBetween } from '../../lib/format'

/** Reine Berechnungs-Helfer für den Statistik-Screen — alles live aus Dexie-Daten. */

/** Gespieltes Meisterschaftsspiel: Ergebnis liegt vor. */
export function isPlayedMatch(e: MatchEvent): boolean {
  return e.kind === 'match' && e.goalsUs != null && e.goalsThem != null
}

export type Outcome = 'S' | 'U' | 'N'

export function matchOutcome(e: MatchEvent): Outcome {
  const us = e.goalsUs ?? 0
  const them = e.goalsThem ?? 0
  if (us > them) return 'S'
  if (us < them) return 'N'
  return 'U'
}

export interface TeamRecord {
  games: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  diff: number
}

export function computeRecord(matches: MatchEvent[]): TeamRecord {
  const r: TeamRecord = {
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    diff: 0,
  }
  for (const m of matches) {
    r.games += 1
    r.goalsFor += m.goalsUs ?? 0
    r.goalsAgainst += m.goalsThem ?? 0
    const o = matchOutcome(m)
    if (o === 'S') r.wins += 1
    else if (o === 'U') r.draws += 1
    else r.losses += 1
  }
  r.diff = r.goalsFor - r.goalsAgainst
  return r
}

export interface RatingPoint {
  date: string
  /** Ggf. Mittelwert mehrerer Bewertungen am selben Tag. */
  value: number
}

/**
 * Bewertungsverlauf einer Spielerin: Trainings-/Spiel-Notizen (notes.rating)
 * und Spielbewertungen (appearances.rating), pro Datum gemittelt, sortiert.
 */
export function ratingPoints(
  playerId: string,
  notes: Note[],
  appearances: Appearance[],
): RatingPoint[] {
  const byDate = new Map<string, number[]>()
  const push = (date: string, v: number) => {
    const arr = byDate.get(date)
    if (arr) arr.push(v)
    else byDate.set(date, [v])
  }
  for (const n of notes) {
    if (n.playerId === playerId && n.rating != null) push(n.date, n.rating)
  }
  for (const a of appearances) {
    if (a.playerId === playerId && a.rating != null) push(a.date, a.rating)
  }
  return [...byDate.entries()]
    .map(([date, vals]) => ({ date, value: avg(vals) ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

/** "3,7" — deutsche Dezimaldarstellung mit 1 Nachkommastelle. */
export function fmtAvg(v: number): string {
  return v.toFixed(1).replace('.', ',')
}

/**
 * Abwesenheitstage einer Spielerin im Fenster [from, to] (beide inklusiv).
 * Überlappende Einträge werden über eine Tagesmenge dedupliziert.
 */
export function absentDaysInWindow(
  absences: Absence[],
  playerId: string,
  from: string,
  to: string,
): number {
  if (from > to) return 0
  const days = new Set<number>()
  for (const a of absences) {
    if (a.playerId !== playerId) continue
    const start = a.from > from ? a.from : from
    const end = a.to < to ? a.to : to
    if (start > end) continue
    const offset = daysBetween(from, start)
    const len = daysBetween(start, end)
    for (let i = 0; i <= len; i++) days.add(offset + i)
  }
  return days.size
}

/** Initialen-Kürzel für Gegner-Badges, z.B. "HSG Köln-West" → "HK". */
export function opponentInitials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Vorzeichenbehaftete Zahl: +4 / -3 / ±0. */
export function fmtSigned(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `${n}`
  return '±0'
}
