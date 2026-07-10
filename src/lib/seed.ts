import { db, todayIso, uid } from './db'
import type { MatchEvent, Opponent, Player, Settings } from './types'

/**
 * Befüllt die Datenbank beim allerersten Start mit realistischen Demo-Daten
 * (TuS Köln-Ehrenfeld 1865, 1. Damen), damit die App sofort erlebbar ist.
 * Läuft nur, wenn noch keine Spielerinnen existieren.
 */
export async function seedIfEmpty(): Promise<void> {
  const count = await db.players.count()
  if (count > 0) return

  const now = new Date().toISOString()
  const p = (
    firstName: string,
    lastName: string,
    main: Player['mainPosition'],
    opts: Partial<Player> = {},
  ): Player => ({
    id: uid(),
    firstName,
    lastName,
    mainPosition: main,
    team: 'D1',
    isGuest: false,
    available: true,
    createdAt: now,
    ...opts,
  })

  // Stammkader 1. Damen
  const marie = p('Marie', 'Köhler', 'TW', { number: 1 })
  const aylin = p('Aylin', 'Demir', 'LA', { number: 7 })
  const carla = p('Carla', 'Weiß', 'KM', { number: 5 })
  const nina = p('Nina', 'Petrovic', 'RM', { number: 10 })
  const johanna = p('Johanna', 'Falk', 'RR', { number: 23 })
  const merle = p('Merle', 'Sanders', 'RA', { number: 11 })
  const paula = p('Paula', 'Vogt', 'RL', { number: 14 })
  const sarah = p('Sarah', 'Lindner', 'KM', { number: 8 })
  const frieda = p('Frieda', 'Albers', 'RM', { altPosition: 'RL', number: 4 })
  const zoe = p('Zoe', 'Krüger', 'RA', { number: 17 })

  // Gäste aus Damen 2 / A-Jugend
  const lena = p('Lena', 'Brandt', 'RL', {
    altPosition: 'RM',
    team: 'D2',
    isGuest: true,
    guestUntil: '2026-09-30',
    number: 19,
  })
  const emma = p('Emma', 'Richter', 'LA', {
    altPosition: 'RA',
    team: 'D2',
    isGuest: true,
    guestUntil: '2026-09-12',
    number: 21,
  })
  const svenja = p('Svenja', 'Ott', 'TW', { team: 'D2', isGuest: false, number: 12 })
  const hanna = p('Hanna', 'Busch', 'RL', { team: 'D2', isGuest: false, number: 3 })

  const players = [
    marie, aylin, carla, nina, johanna, merle, paula, sarah, frieda, zoe,
    lena, emma, svenja, hanna,
  ]

  const opp = (name: string, shortName: string, hall?: string): Opponent => ({
    id: uid(),
    name,
    shortName,
    league: 'Verbandsliga Frauen',
    hall,
  })
  const koelnWest = opp('HSG Köln-West', 'HKW', 'Halle Weiden')
  const zollstock = opp('SV Zollstock', 'SVZ', 'Südhalle Köln')
  const dellbrueck = opp('TV Dellbrück', 'TVD', 'Halle Dellbrück')
  const neuss = opp('HC Rheinkraft Neuss', 'HRN', 'Stadthalle Neuss')
  const opponents = [koelnWest, zollstock, dellbrueck, neuss]

  const ev = (partial: Partial<MatchEvent> & Pick<MatchEvent, 'kind' | 'date'>): MatchEvent => ({
    id: uid(),
    source: 'manual',
    ...partial,
  })
  const events: MatchEvent[] = [
    // Vergangene Testspiele (für Statistik & Festspiel-Historie)
    ev({
      kind: 'match', date: '2026-06-20', time: '16:00', home: true,
      opponentId: koelnWest.id, hall: 'Sporthalle Ehrenfeld',
      goalsUs: 24, goalsThem: 21, note: 'Testspiel',
    }),
    ev({
      kind: 'match', date: '2026-06-27', time: '18:00', home: false,
      opponentId: neuss.id, hall: 'Stadthalle Neuss',
      goalsUs: 19, goalsThem: 27, note: 'Testspiel',
    }),
    // Kommende Termine
    ev({ kind: 'training', date: '2026-07-14', time: '19:30', hall: 'Halle Süd' }),
    ev({ kind: 'training', date: '2026-07-16', time: '19:30', hall: 'Sporthalle Ehrenfeld' }),
    ev({ kind: 'tournament', date: '2026-08-15', time: '10:00', hall: 'Sporthalle Ehrenfeld', note: 'Rhein-Cup (Vorbereitung)' }),
    ev({
      kind: 'match', date: '2026-09-05', time: '18:00', home: false,
      opponentId: zollstock.id, hall: 'Südhalle Köln', note: 'Saisonauftakt',
    }),
    ev({
      kind: 'match', date: '2026-09-12', time: '17:00', home: true,
      opponentId: dellbrueck.id, hall: 'Sporthalle Ehrenfeld',
    }),
  ]
  const testspiel1 = events[0]
  const testspiel2 = events[1]

  await db.transaction(
    'rw',
    [db.players, db.opponents, db.events, db.appearances, db.absences, db.notes, db.settings],
    async () => {
      await db.players.bulkAdd(players)
      await db.opponents.bulkAdd(opponents)
      await db.events.bulkAdd(events)

      // Einsatz-Historie: Lena hat 2 D1-Einsätze in Folge (festgespielt),
      // Emma einen (Warnung). Stammspielerinnen haben normale Einsätze.
      await db.appearances.bulkAdd([
        ...[marie, aylin, nina, johanna, paula, zoe, sarah].map((pl) => ({
          id: uid(), playerId: pl.id, eventId: testspiel1.id,
          date: testspiel1.date, team: 'D1' as const,
          goals: pl.id === nina.id ? 6 : pl.id === aylin.id ? 5 : 2,
        })),
        { id: uid(), playerId: lena.id, eventId: testspiel1.id, date: testspiel1.date, team: 'D1', goals: 3 },
        ...[marie, aylin, nina, johanna, paula, frieda, merle].map((pl) => ({
          id: uid(), playerId: pl.id, eventId: testspiel2.id,
          date: testspiel2.date, team: 'D1' as const,
          goals: pl.id === nina.id ? 4 : 1,
        })),
        { id: uid(), playerId: lena.id, eventId: testspiel2.id, date: testspiel2.date, team: 'D1', goals: 5 },
        { id: uid(), playerId: emma.id, eventId: testspiel2.id, date: testspiel2.date, team: 'D1', bench: true },
      ])

      await db.absences.bulkAdd([
        { id: uid(), playerId: carla.id, category: 'verletzung', from: '2026-06-28', to: '2026-07-30', note: 'Bänderriss' },
        { id: uid(), playerId: merle.id, category: 'urlaub', from: '2026-07-12', to: '2026-07-26' },
        { id: uid(), playerId: hanna.id, category: 'verletzung', from: '2026-03-01', to: '2026-10-31', note: 'Knie-OP, Langzeitausfall' },
      ])

      await db.notes.bulkAdd([
        {
          id: uid(), playerId: nina.id, category: 'spiel', date: testspiel1.date,
          eventId: testspiel1.id, rating: 5,
          text: 'Starke Spielsteuerung, 6 Tore. Nimmt im Angriff viel Druck raus.',
          createdAt: now,
        },
        {
          id: uid(), playerId: lena.id, category: 'spiel', date: testspiel2.date,
          eventId: testspiel2.id, rating: 4,
          text: 'Als Gast sofort integriert, 5 Tore aus dem Rückraum. Achtung: jetzt festgespielt.',
          createdAt: now,
        },
        {
          id: uid(), category: 'training', date: '2026-07-07', rating: 3,
          text: 'Tempogegenstoß-Training: erste Welle gut, zweite Welle kommt zu spät. Donnerstag wiederholen.',
          createdAt: now,
        },
      ])

      const settings: Settings = {
        id: 'app',
        clubName: 'TuS Köln-Ehrenfeld 1865',
        teamName: '1. Damen',
        theme: 'auto',
        seasonStart: '2026-07-01',
      }
      await db.settings.put(settings)
    },
  )
}

export { todayIso }
