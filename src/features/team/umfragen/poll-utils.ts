import type { Player, Poll } from '../../../lib/types'

/** Auswertungs-Helfer für Umfragen. */

export interface PollTally {
  /** Stimmen pro Option (optionId → Anzahl). */
  counts: Record<string, number>
  /** Eindeutige Spielerinnen, die abgestimmt haben. */
  voterIds: string[]
  /** Nenner für Prozentwerte: Stimmen (single) bzw. Abstimmende (multi). */
  ballots: number
  maxCount: number
  /** Optionen mit den meisten Stimmen (leer, wenn noch keine Stimme). */
  leaderIds: string[]
}

export function tallyPoll(poll: Poll): PollTally {
  const counts: Record<string, number> = {}
  for (const o of poll.options) counts[o.id] = 0
  const voterSet = new Set<string>()
  for (const v of poll.votes) {
    if (counts[v.optionId] !== undefined) counts[v.optionId] += 1
    voterSet.add(v.playerId)
  }
  const maxCount = Math.max(0, ...Object.values(counts))
  const leaderIds =
    maxCount > 0
      ? poll.options.filter((o) => counts[o.id] === maxCount).map((o) => o.id)
      : []
  return {
    counts,
    voterIds: [...voterSet],
    ballots: poll.multi ? voterSet.size : poll.votes.length,
    maxCount,
    leaderIds,
  }
}

export function percentOf(count: number, ballots: number): number {
  return ballots === 0 ? 0 : Math.round((count / ballots) * 100)
}

/** Abstimmungs-Basis: D1-Kader plus aktuelle Gäste, alphabetisch. */
export function pollRoster(players: Player[]): Player[] {
  return players
    .filter((p) => p.team === 'D1' || p.isGuest)
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'de') ||
        a.firstName.localeCompare(b.firstName, 'de'),
    )
}

/** Spielerinnen des Kaders, die noch nicht abgestimmt haben. */
export function pendingPlayers(poll: Poll, roster: Player[]): Player[] {
  const voted = new Set(poll.votes.map((v) => v.playerId))
  return roster.filter((p) => !voted.has(p.id))
}

/** "Kanutour" | "Gleichstand: Kanutour / Kegeln" | null (keine Stimmen). */
export function decisionText(poll: Poll): string | null {
  const t = tallyPoll(poll)
  if (t.leaderIds.length === 0) return null
  const labels = poll.options
    .filter((o) => t.leaderIds.includes(o.id))
    .map((o) => o.label)
  return t.leaderIds.length === 1
    ? labels[0]
    : `Gleichstand: ${labels.join(' / ')}`
}
