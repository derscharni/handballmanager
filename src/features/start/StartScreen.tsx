import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { StartScreenProps } from '../props'
import { db, todayIso } from '../../lib/db'
import type { Appearance, MatchEvent, Note, NoteCategory, Player } from '../../lib/types'
import { TEAM_LABEL } from '../../lib/types'
import { computeFestspielStatus, type FestspielStatus } from '../../lib/festspiel'
import { availabilityOn } from '../../lib/availability'
import { fmtDate, fmtDayDate, playerName } from '../../lib/format'
import { Avatar } from '../../components/Avatar'
import { Crest } from '../../components/Crest'
import { Badge, Card, EmptyState, SectionTitle } from '../../components/ui'
import { LockIcon, MicIcon, QuickCaptureSheet } from './QuickCaptureSheet'
import { daysUntilLabel, upcomingBirthdays, type BirthdayEntry } from './birthdays'
import { countAttendance, isRosterPlayer, type AttendanceCounts } from '../spielplan/attendance'
import { AttendanceBar } from '../spielplan/AttendanceRow'

const CATEGORY_LABEL: Record<NoteCategory, string> = {
  allgemein: 'Allgemein',
  training: 'Training',
  spiel: 'Spiel',
}
const CATEGORY_TONE: Record<NoteCategory, 'neutral' | 'ok' | 'accent'> = {
  allgemein: 'neutral',
  training: 'ok',
  spiel: 'accent',
}

const EVENT_KIND_LABEL: Record<MatchEvent['kind'], string> = {
  match: 'Spieltag',
  training: 'Training',
  tournament: 'Turnier',
  sonstiges: 'Event',
}

/** "TuS Köln-Ehrenfeld 1865" → "Köln-Ehrenfeld" (Poster-Kurzform). */
function clubShortName(clubName: string): string {
  const short = clubName
    .replace(/^(TuS|TSV|TV|SG|HSG|SC|VfL|SV|DJK)\s+/i, '')
    .replace(/\s+\d{4}$/, '')
    .trim()
  return short || clubName
}

function opponentInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w))
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function eventSortKey(e: MatchEvent): string {
  return `${e.date}T${e.time ?? '00:00'}`
}

