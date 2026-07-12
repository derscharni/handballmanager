import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import type { MatchEvent, Opponent } from '../../../lib/types'
import { Button, Card, EmptyState } from '../../../components/ui'
import type { TeamSectionProps } from '../../props'
import { OpponentLogo } from './OpponentLogo'
import { GegnerSheet } from './GegnerSheet'
import { recordFromEvents, recordShort } from './bilanz'
import { inputCls } from './form'

/**
 * Gegner-Verwaltung: alphabetische Liste mit Logo, Liga, Halle und
 * Mini-Bilanz; Detail-Sheet zum Bearbeiten inkl. Logo und Spiele-Bilanz.
 */
export default function GegnerSection(_props: TeamSectionProps) {
  const opponents = useLiveQuery(() => db.opponents.toArray())
  const events = useLiveQuery(() => db.events.toArray())

  if (!opponents || !events) {
    return (
      <div className="flex h-[30dvh] items-center justify-center font-display uppercase tracking-wide text-muted">
        Lädt …
      </div>
    )
  }
  return <GegnerInner opponents={opponents} events={events} />
}

function GegnerInner({
  opponents,
  events,
}: {
  opponents: Opponent[]
  events: MatchEvent[]
}) {
  const [query, setQuery] = useState('')
  // 'new' = anlegen, sonst der zu bearbeitende Gegner.
  const [editing, setEditing] = useState<Opponent | 'new' | null>(null)

  const sorted = useMemo(
    () => [...opponents].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [opponents],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((o) =>
      [o.name, o.shortName, o.league, o.hall]
        .filter((v): v is string => typeof v === 'string')
        .some((v) => v.toLowerCase().includes(q)),
    )
  }, [sorted, query])

  /** Spiel-Termine je Gegner (für Mini-Bilanz und Detail-Block). */
  const matchesByOpponent = useMemo(() => {
    const map = new Map<string, MatchEvent[]>()
    for (const e of events) {
      if (e.kind !== 'match' || !e.opponentId) continue
      const list = map.get(e.opponentId)
      if (list) list.push(e)
      else map.set(e.opponentId, [e])
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.date.localeCompare(a.date))
    }
    return map
  }, [events])

  /** Alle Termin-Verweise je Gegner (Lösch-Sperre, auch Turniere etc.). */
  const usageByOpponent = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of events) {
      if (e.opponentId) map.set(e.opponentId, (map.get(e.opponentId) ?? 0) + 1)
    }
    return map
  }, [events])

  const editingOpponent = editing === 'new' ? null : editing

  return (
    <div className="pb-6">
      {sorted.length > 0 && (
        <div className="flex gap-2 pt-3">
          <input
            type="search"
            placeholder="Gegner suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputCls}
            aria-label="Gegner suchen"
          />
          <Button variant="secondary" className="shrink-0" onClick={() => setEditing('new')}>
            + Neu
          </Button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="pt-3">
          <EmptyState
            title="Noch keine Gegner"
            hint="Gegner mit Liga, Halle und Logo anlegen — der Spielplan verknüpft sich damit."
            action={
              <Button variant="secondary" onClick={() => setEditing('new')}>
                + Gegner anlegen
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="pt-3">
          <EmptyState
            title="Keine Treffer"
            hint={`Kein Gegner passt zu „${query.trim()}“.`}
          />
        </div>
      ) : (
        <Card className="mt-3 overflow-hidden">
          {filtered.map((o, i) => {
            const matches = matchesByOpponent.get(o.id) ?? []
            const record = recordFromEvents(matches)
            const meta = [o.league, o.hall].filter(Boolean).join(' · ')
            return (
              <button
                key={o.id}
                onClick={() => setEditing(o)}
                className={`flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors active:bg-card-2 ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <OpponentLogo name={o.name} shortName={o.shortName} logo={o.logo} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight">
                    {o.name}
                  </span>
                  {meta && (
                    <span className="block truncate text-[12px] text-muted">{meta}</span>
                  )}
                  {record.played > 0 && (
                    <span className="tnum block text-[12px] font-semibold text-muted">
                      {recordShort(record)}
                    </span>
                  )}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            )
          })}
        </Card>
      )}

      <GegnerSheet
        open={editing !== null}
        opponent={editingOpponent}
        matches={editingOpponent ? (matchesByOpponent.get(editingOpponent.id) ?? []) : []}
        usedCount={editingOpponent ? (usageByOpponent.get(editingOpponent.id) ?? 0) : 0}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
