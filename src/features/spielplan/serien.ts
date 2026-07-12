/** Terminserien: reine Datums-Helfer (testbar, ohne DB). */

export const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const

/** Wochentag (0=So … 6=Sa) eines ISO-Datums, zeitzonensicher. */
export function weekdayOf(iso: string): number {
  return new Date(iso + 'T12:00:00').getDay()
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

/**
 * Alle Termine einer wöchentlichen Serie: ab `startIso` (exklusive) bis
 * einschließlich `untilIso`, an den gewählten Wochentagen (0=So … 6=Sa).
 * Der Start-Termin selbst wird separat angelegt und ist NICHT enthalten.
 */
export function generateSeriesDates(
  startIso: string,
  weekdays: ReadonlySet<number>,
  untilIso: string,
): string[] {
  if (weekdays.size === 0 || untilIso < startIso) return []
  const out: string[] = []
  let cur = addDaysIso(startIso, 1)
  // Sicherheitsgrenze ~1 Jahr, falls die UI-Begrenzung umgangen wird
  for (let i = 0; i < 366 && cur <= untilIso; i++) {
    if (weekdays.has(weekdayOf(cur))) out.push(cur)
    cur = addDaysIso(cur, 1)
  }
  return out
}