/** Tickende "Jetzt"-Zeit für den Countdown. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export default function StartScreen({ goTo, openPlayer }: StartScreenProps) {
  const today = todayIso()

  const settings = useLiveQuery(() => db.settings.get('app'), [])
  const players = useLiveQuery(() => db.players.toArray(), [])
  const events = useLiveQuery(() => db.events.toArray(), [])
  const appearances = useLiveQuery(() => db.appearances.toArray(), [])
  const absences = useLiveQuery(() => db.absences.toArray(), [])
  const notes = useLiveQuery(() => db.notes.toArray(), [])
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])
  const attendance = useLiveQuery(() => db.attendance.toArray(), [])

  const [captureOpen, setCaptureOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  /* ---------- Nächster Spieltag / nächster Termin ---------- */
  const upcoming = useMemo(
    () =>
      (events ?? [])
        .filter((e) => e.date >= today)
        .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b))),
    [events, today],
  )
  const nextMatch = upcoming.find((e) => e.kind === 'match')
  const heroEvent = nextMatch ?? upcoming[0]

  const heroSquad = useLiveQuery(
    () => (heroEvent ? db.squads.where('eventId').equals(heroEvent.id).first() : undefined),
    [heroEvent?.id],
  )

  /* ---------- Festspiel-Warnungen ---------- */
  const festspielAlerts = useMemo(() => {
    if (!players || !appearances) return []
    const byPlayer = new Map<string, Appearance[]>()
    for (const a of appearances) {
      const list = byPlayer.get(a.playerId)
      if (list) list.push(a)
      else byPlayer.set(a.playerId, [a])
    }
    return players
      .map((p) => ({
        player: p,
        status: computeFestspielStatus(p.team, byPlayer.get(p.id) ?? [], today),
      }))
      .filter((x) => x.status.state !== 'frei')
      .sort((a, b) => {
        const rank = (s: FestspielStatus) => (s.state === 'festgespielt' ? 0 : 1)
        return rank(a.status) - rank(b.status)
      })
  }, [players, appearances, today])

  /* ---------- Nächstes Training ---------- */
  const nextTraining = upcoming.find((e) => e.kind === 'training')
  const roster = useMemo(() => (players ?? []).filter(isRosterPlayer), [players])
  const trainingAbsent = useMemo(() => {
    if (!nextTraining || !absences) return []
    return roster
      .map((p) => ({ player: p, avail: availabilityOn(p, absences, nextTraining.date) }))
      .filter((x) => !x.avail.available)
  }, [nextTraining, roster, absences])

  /* ---------- Rückmeldungs-Zähler (Zu-/Absagen aus db.attendance) ---------- */
  const trainingCounts = useMemo(
    () =>
      nextTraining
        ? countAttendance(
            roster,
            (attendance ?? []).filter((r) => r.eventId === nextTraining.id),
          )
        : null,
    [nextTraining, roster, attendance],
  )
  const heroCounts = useMemo(
    () =>
      heroEvent
        ? countAttendance(
            roster,
            (attendance ?? []).filter((r) => r.eventId === heroEvent.id),
          )
        : null,
    [heroEvent, roster, attendance],
  )

  /* ---------- Letzte Notizen ---------- */
  const lastNotes = useMemo(
    () =>
      [...(notes ?? [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [notes],
  )
  const playerById = useMemo(
    () => new Map((players ?? []).map((p) => [p.id, p])),
    [players],
  )
  const opponentById = useMemo(
    () => new Map((opponents ?? []).map((o) => [o.id, o])),
    [opponents],
  )
  const eventById = useMemo(
    () => new Map((events ?? []).map((e) => [e.id, e])),
    [events],
  )

  /* ---------- Geburtstage (heute + 14 Tage) ---------- */
  const birthdayEntries = useMemo(
    () => upcomingBirthdays(players ?? [], today),
    [players, today],
  )

  const loading = !players || !events || !appearances || !absences || !notes || !attendance

  const clubName = settings?.clubName ?? 'TuS Köln-Ehrenfeld 1865'
  const teamName = settings?.teamName ?? '1. Damen'

  if (loading) {
    return (
      <div className="flex h-[50dvh] items-center justify-center font-display uppercase tracking-wide text-muted">
        Lädt …
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* ================= 1) KOPF ================= */}
      <header className="flex items-center gap-3 px-1 pb-3 pt-2">
        <Crest size={40} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[17px] font-bold uppercase leading-tight tracking-wide text-ink">
            {clubName}
          </h1>
          <p className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-muted">
            {teamName}
          </p>
        </div>
      </header>

      {/* ================= 2) SPIELTAG-POSTER ================= */}
      {heroEvent ? (
        <PosterHero
          event={heroEvent}
          opponentName={
            heroEvent.opponentId
              ? (opponentById.get(heroEvent.opponentId)?.name ?? 'Gegner offen')
              : undefined
          }
          clubName={clubName}
          squad={heroSquad ?? null}
          counts={heroCounts}
          onCta={() => goTo(heroEvent.kind === 'match' ? 'planung' : 'spielplan')}
        />
      ) : (
        <EmptyState
          title="Kein Termin geplant"
          hint="Lege im Spielplan das nächste Spiel oder Training an."
          action={
            <button
              onClick={() => goTo('spielplan')}
              className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-accent-soft px-4 font-display text-[14px] font-bold uppercase tracking-wide text-accent"
            >
              Zum Spielplan
            </button>
          }
        />
      )}

      {/* ================= 3) FESTSPIEL-WARNUNGEN ================= */}
      <SectionTitle>Gäste &amp; Festspiel · §55 SpO</SectionTitle>
      {festspielAlerts.length > 0 ? (
        <Card className="divide-y divide-line overflow-hidden">
          {festspielAlerts.map(({ player, status }) => (
            <FestspielRow
              key={player.id}
              player={player}
              status={status}
              onOpen={() => openPlayer(player.id)}
            />
          ))}
        </Card>
      ) : (
        <Card className="px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ok">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.5 12.5 10 18 19.5 7" />
            </svg>
            Keine Festspiel-Risiken im Kader.
          </p>
        </Card>
      )}

      {/* ================= 4) NÄCHSTES TRAINING ================= */}
      <SectionTitle>Nächstes Training</SectionTitle>
      {nextTraining ? (
        <Card className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate font-display text-[15px] font-bold uppercase tracking-wide text-ink">
              Training{nextTraining.hall ? ` · ${nextTraining.hall}` : ''}
            </p>
            <p className="tnum shrink-0 text-[13px] font-semibold text-muted">
              {fmtDayDate(nextTraining.date)}
              {nextTraining.time ? ` · ${nextTraining.time}` : ''}
            </p>
          </div>
          {trainingCounts && roster.length > 0 && (
            <div className="mt-2.5 flex items-center gap-1.5">
              <Badge tone="ok">
                <span className="tnum">{trainingCounts.zugesagt}</span>&nbsp;zugesagt
              </Badge>
              <Badge tone="crit">
                <span className="tnum">{trainingCounts.abgesagt}</span>&nbsp;abgesagt
              </Badge>
              <Badge tone="neutral">
                <span className="tnum">{trainingCounts.offen + trainingCounts.unsicher}</span>
                &nbsp;offen
              </Badge>
              <AttendanceBar counts={trainingCounts} />
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            {trainingAbsent.length === 0 ? (
              <Badge tone="ok">Alle {roster.length} verfügbar</Badge>
            ) : (
              <>
                <Badge tone="warn">
                  <span className="tnum">{trainingAbsent.length}</span>&nbsp;abwesend
                </Badge>
                <p className="min-w-0 truncate text-[12.5px] text-muted">
                  {trainingAbsent.map((x) => x.player.firstName).join(', ')}
                </p>
              </>
            )}
          </div>
        </Card>
      ) : (
        <Card className="px-4 py-3">
          <p className="text-[13px] text-muted">Kein Training geplant.</p>
        </Card>
      )}

      {/* ================= 5) GEBURTSTAGE ================= */}
      {birthdayEntries.length > 0 && (
        <>
          <SectionTitle>Geburtstage</SectionTitle>
          <Card className="divide-y divide-line overflow-hidden">
            {birthdayEntries.map((entry) => (
              <BirthdayRow
                key={entry.player.id}
                entry={entry}
                onOpen={() => openPlayer(entry.player.id)}
              />
            ))}
          </Card>
        </>
      )}

      {/* ================= 6) LETZTE NOTIZEN ================= */}
      <SectionTitle
        action={
          lastNotes.length > 0 ? (
            <span className="tnum text-[12px] text-muted">{notes.length} gesamt</span>
          ) : undefined
        }
      >
        <span className="inline-flex items-center gap-1.5">
          Letzte Notizen
          <span title="Nur Trainerteam">
            <LockIcon className="h-3 w-3" />
          </span>
        </span>
      </SectionTitle>
      {lastNotes.length > 0 ? (
        <Card className="divide-y divide-line overflow-hidden">
          {lastNotes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              player={n.playerId ? playerById.get(n.playerId) : undefined}
              event={n.eventId ? eventById.get(n.eventId) : undefined}
              teamName={teamName}
            />
          ))}
        </Card>
      ) : (
        <EmptyState
          title="Noch keine Notizen"
          hint="Halte Eindrücke aus Training und Spiel direkt per Sprache fest."
        />
      )}

      {/* ================= 7) QUICK-CAPTURE ================= */}
      <button
        onClick={() => setCaptureOpen(true)}
        className="sticky bottom-20 z-30 mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-btn-bg font-display text-[16px] font-bold uppercase tracking-wide text-btn-ink shadow-[0_10px_26px_rgba(7,18,48,0.38)] active:opacity-90"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15">
          <MicIcon className="h-5 w-5" />
        </span>
        Eindruck festhalten
      </button>

      <QuickCaptureSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        players={players}
        events={events}
        opponents={opponents ?? []}
        onSaved={() => showToast('Notiz gespeichert')}
      />

      {/* ---------- Inline-Toast ---------- */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-club-900 px-4 py-2.5 text-[13px] font-semibold text-club-on shadow-card"
        >
          {toast}
        </div>
      )}
    </div>
  )
}

