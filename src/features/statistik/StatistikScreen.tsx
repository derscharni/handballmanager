import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayIso } from '../../lib/db'
import { computeFestspielStatus, type FestspielStatus } from '../../lib/festspiel'
import { daysBetween, fmtDate, fmtDateShort, playerName } from '../../lib/format'
import {
  POSITIONS,
  POSITION_LABEL,
  TEAM_LABEL,
  type MatchEvent,
  type Player,
} from '../../lib/types'
import { Avatar } from '../../components/Avatar'
import { Badge, Card, EmptyState, SectionTitle, Segmented } from '../../components/ui'
import type { StatistikScreenProps } from '../props'
import {
  absentDaysInWindow,
  avg,
  computeRecord,
  fmtAvg,
  fmtSigned,
  isPlayedMatch,
  matchOutcome,
  opponentInitials,
  ratingPoints,
  type Outcome,
  type RatingPoint,
} from './stats'

/** Track-Hintergrund für alle Balken (rezessiv, folgt dem Theme). */
const TRACK = 'color-mix(in srgb, var(--muted) 14%, transparent)'
/** Sekundär-Balken (Einsätze): abgeschwächter Akzent. */
const ACCENT_DIM = 'color-mix(in srgb, var(--accent) 35%, transparent)'
/** Schraffur für Alternativ-Positionen. */
const HATCH = {
  backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  backgroundImage:
    'repeating-linear-gradient(45deg, var(--accent) 0 2px, transparent 2px 5px)',
  opacity: 0.55,
} as const

type Scope = 'saison' | 'gesamt'

