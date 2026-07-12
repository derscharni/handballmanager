import { describe, expect, it } from 'vitest'
import type { Player } from '../../lib/types'
import {
  extractBlocks,
  findOwnBlockIndex,
  matchPlayer,
  parseRow,
  reconstructLines,
} from './spielbericht'

function player(firstName: string, lastName: string, number?: number): Player {
  return {
    id: `${firstName}-${lastName}`,
    firstName,
    lastName,
    mainPosition: 'RM',
    team: 'D1',
    isGuest: false,
    available: true,
    createdAt: '2026-01-01T00:00:00Z',
    number,
  }
}

describe('parseRow', () => {
  it('erkennt "Nr Nachname, Vorname Tore/7m 2min"', () => {
    const r = parseRow('7 Köhler, Marie 4/2 1')
    expect(r).toMatchObject({
      number: 7, lastName: 'Köhler', firstName: 'Marie',
      goals: 4, goals7m: 2, twoMin: 1,
    })
  })

  it('erkennt Zeilen ohne Nummer und ohne Statistik', () => {
    expect(parseRow('Brandt, Lena')).toMatchObject({
      lastName: 'Brandt', firstName: 'Lena', goals: 0,
    })
  })

  it('verkraftet Doppelnamen und PDF-Fragment-Brüche in "4 / 2"', () => {
    const r = parseRow('13 Müller-Lüdenscheidt, Anna-Lena 4 / 2')
    expect(r).toMatchObject({ lastName: 'Müller-Lüdenscheidt', firstName: 'Anna-Lena', goals: 4, goals7m: 2 })
  })

  it('zählt explizite Zeitstrafen-Minuten (12:33) als 2-min-Einträge', () => {
    const r = parseRow('5 Weiß, Carla 2 12:33 44:10')
    expect(r?.twoMin).toBe(2)
  })

  it('ignoriert Tabellenköpfe und Nicht-Namenszeilen', () => {
    expect(parseRow('Nr Name, Vorname Tore 7m')).toBeNull()
    expect(parseRow('Spielstand zur Halbzeit 12:9')).toBeNull()
    expect(parseRow('irgendein text ohne komma')).toBeNull()
  })
})

describe('reconstructLines', () => {
  it('gruppiert Items per y-Toleranz und sortiert nach x', () => {
    const lines = reconstructLines([
      { str: 'Köhler,', x: 30, y: 700.4 },
      { str: '7', x: 10, y: 700 },
      { str: 'Marie', x: 75, y: 699.8 },
      { str: '4/2', x: 140, y: 700.2 },
      { str: 'Demir, Aylin', x: 10, y: 686 },
    ])
    expect(lines[0]).toBe('7 Köhler, Marie 4/2')
    expect(lines[1]).toBe('Demir, Aylin')
  })
})

describe('extractBlocks + findOwnBlockIndex', () => {
  const lines = [
    'Spielbericht Nr. 4711',
    'Heimmannschaft: TuS Köln-Ehrenfeld 1865',
    'Nr Name, Vorname Tore 7m 2min',
    '1 Köhler, Marie',
    '7 Demir, Aylin 5',
    '10 Petrovic, Nina 6/1',
    'Gastmannschaft: SV Zollstock',
    'Nr Name, Vorname Tore 7m 2min',
    '3 Schmitz, Eva 2',
    '9 Wagner, Julia 4/2 1',
  ]

  it('findet zwei Team-Blöcke', () => {
    const blocks = extractBlocks(lines)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].rows.map((r) => r.lastName)).toEqual(['Köhler', 'Demir', 'Petrovic'])
    expect(blocks[1].rows).toHaveLength(2)
  })

  it('wählt unseren Block über den Vereinsnamen', () => {
    const blocks = extractBlocks(lines)
    expect(findOwnBlockIndex(blocks, 'TuS Köln-Ehrenfeld 1865')).toBe(0)
    expect(findOwnBlockIndex(blocks, 'SV Zollstock')).toBe(1)
    expect(findOwnBlockIndex(blocks, 'HSG Unbekannt')).toBe(-1)
  })
})

describe('matchPlayer', () => {
  const kader = [
    player('Marie', 'Köhler', 1),
    player('Aylin', 'Demir', 7),
    player('Nina', 'Petrovic', 10),
    player('Zoe', 'Krüger', 17),
  ]

  it('exakter Treffer', () => {
    expect(matchPlayer(parseRow('Köhler, Marie')!, kader)?.firstName).toBe('Marie')
  })

  it('toleriert abgekürzte Vornamen und fehlende Umlaute', () => {
    expect(matchPlayer(parseRow('Koehler, M.')!, kader)?.firstName).toBe('Marie')
    expect(matchPlayer(parseRow('Krueger, Zoe')!, kader)?.firstName).toBe('Zoe')
  })

  it('toleriert Tippfehler bis Levenshtein 2', () => {
    expect(matchPlayer(parseRow('Petrovik, Nina')!, kader)?.lastName).toBe('Petrovic')
  })

  it('fällt auf eindeutige Trikotnummer zurück', () => {
    expect(matchPlayer(parseRow('7 Demirr-X, Ayln')!, kader)?.lastName).toBe('Demir')
  })

  it('gibt null bei Fremden zurück', () => {
    expect(matchPlayer(parseRow('Schmitz, Eva')!, kader)).toBeNull()
  })
})