/* ==================================================================
   Spieltag-Poster (Hero)
   ================================================================== */
function PosterHero({
  event,
  opponentName,
  clubName,
  squad,
  counts,
  onCta,
}: {
  event: MatchEvent
  opponentName?: string
  clubName: string
  squad: { status: 'entwurf' | 'freigegeben'; nominations: unknown[] } | null
  /** Rückmeldungs-Zähler des Termins; Zeile erscheint nur, wenn Rückmeldungen existieren. */
  counts?: AttendanceCounts | null
  onCta: () => void
}) {
  const isMatch = event.kind === 'match'
  const now = useNow(30_000)
  const target = new Date(`${event.date}T${event.time ?? '00:00'}:00`).getTime()
  const diff = Math.max(0, target - now)
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)

  return (
    <section
      className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-poster-a to-poster-b p-4 pb-4 text-poster-ink shadow-card"
      aria-label={isMatch ? 'Nächster Spieltag' : 'Nächster Termin'}
    >
      {/* feine Pinstripes + Wappen-Wasserzeichen */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(112deg, transparent 0 16px, rgba(255,255,255,.035) 16px 17px)',
        }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -bottom-11 -right-9 opacity-10" aria-hidden="true">
        <Crest size={190} />
      </div>

      <div className="relative flex items-center justify-between font-display text-[11.5px] font-bold uppercase tracking-[0.14em] opacity-80">
        <span>{EVENT_KIND_LABEL[event.kind]}</span>
        {isMatch && (
          <span className="rounded-full border border-white/40 px-2.5 py-0.5 tracking-[0.1em]">
            {event.home ? 'Heim' : 'Auswärts'}
          </span>
        )}
      </div>

      {isMatch && opponentName ? (
        <div className="relative mx-1 my-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            <Crest size={46} />
            <p className="font-display text-[19px] font-bold uppercase leading-[0.98] tracking-wide [text-wrap:balance]">
              {clubShortName(clubName)}
            </p>
          </div>
          <span className="font-display text-[28px] font-bold uppercase opacity-55" aria-hidden="true">
            VS
          </span>
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            <span
              className="grid h-[46px] w-[46px] place-items-center rounded-full border border-white/30 bg-white/10 font-display text-[17px] font-bold"
              aria-hidden="true"
            >
              {opponentInitials(opponentName)}
            </span>
            <p className="font-display text-[19px] font-bold uppercase leading-[0.98] tracking-wide [text-wrap:balance]">
              {opponentName}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative my-4 text-center">
          <p className="font-display text-[22px] font-bold uppercase leading-tight tracking-wide [text-wrap:balance]">
            {event.kind === 'sonstiges'
              ? event.title || EVENT_KIND_LABEL.sonstiges
              : event.note || EVENT_KIND_LABEL[event.kind]}
          </p>
        </div>
      )}

      <p className="tnum relative flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[12.5px] opacity-90">
        <span>
          {fmtDayDate(event.date)}
          {event.time ? ` · ${event.time}` : ''}
        </span>
        {event.hall && (
          <>
            <span aria-hidden="true">·</span>
            <span>{event.hall}</span>
          </>
        )}
      </p>

      {/* Countdown */}
      {event.time ? (
        <div
          className="relative mt-3.5 grid grid-cols-3 gap-2"
          role="img"
          aria-label={`Anwurf in ${days} Tagen`}
        >
          {[
            [days, 'Tage'],
            [hours, 'Std'],
            [mins, 'Min'],
          ].map(([val, label]) => (
            <div
              key={label}
              className="rounded-xl border border-white/15 bg-white/10 px-1 pb-1.5 pt-2 text-center"
            >
              <b className="tnum block font-display text-[27px] font-bold leading-none">
                {String(val).padStart(2, '0')}
              </b>
              <span className="text-[10px] uppercase tracking-[0.12em] opacity-75">{label}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="tnum relative mt-3.5 text-center font-display text-[27px] font-bold uppercase leading-none tracking-wide">
          {days === 0 ? 'Heute' : days === 1 ? 'Morgen' : `in ${days} Tagen`}
        </p>
      )}

      {/* Rückmeldungen (Zu-/Absagen), falls schon welche vorliegen */}
      {counts && counts.responses > 0 && (
        <p className="tnum relative mt-2.5 flex items-center justify-center gap-x-1.5 text-center text-[11.5px] font-bold uppercase tracking-[0.08em] opacity-90">
          <span className="text-club-acc">{counts.zugesagt} zugesagt</span>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span>{counts.abgesagt} abgesagt</span>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span className="opacity-75">{counts.offen + counts.unsicher} offen</span>
        </p>
      )}

      {/* Kader-Status */}
      {isMatch && squad && (
        <div className="relative mt-3 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em]">
            <span
              className={`h-2 w-2 rounded-full ${
                squad.status === 'freigegeben' ? 'bg-club-acc' : 'bg-white/60'
              }`}
              aria-hidden="true"
            />
            {squad.status === 'freigegeben' ? 'Freigegeben' : 'Entwurf'} ·{' '}
            <span className="tnum">{squad.nominations.length}</span> nominiert
          </span>
        </div>
      )}

      <button
        onClick={onCta}
        className="relative mt-3.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-club-acc font-display text-[14px] font-bold uppercase tracking-wide text-club-acc-ink active:opacity-90"
      >
        {isMatch ? (
          <>
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
              <path d="M12 5v14" />
              <circle cx="12" cy="12" r="2.6" />
            </svg>
            Kader planen
          </>
        ) : (
          'Zum Spielplan'
        )}
      </button>
    </section>
  )
}

/* ==================================================================
   Festspiel-Warnungszeile
   ================================================================== */
function FestspielRow({
  player,
  status,
  onOpen,
}: {
  player: Player
  status: FestspielStatus
  onOpen: () => void
}) {
  const crit = status.state === 'festgespielt'
  const teamLabel = status.team ? TEAM_LABEL[status.team] : ''
  return (
    <button
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left active:bg-card-2"
    >
      <Avatar player={player} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
          <span className="truncate">{playerName(player)}</span>
          {player.isGuest && <Badge tone="guest">Gast · {TEAM_LABEL[player.team]}</Badge>}
        </p>
        <p className={`text-[12.5px] leading-snug ${crit ? 'text-crit' : 'text-warn'}`}>
          {crit
            ? `Festgespielt in ${teamLabel} bis ${status.blockedUntil ? fmtDate(status.blockedUntil) : '—'}`
            : `${status.consecutive} Einsatz in ${teamLabel} — nächster Einsatz in Folge spielt sie fest`}
        </p>
      </div>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </button>
  )
}

/* ==================================================================
   Geburtstags-Zeile — heute gefeiert, kommende als kompakte Liste
   ================================================================== */
function BirthdayRow({
  entry,
  onOpen,
}: {
  entry: BirthdayEntry<Player>
  onOpen: () => void
}) {
  const { player, daysUntil, turns } = entry
  if (daysUntil === 0) {
    return (
      <button
        onClick={onOpen}
        className="flex min-h-14 w-full items-center gap-3 bg-club-acc px-3 py-3 text-left text-club-acc-ink active:opacity-90"
      >
        <Avatar player={player} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15px] font-bold uppercase tracking-wide">
            {player.firstName} wird heute {turns}!
          </span>
          <span className="block text-[12px] font-semibold opacity-85">
            Herzlichen Glückwunsch vom Trainerteam
          </span>
        </span>
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20"
          aria-hidden="true"
        >
          <CakeIcon className="h-5 w-5" />
        </span>
      </button>
    )
  }
  return (
    <button
      onClick={onOpen}
      className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-card-2"
    >
      <Avatar player={player} size="sm" />
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
        {playerName(player)}
      </span>
      <span className="tnum shrink-0 text-[12.5px] text-muted">
        {daysUntilLabel(daysUntil)} · wird {turns}
      </span>
    </button>
  )
}

/** Kleiner Geburtstagskuchen (Konfetti-frei, aber warm). */
function CakeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
      <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
      <path d="M2 21h20" />
      <path d="M7 8v3M12 8v3M17 8v3" />
      <path d="M7 4h.01M12 4h.01M17 4h.01" />
    </svg>
  )
}

