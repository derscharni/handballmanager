import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayIso, uid } from '../../lib/db'
import type { MatchdaySquad, Player, Position, SquadNomination } from '../../lib/types'
import { POSITIONS, POSITION_LABEL, TEAM_LABEL } from '../../lib/types'
import { availabilityOn, type DayAvailability } from '../../lib/availability'
import {
  computeFestspielStatus,
  forecastNomination,
  type FestspielForecast,
  type FestspielStatus,
} from '../../lib/festspiel'
import { fmtDayDate, playerName } from '../../lib/format'
import { Avatar } from '../../components/Avatar'
import { Badge, Button, Card, EmptyState, SectionTitle, Segmented, Sheet } from '../../components/ui'
import FieldView from './FieldView'
import { usePlanDrag } from './dnd'
import { buildShareText, copyText, shareViaWhatsApp } from './share'

/**
 * PLANUNG — Spieltagskader (Entwurf → Freigabe), Liste- und Feld-Ansicht.
 * Eine MatchdaySquad pro Termin in db.squads; jede Änderung schreibt updatedAt.
 */

const LIMIT = 16

const POS_SHORT: Record<Position, string> = {
  TW: 'Tor',
  LA: 'Außen L',
  RA: 'Außen R',
  KM: 'Kreis',
  RL: 'Rück. L',
  RM: 'Rück. M',
  RR: 'Rück. R',
}

type FestInfo = { forecast: FestspielForecast; current: FestspielStatus }

type SheetState =
  | { type: 'nominate'; playerId: string }
  | { type: 'chip'; playerId: string }
  | { type: 'position'; position: Position }
  | { type: 'release' }
  | null

/* ---------- Persistenz: ein Helfer schreibt alle Kader-Änderungen ---------- */

async function mutateSquad(eventId: string, mut: (s: MatchdaySquad) => void): Promise<void> {
  await db.transaction('rw', db.squads, async () => {
    const existing = await db.squads.where('eventId').equals(eventId).first()
    const s: MatchdaySquad = existing ?? {
      id: uid(),
      eventId,
      status: 'entwurf',
      nominations: [],
      updatedAt: new Date().toISOString(),
    }
    mut(s)
    s.updatedAt = new Date().toISOString()
    await db.squads.put(s)
  })
}

