import { describe, expect, it } from 'vitest'
import {
  buildScheduleApiUrl,
  extractTeamId,
  parseHandballNetSchedule,
  parseStartsAt,
} from './handballnet'

const CLUB = 'TuS Köln-Ehrenfeld 1865'

describe('extractTeamId / buildScheduleApiUrl', () => {
  it('liest das Pfadsegment nach /mannschaften/', () => {
    expect(
      extractTeamId('https://www.handball.net/mannschaften/tus-koeln-ehrenfeld-1?tab=spielplan'),
    ).toBe('tus-koeln-ehrenfeld-1')
    expect(extractTeamId('handball.net.id.123')).toBe('handball.net.id.123')
    expect(extractTeamId('')).toBeNull()
  })

  it('baut die Kandidaten-API-URL', () => {
    expect(buildScheduleApiUrl('abc-1')).toBe(
      'https://www.handball.net/a/sportdata/1/teams/abc-1/schedule?ca=0',
    )
  })
})

describe('parseStartsAt', () => {
  it('übernimmt ISO ohne Zeitzone wörtlich', () => {
    expect(parseStartsAt('2025-09-05T18:00:00')).toEqual({ date: '2025-09-05', time: '18:00' })
  })

  it('rechnet Epoch-ms in lokale Zeit um', () => {
    const ms = Date.UTC(2025, 8, 5, 16, 0)
    const res = parseStartsAt(ms)
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    expect(res).toEqual({
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    })
  })

  it('liefert null für Unlesbares', () => {
    expect(parseStartsAt({})).toBeNull()
    expect(parseStartsAt('bald')).toBeNull()
  })
})

describe('parseHandballNetSchedule', () => {
  const game = {
    id: 'hbn.123',
    startsAt: '2025-09-05T18:00:00',
    homeTeam: { name: 'TuS Köln-Ehrenfeld 1865' },
    awayTeam: { name: 'HSG Köln-West' },
    field: { name: 'Sporthalle Ehrenfeld' },
  }

  it('akzeptiert {data:[...]} und mappt Heim/Auswärts + Gegner', () => {
    const [c] = parseHandballNetSchedule({ data: [game] }, CLUB)
    expect(c).toMatchObject({
      externalId: 'hbn.123',
      kind: 'match',
      date: '2025-09-05',
      time: '18:00',
      home: true,
      opponentName: 'HSG Köln-West',
      hall: 'Sporthalle Ehrenfeld',
    })
  })

  it('akzeptiert nacktes Array und erkennt Auswärtsspiele', () => {
    const [c] = parseHandballNetSchedule(
      [{ ...game, homeTeam: { name: 'SV Zollstock' }, awayTeam: { name: 'TuS Köln-Ehrenfeld' } }],
      CLUB,
    )
    expect(c.home).toBe(false)
    expect(c.opponentName).toBe('SV Zollstock')
  })

  it('akzeptiert JSON-Text und wirft verständliche Fehler bei fremdem Format', () => {
    expect(parseHandballNetSchedule(JSON.stringify({ data: [game] }), CLUB)).toHaveLength(1)
    expect(() => parseHandballNetSchedule('kein json', CLUB)).toThrow(/JSON/)
    expect(() => parseHandballNetSchedule({ foo: 1 }, CLUB)).toThrow(/data/)
    expect(() => parseHandballNetSchedule({ data: [{ startsAt: 'bald' }] }, CLUB)).toThrow(
      /startsAt/,
    )
  })
})
