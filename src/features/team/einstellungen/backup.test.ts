import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, uid } from '../../../lib/db'
import type { Note, Player, Poll, Settings } from '../../../lib/types'
import {
  BACKUP_TABLES,
  BackupError,
  applyBackup,
  backupFilename,
  createBackup,
  parseBackup,
} from './backup'

/* ---------- Testdaten (seed-ähnlich, minimal, inkl. Blobs) ---------- */

const PHOTO_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 254, 255])
const AUDIO_BYTES = new Uint8Array(70_000).map((_, i) => i % 251) // > ein Base64-Chunk-Test wäre 32k; hier 70k

function makePlayer(): Player {
  return {
    id: uid(),
    firstName: 'Marie',
    lastName: 'Köhler',
    mainPosition: 'TW',
    team: 'D1',
    isGuest: false,
    number: 1,
    photo: new Blob([PHOTO_BYTES], { type: 'image/png' }),
    available: true,
    comment: 'Kapitänin — Umlaute äöüß bleiben erhalten',
    createdAt: '2026-07-01T10:00:00.000Z',
  }
}

function makeNote(playerId: string): Note {
  return {
    id: uid(),
    playerId,
    category: 'training',
    date: '2026-07-07',
    rating: 4,
    text: 'Sprachnotiz zum Training',
    audio: new Blob([AUDIO_BYTES], { type: 'audio/webm' }),
    createdAt: '2026-07-07T19:30:00.000Z',
  }
}

function makeSettings(): Settings {
  return {
    id: 'app',
    clubName: 'TuS Köln-Ehrenfeld 1865',
    teamName: '1. Damen',
    theme: 'dark',
    seasonStart: '2026-07-01',
    handballNetUrl: 'https://www.handball.net/mannschaften/beispiel',
  }
}

function makePoll(): Poll {
  const opt = uid()
  return {
    id: uid(),
    question: 'Saisonabschluss?',
    options: [{ id: opt, label: 'Kegeln' }],
    votes: [{ playerId: 'p-x', optionId: opt }],
    multi: false,
    status: 'offen',
    createdAt: '2026-07-01T12:00:00.000Z',
  }
}

async function seedMinimal() {
  const player = makePlayer()
  await db.players.add(player)
  await db.absences.add({
    id: uid(), playerId: player.id, category: 'urlaub', from: '2026-07-20', to: '2026-08-02',
  })
  const oppId = uid()
  await db.opponents.add({ id: oppId, name: 'HSG Köln-West', shortName: 'HKW' })
  const eventId = uid()
  await db.events.add({
    id: eventId, kind: 'match', date: '2026-08-15', time: '18:00',
    home: true, opponentId: oppId, source: 'manual',
  })
  await db.appearances.add({
    id: uid(), playerId: player.id, eventId, date: '2026-08-15', team: 'D1', goals: 3,
  })
  await db.notes.add(makeNote(player.id))
  await db.squads.add({
    id: uid(), eventId, status: 'entwurf',
    nominations: [{ playerId: player.id, position: 'TW' }],
    updatedAt: '2026-08-10T08:00:00.000Z',
  })
  await db.boards.add({
    id: uid(), title: 'Angriff 3:3', field: 'half',
    tokens: [{ id: uid(), kind: 'own', label: 'RM', x: 0.5, y: 0.4 }],
    materials: [], updatedAt: '2026-07-05T09:00:00.000Z',
  })
  await db.settings.put(makeSettings())
  await db.attendance.add({
    id: uid(), eventId, playerId: player.id, status: 'zugesagt',
    updatedAt: '2026-08-01T10:00:00.000Z',
  })
  await db.fineTemplates.add({ id: uid(), label: 'Zu spät', amount: 500, active: true, order: 0 })
  await db.fines.add({
    id: uid(), playerId: player.id, label: 'Zu spät', amount: 500, date: '2026-07-08', paid: false,
  })
  await db.cash.add({ id: uid(), date: '2026-07-01', amount: -1250, label: 'Bälle' })
  await db.duties.add({ id: uid(), label: 'Bierwartin', playerIds: [player.id], order: 0 })
  await db.polls.add(makePoll())
  return { player }
}

async function clearAll() {
  for (const name of BACKUP_TABLES) await db.table(name).clear()
}

async function tableCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const name of BACKUP_TABLES) out[name] = await db.table(name).count()
  return out
}

beforeEach(async () => {
  await db.open()
  await clearAll()
})

