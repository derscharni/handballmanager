import type { Appearance, TeamId } from './types'
import { TEAM_RANK } from './types'

/**
 * Festspiel-Engine nach DHB-Spielordnung §55 (vereinfachte Vereins-Sicht,
 * wie in den Anforderungen definiert):
 *
 * - Nach dem 1. Einsatz in einer höheren Mannschaft: WARNUNG.
 * - Nach dem 2. AUFEINANDERFOLGENDEN Einsatz in derselben höheren Mannschaft:
 *   FESTGESPIELT in dieser Mannschaft für 42 Tage (6 Wochen) — gesperrt für
 *   alle niedrigeren Mannschaften.
 * - Bankeinsätze zählen als Einsatz (werden hier nicht unterschieden).
 * - Ein Einsatz in der eigenen oder einer niedrigeren Mannschaft setzt den
 *   Zähler zurück.
 * - Jeder weitere Einsatz in der höheren Mannschaft während der Sperre
 *   verlängert die 42-Tage-Frist (gerechnet ab letztem Einsatz).
 * - Nach Ablauf der 42 Tage ohne weiteren Einsatz in der höheren Mannschaft
 *   ist die Spielerin wieder frei; der Zähler beginnt von vorn.
 * - Keine Sonderregelungen für erste/letzte Spieltage.
 */

export const FESTSPIEL_DAYS = 42

export type FestspielState = 'frei' | 'warnung' | 'festgespielt'

export interface FestspielStatus {
  state: FestspielState
  /** Höhere Mannschaft, auf die sich Warnung/Sperre bezieht. */
  team?: TeamId
  /** Anzahl aufeinanderfolgender Einsätze in dieser höheren Mannschaft. */
  consecutive: number
  /** Datum des letzten Einsatzes in der höheren Mannschaft (ISO). */
  lastHigherDate?: string
  /** Bei 'festgespielt': gesperrt für niedrigere Teams bis einschließlich (ISO). */
  blockedUntil?: string
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Berechnet den Festspiel-Status einer Spielerin aus ihrer Einsatz-Historie.
 *
 * @param ownTeam   Stammmannschaft der Spielerin
 * @param history   Einsätze (beliebige Reihenfolge; wird nach Datum sortiert)
 * @param today     Stichtag (ISO-Datum), Default: jetzt
 */
export function computeFestspielStatus(
  ownTeam: TeamId,
  history: Appearance[],
  today: string,
): FestspielStatus {
  const ownRank = TEAM_RANK[ownTeam]
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))

  let team: TeamId | undefined
  let consecutive = 0
  let lastHigherDate: string | undefined

  for (const app of sorted) {
    if (app.date > today) continue // zukünftige Einträge zählen (noch) nicht
    const rank = TEAM_RANK[app.team]
    if (rank > ownRank) {
      if (team === app.team) {
        consecutive += 1
      } else {
        team = app.team
        consecutive = 1
      }
      lastHigherDate = app.date
    } else {
      // Einsatz in eigener oder niedrigerer Mannschaft → Zähler zurück
      team = undefined
      consecutive = 0
      lastHigherDate = undefined
    }
  }

  if (!team || consecutive === 0 || !lastHigherDate) {
    return { state: 'frei', consecutive: 0 }
  }

  if (consecutive >= 2) {
    const blockedUntil = addDays(lastHigherDate, FESTSPIEL_DAYS)
    if (today <= blockedUntil) {
      return { state: 'festgespielt', team, consecutive, lastHigherDate, blockedUntil }
    }
    // Sperre abgelaufen → wieder frei, Zähler beginnt von vorn
    return { state: 'frei', consecutive: 0 }
  }

  return { state: 'warnung', team, consecutive, lastHigherDate }
}

/**
 * Prognose für die Kaderplanung: Was passiert, wenn die Spielerin am
 * gegebenen Datum in `nominatedTeam` eingesetzt wird?
 */
export interface FestspielForecast {
  /** Status nach dem hypothetischen Einsatz. */
  resulting: FestspielState
  /** Bei 'festgespielt': gesperrt bis (ISO). */
  blockedUntil?: string
  /** Menschlich lesbare Warnung für die UI, falls relevant. */
  warning?: string
}

export function forecastNomination(
  ownTeam: TeamId,
  history: Appearance[],
  nominatedTeam: TeamId,
  matchDate: string,
): FestspielForecast {
  const ownRank = TEAM_RANK[ownTeam]
  const nomRank = TEAM_RANK[nominatedTeam]
  if (nomRank <= ownRank) return { resulting: 'frei' }

  const current = computeFestspielStatus(ownTeam, history, matchDate)
  if (current.state === 'warnung' && current.team === nominatedTeam) {
    const blockedUntil = addDays(matchDate, FESTSPIEL_DAYS)
    return {
      resulting: 'festgespielt',
      blockedUntil,
      warning: `2. Einsatz in Folge — wäre festgespielt und für niedrigere Mannschaften gesperrt bis ${formatGerman(blockedUntil)}.`,
    }
  }
  if (current.state === 'festgespielt') {
    const blockedUntil = addDays(matchDate, FESTSPIEL_DAYS)
    return {
      resulting: 'festgespielt',
      blockedUntil,
      warning: `Bereits festgespielt — dieser Einsatz verlängert die Sperre bis ${formatGerman(blockedUntil)}.`,
    }
  }
  return {
    resulting: 'warnung',
    warning: '1. Einsatz in höherer Mannschaft — der nächste Einsatz in Folge spielt sie fest.',
  }
}

export function formatGerman(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
