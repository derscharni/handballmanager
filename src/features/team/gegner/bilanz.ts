import type { MatchEvent } from '../../../lib/types'

/** Bilanz gegen einen Gegner — nur Spiele mit eingetragenem Ergebnis. */
export interface OpponentRecord {
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
}

export function hasResult(
  e: MatchEvent,
): e is MatchEvent & { goalsUs: number; goalsThem: number } {
  return typeof e.goalsUs === 'number' && typeof e.goalsThem === 'number'
}

export function recordFromEvents(events: MatchEvent[]): OpponentRecord {
  const r: OpponentRecord = {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  }
  for (const e of events) {
    if (e.kind !== 'match' || !hasResult(e)) continue
    r.played += 1
    r.goalsFor += e.goalsUs
    r.goalsAgainst += e.goalsThem
    if (e.goalsUs > e.goalsThem) r.wins += 1
    else if (e.goalsUs < e.goalsThem) r.losses += 1
    else r.draws += 1
  }
  return r
}

/** Kompakt für die Liste: "3 Spiele · 2S 1N" (U nur wenn vorhanden). */
export function recordShort(r: OpponentRecord): string {
  const games = r.played === 1 ? '1 Spiel' : `${r.played} Spiele`
  const parts: string[] = []
  if (r.wins > 0) parts.push(`${r.wins}S`)
  if (r.draws > 0) parts.push(`${r.draws}U`)
  if (r.losses > 0) parts.push(`${r.losses}N`)
  return parts.length > 0 ? `${games} · ${parts.join(' ')}` : games
}

/** Tordifferenz mit Vorzeichen: "+5", "-3", "±0". */
export function fmtDiff(r: OpponentRecord): string {
  const d = r.goalsFor - r.goalsAgainst
  if (d > 0) return `+${d}`
  if (d < 0) return `${d}`
  return '±0'
}
