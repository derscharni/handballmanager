import { describe, expect, it } from 'vitest'
import {
  detectKind,
  icsToCandidates,
  parseDtStart,
  parseIcs,
  startsWithOwnClub,
  unfoldIcsLines,
} from './ics'

const CLUB = 'TuS Köln-Ehrenfeld 1865'

describe('unfoldIcsLines', () => {
  it('entfaltet CRLF-Zeilen mit Space- und Tab-Fortsetzung', () => {
    const text = 'SUMMARY:TuS Köln-Ehrenfeld - HSG\r\n  Köln-West\r\nLOCATION:Halle \r\n\tEhrenfeld\r\n'
    expect(unfoldIcsLines(text)).toEqual([
      'SUMMARY:TuS Köln-Ehrenfeld - HSG Köln-West',
      'LOCATION:Halle Ehrenfeld',
    ])
  })
})

describe('parseDtStart', () => {
  it('parst reines Datum (YYYYMMDD)', () => {
    expect(parseDtStart('20250905')).toEqual({ date: '2025-09-05' })
  })

  it('parst lokale Zeit (YYYYMMDDTHHMMSS) wörtlich', () => {
    expect(parseDtStart('20250905T180000')).toEqual({ date: '2025-09-05', time: '18:00' })
  })

  it('rechnet Z-Zeiten von UTC in lokale Zeit um', () => {
    const res = parseDtStart('20250905T160000Z')
    const expected = new Date(Date.UTC(2025, 8, 5, 16, 0))
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(res).toEqual({
      date: `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
      time: `${pad(expected.getHours())}:${pad(expected.getMinutes())}`,
    })
  })

  it('liefert null für Unlesbares', () => {
    expect(parseDtStart('morgen')).toBeNull()
  })
})

describe('parseIcs', () => {
  const sample = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:spiel-1@handball.net',
    'DTSTART;TZID=Europe/Berlin:20250905T180000',
    'SUMMARY:TuS Köln-Ehrenfeld - HSG Köln-West',
    'LOCATION:Sporthalle\\, Ehrenfeld',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:training-1',
    'DTSTART:20250902T193000',
    'SUMMARY:Training D1',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:kaputt',
    'SUMMARY:Ohne Datum',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  it('parst VEVENT-Blöcke inkl. TZID-Param und Escaping, verwirft Events ohne DTSTART', () => {
    const events = parseIcs(sample)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({
      uid: 'spiel-1@handball.net',
      summary: 'TuS Köln-Ehrenfeld - HSG Köln-West',
      location: 'Sporthalle, Ehrenfeld',
      date: '2025-09-05',
      time: '18:00',
    })
    expect(events[1].summary).toBe('Training D1')
    expect(events[1].time).toBe('19:30')
  })
})

describe('detectKind / startsWithOwnClub', () => {
  it('erkennt Spiele an " - " und "vs"', () => {
    expect(detectKind('A - B')).toBe('match')
    expect(detectKind('A vs B')).toBe('match')
    expect(detectKind('Training D1')).toBe('training')
  })

  it('erkennt den eigenen Verein über Namensfragment', () => {
    expect(startsWithOwnClub('TuS Köln-Ehrenfeld', CLUB)).toBe(true)
    expect(startsWithOwnClub('TuS Wesseling', CLUB)).toBe(true) // Fragment "TuS"
    expect(startsWithOwnClub('HSG Köln-West', CLUB)).toBe(false)
  })
})

describe('icsToCandidates', () => {
  it('mappt Heimspiel: eigener Verein vorn, Gegner ist der Rest', () => {
    const [c] = icsToCandidates(
      [{ uid: 'u1', summary: 'TuS Köln-Ehrenfeld - HSG Köln-West', date: '2025-09-05', time: '18:00', location: 'Halle A' }],
      CLUB,
    )
    expect(c).toMatchObject({
      externalId: 'u1',
      kind: 'match',
      home: true,
      opponentName: 'HSG Köln-West',
      hall: 'Halle A',
    })
  })

  it('mappt Auswärtsspiel: eigener Verein hinten', () => {
    const [c] = icsToCandidates(
      [{ summary: 'SV Zollstock vs TuS Köln-Ehrenfeld', date: '2025-09-12' }],
      CLUB,
    )
    expect(c.home).toBe(false)
    expect(c.opponentName).toBe('SV Zollstock')
  })

  it('mappt Termine ohne Teams-Trenner als Training', () => {
    const [c] = icsToCandidates([{ summary: 'Athletiktraining', date: '2025-09-02' }], CLUB)
    expect(c.kind).toBe('training')
    expect(c.opponentName).toBeUndefined()
  })
})
