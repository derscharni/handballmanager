import { daysBetween } from '../../lib/format'

/**
 * Reine Geburtstags-Helfer (kein DOM, kein Dexie) — testbar mit Vitest.
 *
 * Regeln:
 * - Jahreswechsel: Geburtstag im Januar wird auch im Dezember korrekt
 *   als "in X Tagen" erkannt (nächstes Jahr).
 * - Schaltjahr: 29.02. wird in Nicht-Schaltjahren am 28.02. gefeiert.
 */

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Feier-Datum eines Geburtstags in einem Zieljahr (29.02. → 28.02. ohne Schaltjahr). */
export function celebrationDateIn(year: number, birthday: string): string {
  const [, m, d] = birthday.split('-').map(Number)
  if (m === 2 && d === 29 && !isLeapYear(year)) return `${year}-02-28`
  return `${year}-${pad2(m)}-${pad2(d)}`
}

/** Alter in vollen Jahren am Stichtag (29.02.-Kinder altern am 28.02. in Nicht-Schaltjahren). */
export function ageOn(birthday: string, on: string): number {
  const birthYear = Number(birthday.slice(0, 4))
  const onYear = Number(on.slice(0, 4))
  const celebration = celebrationDateIn(onYear, birthday)
  return onYear - birthYear - (on < celebration ? 1 : 0)
}

export interface NextBirthday {
  /** Tage bis zur Feier; 0 = heute. */
  daysUntil: number
  /** Alter, das an diesem Geburtstag erreicht wird. */
  turns: number
  /** ISO-Datum, an dem gefeiert wird. */
  celebratesOn: string
}

/** Nächster (ggf. heutiger) Geburtstag ab `today`, Jahreswechsel-sicher. */
export function nextBirthday(birthday: string, today: string): NextBirthday {
  const birthYear = Number(birthday.slice(0, 4))
  let year = Number(today.slice(0, 4))
  let celebratesOn = celebrationDateIn(year, birthday)
  if (celebratesOn < today) {
    year += 1
    celebratesOn = celebrationDateIn(year, birthday)
  }
  return {
    daysUntil: daysBetween(today, celebratesOn),
    turns: year - birthYear,
    celebratesOn,
  }
}

export interface BirthdayEntry<T> {
  player: T
  daysUntil: number
  turns: number
  celebratesOn: string
}

/**
 * Anstehende Geburtstage (heute + `horizonDays` Tage), sortiert nach Nähe.
 * Spielerinnen ohne Geburtsdatum werden übersprungen.
 */
export function upcomingBirthdays<T extends { birthday?: string }>(
  players: T[],
  today: string,
  horizonDays = 14,
): BirthdayEntry<T>[] {
  return players
    .flatMap((player) => {
      if (!player.birthday) return []
      const next = nextBirthday(player.birthday, today)
      if (next.daysUntil > horizonDays) return []
      return [{ player, ...next }]
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.turns - b.turns)
}

/** "heute" / "morgen" / "in 3 Tagen" */
export function daysUntilLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'heute'
  if (daysUntil === 1) return 'morgen'
  return `in ${daysUntil} Tagen`
}
