import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayIso } from '../../lib/db'
import type { Absence, Appearance, Note, Player } from '../../lib/types'
import { ABSENCE_LABEL, TEAM_LABEL } from '../../lib/types'
import { availabilityOn } from '../../lib/availability'
import { computeFestspielStatus } from '../../lib/festspiel'
import { fmtDate, fmtDateShort, fmtDayDate } from '../../lib/format'
import { Avatar } from '../../components/Avatar'
import { Badge, Button, Card, EmptyState, SectionTitle } from '../../components/ui'
import {
  AudioButton,
  inputCls,
  PositionChips,
  RatingDots,
  Toggle,
  TwoStepDelete,
  WarnIcon,
} from './shared'
import { TeamProfilCard } from '../team/kasse/TeamProfilCard'
import { TrainerGate } from '../../components/TrainerGate'
import { SkillsCard } from './SkillsCard'
import { PlayerFormSheet } from './PlayerFormSheet'
import { AbsenceSheet, AppearanceSheet, NoteSheet, NOTE_CATEGORY_LABEL } from './ProfilSheets'
import { downscalePhoto } from './photo'

export function KaderProfil({
  playerId,
  onBack,
}: {
  playerId: string
  onBack: () => void
}) {
  // null = nicht gefunden, undefined = lädt noch
  const player = useLiveQuery(
    async () => (await db.players.get(playerId)) ?? null,
    [playerId],
  )
  const absences = useLiveQuery(
    () => db.absences.where('playerId').equals(playerId).toArray(),
    [playerId],
  )
  const appearances = useLiveQuery(
    () => db.appearances.where('playerId').equals(playerId).toArray(),
    [playerId],
  )
  const notes = useLiveQuery(
    () => db.notes.where('playerId').equals(playerId).toArray(),
    [playerId],
  )

  if (player === undefined) {
    return (
      <div className="flex h-[40dvh] items-center justify-center font-display uppercase tracking-wide text-muted">
        Lädt …
      </div>
    )
  }
  if (player === null) {
    return (
      <div className="pt-2">
        <BackButton onBack={onBack} />
        <EmptyState
          title="Spielerin nicht gefunden"
          hint="Der Eintrag wurde möglicherweise gelöscht."
          action={<Button variant="secondary" onClick={onBack}>Zurück zum Kader</Button>}
        />
      </div>
    )
  }

  return (
    <ProfilInner
      player={player}
      absences={absences ?? []}
      appearances={appearances ?? []}
      notes={notes ?? []}
      onBack={onBack}
    />
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="mb-2 inline-flex min-h-11 items-center gap-1 px-1 font-display text-[14px] font-bold uppercase tracking-wide text-accent"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      Kader
    </button>
  )
}

