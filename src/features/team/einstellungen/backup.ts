import { db, todayIso } from '../../../lib/db'

/**
 * Backup & Restore der kompletten IndexedDB als JSON-Datei.
 *
 * Local-first: Alle Daten liegen nur auf dem Gerät — der Export ist die
 * einzige Sicherung. Blobs (Fotos, Logos, Sprachnotizen) werden als
 * Base64 serialisiert und beim Import wieder in Blobs verwandelt.
 *
 * Sicherheitsprinzip beim Import: erst vollständig parsen und validieren,
 * DANN (und nur dann) in einer Transaktion löschen und einspielen.
 */

/** Alle Tabellen der Datenbank (v1 + v2). Reihenfolge = Export-Reihenfolge. */
export const BACKUP_TABLES = [
  'players',
  'absences',
  'opponents',
  'events',
  'appearances',
  'notes',
  'squads',
  'boards',
  'settings',
  'attendance',
  'fineTemplates',
  'fines',
  'cash',
  'duties',
  'polls',
] as const

export type BackupTableName = (typeof BACKUP_TABLES)[number]

/** Tabellen, die es erst seit Schema v2 gibt (fehlen in v1-Backups = leer). */
const V2_TABLES: ReadonlySet<BackupTableName> = new Set([
  'attendance',
  'fineTemplates',
  'fines',
  'cash',
  'duties',
  'polls',
])

export const BACKUP_VERSION = 2

export interface BackupFile {
  version: number
  exportedAt: string
  data: Partial<Record<BackupTableName, unknown[]>>
}

/** Geparstes, validiertes Backup — bereit zum Einspielen. */
export interface ParsedBackup {
  version: number
  exportedAt: string | null
  /** Deserialisierte Zeilen je Tabelle (Blobs bereits wiederhergestellt). */
  rows: Record<BackupTableName, unknown[]>
  /** Zusammenfassung für den Bestätigungsdialog. */
  summary: { label: string; count: number }[]
}

/** Verständliche, deutsche Fehlermeldung für die UI. */
export class BackupError extends Error {}

/* ---------- Blob <-> Base64 ---------- */

interface SerializedBlob {
  __blob: string
  type: string
}

function isSerializedBlob(v: unknown): v is SerializedBlob {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as SerializedBlob).__blob === 'string' &&
    typeof (v as SerializedBlob).type === 'string'
  )
}

/** Uint8Array → Base64, chunk-weise (vermeidet Stack-Overflow bei großen Fotos). */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK)
    let part = ''
    for (let j = 0; j < slice.length; j++) part += String.fromCharCode(slice[j])
    binary += part
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function serializeBlob(blob: Blob): Promise<SerializedBlob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return { __blob: bytesToBase64(bytes), type: blob.type }
}

function deserializeBlob(s: SerializedBlob): Blob {
  const bytes = base64ToBytes(s.__blob)
  return new Blob([bytes.buffer as ArrayBuffer], { type: s.type })
}

/** Tiefe Serialisierung: Blobs (photo, logo, audio, …) → {__blob, type}. */
async function serializeValue(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return serializeBlob(value)
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const item of value) out.push(await serializeValue(item))
    return out
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = await serializeValue(v)
    return out
  }
  return value
}

/** Tiefe Deserialisierung: {__blob, type} → Blob. */
function deserializeValue(value: unknown): unknown {
  if (isSerializedBlob(value)) return deserializeBlob(value)
  if (Array.isArray(value)) return value.map(deserializeValue)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = deserializeValue(v)
    return out
  }
  return value
}

/* ---------- Export ---------- */

/** Liest alle Tabellen und baut das serialisierbare Backup-Objekt. */
export async function createBackup(): Promise<BackupFile> {
  const data: Partial<Record<BackupTableName, unknown[]>> = {}
  for (const name of BACKUP_TABLES) {
    const rows = await db.table(name).toArray()
    data[name] = (await serializeValue(rows)) as unknown[]
  }
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }
}

export function backupFilename(dateIso: string = todayIso()): string {
  return `handball-manager-backup-${dateIso}.json`
}

/** Exportiert alle Daten und stößt den Datei-Download an. */
export async function exportBackup(): Promise<void> {
  const backup = await createBackup()
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = backupFilename()
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Etwas verzögert freigeben, damit der Download sicher gestartet ist.
    setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }
}

/* ---------- Import ---------- */