function sameNominations(a: SquadNomination[], b?: SquadNomination[]): boolean {
  if (!b) return false
  const key = (list: SquadNomination[]) =>
    list
      .map((n) => `${n.playerId}:${n.position}`)
      .sort()
      .join('|')
  return key(a) === key(b)
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/** ISO-Zeitstempel → "Do 09.07., 21:14" (lokale Zeit). */
function fmtStamp(iso: string): string {
  const d = new Date(iso)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${WD[d.getDay()]} ${p2(d.getDate())}.${p2(d.getMonth() + 1)}., ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** Vorschlag Treffpunkt-Zeit: 90 Minuten vor Anwurf. */
function defaultMeetTime(time?: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const total = Math.max(0, h * 60 + m - 90)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/* ================================================================ */

export default function PlanungScreen() {
  const today = todayIso()
  const events = useLiveQuery(
    () =>
      db.events
        .where('date')
        .aboveOrEqual(today)
        .and((e) => e.kind === 'match' || e.kind === 'tournament')
        .sortBy('date'),
    [today],
  )
  const players = useLiveQuery(() => db.players.toArray(), [])
  const absences = useLiveQuery(() => db.absences.toArray(), [])
  const appearances = useLiveQuery(() => db.appearances.toArray(), [])
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])
  const settings = useLiveQuery(() => db.settings.get('app'), [])

  const [selId, setSelId] = useState<string | null>(null)
  const event = useMemo(
    () => (events ? (events.find((e) => e.id === selId) ?? events[0]) : undefined),
    [events, selId],
  )

  const squad = useLiveQuery(
    async () =>
      event ? ((await db.squads.where('eventId').equals(event.id).first()) ?? null) : null,
    [event?.id],
  )

  const [view, setView] = useState<'liste' | 'feld'>('liste')
  const [sheet, setSheet] = useState<SheetState>(null)
  const [pvOpen, setPvOpen] = useState(false)
  const [pvPlayerId, setPvPlayerId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; tone: 'neutral' | 'crit' | 'ok' } | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    },
    [],
  )

  function showToast(text: string, tone: 'neutral' | 'crit' | 'ok' = 'neutral') {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current)
    setToast({ text, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), tone === 'crit' ? 4200 : 2600)
  }

  /* ---------- Abgeleitete Daten ---------- */

  const playersById = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players])
  const oppById = useMemo(() => new Map((opponents ?? []).map((o) => [o.id, o])), [opponents])
  const opponent = event?.opponentId ? oppById.get(event.opponentId) : undefined

  /** Kader-Pool: Stammkader (D1) + aktuelle Gäste. */
  const roster = useMemo(
    () =>
      (players ?? [])
        .filter((p) => (p.team === 'D1' && !p.isGuest) || p.isGuest)
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de')),
    [players],
  )

  const nominations = useMemo(() => squad?.nominations ?? [], [squad])
  const nominatedIds = useMemo(() => new Set(nominations.map((n) => n.playerId)), [nominations])

  const availById = useMemo(() => {
    const m = new Map<string, DayAvailability>()
    if (!event) return m
    for (const p of roster) m.set(p.id, availabilityOn(p, absences ?? [], event.date))
    return m
  }, [roster, absences, event])

  /** Festspiel-Prognose + aktueller Status für alle Gast-Spielerinnen (Stammteam ≠ D1). */
  const fest = useMemo(() => {
    const m = new Map<string, FestInfo>()
    if (!event) return m
    for (const p of roster) {
      if (p.team === 'D1') continue
      const hist = (appearances ?? []).filter((a) => a.playerId === p.id)
      m.set(p.id, {
        forecast: forecastNomination(p.team, hist, 'D1', event.date),
        current: computeFestspielStatus(p.team, hist, event.date),
      })
    }
    return m
  }, [roster, appearances, event])

  const availableFree = roster.filter(
    (p) => !nominatedIds.has(p.id) && (availById.get(p.id)?.available ?? true),
  )
  const unavailable = roster.filter(
    (p) => !nominatedIds.has(p.id) && !(availById.get(p.id)?.available ?? true),
  )

  const status = squad?.status ?? 'entwurf'
  const count = nominations.length
  const over = count > LIMIT
  const dirty = status === 'freigegeben' && !sameNominations(nominations, squad?.releasedNominations)

  const critNominated = useMemo(
    () =>
      nominations
        .map((n) => playersById.get(n.playerId))
        .filter((p): p is Player => !!p && fest.get(p.id)?.forecast.resulting === 'festgespielt'),
    [nominations, playersById, fest],
  )

  const matchLine = event
    ? `${fmtDayDate(event.date)}${event.time ? ` · ${event.time}` : ''} · ${
        event.kind === 'tournament'
          ? (event.note ?? 'Turnier')
          : `${event.home ? 'Heim vs' : 'Auswärts @'} ${opponent?.name ?? 'Gegner'}`
      }`
    : ''

  /* ---------- Aktionen ---------- */

  async function nominate(playerId: string, position: Position) {
    if (!event) return
    const wasNominated = nominatedIds.has(playerId)
    await mutateSquad(event.id, (s) => {
      s.nominations = [...s.nominations.filter((n) => n.playerId !== playerId), { playerId, position }]
    })
    const p = playersById.get(playerId)
    if (!p) return
    const fc = fest.get(playerId)?.forecast
    if (!wasNominated && fc?.resulting === 'festgespielt' && fc.warning) {
      showToast(`Achtung — ${p.firstName}: ${fc.warning}`, 'crit')
    } else if (wasNominated) {
      showToast(`${p.firstName} → ${position}`)
    } else {
      showToast(`${p.firstName}${p.isGuest ? ' (Gast)' : ''} nominiert · ${position}`)
    }
  }

  async function removeNomination(playerId: string) {
    if (!event) return
    await mutateSquad(event.id, (s) => {
      s.nominations = s.nominations.filter((n) => n.playerId !== playerId)
    })
    const p = playersById.get(playerId)
    if (p) showToast(`${p.firstName} aus dem Spieltagskader entfernt`)
  }

  async function release(meetTime: string, meetPlace: string) {
    if (!event) return
    const n = nominations.length
    await mutateSquad(event.id, (s) => {
      s.status = 'freigegeben'
      s.releasedAt = new Date().toISOString()
      s.releasedNominations = s.nominations.map((x) => ({ ...x }))
      s.meetTime = meetTime || undefined
      s.meetPlace = meetPlace || undefined
    })
    setSheet(null)
    showToast(`${n} Spielerinnen werden informiert — Kader freigegeben`, 'ok')
  }

  const { drag, startPress, consumeClick } = usePlanDrag((playerId, from, target) => {
    if (target === 'remove') {
      if (from !== null) void removeNomination(playerId)
      return
    }
    if (from === target) return
    void nominate(playerId, target)
  })

  const dragPlayer = drag ? playersById.get(drag.playerId) : undefined

  /* ---------- Render ---------- */

  if (!events || !players || !absences || !appearances || !opponents) return null

  const header = (
    <>
      <h1 className="px-1 pt-2 font-display text-[22px] font-bold uppercase leading-none tracking-wide">
        Planung
      </h1>
      <p className="px-1 pt-1 text-[12.5px] text-muted">
        Spieltagskader — Spielerin antippen oder in eine Position ziehen.
      </p>
    </>
  )

  if (events.length === 0) {
    return (
      <div className="pb-4">
        {header}
        <div className="mt-4">
          <EmptyState
            title="Keine anstehenden Spiele"
            hint="Lege im Tab „Spielplan“ ein Spiel oder Turnier an — danach planst du hier den Spieltagskader und gibst ihn für die Spielerinnen frei."
          />
        </div>
      </div>
    )
  }

  const squadLoading = event !== undefined && squad === undefined
  const sheetPlayer =
    sheet && (sheet.type === 'nominate' || sheet.type === 'chip')
      ? playersById.get(sheet.playerId)
      : undefined

  return (
    <div className="pb-4">
      {header}

      {/* 1) Spiel-Auswahl */}
      <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1" role="group" aria-label="Spiel wählen">
        {events.map((e) => {
          const opp = e.opponentId ? oppById.get(e.opponentId) : undefined
          const sel = e.id === event?.id
          return (
            <button
              key={e.id}
              onClick={() => setSelId(e.id)}
              aria-pressed={sel}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold ${
                sel ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-ink'
              }`}
            >
              <span className="tnum">{fmtDayDate(e.date)}</span>
              <span>{e.kind === 'tournament' ? 'Turnier' : (opp?.shortName ?? opp?.name ?? 'Spiel')}</span>
            </button>
          )
        })}
      </div>

      {event && !squadLoading && (
        <>
          <p className="px-1 pt-3 text-[12.5px] text-muted">
            <b className="font-semibold text-ink">{matchLine}</b>
            {event.hall ? ` · ${event.hall}` : ''}
          </p>

          <div className="mt-3">
            <Segmented
              options={[
                { value: 'liste', label: 'Liste' },
                { value: 'feld', label: 'Feld' },
              ]}
              value={view}
              onChange={setView}
            />
          </div>

          {/* 2) Status-Leiste */}
          <div
            className="mt-3 rounded-2xl border-[1.5px] bg-card p-4 shadow-card"
            style={{
              borderStyle: status === 'entwurf' ? 'dashed' : 'solid',
              borderColor:
                status === 'entwurf'
                  ? 'color-mix(in srgb, var(--muted) 55%, transparent)'
                  : 'color-mix(in srgb, var(--ok) 50%, var(--line))',
            }}
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-2">
              {status === 'entwurf' ? (
                <>
                  <span
                    className="rounded-md border-[1.5px] border-dashed px-2 py-0.5 font-display text-[10.5px] font-bold uppercase tracking-widest text-muted"
                    style={{ borderColor: 'color-mix(in srgb, var(--muted) 55%, transparent)' }}
                  >
                    Entwurf
                  </span>
                  <span className="text-[11.5px] text-muted">nur für Trainer sichtbar</span>
                  {squad?.updatedAt && (
                    <span className="tnum ml-auto text-[11px] text-muted">
                      bearbeitet {fmtStamp(squad.updatedAt)}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Badge tone="ok" className="font-display uppercase tracking-widest">
                    Freigegeben
                  </Badge>
                  <span className="text-[11.5px] text-muted">sichtbar für Spielerinnen</span>
                  {squad?.releasedAt && (
                    <span className="tnum ml-auto text-[11px] text-muted">
                      freigegeben {fmtStamp(squad.releasedAt)}
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              <b className={`tnum font-display text-[30px] font-bold leading-none ${over ? 'text-crit' : ''}`}>
                {count}
                <span className="text-[16px] text-muted"> / {LIMIT}</span>
              </b>
              <span className="text-[12px] text-muted">nominiert</span>
              {over ? (
                <Badge tone="crit" className="ml-auto">
                  Spielbericht erlaubt max. 16
                </Badge>
              ) : count === LIMIT ? (
                <span className="ml-auto text-[11px] font-semibold text-warn">Kader voll</span>
              ) : null}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-card-2">
              <div
                className={`h-full rounded-full ${over ? 'bg-crit' : 'bg-accent'}`}
                style={{ width: `${(Math.min(count, LIMIT) / LIMIT) * 100}%` }}
              />
            </div>

            {status === 'entwurf' && (
              <Button
                className="mt-3 w-full"
                onClick={() =>
                  count > 0 ? setSheet({ type: 'release' }) : showToast('Noch keine Spielerin nominiert')
                }
              >
                An Spielerinnen freigeben
              </Button>
            )}
            {status === 'freigegeben' && dirty && (
              <div
                className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border bg-warn-soft p-3 text-[12px]"
                style={{ borderColor: 'color-mix(in srgb, var(--warn) 34%, var(--line))' }}
              >
                <Badge tone="warn">Änderungen seit Freigabe</Badge>
                <span className="min-w-0 flex-1 text-muted">
                  Die Spielerinnen sehen noch den Stand von{' '}
                  {squad?.releasedAt ? fmtStamp(squad.releasedAt) : '—'}.
                </span>
                <button
                  className="min-h-9 shrink-0 rounded-lg border px-2.5 text-[12px] font-semibold text-warn"
                  style={{ borderColor: 'color-mix(in srgb, var(--warn) 55%, transparent)' }}
                  onClick={() => setSheet({ type: 'release' })}
                >
                  Erneut freigeben
                </button>
              </div>
            )}
            {critNominated.map((p) => (
              <div
                key={p.id}
                role="alert"
                className="mt-3 rounded-xl border bg-crit-soft p-3 text-[12px]"
                style={{ borderColor: 'color-mix(in srgb, var(--crit) 34%, var(--line))' }}
              >
                <b className="font-semibold">
                  {playerName(p)} (Gast · {TEAM_LABEL[p.team]}):
                </b>{' '}
                {fest.get(p.id)?.forecast.warning}
              </div>
            ))}
          </div>

          {/* 3) Kader-Builder — Liste */}
          {view === 'liste' && (
            <>
              <SectionTitle>Positionen · beliebig besetzbar</SectionTitle>
              <div className="flex flex-col gap-2" aria-label="Positionsgruppen">
                {POSITIONS.map((pos) => {
                  const members = nominations.filter((n) => n.position === pos)
                  const dragOn = drag !== null
                  const hot = drag?.over === pos
                  return (
                    <div
                      key={pos}
                      data-drop-pos={pos}
                      className={`flex min-h-[54px] items-center gap-2.5 rounded-2xl border bg-card px-3 py-2 ${
                        hot ? 'border-accent bg-accent-soft' : 'border-line'
                      }`}
                      style={{
                        borderStyle: dragOn && !hot ? 'dashed' : 'solid',
                        borderColor:
                          dragOn && !hot ? 'color-mix(in srgb, var(--accent) 45%, var(--line))' : undefined,
                        boxShadow: hot ? '0 0 0 1.5px var(--accent) inset' : undefined,
                      }}
                    >
                      <button
                        className="w-11 shrink-0 text-center"
                        aria-label={`Verfügbare Spielerinnen für ${POSITION_LABEL[pos]} anzeigen`}
                        onClick={() => setSheet({ type: 'position', position: pos })}
                      >
                        <span className="block font-display text-[15px] font-bold text-accent">{pos}</span>
                        <span className="block whitespace-nowrap text-[8px] uppercase text-muted">
                          {POS_SHORT[pos]}
                        </span>
                      </button>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        {members.map((n) => {
                          const p = playersById.get(n.playerId)
                          if (!p) return null
                          return (
                            <NomChip
                              key={n.playerId}
                              player={p}
                              dragging={drag?.playerId === p.id}
                              onPress={(e) => startPress(e, p.id, pos)}
                              onOpen={() => {
                                if (!consumeClick()) setSheet({ type: 'chip', playerId: p.id })
                              }}
                              onRemove={() => void removeNomination(p.id)}
                            />
                          )
                        })}
                        {hot ? (
                          <span className="rounded-full border-[1.5px] border-dashed border-accent px-3 py-1 text-[11px] font-bold text-accent">
                            Hier ablegen
                          </span>
                        ) : members.length === 0 ? (
                          <button
                            className="min-h-9 rounded-full border-[1.5px] border-dashed px-3 py-1 text-[11.5px] text-muted active:bg-accent-soft active:text-accent"
                            style={{ borderColor: 'color-mix(in srgb, var(--muted) 45%, transparent)' }}
                            onClick={() => setSheet({ type: 'position', position: pos })}
                          >
                            + besetzen
                          </button>
                        ) : null}
                      </div>
                      {members.length > 1 && (
                        <span className="shrink-0 font-display text-[11px] font-bold text-muted">
                          ×{members.length}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <SectionTitle>Verfügbar · Stammkader + Gäste</SectionTitle>
              <Card className="overflow-hidden">
                {availableFree.length > 0 ? (
                  availableFree.map((p) => (
                    <PoolRow
                      key={p.id}
                      player={p}
                      avail={availById.get(p.id) ?? { available: true }}
                      festInfo={fest.get(p.id)}
                      dragging={drag?.playerId === p.id}
                      onPress={(e) => startPress(e, p.id, null)}
                      onOpen={() => {
                        if (!consumeClick()) setSheet({ type: 'nominate', playerId: p.id })
                      }}
                    />
                  ))
                ) : (
                  <p className="p-4 text-[13px] text-muted">
                    Alle verfügbaren Spielerinnen sind bereits nominiert.
                  </p>
                )}
              </Card>

              {unavailable.length > 0 && (
                <>
                  <SectionTitle>Nicht verfügbar</SectionTitle>
                  <Card className="overflow-hidden">
                    {unavailable.map((p) => (
                      <PoolRow
                        key={p.id}
                        player={p}
                        avail={availById.get(p.id) ?? { available: false }}
                        festInfo={fest.get(p.id)}
                        dragging={false}
                      />
                    ))}
                  </Card>
                </>
              )}
            </>
          )}

          {/* 5) Feld-Ansicht */}
          {view === 'feld' && (
            <>
              <SectionTitle>Aufstellung auf dem Feld</SectionTitle>
              <FieldView
                nominations={nominations}
                playersById={playersById}
                hotZone={drag && drag.over !== 'remove' ? drag.over : null}
                dragPlayerId={drag?.playerId ?? null}
                onTokenPress={(e, pid, from) => startPress(e, pid, from)}
                onTokenClick={(pid) => {
                  if (!consumeClick()) setSheet({ type: 'chip', playerId: pid })
                }}
              />
              <p className="mt-2 px-1 text-[11.5px] text-muted">
                Spielerin aus der Ablage aufs Feld ziehen — sie rastet in der nächstgelegenen
                Positionszone ein. Figur ziehen = Position wechseln, antippen = verschieben /
                entfernen. Gelbes G = Gast.
              </p>

              <SectionTitle>Ablage · Stammkader + Gäste</SectionTitle>
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                {availableFree.length > 0 ? (
                  availableFree.map((p) => (
                    <button
                      key={p.id}
                      onPointerDown={(e) => startPress(e, p.id, null)}
                      onClick={() => {
                        if (!consumeClick()) setSheet({ type: 'nominate', playerId: p.id })
                      }}
                      className={`flex min-h-11 shrink-0 select-none items-center gap-2 rounded-full border border-line bg-card py-1 pl-1.5 pr-3 text-[12.5px] font-semibold ${
                        drag?.playerId === p.id ? 'opacity-35' : ''
                      }`}
                      style={{ cursor: 'grab' }}
                      aria-label={`${playerName(p)} nominieren`}
                    >
                      <Avatar player={p} size="sm" />
                      {p.firstName}
                      {p.isGuest && <Badge tone="guest">Gast</Badge>}
                      <span className="font-display text-[10.5px] font-bold text-muted">
                        {p.mainPosition}
                      </span>
                    </button>
                  ))
                ) : (
                  <span className="py-2 text-[12.5px] text-muted">
                    Alle verfügbaren Spielerinnen sind bereits nominiert.
                  </span>
                )}
              </div>
            </>
          )}

          {/* 6+7) Nach der Freigabe: Vorschau + Teilen */}
          {status === 'freigegeben' && squad && (
            <>
              <SectionTitle>Spielerinnen-Vorschau</SectionTitle>
              <PreviewSection
                squad={squad}
                matchLine={matchLine}
                playersById={playersById}
                dirty={dirty}
                open={pvOpen}
                setOpen={setPvOpen}
                pvPlayerId={pvPlayerId}
                setPvPlayerId={setPvPlayerId}
              />

              <SectionTitle>WhatsApp teilen</SectionTitle>
              <ShareCard
                text={buildShareText({
                  event,
                  opponentName: opponent?.name,
                  nominations: squad.releasedNominations ?? [],
                  playersById,
                  meetTime: squad.meetTime,
                  meetPlace: squad.meetPlace,
                  clubName: settings?.clubName ?? 'TuS Ehrenfeld',
                })}
                onToast={showToast}
              />
            </>
          )}
        </>
      )}

      {/* 4) Sheets */}
      {sheet?.type === 'nominate' && sheetPlayer && (
        <NominateSheet
          player={sheetPlayer}
          festInfo={fest.get(sheetPlayer.id)}
          onClose={() => setSheet(null)}
          onPick={(pos) => {
            setSheet(null)
            void nominate(sheetPlayer.id, pos)
          }}
        />
      )}
      {sheet?.type === 'chip' && sheetPlayer && (
        <ChipSheet
          player={sheetPlayer}
          current={
            nominations.find((n) => n.playerId === sheetPlayer.id)?.position ??
            sheetPlayer.mainPosition
          }
          onClose={() => setSheet(null)}
          onMove={(pos) => {
            setSheet(null)
            void nominate(sheetPlayer.id, pos)
          }}
          onRemove={() => {
            setSheet(null)
            void removeNomination(sheetPlayer.id)
          }}
        />
      )}
      {sheet?.type === 'position' && (
        <PositionPickSheet
          position={sheet.position}
          candidates={availableFree}
          fest={fest}
          onClose={() => setSheet(null)}
          onPick={(playerId) => {
            setSheet(null)
            void nominate(playerId, sheet.position)
          }}
        />
      )}
      {sheet?.type === 'release' && event && (
        <ReleaseSheet
          matchLine={matchLine}
          count={count}
          over={over}
          critWarnings={critNominated.map(
            (p) =>
              `${playerName(p)} (Gast · ${TEAM_LABEL[p.team]}): ${fest.get(p.id)?.forecast.warning ?? ''}`,
          )}
          again={status === 'freigegeben'}
          defaultTime={squad?.meetTime ?? defaultMeetTime(event.time)}
          defaultPlace={squad?.meetPlace ?? event.hall ?? ''}
          onClose={() => setSheet(null)}
          onConfirm={(t, pl) => void release(t, pl)}
        />
      )}

      {/* Drag-Ghost */}
      {drag && dragPlayer && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[70]"
          style={{ transform: `translate(${drag.x - 20}px, ${drag.y - 52}px) rotate(2deg) scale(1.05)` }}
          aria-hidden="true"
        >
          <span
            className="flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft py-1 pl-1.5 pr-3 text-[12.5px] font-semibold shadow-card"
          >
            <Avatar player={dragPlayer} size="sm" />
            {dragPlayer.firstName}
            {dragPlayer.isGuest && <Badge tone="guest">Gast</Badge>}
          </span>
        </div>
      )}

      {/* Entfernen-Zone (nur beim Ziehen einer Nominierten) */}
      {drag && drag.from !== null && (
        <div
          data-drop-remove
          className={`fixed inset-x-4 bottom-20 z-[65] flex min-h-14 items-center justify-center gap-2 rounded-2xl border-[1.5px] text-[13px] font-bold ${
            drag.over === 'remove'
              ? 'border-solid border-crit bg-crit text-white'
              : 'border-dashed bg-crit-soft text-crit'
          }`}
          style={
            drag.over === 'remove'
              ? undefined
              : { borderColor: 'color-mix(in srgb, var(--crit) 55%, transparent)' }
          }
        >
          × Entfernen — hier loslassen
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 z-[80] w-max max-w-[85vw] -translate-x-1/2 rounded-xl px-4 py-2.5 text-center text-[12.5px] shadow-card ${
            toast.tone === 'crit'
              ? 'bg-crit text-white'
              : toast.tone === 'ok'
                ? 'bg-ok text-white'
                : 'bg-ink text-bg'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

/* ================= Bausteine ================= */

/** Chip einer Nominierten in einer Positionsgruppe. */
function NomChip({
  player,
  dragging,
  onPress,
  onOpen,
  onRemove,
}: {
  player: Player
  dragging: boolean
  onPress: (e: React.PointerEvent) => void
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <span
      className={`inline-flex select-none items-center rounded-full border bg-accent-soft ${
        dragging ? 'opacity-35' : ''
      }`}
      style={{ borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))' }}
    >
      <button
        className="flex min-h-9 items-center gap-1.5 py-0.5 pl-1 text-[12px] font-semibold"
        style={{ cursor: 'grab' }}
        onPointerDown={onPress}
        onClick={onOpen}
        aria-label={`${playerName(player)} — verschieben oder Position ändern`}
      >
        <Avatar player={player} size="sm" />
        {player.firstName}
        {player.isGuest && <Badge tone="guest">Gast</Badge>}
      </button>
      <button
        aria-label={`${playerName(player)} entfernen`}
        className="min-h-9 px-2 text-[16px] leading-none text-muted"
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  )
}

/** Zeile im Verfügbaren-/Nicht-verfügbar-Pool. */
function PoolRow({
  player,
  avail,
  festInfo,
  dragging,
  onPress,
  onOpen,
}: {
  player: Player
  avail: DayAvailability
  festInfo?: FestInfo
  dragging: boolean
  onPress?: (e: React.PointerEvent) => void
  onOpen?: () => void
}) {
  const disabled = !avail.available
  const festChip = festInfo ? (
    festInfo.current.state === 'festgespielt' ? (
      <Badge tone="accent">Festgespielt · 1. Damen</Badge>
    ) : festInfo.forecast.resulting === 'festgespielt' ? (
      <Badge tone="warn">2. Einsatz in Folge!</Badge>
    ) : null
  ) : null

  return (
    <button
      disabled={disabled}
      onPointerDown={disabled ? undefined : onPress}
      onClick={disabled ? undefined : onOpen}
      className={`flex min-h-14 w-full select-none items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 ${
        disabled ? 'opacity-45' : ''
      } ${dragging ? 'opacity-35' : ''}`}
      style={disabled ? undefined : { cursor: 'grab' }}
      aria-label={
        disabled
          ? `${playerName(player)} — nicht verfügbar${avail.reason ? `: ${avail.reason}` : ''}`
          : `${playerName(player)} nominieren`
      }
    >
      <Avatar player={player} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold">
          <span className="truncate">{playerName(player)}</span>
          {player.isGuest && <Badge tone="guest">Gast</Badge>}
          {festChip}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
          <span className="rounded-md bg-card-2 px-1.5 py-0.5 font-display font-bold">
            {player.mainPosition}
            {player.altPosition ? ` / ${player.altPosition}` : ''}
          </span>
          {player.team !== 'D1' && <span>{TEAM_LABEL[player.team]}</span>}
          {disabled && avail.reason && <Badge tone="crit">{avail.reason}</Badge>}
        </div>
      </div>
    </button>
  )
}

/** Positions-Option in den Sheets (Hauptposition vorausgewählt). */
function PosOption({
  pos,
  player,
  onClick,
}: {
  pos: Position
  player: Player
  onClick: () => void
}) {
  const main = pos === player.mainPosition
  const alt = !main && pos === player.altPosition
  return (
    <button
      onClick={onClick}
      className={`mt-1.5 flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 text-left text-[13.5px] font-semibold ${
        main ? 'border-accent bg-accent-soft' : alt ? 'border-accent/50 bg-card-2' : 'border-line bg-card-2'
      }`}
      style={main ? { boxShadow: '0 0 0 1px var(--accent) inset' } : undefined}
    >
      <b className="w-8 shrink-0 font-display text-[13px] font-bold text-accent">{pos}</b>
      {POSITION_LABEL[pos]}
      {(main || alt) && (
        <span className="ml-auto shrink-0 text-[11px] font-normal text-muted">
          {main ? 'Hauptposition' : 'Nebenposition'}
        </span>
      )}
    </button>
  )
}

function SheetHead({ player, sub }: { player: Player; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar player={player} size="md" />
      <div>
        <div className="font-display text-[17px] font-bold uppercase leading-tight">
          {playerName(player)}
        </div>
        <div className="text-[12px] text-muted">{sub}</div>
      </div>
    </div>
  )
}

/** 4a) Nominieren per Tap: Positions-Picker mit Festspiel-Warnung. */
function NominateSheet({
  player,
  festInfo,
  onClose,
  onPick,
}: {
  player: Player
  festInfo?: FestInfo
  onClose: () => void
  onPick: (pos: Position) => void
}) {
  const fc = festInfo?.forecast
  return (
    <Sheet open onClose={onClose}>
      <SheetHead
        player={player}
        sub={`${player.mainPosition}${player.altPosition ? ` / ${player.altPosition}` : ''} · ${
          player.isGuest ? `Gast · ${TEAM_LABEL[player.team]}` : TEAM_LABEL[player.team]
        }`}
      />
      {fc?.warning && (
        <div
          role="alert"
          className={`mt-3 rounded-xl border p-3 text-[12.5px] ${
            fc.resulting === 'festgespielt' ? 'bg-crit-soft' : 'bg-warn-soft'
          }`}
          style={{
            borderColor:
              fc.resulting === 'festgespielt'
                ? 'color-mix(in srgb, var(--crit) 40%, var(--line))'
                : 'color-mix(in srgb, var(--warn) 40%, var(--line))',
          }}
        >
          <b className="font-semibold">Festspielregel (§55 SpO):</b> {fc.warning}
        </div>
      )}
      <div className="mb-1 mt-4 text-[10.5px] font-bold uppercase tracking-widest text-muted">
        Position wählen — Hauptposition vorausgewählt
      </div>
      {POSITIONS.map((pos) => (
        <PosOption key={pos} pos={pos} player={player} onClick={() => onPick(pos)} />
      ))}
      <button
        className="mt-3 min-h-11 w-full rounded-xl border border-line text-[13.5px] font-semibold text-muted"
        onClick={onClose}
      >
        Abbrechen
      </button>
    </Sheet>
  )
}

/** 4b) Nominierte antippen: verschieben oder entfernen. */
function ChipSheet({
  player,
  current,
  onClose,
  onMove,
  onRemove,
}: {
  player: Player
  current: Position
  onClose: () => void
  onMove: (pos: Position) => void
  onRemove: () => void
}) {
  return (
    <Sheet open onClose={onClose}>
      <SheetHead player={player} sub={`Nominiert · ${current} — ${POSITION_LABEL[current]}`} />
      <button
        className="mt-4 flex min-h-12 w-full items-center gap-2 rounded-xl border bg-crit-soft px-3 text-left text-[13.5px] font-semibold text-crit"
        style={{ borderColor: 'color-mix(in srgb, var(--crit) 40%, var(--line))' }}
        onClick={onRemove}
      >
        Aus dem Spieltagskader entfernen
      </button>
      <div className="mb-1 mt-4 text-[10.5px] font-bold uppercase tracking-widest text-muted">
        Oder verschieben nach
      </div>
      {POSITIONS.filter((p) => p !== current).map((pos) => (
        <PosOption key={pos} pos={pos} player={player} onClick={() => onMove(pos)} />
      ))}
      <button
        className="mt-3 min-h-11 w-full rounded-xl border border-line text-[13.5px] font-semibold text-muted"
        onClick={onClose}
      >
        Abbrechen
      </button>
    </Sheet>
  )
}

/** 6) Freigabe-Bestätigung mit Treffpunkt-Eingaben. */
function ReleaseSheet({
  matchLine,
  count,
  over,
  critWarnings,
  again,
  defaultTime,
  defaultPlace,
  onClose,
  onConfirm,
}: {
  matchLine: string
  count: number
  over: boolean
  critWarnings: string[]
  again: boolean
  defaultTime: string
  defaultPlace: string
  onClose: () => void
  onConfirm: (meetTime: string, meetPlace: string) => void
}) {
  const [meetTime, setMeetTime] = useState(defaultTime)
  const [meetPlace, setMeetPlace] = useState(defaultPlace)
  return (
    <Sheet open onClose={onClose} title={again ? 'Erneut freigeben?' : 'Kader freigeben?'}>
      <p className="-mt-2 text-[12px] text-muted">{matchLine}</p>
      <p className="mt-2 text-[13.5px]">
        <b className="font-semibold tnum">{count} Spielerinnen</b> werden informiert und sehen
        Kader, ihre Position und den Treffpunkt.
        {again ? ' Bereits informierte Spielerinnen erhalten die Aktualisierung.' : ''}
      </p>
      <label className="mt-3 block">
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-muted">
          Treffpunkt — Uhrzeit
        </span>
        <input
          type="time"
          value={meetTime}
          onChange={(e) => setMeetTime(e.target.value)}
          className="tnum mt-1 min-h-11 w-full rounded-xl border border-line bg-card-2 px-3 text-[14px]"
        />
      </label>
      <label className="mt-2 block">
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-muted">
          Treffpunkt — Ort
        </span>
        <input
          type="text"
          value={meetPlace}
          onChange={(e) => setMeetPlace(e.target.value)}
          placeholder="z.B. Sporthalle Ehrenfeld"
          className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card-2 px-3 text-[14px]"
        />
      </label>
      {over && (
        <div
          className="mt-3 rounded-xl border bg-warn-soft p-3 text-[12px]"
          style={{ borderColor: 'color-mix(in srgb, var(--warn) 34%, var(--line))' }}
        >
          <b className="font-semibold tnum">{count} nominiert</b> — der Spielbericht erlaubt max.{' '}
          {LIMIT}. Vor dem Anwurf müssen {count - LIMIT} gestrichen werden.
        </div>
      )}
      {critWarnings.map((w) => (
        <div
          key={w}
          className="mt-3 rounded-xl border bg-crit-soft p-3 text-[12px]"
          style={{ borderColor: 'color-mix(in srgb, var(--crit) 34%, var(--line))' }}
        >
          <b className="font-semibold">Festspiel-Folge:</b> {w}
        </div>
      ))}
      <Button className="mt-4 w-full" onClick={() => onConfirm(meetTime.trim(), meetPlace.trim())}>
        Jetzt freigeben
      </Button>
      <button
        className="mt-2 min-h-11 w-full rounded-xl border border-line text-[13.5px] font-semibold text-muted"
        onClick={onClose}
      >
        Abbrechen
      </button>
    </Sheet>
  )
}

/** 6b) Spielerinnen-Vorschau: persönliche Karte + freigegebener Kader. */
function PreviewSection({
  squad,
  matchLine,
  playersById,
  dirty,
  open,
  setOpen,
  pvPlayerId,
  setPvPlayerId,
}: {
  squad: MatchdaySquad
  matchLine: string
  playersById: Map<string, Player>
  dirty: boolean
  open: boolean
  setOpen: (v: boolean) => void
  pvPlayerId: string | null
  setPvPlayerId: (id: string) => void
}) {
  const released = squad.releasedNominations ?? []
  const selected = released.find((n) => n.playerId === pvPlayerId) ?? released[0]
  const selectedPlayer = selected ? playersById.get(selected.playerId) : undefined
  const meet = [squad.meetTime, squad.meetPlace].filter(Boolean).join(' · ')

  return (
    <div>
      <button
        className="flex min-h-12 w-full items-center gap-2 rounded-2xl border border-line bg-card px-3 text-left text-[13.5px] font-semibold shadow-card"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        So sieht es eine nominierte Spielerin
        <span
          className={`ml-auto text-muted transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      {open && (
        <div className="mt-2">
          {released.length > 1 && (
            <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Vorschau-Spielerin wählen">
              {released.map((n) => {
                const p = playersById.get(n.playerId)
                if (!p) return null
                const sel = n.playerId === selected?.playerId
                return (
                  <button
                    key={n.playerId}
                    onClick={() => setPvPlayerId(n.playerId)}
                    aria-pressed={sel}
                    className={`min-h-9 shrink-0 rounded-full border px-2.5 text-[12px] font-semibold ${
                      sel ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-card text-muted'
                    }`}
                  >
                    {p.firstName}
                  </button>
                )
              })}
            </div>
          )}

          {selected && selectedPlayer && (
            <>
              <p className="mb-1.5 px-1 text-[11px] text-muted">
                Vorschau aus Sicht von {playerName(selectedPlayer)}
              </p>
              <div
                className="rounded-2xl p-4 text-poster-ink"
                style={{ background: 'linear-gradient(150deg, var(--poster-a), var(--poster-b))' }}
              >
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">
                  Spieltagskader · freigegeben
                </div>
                <div className="mt-1 font-display text-[21px] font-bold uppercase leading-none">
                  Du bist nominiert
                </div>
                <div className="tnum mt-2 text-[12.5px] opacity-90">{matchLine}</div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span
                    className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ borderColor: 'color-mix(in srgb, var(--poster-ink) 40%, transparent)' }}
                  >
                    Position: {selected.position} · {POSITION_LABEL[selected.position]}
                  </span>
                  {meet && (
                    <span
                      className="tnum rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ borderColor: 'color-mix(in srgb, var(--poster-ink) 40%, transparent)' }}
                    >
                      Treffpunkt {meet}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          <Card className="mt-2 p-3">
            <div className="text-[10.5px] font-bold uppercase tracking-widest text-muted">
              Freigegebener Kader · {released.length} Spielerinnen
            </div>
            {POSITIONS.map((pos) => {
              const names = released
                .filter((n) => n.position === pos)
                .map((n) => {
                  const p = playersById.get(n.playerId)
                  return p ? `${playerName(p)}${p.isGuest ? ' (Gast)' : ''}` : null
                })
                .filter((s): s is string => s !== null)
              if (names.length === 0) return null
              return (
                <div key={pos} className="flex gap-2 border-b border-line py-1.5 text-[12.5px] last:border-b-0">
                  <span className="w-8 shrink-0 font-display text-[11.5px] font-bold text-accent">
                    {pos}
                  </span>
                  <span>{names.join(', ')}</span>
                </div>
              )
            })}
            <p className="mt-1.5 text-[11px] text-muted">
              Stand: {squad.releasedAt ? fmtStamp(squad.releasedAt) : '—'}
              {dirty ? ' — spätere Änderungen sind noch nicht freigegeben.' : ''}
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}

/** 7) WhatsApp-Teilen des freigegebenen Kaders. */
function ShareCard({ text, onToast }: { text: string; onToast: (m: string) => void }) {
  return (
    <Card className="p-4">
      <p className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-card-2 p-3 text-[12px] leading-relaxed text-muted">
        {text}
      </p>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={() => void shareViaWhatsApp(text)}>
          Teilen
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={async () => {
            onToast((await copyText(text)) ? 'Kader-Text kopiert' : 'Kopieren nicht möglich')
          }}
        >
          Kopieren
        </Button>
      </div>
    </Card>
  )
}

/** 4c) Positionsgruppe antippen: verfügbare Spielerinnen für diese Position. */
function PositionPickSheet({
  position,
  candidates,
  fest,
  onClose,
  onPick,
}: {
  position: Position
  candidates: Player[]
  fest: Map<string, FestInfo>
  onClose: () => void
  onPick: (playerId: string) => void
}) {
  const main = candidates.filter((p) => p.mainPosition === position)
  const alt = candidates.filter(
    (p) => p.altPosition === position && p.mainPosition !== position,
  )
  const rest = candidates.filter(
    (p) => p.mainPosition !== position && p.altPosition !== position,
  )

  const row = (p: Player) => {
    const fc = fest.get(p.id)?.forecast
    return (
      <button
        key={p.id}
        onClick={() => onPick(p.id)}
        className="flex min-h-13 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left active:bg-accent-soft"
      >
        <Avatar player={p} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{playerName(p)}</span>
          <span className="block text-[11px] text-muted">
            {p.mainPosition}
            {p.altPosition ? ` / ${p.altPosition}` : ''}
            {p.isGuest ? ` · Gast · ${TEAM_LABEL[p.team]}` : ''}
          </span>
        </span>
        {fc?.resulting === 'festgespielt' && <Badge tone="crit">2. Einsatz in Folge!</Badge>}
        {fc?.resulting === 'warnung' && <Badge tone="warn">1. Einsatz höher</Badge>}
      </button>
    )
  }

  const section = (title: string, list: Player[]) =>
    list.length > 0 && (
      <>
        <div className="mb-0.5 mt-3 text-[10.5px] font-bold uppercase tracking-widest text-muted">
          {title}
        </div>
        {list.map(row)}
      </>
    )

  return (
    <Sheet open onClose={onClose} title={`${position} — ${POSITION_LABEL[position]} besetzen`}>
      {candidates.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted">
          Keine verfügbaren Spielerinnen mehr — alle sind nominiert oder abwesend.
        </p>
      ) : (
        <>
          {section('Hauptposition', main)}
          {section('Alternativposition', alt)}
          {section('Weitere Verfügbare', rest)}
        </>
      )}
      <button
        className="mt-3 min-h-11 w-full rounded-xl border border-line text-[13.5px] font-semibold text-muted"
        onClick={onClose}
      >
        Abbrechen
      </button>
    </Sheet>
  )
}
