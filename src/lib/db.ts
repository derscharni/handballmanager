import Dexie, { type EntityTable } from 'dexie'
import type {
  Absence,
  Appearance,
  MatchEvent,
  MatchdaySquad,
  Note,
  Opponent,
  Player,
  Settings,
  TacticsBoard,
} from './types'

/**
 * Local-First-Datenbank (IndexedDB via Dexie).
 * Alle Daten bleiben auf dem Gerät; Export/Import als Backup in lib/backup.ts.
 */
export class HbmDatabase extends Dexie {
  players!: EntityTable<Player, 'id'>
  absences!: EntityTable<Absence, 'id'>
  opponents!: EntityTable<Opponent, 'id'>
  events!: EntityTable<MatchEvent, 'id'>
  appearances!: EntityTable<Appearance, 'id'>
  notes!: EntityTable<Note, 'id'>
  squads!: EntityTable<MatchdaySquad, 'id'>
  boards!: EntityTable<TacticsBoard, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor() {
    super('handball-manager')
    this.version(1).stores({
      players: 'id, team, isGuest, lastName',
      absences: 'id, playerId, from, to',
      opponents: 'id, name',
      events: 'id, date, kind, opponentId, externalId',
      appearances: 'id, playerId, date, team, eventId',
      notes: 'id, playerId, eventId, date, category',
      squads: 'id, eventId, status',
      boards: 'id, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new HbmDatabase()

export function uid(): string {
  return crypto.randomUUID()
}

/** Heutiges Datum als ISO-String (lokale Zeitzone). */
export function todayIso(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}
