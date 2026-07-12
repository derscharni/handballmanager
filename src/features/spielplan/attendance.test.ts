import { describe, expect, it } from 'vitest'
import type { AttendanceResponse, MatchEvent, Player } from '../../lib/types'
import { countAttendance, eventHeading, isRosterPlayer, reminderText } from './attendance'

function player(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    firstName: 'Test',
    lastName: id.toUpperCase(),
    mainPosition: 'RM',
    team: 'D1',
    isGuest: false,
    available: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function response(
  playerId: string,
  status: AttendanceResponse['status'],
): AttendanceResponse {
  return {
    id: `r-${playerId}`,
    eventId: 'e1',
    playerId,
    status,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const baseEvent: MatchEvent = {
  id: 'e1',
  kind: 'training',
  date: '2026-07-14',
  time: '19:30',
  hall: 'Sporthalle Ehrenfeld',
  source: 'manual',
}

describe('isRosterPlayer', () => {
  it('zählt D1 und aktive Gäste zum Kader', () => {
    expect(isRosterPlayer(player('a'))).toBe(true)
    expect(isRosterPlayer(player('b', { team: 'D2', isGuest: true }))).toBe(true)
    expect(isRosterPlayer(player('c', { team: 'D2' }))).toBe(false)
  })
})

describe('countAttendance', () => {
  const roster = [player('a'), player('b'), player('c'), player('d')]

  it('zählt zu/ab/unsicher und offen (= ohne Eintrag)', () => {
    const counts = countAttendance(roster, [
      response('a', 'zugesagt'),
      response('b', 'abgesagt'),
      response('c', 'unsicher'),
    ])
    expect(counts).toEqual({
      zugesagt: 1,
      abgesagt: 1,
      unsicher: 1,
      offen: 1,
      total: 4,
      responses: 3,
    })
  })

  it('ignoriert Antworten von Nicht-Kader-Spielerinnen', () => {
    const counts = countAttendance(roster, [response('fremd', 'zugesagt')])
    expect(counts.zugesagt).toBe(0)
    expect(counts.offen).toBe(4)
  })

  it('funktioniert mit leerem Kader', () => {
    const counts = countAttendance([], [])
    expect(counts.total).toBe(0)
    expect(counts.responses).toBe(0)
  })
})

describe('eventHeading', () => {
  it('nutzt den Titel bei sonstigen Events', () => {
    expect(eventHeading({ ...baseEvent, kind: 'sonstiges', title: 'Mannschaftsabend' })).toBe(
      'Mannschaftsabend',
    )
    expect(eventHeading({ ...baseEvent, kind: 'sonstiges' })).toBe('Event')
  })

  it('nennt den Gegner bei Spielen', () => {
    expect(eventHeading({ ...baseEvent, kind: 'match' }, 'HSG Köln-West')).toBe(
      'Spiel gegen HSG Köln-West',
    )
  })

  it('fällt auf das Kind-Label zurück', () => {
    expect(eventHeading(baseEvent)).toBe('Training')
  })
})

describe('reminderText', () => {
  it('enthält Termin-Info, offene Namen und Aufforderung', () => {
    const text = reminderText(baseEvent, undefined, ['Marie', 'Aylin'])
    expect(text).toContain('Training am Di 14.07. · 19:30 Uhr · Sporthalle Ehrenfeld')
    expect(text).toContain('Noch keine Rückmeldung von: Marie, Aylin')
    expect(text).toContain('Bitte kurz zu- oder absagen!')
  })
})