describe('Backup Round-Trip', () => {
  it('export → clear → import stellt alle Tabellen inkl. Blobs wieder her', async () => {
    const { player } = await seedMinimal()
    const before = await tableCounts()
    for (const name of BACKUP_TABLES) expect(before[name], name).toBe(1)

    // Export als JSON-Text (wie in der heruntergeladenen Datei)
    const backup = await createBackup()
    expect(backup.version).toBe(2)
    const json = JSON.stringify(backup)
    // Blobs dürfen im JSON nicht als leere Objekte landen
    expect(json).toContain('"__blob"')

    await clearAll()
    expect(await db.players.count()).toBe(0)

    const parsed = parseBackup(json)
    expect(parsed.summary.find((s) => s.label === 'Spielerin')?.count).toBe(1)
    await applyBackup(parsed)

    expect(await tableCounts()).toEqual(before)

    // Feldgenauer Vergleich (ohne Blob) …
    const restored = await db.players.get(player.id)
    expect(restored).toBeDefined()
    const { photo: origPhoto, ...origRest } = player
    const { photo: restPhoto, ...restRest } = restored!
    expect(restRest).toEqual(origRest)

    // … Blob-Inhalt byte-genau via arrayBuffer
    expect(restPhoto).toBeInstanceOf(Blob)
    expect(restPhoto!.type).toBe('image/png')
    expect(new Uint8Array(await restPhoto!.arrayBuffer())).toEqual(PHOTO_BYTES)
    expect(new Uint8Array(await (origPhoto as Blob).arrayBuffer())).toEqual(PHOTO_BYTES)

    // Großer Audio-Blob (> Base64-Chunkgröße) ebenfalls byte-genau
    const note = (await db.notes.toArray())[0]
    expect(note.audio).toBeInstanceOf(Blob)
    expect(note.audio!.type).toBe('audio/webm')
    expect(new Uint8Array(await note.audio!.arrayBuffer())).toEqual(AUDIO_BYTES)

    // Verschachtelte Strukturen (Poll-Votes, Squad-Nominierungen) intakt
    const poll = (await db.polls.toArray())[0]
    expect(poll.options).toHaveLength(1)
    expect(poll.votes[0].optionId).toBe(poll.options[0].id)
    const squad = (await db.squads.toArray())[0]
    expect(squad.nominations).toEqual([{ playerId: player.id, position: 'TW' }])

    // Settings inkl. Sonderfeldern
    const settings = await db.settings.get('app')
    expect(settings).toEqual(makeSettings())
  })

  it('akzeptiert v1-Backups: fehlende v2-Tabellen werden leer importiert', async () => {
    const player = makePlayer()
    delete (player as Partial<Player>).photo
    const v1 = JSON.stringify({
      version: 1,
      exportedAt: '2025-11-01T10:00:00.000Z',
      data: {
        players: [player], absences: [], opponents: [], events: [],
        appearances: [], notes: [], squads: [], boards: [],
        settings: [makeSettings()],
      },
    })
    const parsed = parseBackup(v1)
    expect(parsed.rows.fines).toEqual([])
    expect(parsed.rows.polls).toEqual([])
    await applyBackup(parsed)
    expect(await db.players.count()).toBe(1)
    expect(await db.fines.count()).toBe(0)
  })
})

describe('parseBackup — Fehlerfälle (Datenbank bleibt unangetastet)', () => {
  it('kaputtes JSON → BackupError, nichts gelöscht', async () => {
    await seedMinimal()
    expect(() => parseBackup('{ kaputt')).toThrow(BackupError)
    expect(() => parseBackup('{ kaputt')).toThrow(/kein gültiges JSON/)
    expect(await db.players.count()).toBe(1)
  })

  it('fremdes JSON ohne Version → BackupError', () => {
    expect(() => parseBackup('{"foo": 1}')).toThrow(BackupError)
    expect(() => parseBackup('[1,2,3]')).toThrow(BackupError)
    expect(() => parseBackup('"nur ein String"')).toThrow(BackupError)
  })

  it('unbekannte Version → BackupError', () => {
    expect(() => parseBackup(JSON.stringify({ version: 99, data: {} }))).toThrow(
      /Backup-Version/,
    )
  })

  it('v2-Backup mit fehlender Tabelle → BackupError', () => {
    const data: Record<string, unknown[]> = {}
    for (const name of BACKUP_TABLES) data[name] = []
    delete data.polls
    expect(() => parseBackup(JSON.stringify({ version: 2, data }))).toThrow(/polls/)
  })

  it('Eintrag ohne ID → BackupError', () => {
    const data: Record<string, unknown[]> = {}
    for (const name of BACKUP_TABLES) data[name] = []
    data.players = [{ firstName: 'Ohne', lastName: 'Id' }]
    expect(() => parseBackup(JSON.stringify({ version: 2, data }))).toThrow(/ungültig/)
  })
})

describe('Dateiname', () => {
  it('enthält das Datum: handball-manager-backup-YYYY-MM-DD.json', () => {
    expect(backupFilename('2026-07-12')).toBe('handball-manager-backup-2026-07-12.json')
    expect(backupFilename()).toMatch(/^handball-manager-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
