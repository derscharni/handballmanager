/** Datums-/Text-Helfer für die deutsche UI. */

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

export function fmtDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`
}

export function fmtWeekday(iso: string): string {
  return WEEKDAYS[new Date(iso + 'T12:00:00').getDay()]
}

/** "Sa 05.09." */
export function fmtDayDate(iso: string): string {
  return `${fmtWeekday(iso)} ${fmtDateShort(iso)}`
}

/** "5. September 2026" */
export function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}. ${MONTHS[m - 1]} ${y}`
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime()
  const b = new Date(toIso + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86_400_000)
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

export function playerName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`
}