/* ==================================================================
   Notiz-Zeile inkl. Audio-Wiedergabe
   ================================================================== */
function NoteRow({
  note,
  player,
  event,
  teamName,
}: {
  note: Note
  player?: Player
  /** Verknüpfter Termin (falls die Notiz einen eventId-Bezug hat). */
  event?: MatchEvent
  teamName: string
}) {
  return (
    <div className="flex items-start gap-3 p-3">
      {player ? (
        <Avatar player={player} size="sm" className="mt-0.5" />
      ) : (
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-club-700 font-display text-[9px] font-bold text-club-on ring-1 ring-line"
          aria-hidden="true"
        >
          TuS
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted">
          <span className="tnum">{fmtDayDate(note.date)}</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-ink">
            {player ? playerName(player) : `Team ${teamName}`}
          </span>
          <Badge tone={CATEGORY_TONE[note.category]}>{CATEGORY_LABEL[note.category]}</Badge>
          {note.rating && <RatingDots rating={note.rating} />}
          {event && (
            <span className="tnum text-[11.5px] text-muted">
              → {event.kind === 'sonstiges' ? event.title || EVENT_KIND_LABEL.sonstiges : EVENT_KIND_LABEL[event.kind]}{' '}
              {fmtDayDate(event.date)}
            </span>
          )}
        </p>
        {note.text && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink">{note.text}</p>}
      </div>
      {note.audio && <AudioPlayButton blob={note.audio} />}
    </div>
  )
}

function RatingDots({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Bewertung ${rating} von 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${n <= rating ? 'bg-club-acc' : 'bg-line'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

/** Spielt den Audio-Blob einer Sprachnotiz ab; Object-URL wird sauber freigegeben. */
function AudioPlayButton({ blob }: { blob: Blob }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  function cleanup() {
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }

  useEffect(() => cleanup, [])

  function toggle() {
    if (playing) {
      cleanup()
      setPlaying(false)
      return
    }
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio
    const done = () => {
      cleanup()
      setPlaying(false)
    }
    audio.onended = done
    audio.onerror = done
    void audio.play().catch(done)
    setPlaying(true)
  }

  return (
    <button
      onClick={toggle}
      aria-label={playing ? 'Wiedergabe stoppen' : 'Sprachnotiz abspielen'}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
    >
      {playing ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5Z" />
        </svg>
      )}
    </button>
  )
}
