import { describe, expect, it } from 'vitest'
import {
  ageOn,
  celebrationDateIn,
  daysUntilLabel,
  isLeapYear,
  nextBirthday,
  upcomingBirthdays,
} from './birthdays'

describe('isLeapYear', () => {
  it('erkennt Schaltjahre inkl. Jahrhundert-Regel', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2026)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
  })
})

describe('celebrationDateIn', () => {
  it('nutzt das echte Datum in normalen Fällen', () => {
    expect(celebrationDateIn(2026, '2002-03-14')).toBe('2026-03-14')
  })
  it('verschiebt 29.02. auf 28.02. in Nicht-Schaltjahren', () => {
    expect(celebrationDateIn(2026, '2000-02-29')).toBe('2026-02-28')
    expect(celebrationDateIn(2028, '2000-02-29')).toBe('2028-02-29')
  })
})

describe('ageOn', () => {
  it('zählt erst ab dem Geburtstag hoch', () => {
    expect(ageOn('2002-03-14', '2026-03-13')).toBe(23)
    expect(ageOn('2002-03-14', '2026-03-14')).toBe(24)
    expect(ageOn('2002-03-14', '2026-12-31')).toBe(24)
  })
  it('29.02.-Geburtstag altert am 28.02. in Nicht-Schaltjahren', () => {
    expect(ageOn('2000-02-29', '2026-02-27')).toBe(25)
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(26)
    expect(ageOn('2000-02-29', '2028-02-28')).toBe(27)
    expect(ageOn('2000-02-29', '2028-02-29')).toBe(28)
  })
})

describe('nextBirthday', () => {
  it('heute = 0 Tage', () => {
    expect(nextBirthday('2001-07-12', '2026-07-12')).toEqual({
      daysUntil: 0,
      turns: 25,
      celebratesOn: '2026-07-12',
    })
  })
  it('liegt der Geburtstag dieses Jahr zurück, zählt das nächste Jahr', () => {
    const n = nextBirthday('2002-01-05', '2026-12-28')
    expect(n.celebratesOn).toBe('2027-01-05')
    expect(n.daysUntil).toBe(8)
    expect(n.turns).toBe(25)
  })
  it('29.02. wird in Nicht-Schaltjahren am 28.02. gefeiert', () => {
    const n = nextBirthday('2000-02-29', '2026-02-27')
    expect(n.celebratesOn).toBe('2026-02-28')
    expect(n.daysUntil).toBe(1)
    expect(n.turns).toBe(26)
  })
  it('im Schaltjahr bleibt der 29.02. erhalten', () => {
    const n = nextBirthday('2000-02-29', '2028-02-27')
    expect(n.celebratesOn).toBe('2028-02-29')
    expect(n.daysUntil).toBe(2)
    expect(n.turns).toBe(28)
  })
})

describe('upcomingBirthdays', () => {
  const players = [
    { id: 'a', birthday: '2001-07-12' }, // heute
    { id: 'b', birthday: '1999-07-15' }, // in 3 Tagen
    { id: 'c', birthday: '2003-07-26' }, // in 14 Tagen (Grenze)
    { id: 'd', birthday: '2000-07-27' }, // in 15 Tagen → raus
    { id: 'e' }, // ohne Geburtstag → raus
  ]

  it('filtert auf den Horizont und sortiert nach Nähe', () => {
    const result = upcomingBirthdays(players, '2026-07-12')
    expect(result.map((r) => r.player.id)).toEqual(['a', 'b', 'c'])
    expect(result[0].daysUntil).toBe(0)
    expect(result[0].turns).toBe(25)
    expect(result[1].daysUntil).toBe(3)
    expect(result[2].daysUntil).toBe(14)
  })

  it('funktioniert über den Jahreswechsel', () => {
    const result = upcomingBirthdays([{ id: 'x', birthday: '2004-01-02' }], '2026-12-24')
    expect(result).toHaveLength(1)
    expect(result[0].daysUntil).toBe(9)
    expect(result[0].turns).toBe(23)
  })
})

describe('daysUntilLabel', () => {
  it('deutsche Microcopy', () => {
    expect(daysUntilLabel(0)).toBe('heute')
    expect(daysUntilLabel(1)).toBe('morgen')
    expect(daysUntilLabel(3)).toBe('in 3 Tagen')
  })
})
