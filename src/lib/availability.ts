import type { Absence, Player } from './types'
import { ABSENCE_LABEL } from './types'
import { fmtDate } from './format'

export interface DayAvailability {
  available: boolean
  /** Grund, falls nicht verfügbar (deutsch, UI-fertig). */
  reason?: string
  absence?: Absence
}

/** Ist die Spielerin an einem Datum grundsätzlich einsetzbar? */
export function availabilityOn(
  player: Player,
  absences: Absence[],
  dateIso: string,
): DayAvailability {
  if (!player.available) {
    return { available: false, reason: 'Als nicht verfügbar markiert' }
  }
  const hit = absences.find(
    (a) => a.playerId === player.id && a.from <= dateIso && dateIso <= a.to,
  )
  if (hit) {
    return {
      available: false,
      reason: `${ABSENCE_LABEL[hit.category]} bis ${fmtDate(hit.to)}`,
      absence: hit,
    }
  }
  if (player.isGuest && player.guestUntil && dateIso > player.guestUntil) {
    return { available: false, reason: `Gast-Zeitraum endete ${fmtDate(player.guestUntil)}` }
  }
  return { available: true }
}
