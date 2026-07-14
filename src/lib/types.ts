/**
 * Domänen-Typen des Handball Managers.
 *
 * Grundsätze:
 * - Datums-/Zeitwerte als ISO-Strings (YYYY-MM-DD bzw. ISO 8601) — IndexedDB-freundlich.
 * - IDs sind UUIDs (crypto.randomUUID()).
 * - Fotos/Audio liegen als Blob direkt in IndexedDB.
 */

export const POSITIONS = ['TW', 'LA', 'RA', 'KM', 'RL', 'RM', 'RR'] as const
export type Position = (typeof POSITIONS)[number]

export const POSITION_LABEL: Record<Position, string> = {
  TW: 'Torwart',
  LA: 'Linksaußen',
  RA: 'Rechtsaußen',
  KM: 'Kreismitte',
  RL: 'Rückraum links',
  RM: 'Rückraum mitte',
  RR: 'Rückraum rechts',
}

/** Mannschafts-Referenzen. D1 = eigenes Team (Fokus der App). */
export const TEAMS = ['D1', 'D2', 'AJ'] as const
export type TeamId = (typeof TEAMS)[number]

export const TEAM_LABEL: Record<TeamId, string> = {
  D1: '1. Damen',
  D2: '2. Damen',
  AJ: 'A-Jugend',
}

/** Rang für den Festspiel-Vergleich: höherer Wert = höhere Mannschaft. */
export const TEAM_RANK: Record<TeamId, number> = { D1: 2, D2: 1, AJ: 0 }

export interface Player {
  id: string
  firstName: string
  lastName: string
  mainPosition: Position
  altPosition?: Position
  /** Stammteam der Spielerin. D1 = Stammkader, alles andere = potenzielle Gäste. */
  team: TeamId
  /** Temporär ins Team geholt (Gäste-Konzept). */
  isGuest: boolean
  /** Gast-Zeitraum-Ende (ISO-Datum), optional. */
  guestUntil?: string
  /** Trikotnummer, optional. */
  number?: number
  /** Geburtstag (ISO-Datum), optional — für Reminder und Altersanzeige. */
  birthday?: string
  photo?: Blob | null
  /** Genereller Verfügbarkeitsschalter (unabhängig von Abwesenheiten). */
  available: boolean
  comment?: string
  createdAt: string
}

export type AbsenceCategory = 'urlaub' | 'verletzung' | 'krankheit' | 'sonstiges'

export const ABSENCE_LABEL: Record<AbsenceCategory, string> = {
  urlaub: 'Urlaub',
  verletzung: 'Verletzung',
  krankheit: 'Krankheit',
  sonstiges: 'Sonstiges',
}

export interface Absence {
  id: string
  playerId: string
  category: AbsenceCategory
  /** ISO-Datum, inklusiv. */
  from: string
  /** ISO-Datum, inklusiv. */
  to: string
  note?: string
}

export interface Opponent {
  id: string
  name: string
  shortName?: string
  league?: string
  hall?: string
  contact?: string
  logo?: Blob | null
}

export type EventKind = 'match' | 'training' | 'tournament' | 'sonstiges'
export type EventSource = 'manual' | 'ics' | 'handballnet'

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  match: 'Spiel',
  training: 'Training',
  tournament: 'Turnier',
  sonstiges: 'Event',
}

export interface MatchEvent {
  id: string
  kind: EventKind
  /** Titel für kind='sonstiges' (z.B. "Mannschaftsabend", "Helfereinsatz"). */
  title?: string
  /** ISO-Datum des Termins. */
  date: string
  /** Uhrzeit HH:MM, optional. */
  time?: string
  /** Nur bei kind='match': Heimspiel? */
  home?: boolean
  opponentId?: string
  hall?: string
  note?: string
  /** Ergebnis aus unserer Sicht; null/undefined = noch nicht gespielt. */
  goalsUs?: number | null
  goalsThem?: number | null
  source: EventSource
  /** Externe Referenz (z.B. handball.net-Spiel-ID) zur Import-Deduplizierung. */
  externalId?: string
  /** Hintergrundbild fürs teilbare Spieltag-Poster (Blob, unindiziert). */
  posterImage?: Blob | null
}

/**
 * Ein Einsatz einer Spielerin in einer Mannschaft an einem Datum.
 * Grundlage des Festspiel-Trackers. Bankeinsätze zählen laut Spielordnung
 * als Einsatz — `bench` dient nur der Dokumentation.
 */
export interface Appearance {
  id: string
  playerId: string
  /** Verknüpfter Termin, falls vorhanden (manuell nachgetragene Einsätze haben keinen). */
  eventId?: string
  /** ISO-Datum des Einsatzes. */
  date: string
  /** In welcher Mannschaft der Einsatz stattfand. */
  team: TeamId
  bench?: boolean
  /** Tore in diesem Einsatz (manuell ergänzt oder aus Spielbericht). */
  goals?: number
  positionPlayed?: Position
  /** Minuten Spielzeit, optional. */
  minutes?: number
  /** Individuelle Spielbewertung 1–5 (nur Teamleitung). */
  rating?: 1 | 2 | 3 | 4 | 5
  note?: string
}

export type NoteCategory = 'training' | 'spiel' | 'allgemein'

/**
 * Trainer-Notiz (Second-Brain-Eintrag).
 *
 * SICHTBARKEIT: Notizen sind ausschließlich für das Trainerteam bestimmt.
 * Sie dürfen NIEMALS in Spielerinnen-Ansichten (Kader-Freigabe-Vorschau),
 * WhatsApp-/Share-Texten oder anderen nach außen gerichteten Flächen
 * gerendert werden. Phase 2 (Multi-User) erzwingt das serverseitig über
 * die Trainer-Rolle.
 *
 * VERKNÜPFUNG: Jede Notiz braucht mindestens eine Bezugsgröße —
 * playerId und/oder eventId (UI erzwingt das beim Erfassen).
 */