export default function StatistikScreen({ openPlayer }: StatistikScreenProps) {
  const [scope, setScope] = useState<Scope>('saison')
  const [formPlayerId, setFormPlayerId] = useState<string | null>(null)
  const [showAllAvail, setShowAllAvail] = useState(false)

  const settings = useLiveQuery(() => db.settings.get('app'), [])
  const players = useLiveQuery(() => db.players.toArray(), [])
  const events = useLiveQuery(() => db.events.toArray(), [])
  const appearances = useLiveQuery(() => db.appearances.toArray(), [])
  const notes = useLiveQuery(() => db.notes.toArray(), [])
  const absences = useLiveQuery(() => db.absences.toArray(), [])
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])

  if (!players || !events || !appearances || !notes || !absences || !opponents) {
    return (
      <div className="flex h-[50dvh] items-center justify-center font-display uppercase tracking-wide text-muted">
        Lädt …
      </div>
    )
  }

  const today = todayIso()
  const seasonStart = settings?.seasonStart
  const inScope = (date: string) =>
    scope === 'gesamt' || !seasonStart || date >= seasonStart

  /* ---------- Kopf ---------- */
  const header = (
    <header className="px-1 pb-1 pt-2">
      <h1 className="font-display text-[26px] font-bold uppercase tracking-wide">
        Statistik
      </h1>
      <div className="mt-2">
        <Segmented<Scope>
          options={[
            { value: 'saison', label: 'Saison' },
            { value: 'gesamt', label: 'Gesamt' },
          ]}
          value={scope}
          onChange={setScope}
        />
      </div>
      {scope === 'saison' && seasonStart && (
        <p className="mt-1.5 px-1 text-[11px] text-muted">
          Saison ab {fmtDate(seasonStart)} — alles live aus deinen Daten.
        </p>
      )}
    </header>
  )

  if (players.length === 0 && events.length === 0 && appearances.length === 0) {
    return (
      <div>
        {header}
        <div className="pt-4">
          <EmptyState
            title="Noch keine Daten"
            hint="Lege Spielerinnen im Kader an, pflege Termine und Einsätze — die Statistik entsteht dann von selbst."
          />
        </div>
      </div>
    )
  }

  const playerById = new Map(players.map((p) => [p.id, p]))

  /* ---------- 1) Team-Bilanz ---------- */
  const playedMatches = events
    .filter((e) => isPlayedMatch(e) && inScope(e.date))
    .sort((a, b) => a.date.localeCompare(b.date))
  const record = computeRecord(playedMatches)
  const lastFive = playedMatches.slice(-5)

  /* ---------- 2) Einsätze & Tore ---------- */
  const d1Apps = appearances.filter((a) => a.team === 'D1' && inScope(a.date))
  const perPlayer = new Map<string, { einsaetze: number; tore: number }>()
  for (const a of d1Apps) {
    const e = perPlayer.get(a.playerId) ?? { einsaetze: 0, tore: 0 }
    e.einsaetze += 1
    e.tore += a.goals ?? 0
    perPlayer.set(a.playerId, e)
  }
  const einsatzRows = [...perPlayer.entries()]
    .map(([id, v]) => ({ player: playerById.get(id), ...v }))
    .filter((r): r is { player: Player; einsaetze: number; tore: number } => !!r.player)
    .sort((a, b) => b.tore - a.tore || b.einsaetze - a.einsaetze)
  const maxTore = Math.max(1, ...einsatzRows.map((r) => r.tore))
  const maxEinsaetze = Math.max(1, ...einsatzRows.map((r) => r.einsaetze))

  /* ---------- 3) Formkurve ---------- */
  const scopedNotes = notes.filter((n) => inScope(n.date))
  const scopedApps = appearances.filter((a) => inScope(a.date))
  const formCandidates = players
    .map((p) => ({ player: p, points: ratingPoints(p.id, scopedNotes, scopedApps) }))
    .filter((c) => c.points.length > 0)
    .sort(
      (a, b) =>
        b.points.length - a.points.length ||
        a.player.lastName.localeCompare(b.player.lastName),
    )
  const formSelected =
    formCandidates.find((c) => c.player.id === formPlayerId) ?? formCandidates[0]

  /* ---------- 4) Ø-Bewertungen ---------- */
  const ratingRows = players
    .map((p) => {
      const training = scopedNotes
        .filter((n) => n.playerId === p.id && n.category === 'training' && n.rating != null)
        .map((n) => n.rating as number)
      const spiel = [
        ...scopedApps
          .filter((a) => a.playerId === p.id && a.rating != null)
          .map((a) => a.rating as number),
        ...scopedNotes
          .filter((n) => n.playerId === p.id && n.category === 'spiel' && n.rating != null)
          .map((n) => n.rating as number),
      ]
      return { player: p, avgTraining: avg(training), avgSpiel: avg(spiel) }
    })
    .filter((r) => r.avgTraining != null || r.avgSpiel != null)
    .sort((a, b) => (b.avgSpiel ?? b.avgTraining ?? 0) - (a.avgSpiel ?? a.avgTraining ?? 0))

  /* ---------- 5) Verfügbarkeitsquote ---------- */
  const roster = players.filter((p) => p.team === 'D1' || p.isGuest)
  const availWindowOk = !!seasonStart && seasonStart <= today
  const totalDays = availWindowOk ? daysBetween(seasonStart, today) + 1 : 0
  const availRows = availWindowOk
    ? roster
        .map((p) => {
          const absent = Math.min(
            totalDays,
            absentDaysInWindow(absences, p.id, seasonStart, today),
          )
          const quote = totalDays > 0 ? 1 - absent / totalDays : 1
          return { player: p, absent, quote }
        })
        .sort(
          (a, b) =>
            a.quote - b.quote || a.player.lastName.localeCompare(b.player.lastName),
        )
    : []
  const availProblem = availRows.filter((r) => r.quote <= 0.95)
  const availFine = availRows.filter((r) => r.quote > 0.95)

  /* ---------- 6) Positionsabdeckung ---------- */
  const coverage = POSITIONS.map((pos) => ({
    pos,
    main: roster.filter((p) => p.mainPosition === pos).length,
    alt: roster.filter((p) => p.altPosition === pos).length,
  }))
  const thinPositions = coverage.filter((c) => c.main < 2)
  const twThin = thinPositions.find((c) => c.pos === 'TW')

  /* ---------- 7) Festspiel-Übersicht ---------- */
  const appsByPlayer = new Map<string, typeof appearances>()
  for (const a of appearances) {
    const arr = appsByPlayer.get(a.playerId)
    if (arr) arr.push(a)
    else appsByPlayer.set(a.playerId, [a])
  }
  const festRows = players
    .map((p) => ({
      player: p,
      status: computeFestspielStatus(p.team, appsByPlayer.get(p.id) ?? [], today),
    }))
    .filter((r) => r.status.state !== 'frei')
    .sort((a, b) => {
      if (a.status.state !== b.status.state)
        return a.status.state === 'festgespielt' ? -1 : 1
      return (a.status.blockedUntil ?? a.status.lastHigherDate ?? '').localeCompare(
        b.status.blockedUntil ?? b.status.lastHigherDate ?? '',
      )
    })
  const festCount = festRows.filter((r) => r.status.state === 'festgespielt').length
  const warnCount = festRows.length - festCount

  /* ---------- 8) D1-Aushilfen ---------- */
  const helperRows = players
    .filter((p) => p.team !== 'D1')
    .map((p) => ({
      player: p,
      count: d1Apps.filter((a) => a.playerId === p.id).length,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.player.lastName.localeCompare(b.player.lastName))
  const maxHelper = Math.max(1, ...helperRows.map((r) => r.count))

  /* ---------- 9) Gegner-Bilanz ---------- */
  const byOpponent = new Map<string, MatchEvent[]>()
  for (const m of playedMatches) {
    if (!m.opponentId) continue
    const arr = byOpponent.get(m.opponentId)
    if (arr) arr.push(m)
    else byOpponent.set(m.opponentId, [m])
  }
  const opponentById = new Map(opponents.map((o) => [o.id, o]))
  const oppRows = [...byOpponent.entries()]
    .map(([id, ms]) => ({ opponent: opponentById.get(id), record: computeRecord(ms) }))
    .filter((r): r is { opponent: NonNullable<typeof r.opponent>; record: typeof r.record } => !!r.opponent)
    .sort(
      (a, b) =>
        b.record.games - a.record.games || a.opponent.name.localeCompare(b.opponent.name),
    )

  return (
    <div className="pb-4">
      {header}

      {/* ============ 1) TEAM-BILANZ ============ */}
      <SectionTitle
        action={
          record.games > 0 ? (
            <span className="tnum text-[11px] text-muted">{record.games} Spiele</span>
          ) : undefined
        }
      >
        Team-Bilanz
      </SectionTitle>
      {record.games === 0 ? (
        <EmptyState
          title="Noch keine Ergebnisse"
          hint="Trage im Spielplan Ergebnisse ein — die Bilanz rechnet sich von selbst."
        />
      ) : (
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-ok-soft py-2.5">
              <b className="tnum block font-display text-[24px] font-bold leading-none text-ok">
                {record.wins}
              </b>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ok">
                Siege
              </span>
            </div>
            <div className="rounded-xl bg-card-2 py-2.5">
              <b className="tnum block font-display text-[24px] font-bold leading-none text-muted">
                {record.draws}
              </b>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Remis
              </span>
            </div>
            <div className="rounded-xl bg-crit-soft py-2.5">
              <b className="tnum block font-display text-[24px] font-bold leading-none text-crit">
                {record.losses}
              </b>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-crit">
                Niederl.
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
            <div>
              <span className="text-[11px] uppercase tracking-wide text-muted">
                Tordifferenz
              </span>
              <div className="flex items-baseline gap-2">
                <b
                  className={`tnum font-display text-[22px] font-bold leading-none ${
                    record.diff > 0 ? 'text-ok' : record.diff < 0 ? 'text-crit' : 'text-muted'
                  }`}
                >
                  {fmtSigned(record.diff)}
                </b>
                <span className="tnum text-[11px] text-muted">
                  {record.goalsFor}:{record.goalsAgainst} Tore
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wide text-muted">
                Letzte {lastFive.length}
              </span>
              <div
                className="mt-1 flex justify-end gap-1"
                aria-label={`Form der letzten Spiele: ${lastFive
                  .map((m) => outcomeLabel(matchOutcome(m)))
                  .join(', ')}`}
              >
                {lastFive.map((m) => (
                  <ResPill key={m.id} outcome={matchOutcome(m)} />
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ============ 2) EINSÄTZE & TORE ============ */}
      <SectionTitle
        action={
          <span className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted">
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-3 rounded-sm"
                style={{ background: 'var(--accent)' }}
                aria-hidden="true"
              />
              Tore
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-3 rounded-sm"
                style={{ background: ACCENT_DIM }}
                aria-hidden="true"
              />
              Einsätze
            </span>
          </span>
        }
      >
        Einsätze & Tore · 1. Damen
      </SectionTitle>
      {einsatzRows.length === 0 ? (
        <EmptyState
          title="Noch keine Einsätze"
          hint="Einsätze entstehen aus freigegebenen Kadern oder werden im Spielplan nachgetragen."
        />
      ) : (
        <Card className="px-4 py-2">
          {einsatzRows.map(({ player, einsaetze, tore }) => (
            <button
              key={player.id}
              onClick={() => openPlayer(player.id)}
              className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-b-0"
            >
              <Avatar player={player} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold">
                    {playerName(player)}
                  </span>
                  {player.isGuest && <Badge tone="guest">Gast</Badge>}
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  <MiniBar value={tore} max={maxTore} color="var(--accent)" />
                  <MiniBar value={einsaetze} max={maxEinsaetze} color={ACCENT_DIM} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tnum text-[15px] font-bold leading-tight">{tore}</div>
                <div className="tnum text-[11px] leading-tight text-muted">
                  {einsaetze} Sp.
                </div>
              </div>
            </button>
          ))}
        </Card>
      )}

      {/* ============ 3) FORMKURVE ============ */}
      <SectionTitle>Formkurve · Bewertungen 1–5</SectionTitle>
      {formCandidates.length === 0 ? (
        <EmptyState
          title="Noch keine Bewertungen"
          hint="Bewerte Spielerinnen bei Trainings-Notizen oder Einsätzen (1–5) — hier entsteht dann die Formkurve."
        />
      ) : (
        <Card className="p-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {formCandidates.map(({ player, points }) => {
              const active = player.id === formSelected?.player.id
              return (
                <button
                  key={player.id}
                  onClick={() => setFormPlayerId(player.id)}
                  aria-pressed={active}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[12px] font-semibold transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-card text-muted'
                  }`}
                >
                  <Avatar player={player} size="sm" className="!h-6 !w-6 !text-[9px]" />
                  {player.firstName}
                  <span className="tnum font-normal opacity-70">{points.length}</span>
                </button>
              )
            })}
          </div>
          {formSelected && formSelected.points.length >= 2 ? (
            <div className="mt-2">
              <FormChart
                points={formSelected.points}
                name={playerName(formSelected.player)}
              />
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-card-2 p-3 text-center text-[12px] text-muted">
              Mindestens 2 Bewertungen nötig —{' '}
              {formSelected ? formSelected.player.firstName : 'die Spielerin'} hat bisher
              nur eine. Bewertungen entstehen bei Notizen und Einsätzen.
            </p>
          )}
        </Card>
      )}

      {/* ============ 4) Ø-BEWERTUNGEN ============ */}
      <SectionTitle>Ø-Bewertungen</SectionTitle>
      {ratingRows.length === 0 ? (
        <EmptyState
          title="Keine Bewertungen vorhanden"
          hint="Vergib bei Trainings-Notizen und Spieleinsätzen Bewertungen von 1 bis 5."
        />
      ) : (
        <Card className="px-4 py-3">
          <div className="grid grid-cols-[1fr_76px_76px] items-center gap-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <span>Spielerin</span>
            <span className="text-right">Ø Training</span>
            <span className="text-right">Ø Spiel</span>
          </div>
          {ratingRows.map(({ player, avgTraining, avgSpiel }) => (
            <button
              key={player.id}
              onClick={() => openPlayer(player.id)}
              className="grid w-full grid-cols-[1fr_76px_76px] items-center gap-2 border-t border-line py-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar player={player} size="sm" />
                <span className="truncate text-[13px] font-semibold">
                  {playerName(player)}
                </span>
              </span>
              <RatingCell value={avgTraining} />
              <RatingCell value={avgSpiel} />
            </button>
          ))}
        </Card>
      )}

      {/* ============ 5) VERFÜGBARKEITSQUOTE ============ */}
      <SectionTitle
        action={
          availWindowOk ? (
            <span className="tnum text-[11px] text-muted">
              seit {fmtDateShort(seasonStart)} · {totalDays} Tage
            </span>
          ) : undefined
        }
      >
        Verfügbarkeitsquote
      </SectionTitle>
      {!availWindowOk ? (
        <EmptyState
          title="Kein Saisonfenster"
          hint="Der Saisonstart liegt in der Zukunft oder ist nicht gesetzt — die Quote startet mit der Saison."
        />
      ) : availRows.length === 0 ? (
        <EmptyState
          title="Keine Spielerinnen im Kader"
          hint="Lege Spielerinnen der 1. Damen an, um Verfügbarkeiten zu sehen."
        />
      ) : (
        <Card className="px-4 py-2">
          {availProblem.length === 0 && (
            <p className="flex items-center gap-2 py-2 text-[12px] text-muted">
              <Badge tone="ok">OK</Badge> Alle Spielerinnen über 95 % verfügbar.
            </p>
          )}
          {availProblem.map((r) => (
            <AvailRow key={r.player.id} row={r} totalDays={totalDays} onTap={openPlayer} />
          ))}
          {showAllAvail &&
            availFine.map((r) => (
              <AvailRow key={r.player.id} row={r} totalDays={totalDays} onTap={openPlayer} />
            ))}
          {availFine.length > 0 && (
            <button
              onClick={() => setShowAllAvail((v) => !v)}
              className="w-full py-2.5 text-center text-[12px] font-semibold text-accent"
            >
              {showAllAvail
                ? 'Weniger anzeigen'
                : `Alle anzeigen (${availFine.length} weitere über 95 %)`}
            </button>
          )}
        </Card>
      )}

      {/* ============ 6) POSITIONSABDECKUNG ============ */}
      <SectionTitle
        action={
          <span className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted">
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-3.5 rounded-sm"
                style={{ background: 'var(--accent)' }}
                aria-hidden="true"
              />
              Stamm
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3.5 rounded-sm" style={HATCH} aria-hidden="true" />
              Alternativ
            </span>
          </span>
        }
      >
        Positionsabdeckung · 1. Damen
      </SectionTitle>
      {roster.length === 0 ? (
        <EmptyState
          title="Kein Kader angelegt"
          hint="Sobald Spielerinnen mit Positionen angelegt sind, siehst du hier die Abdeckung."
        />
      ) : (
        <Card className="p-4">
          <div className="flex flex-col gap-2.5">
            {coverage.map(({ pos, main, alt }) => (
              <div key={pos} className="grid grid-cols-[34px_1fr_auto] items-center gap-2">
                <span className="font-display text-[12px] font-bold uppercase text-muted">
                  {pos}
                </span>
                <span
                  className="flex flex-wrap gap-1"
                  aria-label={`${POSITION_LABEL[pos]}: ${main} Stamm, ${alt} alternativ`}
                >
                  {Array.from({ length: main }, (_, i) => (
                    <span
                      key={`m${i}`}
                      className="h-2.5 w-4 rounded-[4px]"
                      style={{ background: 'var(--accent)' }}
                    />
                  ))}
                  {Array.from({ length: alt }, (_, i) => (
                    <span key={`a${i}`} className="h-2.5 w-4 rounded-[4px]" style={HATCH} />
                  ))}
                  {main + alt === 0 && (
                    <span
                      className="h-2.5 w-4 rounded-[4px]"
                      style={{ background: TRACK }}
                    />
                  )}
                </span>
                {main < 2 ? (
                  <Badge tone={pos === 'TW' ? 'crit' : 'warn'}>dünn besetzt</Badge>
                ) : (
                  <span className="tnum text-[11px] font-semibold text-ok">
                    {main} Stamm{alt > 0 ? ` +${alt}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
          {thinPositions.length > 0 && (
            <div
              className={`mt-3 rounded-xl p-3 text-[12px] leading-snug ${
                twThin ? 'bg-crit-soft text-crit' : 'bg-warn-soft text-warn'
              }`}
            >
              {twThin && (
                <p className="font-semibold">
                  {twThin.main === 0
                    ? 'Kein Stamm-Torwart im Kader — kritisch.'
                    : 'Nur 1 Stamm-Torwart im Kader — kritisch, ein Ausfall ist nicht abgedeckt.'}
                </p>
              )}
              <p className={twThin ? 'mt-1 opacity-90' : 'font-semibold'}>
                Unter 2 Stammspielerinnen:{' '}
                {thinPositions
                  .map((c) => `${POSITION_LABEL[c.pos]} (${c.main})`)
                  .join(', ')}
                .
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ============ 7) FESTSPIEL-ÜBERSICHT ============ */}
      <SectionTitle>Festspiel-Übersicht · §55 SpO</SectionTitle>
      {festRows.length === 0 ? (
        <Card className="flex items-center gap-2 p-4">
          <Badge tone="ok">Alles frei</Badge>
          <span className="text-[13px] text-muted">
            Keine Spielerin ist aktuell festgespielt oder verwarnt.
          </span>
        </Card>
      ) : (
        <Card className="px-4 py-2">
          <p className="tnum border-b border-line py-2 text-[12px] font-semibold text-muted">
            {festCount === 1 ? '1 Spielerin' : `${festCount} Spielerinnen`} aktuell
            festgespielt
            {warnCount > 0 &&
              `, ${warnCount === 1 ? '1 mit Warnung' : `${warnCount} mit Warnung`}`}
          </p>
          {festRows.map(({ player, status }) => (
            <button
              key={player.id}
              onClick={() => openPlayer(player.id)}
              className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-b-0"
            >
              <Avatar player={player} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold">
                    {playerName(player)}
                  </span>
                  {player.isGuest && <Badge tone="guest">Gast</Badge>}
                </div>
                <div className="tnum text-[11px] text-muted">{festspielSub(status)}</div>
              </div>
              <Badge tone={status.state === 'festgespielt' ? 'crit' : 'warn'}>
                {status.state === 'festgespielt' ? 'Festgespielt' : 'Warnung'}
              </Badge>
            </button>
          ))}
        </Card>
      )}

      {/* ============ 8) D1-AUSHILFEN ============ */}
      <SectionTitle>D1-Aushilfen</SectionTitle>
      {helperRows.length === 0 ? (
        <EmptyState
          title="Keine Aushilfen"
          hint="Hier erscheinen Spielerinnen aus Damen 2 oder der A-Jugend, sobald sie in der 1. Damen aushelfen."
        />
      ) : (
        <Card className="px-4 py-2">
          {helperRows.map(({ player, count }) => (
            <button
              key={player.id}
              onClick={() => openPlayer(player.id)}
              className="flex w-full items-center gap-3 border-b border-line py-2.5 text-left last:border-b-0"
            >
              <Avatar player={player} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold">
                    {playerName(player)}
                  </span>
                  <Badge tone="neutral">{TEAM_LABEL[player.team]}</Badge>
                </div>
                <div className="mt-1">
                  <MiniBar value={count} max={maxHelper} color="var(--accent)" />
                </div>
              </div>
              <div className="tnum shrink-0 text-right text-[13px] font-bold">
                {count}
                <span className="ml-0.5 font-normal text-muted">×</span>
              </div>
            </button>
          ))}
        </Card>
      )}

      {/* ============ 9) GEGNER-BILANZ ============ */}
      <SectionTitle>Gegner-Bilanz</SectionTitle>
      {oppRows.length === 0 ? (
        <EmptyState
          title="Noch keine Gegner-Daten"
          hint="Verknüpfe Spiele mit Gegnern und trage Ergebnisse ein — die Bilanz je Gegner folgt automatisch."
        />
      ) : (
        <Card className="px-4 py-1">
          {oppRows.map(({ opponent, record: r }) => (
            <div
              key={opponent.id}
              className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-[12px] font-bold text-accent"
              >
                {opponent.shortName?.slice(0, 2).toUpperCase() ??
                  opponentInitials(opponent.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{opponent.name}</div>
                <div className="tnum text-[11px] text-muted">
                  {r.games} {r.games === 1 ? 'Spiel' : 'Spiele'}
                  {opponent.league ? ` · ${opponent.league}` : ''}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tnum text-[13px] font-bold">
                  {r.wins}S {r.draws}U {r.losses}N
                </div>
                <div
                  className={`tnum text-[11px] font-semibold ${
                    r.diff > 0 ? 'text-ok' : r.diff < 0 ? 'text-crit' : 'text-muted'
                  }`}
                >
                  {fmtSigned(r.diff)} Tore
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

/* ================================================================
   Kleinteile: Pills, Balken, Punkte-Skala, Verfügbarkeits-Zeile
   ================================================================ */

function outcomeLabel(o: Outcome): string {
  return o === 'S' ? 'Sieg' : o === 'U' ? 'Unentschieden' : 'Niederlage'
}

function ResPill({ outcome }: { outcome: Outcome }) {
  const cls =
    outcome === 'S'
      ? 'bg-ok-soft text-ok'
      : outcome === 'N'
        ? 'bg-crit-soft text-crit'
        : 'bg-card-2 text-muted'
  return (
    <span
      title={outcomeLabel(outcome)}
      className={`grid h-6 w-6 place-items-center rounded-lg font-display text-[11px] font-bold ${cls}`}
    >
      {outcome}
    </span>
  )
}

/** Horizontaler Mini-Balken mit 0-Basislinie (Breite proportional zum Maximum). */
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <span className="block h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
    </span>
  )
}

/** Zahl (1 Dezimale) + 5-Punkte-Skala für Ø-Bewertungen. */
function RatingCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-right text-[12px] text-muted">—</span>
  }
  const filled = Math.round(Math.min(5, Math.max(0, value)))
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="tnum text-[13px] font-bold leading-none">{fmtAvg(value)}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: i < filled ? 'var(--accent)' : TRACK }}
          />
        ))}
      </span>
    </span>
  )
}

function AvailRow({
  row,
  totalDays,
  onTap,
}: {
  row: { player: Player; absent: number; quote: number }
  totalDays: number
  onTap: (id: string) => void
}) {
  const pct = Math.round(row.quote * 100)
  const tone =
    row.quote < 0.75 ? 'var(--crit)' : row.quote < 0.9 ? 'var(--warn)' : 'var(--ok)'
  return (
    <button
      onClick={() => onTap(row.player.id)}
      className="block w-full border-b border-line py-2 text-left last:border-b-0"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{playerName(row.player)}</span>
          {row.player.isGuest && <Badge tone="guest">Gast</Badge>}
        </span>
        <span className="tnum shrink-0 text-[12px] font-bold">{pct} %</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: TRACK }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: tone }}
        />
      </div>
      {row.absent > 0 && (
        <div className="tnum mt-0.5 text-[10px] text-muted">
          {row.absent} von {totalDays} Tagen abwesend
        </div>
      )}
    </button>
  )
}

function festspielSub(status: FestspielStatus): string {
  const team = status.team ? TEAM_LABEL[status.team] : ''
  if (status.state === 'festgespielt' && status.blockedUntil) {
    return `${team} · gesperrt für tiefere Teams bis ${fmtDate(status.blockedUntil)}`
  }
  if (status.lastHigherDate) {
    return `1. Einsatz ${team} am ${fmtDateShort(status.lastHigherDate)} — nächster spielt fest`
  }
  return team
}

/* ================================================================
   Formkurve: handgebautes SVG-Liniendiagramm (Bewertungen 1–5)
   ================================================================ */

function FormChart({ points, name }: { points: RatingPoint[]; name: string }) {
  const W = 340
  const H = 132
  const padL = 22
  const padR = 30
  const padT = 18
  const padB = 20
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = points.length
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + ((5 - v) / 4) * innerH

  const coords = points.map((p, i) => ({ cx: x(i), cy: y(p.value) }))
  const line = coords.map((c) => `${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(' ')
  const base = y(1)
  const area =
    `M ${coords[0].cx.toFixed(1)} ${coords[0].cy.toFixed(1)} ` +
    coords
      .slice(1)
      .map((c) => `L ${c.cx.toFixed(1)} ${c.cy.toFixed(1)}`)
      .join(' ') +
    ` L ${coords[n - 1].cx.toFixed(1)} ${base} L ${coords[0].cx.toFixed(1)} ${base} Z`

  const last = coords[n - 1]
  const lastValue = points[n - 1].value
  // Wert-Label über dem letzten Punkt; nahe der Oberkante darunter setzen.
  const labelAbove = last.cy > padT + 14
  const labelY = labelAbove ? last.cy - 9 : last.cy + 16

  // Sparsame X-Achsen-Labels: erstes, mittleres, letztes Datum.
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Formkurve von ${name}: ${points
        .map((p) => `${fmtDateShort(p.date)} ${fmtAvg(p.value)}`)
        .join(', ')}`}
    >
      {/* Gitter 1–5, Basislinie leicht betont */}
      {[1, 2, 3, 4, 5].map((v) => (
        <line
          key={v}
          x1={padL}
          y1={y(v)}
          x2={W - padR}
          y2={y(v)}
          stroke="var(--line)"
          strokeWidth={v === 1 ? 1.4 : 1}
        />
      ))}
      {[1, 3, 5].map((v) => (
        <text
          key={v}
          x={padL - 6}
          y={y(v) + 3}
          textAnchor="end"
          fontSize="9"
          className="tnum"
          fill="var(--muted)"
        >
          {v}
        </text>
      ))}

      <path d={area} fill="var(--accent-soft)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.slice(0, -1).map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r="2.4" fill="var(--accent)" />
      ))}
      {/* Letzter Punkt betont + Direktlabel */}
      <circle
        cx={last.cx}
        cy={last.cy}
        r="4"
        fill="var(--accent)"
        stroke="var(--card)"
        strokeWidth="1.5"
      />
      <text
        x={Math.min(last.cx, W - padR + 6)}
        y={labelY}
        textAnchor="end"
        fontSize="11"
        fontWeight="700"
        className="tnum"
        fill="var(--accent)"
      >
        {fmtAvg(lastValue)}
      </text>

      {labelIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 4}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          fontSize="9"
          className="tnum"
          fill="var(--muted)"
        >
          {fmtDateShort(points[i].date)}
        </text>
      ))}
    </svg>
  )
}
