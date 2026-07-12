import type { AttendanceResponse, AttendanceStatus, MatchEvent, Player } from '../../lib/types'
import { EVENT_KIND_LABEL } from '../../lib/types'
import { fmtDayDate } from '../../lib/format'

/**
 * Rückmeldungs-Logik (Zu-/Absagen) — reine Funktionen, testbar.
 * Der Trainer pflegt die Rückmeldungen aus der WhatsApp-Gruppe nach;
 * kein Eintrag in db.attendance = "offen".
 */

/** Basis der Rückmeldungen: D1-Kader plus aktive Gäste. */
export function isRosterPlayer(p: Player): boolean {
  return p.team === 'D1' || p.isGuest
}

export interface AttendanceCounts {
  zugesagt: number
  abgesagt: number
  unsicher: number
  /** Ohne jede Rückmeldung. */
  offen: number
  /** Kadergröße (Basis der Zähler). */
  total: number
  /** Anzahl vorhandener Rückmeldungen (zugesagt + abgesagt + unsicher). */
  responses: number
}

/** Zählt Rückmeldungen relativ zum Kader; Antworten von Nicht-Kader-Spielerinnen werden ignoriert. */
export function countAttendance(
  roster: Player[],
  responses: AttendanceResponse[],
): AttendanceCounts {
  const byPlayer = new Map(responses.map((r) => [r.playerId, r.status]))
  const counts: AttendanceCounts = {
    zugesagt: 0,
    abgesagt: 0,
    unsicher: 0,
    offen: 0,
    total: roster.length,
    responses: 0,
  }
  for (const p of roster) {
    const status = byPlayer.get(p.id)
    if (!status) {
      counts.offen += 1
    } else {
      counts[status] += 1
      counts.responses += 1
    }
  }
  return counts
}

/** Rückmeldungen eines Termins als Map playerId → Response. */
export function responsesByPlayer(
  responses: AttendanceResponse[],
): Map<string, AttendanceResponse> {
  return new Map(responses.map((r) => [r.playerId, r]))
}

/** Kurzer Termin-Titel für Kopfzeilen und Nachrichten. */
export function eventHeading(event: MatchEvent, opponentName?: string): string {
  if (event.kind === 'sonstiges') return event.title?.trim() || 'Event'
  if (event.kind === 'match' && opponentName) return `Spiel gegen ${opponentName}`
  if (event.kind === 'tournament') return event.note?.trim() || 'Turnier'
  return EVENT_KIND_LABEL[event.kind]
}

/** WhatsApp-Erinnerungstext für alle Offenen. */
export function reminderText(
  event: MatchEvent,
  opponentName: string | undefined,
  openNames: string[],
): string {
  const when = [
    fmtDayDate(event.date),
    event.time ? `${event.time} Uhr` : null,
    event.hall || null,
  ]
    .filter(Boolean)
    .join(' · ')
  const lines = [
    `Erinnerung: ${eventHeading(event, opponentName)} am ${when}`,
    '',
    `Noch keine Rückmeldung von: ${openNames.join(', ')}`,
    '',
    'Bitte kurz zu- oder absagen!',
  ]
  return lines.join('\n')
}

export const STATUS_ORDER: AttendanceStatus[] = ['zugesagt', 'abgesagt', 'unsicher']