export interface Note {
  id: string
  /** Bezugs-Spielerin; ohne = Team-Notiz (dann ist eventId Pflicht). */
  playerId?: string
  /** Bezugs-Termin (Training/Spiel/Event); ohne ist playerId Pflicht. */
  eventId?: string
  category: NoteCategory
  /** ISO-Datum, auf das sich die Notiz bezieht. */
  date: string
  /** Trainingsbewertung 1–5, optional. */
  rating?: 1 | 2 | 3 | 4 | 5
  text: string
  /** Sprachnotiz (Audio-Blob), optional. */
  audio?: Blob | null
  createdAt: string
}

export interface SquadNomination {
  playerId: string
  position: Position
}

export type SquadStatus = 'entwurf' | 'freigegeben'

/** Spieltagskader (bis ~16 Spielerinnen, Positionen mehrfach besetzbar). */
export interface MatchdaySquad {
  id: string
  eventId: string
  status: SquadStatus
  nominations: SquadNomination[]
  meetTime?: string
  meetPlace?: string
  releasedAt?: string
  /** Snapshot der Nominierungen zum Zeitpunkt der letzten Freigabe. */
  releasedNominations?: SquadNomination[]
  updatedAt: string
}

/* ---------- Taktikboard ---------- */

export type TokenKind = 'own' | 'opp' | 'ball'
export type MaterialKind =
  | 'huetchen'
  | 'stange'
  | 'leiter'
  | 'matte'
  | 'minitor'
  | 'ball-extra'

export interface BoardToken {
  id: string
  kind: TokenKind
  /** Beschriftung, z.B. Positions-Kürzel oder Spielerinnen-Initialen. */
  label?: string
  playerId?: string
  /** Normierte Koordinaten 0..1 (x quer, y längs des Feldes). */
  x: number
  y: number
  /** Aufgezeichneter Laufweg als normierte Punktfolge. */
  path?: { x: number; y: number }[]
}

export interface BoardMaterial {
  id: string
  kind: MaterialKind
  x: number
  y: number
}

export interface TacticsBoard {
  id: string
  title: string
  field: 'full' | 'half'
  tokens: BoardToken[]
  materials: BoardMaterial[]
  updatedAt: string
}

/* ---------- Rückmeldungen (Zu-/Absagen) ---------- */

export type AttendanceStatus = 'zugesagt' | 'abgesagt' | 'unsicher'

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  zugesagt: 'Zugesagt',
  abgesagt: 'Abgesagt',
  unsicher: 'Unsicher',
}

/** Rückmeldung einer Spielerin zu einem Termin. Kein Eintrag = offen. */
export interface AttendanceResponse {
  id: string
  eventId: string
  playerId: string
  status: AttendanceStatus
  comment?: string
  updatedAt: string
}

/* ---------- Mannschaftskasse & Strafen ---------- */

/** Eintrag im Strafenkatalog (Beträge in Cent). */
export interface FineTemplate {
  id: string
  label: string
  amount: number
  active: boolean
  order: number
}

/** Verhängte Strafe. */
export interface Fine {
  id: string
  playerId: string
  /** Katalog-Referenz, falls aus dem Katalog verhängt. */
  templateId?: string
  label: string
  /** Cent. */
  amount: number
  /** ISO-Datum. */
  date: string
  paid: boolean
  paidAt?: string
  note?: string
}

/** Kassenbewegung außerhalb von Strafen (Cent; negativ = Ausgabe). */
export interface CashTransaction {
  id: string
  date: string
  amount: number
  label: string
}

/* ---------- Ämter ---------- */

/** Team-Amt (Bierwartin, Kassenwartin, Trikotwäsche, …). */
export interface Duty {
  id: string
  label: string
  /** Zugewiesene Spielerinnen (mehrere möglich). */
  playerIds: string[]
  note?: string
  order: number
}

/* ---------- Umfragen ---------- */

export interface PollOption {
  id: string
  label: string
}

export interface PollVote {
  playerId: string
  optionId: string
}

export interface Poll {
  id: string
  question: string
  options: PollOption[]
  votes: PollVote[]
  /** Mehrfachauswahl erlaubt? */
  multi: boolean
  status: 'offen' | 'geschlossen'
  createdAt: string
  note?: string
}

/* ---------- Einstellungen ---------- */

export interface Settings {
  /** Fester Key 'app' — genau ein Datensatz. */
  id: string
  clubName: string
  teamName: string
  theme: 'auto' | 'light' | 'dark'
  /** Vereinsfarben (Hex): Hauptfarbe + Akzent. Fehlt = TuS-Standard. */
  colors?: { primary: string; accent: string }
  /**
   * Trainerteam: Admin verwaltet die Liste; nur Trainer:innen sehen
   * Notizen/Bewertungen. In V1 lokal über die Trainer-PIN geschützt,
   * in Phase 2 (Multi-User) serverseitig über Rollen erzwungen.
   */
  trainerTeam?: { admin: string; trainers: string[] }
  /** SHA-256-Hash der Trainer-PIN; fehlt = keine Sperre aktiv. */
  trainerPinHash?: string
  /** Saisonstart (ISO-Datum) für Saison-Statistiken. */
  seasonStart: string
  /** handball.net-Team-URL für den Spielplan-Import, optional. */
  handballNetUrl?: string
  logo?: Blob | null
}
