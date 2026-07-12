import { describe, expect, it } from 'vitest'
import { generateSeriesDates, weekdayOf } from './serien'

describe('generateSeriesDates', () => {
  it('erzeugt Di+Do-Trainings bis zum Enddatum (Start exklusiv, Ende inklusiv)', () => {
    // 2026-07-14 ist ein Dienstag
    const dates = generateSeriesDates('2026-07-14', new Set([2, 4]), '2026-07-28')
    expect(dates).toEqual([
      '2026-07-16', // Do
      '2026-07-21', // Di
      '2026-07-23', // Do
      '2026-07-28', // Di (inklusiv)
    ])
  })

  it('liefert leer bei fehlenden Wochentagen oder Ende vor Start', () => {
    expect(generateSeriesDates('2026-07-14', new Set(), '2026-08-14')).toEqual([])
    expect(generateSeriesDates('2026-07-14', new Set([2]), '2026-07-01')).toEqual([])
  })

  it('überspringt Monats- und Jahreswechsel korrekt', () => {
    // 2026-12-29 ist ein Dienstag; nächster Dienstag: 2027-01-05
    const dates = generateSeriesDates('2026-12-29', new Set([2]), '2027-01-06')
    expect(dates).toEqual(['2027-01-05'])
  })

  it('weekdayOf ist zeitzonensicher', () => {
    expect(weekdayOf('2026-07-14')).toBe(2) // Dienstag
    expect(weekdayOf('2026-07-12')).toBe(0) // Sonntag
  })
})