function ProfilInner({
  player,
  absences,
  appearances,
  notes,
  onBack,
}: {
  player: Player
  absences: Absence[]
  appearances: Appearance[]
  notes: Note[]
  onBack: () => void
}) {
  const [showEdit, setShowEdit] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showAbsence, setShowAbsence] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoError, setPhotoError] = useState(false)

  const today = todayIso()
  const avail = availabilityOn(player, absences, today)
  const fest = computeFestspielStatus(player.team, appearances, today)

  const appsDesc = useMemo(
    () => [...appearances].sort((a, b) => b.date.localeCompare(a.date)),
    [appearances],
  )

  async function onPickPhoto(file: File | undefined) {
    if (!file) return
    setPhotoError(false)
    try {
      const blob = await downscalePhoto(file)
      await db.players.update(player.id, { photo: blob })
    } catch {
      setPhotoError(true)
    }
  }

  async function deletePlayer() {
    // Kaskade: Abwesenheiten, Notizen, Einsätze und Kader-Nominierungen mit entfernen.
    await db.transaction(
      'rw',
      [db.players, db.absences, db.notes, db.appearances, db.squads],
      async () => {
        await db.absences.where('playerId').equals(player.id).delete()
        await db.notes.where('playerId').equals(player.id).delete()
        await db.appearances.where('playerId').equals(player.id).delete()
        const squads = await db.squads.toArray()
        for (const s of squads) {
          const noms = s.nominations.filter((n) => n.playerId !== player.id)
          const released = s.releasedNominations?.filter((n) => n.playerId !== player.id)
          const changed =
            noms.length !== s.nominations.length ||
            (s.releasedNominations !== undefined &&
              released !== undefined &&
              released.length !== s.releasedNominations.length)
          if (changed) {
            await db.squads.update(s.id, {
              nominations: noms,
              releasedNominations: released,
              updatedAt: new Date().toISOString(),
            })
          }
        }
        await db.players.delete(player.id)
      },
    )
    onBack()
  }

  return (
    <div className="pb-6 pt-2">
      <BackButton onBack={onBack} />

      {/* ---------- Kopf ---------- */}
      <Card className="p-4">
        <div className="flex items-start gap-4">
          <Avatar player={player} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[24px] font-bold uppercase leading-tight tracking-wide">
              {player.firstName} {player.lastName}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {player.number != null && (
                <span className="text-[14px] font-bold text-muted tnum">#{player.number}</span>
              )}
              <PositionChips main={player.mainPosition} alt={player.altPosition} />
              {player.isGuest ? (
                <Badge tone="guest">
                  GAST · {TEAM_LABEL[player.team]}
                  {player.guestUntil ? ` · bis ${fmtDateShort(player.guestUntil)}` : ''}
                </Badge>
              ) : (
                <Badge tone="neutral">{TEAM_LABEL[player.team]}</Badge>
              )}
            </div>
            {player.birthday && (
              <p className="mt-1 text-[12px] text-muted tnum">
                {ageOf(player.birthday)} Jahre · *{fmtDate(player.birthday)}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 text-[12px] font-bold text-accent"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 8.5h3l1.6-2.2h6.8L17 8.5h3v10H4Z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                {player.photo ? 'Foto ändern' : 'Foto hinzufügen'}
              </button>
              {player.photo && (
                <button
                  onClick={() => void db.players.update(player.id, { photo: null })}
                  className="inline-flex min-h-11 items-center rounded-lg bg-crit-soft px-2.5 text-[12px] font-bold text-crit"
                >
                  Foto entfernen
                </button>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void onPickPhoto(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
            {photoError && (
              <p className="mt-1 text-[12px] font-semibold text-crit">
                Foto konnte nicht verarbeitet werden.
              </p>
            )}
          </div>
        </div>

        {/* Verfügbarkeit */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <Toggle
            checked={player.available}
            onChange={(v) => void db.players.update(player.id, { available: v })}
            label={player.available ? 'Verfügbar' : 'Nicht verfügbar'}
          />
          {avail.absence && (
            <Badge
              tone={
                avail.absence.category === 'verletzung' || avail.absence.category === 'krankheit'
                  ? 'crit'
                  : 'warn'
              }
            >
              {avail.reason}
            </Badge>
          )}
        </div>

        {/* Kommentar inline */}
        <div className="mt-3 border-t border-line pt-3">
          <span className="mb-1 block text-[12px] font-semibold text-muted">Kommentar</span>
          <textarea
            key={`${player.id}:${player.comment ?? ''}`}
            defaultValue={player.comment ?? ''}
            placeholder="Kommentar zur Spielerin …"
            className={`${inputCls} min-h-16 py-2.5`}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (player.comment ?? '')) {
                void db.players.update(player.id, { comment: v === '' ? undefined : v })
              }
            }}
          />
        </div>

        {/* Aktionen */}
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowEdit(true)}>
            Bearbeiten
          </Button>
          {player.isGuest && (
            <Button
              variant="accent"
              className="flex-1"
              onClick={() =>
                void db.players.update(player.id, { isGuest: false, guestUntil: undefined })
              }
            >
              Gast beenden
            </Button>
          )}
          <TwoStepDelete
            label="Löschen"
            confirmLabel="Wirklich löschen?"
            size="lg"
            onConfirm={() => void deletePlayer()}
            className="flex-1"
          />
        </div>
      </Card>

      {/* ---------- Festspiel-Status ---------- */}
      <SectionTitle
        action={
          <button
            onClick={() => setShowAppearance(true)}
            className="min-h-11 px-1 text-[13px] font-bold text-accent"
          >
            + Einsatz nachtragen
          </button>
        }
      >
        Festspiel-Status · §55 SpO
      </SectionTitle>
      <Card className="p-4">
        {fest.state === 'frei' && (
          <>
            <Badge tone="ok">Frei</Badge>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Kein laufender Einsatz-Zähler in einer höheren Mannschaft — Einsätze in allen
              Mannschaften möglich.
            </p>
          </>
        )}
        {fest.state === 'warnung' && fest.team && fest.lastHigherDate && (
          <>
            <Badge tone="warn">
              <WarnIcon className="h-3 w-3" />
              Warnung · 1. Einsatz
            </Badge>
            <p className="mt-2 text-[13px] leading-relaxed">
              1. Einsatz in der {TEAM_LABEL[fest.team]} am{' '}
              <b className="tnum">{fmtDate(fest.lastHigherDate)}</b> — der nächste Einsatz in Folge
              spielt sie fest.
            </p>
          </>
        )}
        {fest.state === 'festgespielt' && fest.team && fest.blockedUntil && (
          <>
            <Badge tone="crit">Festgespielt</Badge>
            <p className="mt-2 text-[13px] leading-relaxed">
              Festgespielt in der {TEAM_LABEL[fest.team]}
              {fest.lastHigherDate && (
                <>
                  {' '}
                  (letzter Einsatz <b className="tnum">{fmtDate(fest.lastHigherDate)}</b>)
                </>
              )}{' '}
              — gesperrt für niedrigere Mannschaften bis{' '}
              <b className="tnum">{fmtDate(fest.blockedUntil)}</b>.
            </p>
          </>
        )}

        {/* Einsatz-Historie */}
        <div className="mt-3 border-t border-line pt-2">
          <span className="block pb-1 text-[12px] font-semibold text-muted">
            Letzte Einsätze
          </span>
          {appsDesc.length === 0 ? (
            <p className="py-2 text-[13px] text-muted">Noch keine Einsätze erfasst.</p>
          ) : (
            <ul className="divide-y divide-line">
              {appsDesc.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-18 shrink-0 text-[13px] font-semibold tnum">
                    {fmtDate(a.date)}
                  </span>
                  <Badge tone={a.team === player.team ? 'neutral' : 'accent'}>
                    {TEAM_LABEL[a.team]}
                  </Badge>
                  {a.bench && <Badge tone="neutral">Bank</Badge>}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted tnum">
                    {a.goals != null ? `${a.goals} Tore` : ''}
                  </span>
                  {a.rating && <RatingDots rating={a.rating} />}
                  <TwoStepDelete
                    label="Löschen"
                    confirmLabel="Sicher?"
                    size="sm"
                    onConfirm={() => void db.appearances.delete(a.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ---------- Abwesenheiten ---------- */}
      <SectionTitle
        action={
          <button
            onClick={() => setShowAbsence(true)}
            className="min-h-11 px-1 text-[13px] font-bold text-accent"
          >
            + Eintragen
          </button>
        }
      >
        Abwesenheiten
      </SectionTitle>
      <AbsenceList absences={absences} today={today} />

      {/* ---------- Team: Ämter & offene Strafen ---------- */}
      <TeamProfilCard playerId={player.id} />

      {/* ---------- Fähigkeiten (Spinnennetz, nur Trainerteam) ---------- */}
      <div className="mt-3">
        <TrainerGate compact>
          <SkillsCard player={player} />
        </TrainerGate>
      </div>

      {/* ---------- Notizen (Teamleitung) ---------- */}
      <SectionTitle
        action={
          <button
            onClick={() => setShowNote(true)}
            className="min-h-11 px-1 text-[13px] font-bold text-accent"
          >
            + Notiz
          </button>
        }
      >
        <span className="inline-flex items-center gap-1.5">
          Notizen · Teamleitung
          <span title="Nur für das Trainerteam sichtbar">
            <LockIcon />
          </span>
        </span>
      </SectionTitle>
      <TrainerGate compact>
        <NotesCard notes={notes} appearances={appearances} />
      </TrainerGate>

      {/* ---------- Sheets ---------- */}
      <PlayerFormSheet open={showEdit} onClose={() => setShowEdit(false)} player={player} />
      <AppearanceSheet
        open={showAppearance}
        onClose={() => setShowAppearance(false)}
        player={player}
      />
      <AbsenceSheet open={showAbsence} onClose={() => setShowAbsence(false)} player={player} />
      <NoteSheet open={showNote} onClose={() => setShowNote(false)} player={player} />
    </div>
  )
}

/* ---------- Abwesenheiten ---------- */

function AbsenceList({ absences, today }: { absences: Absence[]; today: string }) {
  const sorted = useMemo(() => {
    const rank = (a: Absence) => {
      if (a.from <= today && today <= a.to) return 0 // aktiv
      if (a.from > today) return 1 // kommend
      return 2 // vergangen
    }
    return [...absences].sort((a, b) => {
      const r = rank(a) - rank(b)
      if (r !== 0) return r
      // aktiv/kommend: nächstliegende zuerst; vergangen: jüngste zuerst
      return rank(a) === 2 ? b.to.localeCompare(a.to) : a.from.localeCompare(b.from)
    })
  }, [absences, today])

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="Keine Abwesenheiten"
        hint="Urlaub, Verletzung oder Krankheit hier eintragen — der Kader-Status läuft automatisch mit."
      />
    )
  }

  return (
    <Card>
      <ul className="divide-y divide-line">
      {sorted.map((a) => {
        const active = a.from <= today && today <= a.to
        const past = a.to < today
        const tone = active
          ? a.category === 'verletzung' || a.category === 'krankheit'
            ? 'crit'
            : 'warn'
          : 'neutral'
        return (
          <li key={a.id} className={`flex items-center gap-2 px-3 py-2 ${past ? 'opacity-60' : ''}`}>
            <Badge tone={tone}>{ABSENCE_LABEL[a.category]}</Badge>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold tnum">
                {fmtDateShort(a.from)} – {fmtDateShort(a.to)}
                {active && <span className="ml-1.5 font-normal text-crit">· aktiv</span>}
              </span>
              {a.note && <span className="block truncate text-[12px] text-muted">{a.note}</span>}
            </span>
            <TwoStepDelete
              label="Löschen"
              confirmLabel="Sicher?"
              size="sm"
              onConfirm={() => void db.absences.delete(a.id)}
            />
          </li>
        )
      })}
      </ul>
    </Card>
  )
}

/* ---------- Notizen + Formkurve ---------- */

function NotesCard({ notes, appearances }: { notes: Note[]; appearances: Appearance[] }) {
  // Formkurve: Training- UND Spiel-Bewertungen gemischt, chronologisch.
  const ratingPoints = useMemo(() => {
    const pts: { date: string; rating: number }[] = []
    for (const n of notes) if (n.rating) pts.push({ date: n.date, rating: n.rating })
    for (const a of appearances) if (a.rating) pts.push({ date: a.date, rating: a.rating })
    pts.sort((a, b) => a.date.localeCompare(b.date))
    return pts.slice(-10)
  }, [notes, appearances])

  const notesDesc = useMemo(
    () =>
      [...notes].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      ),
    [notes],
  )

  if (notesDesc.length === 0 && ratingPoints.length === 0) {
    return (
      <EmptyState
        title="Noch keine Notizen"
        hint="Beobachtungen aus Training und Spiel festhalten — mit Bewertung entsteht die Formkurve."
      />
    )
  }

  return (
    <Card className="p-4">
      {ratingPoints.length >= 2 && (
        <div className="mb-3 border-b border-line pb-3">
          <span className="mb-1.5 block text-[12px] font-semibold text-muted">
            Formkurve · Trainereindruck 1–5
          </span>
          <Sparkline points={ratingPoints} />
        </div>
      )}
      {notesDesc.length === 0 ? (
        <p className="text-[13px] text-muted">Noch keine Notizen vorhanden.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notesDesc.map((n) => (
            <li key={n.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold tnum">{fmtDayDate(n.date)}</span>
                <Badge tone={n.category === 'spiel' ? 'accent' : 'neutral'}>
                  {NOTE_CATEGORY_LABEL[n.category]}
                </Badge>
                {n.rating && <RatingDots rating={n.rating} />}
              </div>
              <p className="text-[13px] leading-relaxed">{n.text}</p>
              {n.audio && (
                <div>
                  <AudioButton blob={n.audio} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Formkurve als SVG-Sparkline (letzte 10 Bewertungen, Fläche in Akzentfarbe). */
function Sparkline({ points }: { points: { date: string; rating: number }[] }) {
  const W = 120
  const H = 44
  const X0 = 6
  const X1 = 114
  const yFor = (rating: number) => 36 - (rating - 1) * 7.5
  const xFor = (i: number) =>
    points.length === 1 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (points.length - 1)

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.rating) }))
  const line = coords.map((c) => `${c.x},${c.y}`).join(' ')
  const area = `M ${coords.map((c) => `${c.x} ${c.y}`).join(' L ')} L ${coords[coords.length - 1].x} 40 L ${coords[0].x} 40 Z`
  const last = coords[coords.length - 1]

  return (
    <div>
      <div className="flex items-stretch gap-1.5">
        <div
          className="flex flex-col justify-between py-0.5 text-right text-[9px] leading-none text-muted tnum"
          aria-hidden="true"
        >
          <span>5</span>
          <span>3</span>
          <span>1</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-16 w-full"
          role="img"
          aria-label={`Formkurve: ${points.map((p) => p.rating).join(', ')}`}
        >
          {[6, 21, 36].map((y) => (
            <line
              key={y}
              x1={X0 - 2}
              y1={y}
              x2={X1 + 2}
              y2={y}
              stroke="var(--line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill="var(--accent-soft)" />
          <polyline
            points={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {coords.slice(0, -1).map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="2" fill="var(--accent)" />
          ))}
          <circle
            cx={last.x}
            cy={last.y}
            r="3.4"
            fill="var(--accent)"
            stroke="var(--card)"
            strokeWidth="1.5"
          />
        </svg>
      </div>
      <div className="mt-1 flex justify-between pl-4 text-[10px] text-muted tnum">
        <span>{fmtDateShort(points[0].date)}</span>
        {points.length > 1 && <span>{fmtDateShort(points[points.length - 1].date)}</span>}
      </div>
    </div>
  )
}

/** Alter in vollen Jahren am heutigen Tag. */
function ageOf(birthdayIso: string): number {
  const today = new Date()
  const [y, m, d] = birthdayIso.split('-').map(Number)
  let age = today.getFullYear() - y
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)
  if (beforeBirthday) age -= 1
  return age
}

/** Kleines Schloss — Notizen sind nur fürs Trainerteam (Regel B). */
function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Nur Trainerteam"
      role="img"
    >
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