/** Deutsche Bezeichner für die Zusammenfassung im Bestätigungsdialog. */
const TABLE_LABEL: Record<BackupTableName, [singular: string, plural: string]> = {
  players: ['Spielerin', 'Spielerinnen'],
  absences: ['Abwesenheit', 'Abwesenheiten'],
  opponents: ['Gegner', 'Gegner'],
  events: ['Termin', 'Termine'],
  appearances: ['Einsatz', 'Einsätze'],
  notes: ['Notiz', 'Notizen'],
  squads: ['Spieltagskader', 'Spieltagskader'],
  boards: ['Taktikboard', 'Taktikboards'],
  settings: ['Einstellungs-Datensatz', 'Einstellungs-Datensätze'],
  attendance: ['Rückmeldung', 'Rückmeldungen'],
  fineTemplates: ['Strafenkatalog-Eintrag', 'Strafenkatalog-Einträge'],
  fines: ['Strafe', 'Strafen'],
  cash: ['Kassenbewegung', 'Kassenbewegungen'],
  duties: ['Amt', 'Ämter'],
  polls: ['Umfrage', 'Umfragen'],
}

/**
 * Parst und validiert eine Backup-Datei — ohne die Datenbank anzufassen.
 * Wirft BackupError mit verständlicher Meldung bei kaputtem/fremdem JSON.
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError(
      'Die Datei konnte nicht gelesen werden — sie ist kein gültiges JSON. Es wurden keine Daten verändert.',
    )
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BackupError('Die Datei ist kein Handball-Manager-Backup. Es wurden keine Daten verändert.')
  }
  const obj = raw as Record<string, unknown>

  const version = obj.version
  if (version !== 1 && version !== 2) {
    throw new BackupError(
      'Unbekannte Backup-Version. Unterstützt werden Backups der Version 1 und 2.',
    )
  }

  const data = obj.data
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new BackupError('Der Backup-Inhalt fehlt oder ist beschädigt. Es wurden keine Daten verändert.')
  }
  const tables = data as Record<string, unknown>

  const rows = {} as Record<BackupTableName, unknown[]>
  for (const name of BACKUP_TABLES) {
    const value = tables[name]
    if (value === undefined) {
      // v1-Backups kennen die v2-Tabellen noch nicht → leer importieren.
      if (version === 1 && V2_TABLES.has(name)) {
        rows[name] = []
        continue
      }
      if (version === 2) {
        throw new BackupError(`Im Backup fehlt die Tabelle „${name}“ — Datei beschädigt?`)
      }
      rows[name] = []
      continue
    }
    if (!Array.isArray(value)) {
      throw new BackupError(`Die Tabelle „${name}“ im Backup ist beschädigt. Es wurden keine Daten verändert.`)
    }
    for (const row of value) {
      if (typeof row !== 'object' || row === null || typeof (row as { id?: unknown }).id !== 'string') {
        throw new BackupError(`Ein Eintrag in „${name}“ ist ungültig (fehlende ID). Es wurden keine Daten verändert.`)
      }
    }
    rows[name] = deserializeValue(value) as unknown[]
  }

  const summary = BACKUP_TABLES.filter((name) => rows[name].length > 0 && name !== 'settings').map(
    (name) => {
      const count = rows[name].length
      return { label: TABLE_LABEL[name][count === 1 ? 0 : 1], count }
    },
  )

  return {
    version,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : null,
    rows,
    summary,
  }
}

/**
 * Spielt ein validiertes Backup ein: EINE Transaktion, alle Tabellen
 * leeren und neu befüllen. Schlägt etwas fehl, rollt Dexie alles zurück.
 */
export async function applyBackup(parsed: ParsedBackup): Promise<void> {
  const tables = BACKUP_TABLES.map((name) => db.table(name))
  await db.transaction('rw', tables, async () => {
    for (const name of BACKUP_TABLES) {
      const table = db.table(name)
      await table.clear()
      if (parsed.rows[name].length > 0) await table.bulkAdd(parsed.rows[name])
    }
  })
}

/**
 * Komfort-Funktion: Datei lesen + parsen + validieren (wirft BackupError),
 * die Datenbank bleibt dabei unangetastet. Einspielen danach via applyBackup.
 */
export async function readBackupFile(file: File): Promise<ParsedBackup> {
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new BackupError('Die Datei konnte nicht gelesen werden. Es wurden keine Daten verändert.')
  }
  return parseBackup(text)
}

/** Datei parsen und (nach externer Bestätigung) einspielen — kompletter Import. */
export async function importBackup(file: File): Promise<void> {
  const parsed = await readBackupFile(file)
  await applyBackup(parsed)
}
