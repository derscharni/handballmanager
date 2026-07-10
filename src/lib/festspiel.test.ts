import { describe, expect, it } from 'vitest'
import type { Appearance } from './types'
import {
  computeFestspielStatus,
  forecastNomination,
} from './festspiel'

let n = 0
function app(date: string, team: Appearance['team'], bench = false): Appearance {
  n += 1
  return { id: `a${n}`, playerId: 'p1', date, team, bench }
}

describe('computeFestspielStatus (§55)', () => {
  it('ist frei ohne Einsätze', () => {
    expect(computeFestspielStatus('D2', [], '2026-07-10').state).toBe('frei')
  })

  it('ist frei bei Einsätzen nur in der eigenen Mannschaft', () => {
    const h = [app('2026-01-10', 'D2'), app('2026-01-17', 'D2')]
    expect(computeFestspielStatus('D2', h, '2026-07-10').state).toBe('frei')
  })

  it('warnt nach dem ersten Einsatz in der höheren Mannschaft', () => {
    const h = [app('2026-06-20', 'D1')]
    const s = computeFestspielStatus('D2', h, '2026-07-10')
    expect(s.state).toBe('warnung')
    expect(s.team).toBe('D1')
    expect(s.consecutive).toBe(1)
  })

  it('spielt nach zwei aufeinanderfolgenden Einsätzen fest — 42 Tage ab dem 2.', () => {
    const h = [app('2026-06-20', 'D1'), app('2026-06-27', 'D1')]
    const s = computeFestspielStatus('D2', h, '2026-07-10')
    expect(s.state).toBe('festgespielt')
    expect(s.blockedUntil).toBe('2026-08-08') // 27.06. + 42 Tage
  })

  it('Bankeinsätze zählen als Einsatz', () => {
    const h = [app('2026-06-20', 'D1', true), app('2026-06-27', 'D1', true)]
    expect(computeFestspielStatus('D2', h, '2026-07-10').state).toBe('festgespielt')
  })

  it('Einsatz in eigener Mannschaft setzt den Zähler zurück', () => {
    const h = [
      app('2026-06-20', 'D1'),
      app('2026-06-24', 'D2'), // Reset
      app('2026-06-27', 'D1'),
    ]
    const s = computeFestspielStatus('D2', h, '2026-07-10')
    expect(s.state).toBe('warnung')
    expect(s.consecutive).toBe(1)
  })

  it('Einsatz in niedrigerer Mannschaft setzt ebenfalls zurück', () => {
    const h = [
      app('2026-06-20', 'D1'),
      app('2026-06-24', 'AJ'), // A-Jugend ist niedriger als D2
      app('2026-06-27', 'D1'),
    ]
    const s = computeFestspielStatus('D2', h, '2026-07-10')
    expect(s.state).toBe('warnung')
  })

  it('Wechsel der höheren Mannschaft zählt nicht als aufeinanderfolgend', () => {
    // AJ-Spielerin: D2 und D1 sind beide höher — aber D2→D1 ist kein 2. Einsatz in D2
    const h = [app('2026-06-20', 'D2'), app('2026-06-27', 'D1')]
    const s = computeFestspielStatus('AJ', h, '2026-07-10')
    expect(s.state).toBe('warnung')
    expect(s.team).toBe('D1')
    expect(s.consecutive).toBe(1)
  })

  it('weitere Einsätze während der Sperre verlängern die Frist', () => {
    const h = [
      app('2026-06-20', 'D1'),
      app('2026-06-27', 'D1'),
      app('2026-07-04', 'D1'),
    ]
    const s = computeFestspielStatus('D2', h, '2026-07-10')
    expect(s.state).toBe('festgespielt')
    expect(s.blockedUntil).toBe('2026-08-15') // 04.07. + 42 Tage
  })

  it('nach Ablauf der 42 Tage ist die Spielerin wieder frei', () => {
    const h = [app('2026-01-10', 'D1'), app('2026-01-17', 'D1')]
    // gesperrt bis 28.02.; Stichtag 01.03. → frei
    expect(computeFestspielStatus('D2', h, '2026-02-28').state).toBe('festgespielt')
    expect(computeFestspielStatus('D2', h, '2026-03-01').state).toBe('frei')
  })

  it('Stichtag am letzten Sperrtag ist noch gesperrt (inklusiv)', () => {
    const h = [app('2026-06-20', 'D1'), app('2026-06-27', 'D1')]
    expect(computeFestspielStatus('D2', h, '2026-08-08').state).toBe('festgespielt')
  })

  it('zukünftige Einsätze zählen am Stichtag nicht', () => {
    const h = [app('2026-06-20', 'D1'), app('2026-08-01', 'D1')]
    const s = computeFestspielStatus('D2', h, '2026-07-10')
    expect(s.state).toBe('warnung')
  })

  it('D1-Spielerin kann in D1 nicht festgespielt werden', () => {
    const h = [app('2026-06-20', 'D1'), app('2026-06-27', 'D1')]
    expect(computeFestspielStatus('D1', h, '2026-07-10').state).toBe('frei')
  })
})

describe('forecastNomination (Kaderplanung)', () => {
  it('warnt beim 2. Einsatz in Folge vor dem Festspielen', () => {
    const h = [app('2026-08-29', 'D1')]
    const f = forecastNomination('D2', h, 'D1', '2026-09-05')
    expect(f.resulting).toBe('festgespielt')
    expect(f.blockedUntil).toBe('2026-10-17') // 05.09. + 42 Tage
    expect(f.warning).toContain('2. Einsatz in Folge')
  })

  it('kündigt beim 1. Einsatz die Warnstufe an', () => {
    const f = forecastNomination('D2', [], 'D1', '2026-09-05')
    expect(f.resulting).toBe('warnung')
  })

  it('Nominierung in eigener Mannschaft ist immer unkritisch', () => {
    const h = [app('2026-08-29', 'D1')]
    const f = forecastNomination('D2', h, 'D2', '2026-09-05')
    expect(f.resulting).toBe('frei')
    expect(f.warning).toBeUndefined()
  })

  it('während bestehender Sperre: Einsatz verlängert', () => {
    const h = [app('2026-08-22', 'D1'), app('2026-08-29', 'D1')]
    const f = forecastNomination('D2', h, 'D1', '2026-09-05')
    expect(f.resulting).toBe('festgespielt')
    expect(f.warning).toContain('verlängert')
  })
})
