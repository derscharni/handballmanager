import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayIso } from '../../lib/db'
import type { MatchEvent, Opponent } from '../../lib/types'
import type { SpielplanScreenProps } from '../props'
import { Badge, Button, EmptyState, SectionTitle } from '../../components/ui'
import { fmtDateShort, fmtDayDate, fmtWeekday } from '../../lib/format'
import EventEditorSheet from './EventEditorSheet'
import ImportSheet from './ImportSheet'

const PAST_PREVIEW_COUNT = 5

/** Kürzel für das Gegner-Badge: shortName oder aus dem Namen abgeleitet. */
export function opponentInitials(opp: Opponent | undefined): string {
  if (!opp) return '?'
  if (opp.shortName?.trim()) return opp.shortName.trim().slice(0, 3).toUpperCase()
  const words = opp.name.split(/[\s-]+/).filter(Boolean)
  const core = words.filter(
    (w) => !/^(hsg|tus|tsv|tv|sv|sc|hc|sg|vfl|vfb|djk|fc)$/i.test(w) && !/^\d/.test(w),
  )
  const src = core.length > 0 ? core : words
  const init = src
    .slice(0, 2)
    .map((w) => (w[0] ?? '').toUpperCase())
    .join('')
  return init || opp.name.slice(0, 2).toUpperCase()
}

function byDateTime(a: MatchEvent, b: MatchEvent): number {
  return `${a.date}T${a.time ?? '00:00'}`.localeCompare(`${b.date}T${b.time ?? '00:00'}`)
}

function sourceLabel(e: MatchEvent): string | null {
  if (e.source === 'handballnet') return 'handball.net'
  if (e.source === 'ics') return 'ICS'
  return null
}

function MatchCard({
  event,
  opponent,
  onOpen,
}: {
  event: MatchEvent
  opponent: Opponent | undefined
  onOpen: () => void
}) {
  const played = event.goalsUs != null && event.goalsThem != null
  const outcome = !played
    ? null
    : event.goalsUs! > event.goalsThem!
      ? ('ok' as const)
      : event.goalsUs! < event.goalsThem!
        ? ('crit' as const)
        : ('neutral' as const)
  const src = sourceLabel(event)

  return (
    <button
      onClick={onOpen}
      className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-card p-3 text-left shadow-card active:bg-card-2"
    >
      <span className="w-11 flex-none text-center">
        <span className="block font-display text-[17px] font-bold leading-none tnum">
          {fmtDateShort(event.date)}
        </span>
        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.1em] text-muted">
          {fmtWeekday(event.date)}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-line bg-card-2 font-display text-[13px] font-bold"
      >
        {opponentInitials(opponent)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold">
          {opponent?.name ?? 'Gegner offen'}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted tnum">
          {played && (
            <Badge tone={event.home ? 'accent' : 'neutral'} className="font-display">
              {event.home ? 'H' : 'A'}
            </Badge>
          )}
          {event.time && <span>{event.time}</span>}
          {event.hall && <span className="truncate">· {event.hall}</span>}
          {src && <Badge tone="neutral">{src}</Badge>}
        </span>
      </span>
      {played ? (
        <Badge tone={outcome!} className="tnum px-2 py-1 text-[14px] font-display">
          {event.goalsUs}:{event.goalsThem}
        </Badge>
      ) : (
        <Badge tone={event.home ? 'accent' : 'neutral'} className="font-display uppercase">
          {event.home ? 'Heim' : 'Ausw.'}
        </Badge>
      )}
    </button>
  )
}

function CompactRow({ event, onOpen }: { event: MatchEvent; onOpen: () => void }) {
  const isTournament = event.kind === 'tournament'
  const src = sourceLabel(event)
  return (
    <button
      onClick={onOpen}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2 text-left active:bg-card-2"
    >
      <span className="w-[74px] flex-none text-[12.5px] text-muted tnum">
        {fmtDayDate(event.date)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
        {isTournament ? event.note?.trim() || 'Turnier' : 'Training'}
      </span>
      {isTournament && <Badge tone="accent">Turnier</Badge>}
      {src && <Badge tone="neutral">{src}</Badge>}
      <span className="flex-none text-[12px] text-muted tnum">{event.time ?? ''}</span>
    </button>
  )
}

export default function SpielplanScreen(_props: SpielplanScreenProps) {
  const events = useLiveQuery(() => db.events.toArray(), [])
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])
  const settings = useLiveQuery(() => db.settings.get('app'), [])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<MatchEvent | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [showAllPast, setShowAllPast] = useState(false)

  const today = todayIso()
  const oppById = useMemo(
    () => new Map((opponents ?? []).map((o) => [o.id, o])),
    [opponents],
  )
  const { upcoming, past } = useMemo(() => {
    const all = events ?? []
    return {
      upcoming: all.filter((e) => e.date >= today).sort(byDateTime),
      past: all.filter((e) => e.date < today).sort((a, b) => byDateTime(b, a)),
    }
  }, [events, today])

  const existingExternalIds = useMemo(
    () =>
      new Set(
        (events ?? []).flatMap((e) => (e.externalId ? [e.externalId] : [])),
      ),
    [events],
  )

  if (!events) return null // Erste Dexie-Antwort abwarten (kein Flackern)

  function openNew() {
    setEditEvent(null)
    setEditorOpen(true)
  }
  function openEdit(e: MatchEvent) {
    setEditEvent(e)
    setEditorOpen(true)
  }

  const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW_COUNT)

  const renderEvent = (e: MatchEvent) =>
    e.kind === 'match' ? (
      <MatchCard key={e.id} event={e} opponent={e.opponentId ? oppById.get(e.opponentId) : undefined} onOpen={() => openEdit(e)} />
    ) : (
      <CompactRow key={e.id} event={e} onOpen={() => openEdit(e)} />
    )

  return (
    <div className="pb-6">
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
            <path d="M5 19.5h14" />
          </svg>
          Import
        </Button>
        <Button onClick={openNew}>+ Neuer Termin</Button>
      </div>

      {events.length === 0 ? (
        <div className="pt-4">
          <EmptyState
            title="Noch keine Termine"
            hint="Lege Spiele, Trainings und Turniere an — oder importiere den Spielplan aus einer ICS-Datei bzw. von handball.net."
          />
        </div>
      ) : (
        <>
          <SectionTitle>
            Kommende{settings?.teamName ? ` · ${settings.teamName}` : ''}
          </SectionTitle>
          {upcoming.length === 0 ? (
            <EmptyState title="Keine kommenden Termine" hint="Neuen Termin anlegen oder Spielplan importieren." />
          ) : (
            <div className="flex flex-col gap-2">{upcoming.map(renderEvent)}</div>
          )}

          {past.length > 0 && (
            <>
              <SectionTitle>Vergangene</SectionTitle>
              <div className="flex flex-col gap-2">{visiblePast.map(renderEvent)}</div>
              {past.length > PAST_PREVIEW_COUNT && (
                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => setShowAllPast((v) => !v)}
                >
                  {showAllPast
                    ? 'Weniger anzeigen'
                    : `Alle ${past.length} vergangenen Termine anzeigen`}
                </Button>
              )}
            </>
          )}
        </>
      )}

      <EventEditorSheet
        open={editorOpen}
        event={editEvent}
        opponents={opponents ?? []}
        onClose={() => setEditorOpen(false)}
      />
      {importOpen && (
        <ImportSheet
          open
          onClose={() => setImportOpen(false)}
          settings={settings}
          existingExternalIds={existingExternalIds}
        />
      )}
    </div>
  )
}
