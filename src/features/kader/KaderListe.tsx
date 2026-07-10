import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayIso } from '../../lib/db'
import type { Absence, Appearance, Player } from '../../lib/types'
import { TEAM_LABEL } from '../../lib/types'
import { availabilityOn } from '../../lib/availability'
import { computeFestspielStatus } from '../../lib/festspiel'
import { fmtDateShort } from '../../lib/format'
import { Avatar } from '../../components/Avatar'
import { Badge, Card, EmptyState, SectionTitle } from '../../components/ui'
import { byPositionThenName, matchesQuery, PositionChips, WarnIcon } from './shared'
import { PlayerFormSheet } from './PlayerFormSheet'
import { GuestSheet } from './GuestSheet'

export function KaderListe({ openPlayer }: { openPlayer: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [showNewSheet, setShowNewSheet] = useState(false)
  const [showGuestSheet, setShowGuestSheet] = useState(false)
  const [showWeitere, setShowWeitere] = useState(false)

  const players = useLiveQuery(() => db.players.toArray(), [])
  const absences = useLiveQuery(() => db.absences.toArray(), [])
  const appearances = useLiveQuery(() => db.appearances.toArray(), [])
  const today = todayIso()

  const appsByPlayer = useMemo(() => {
    const map = new Map<string, Appearance[]>()
    for (const a of appearances ?? []) {
      const list = map.get(a.playerId)
      if (list) list.push(a)
      else map.set(a.playerId, [a])
    }
    return map
  }, [appearances])

  const loading = players === undefined || absences === undefined || appearances === undefined

  const stamm = useMemo(
    () =>
      (players ?? [])
        .filter((p) => p.team === 'D1' && !p.isGuest && matchesQuery(p, query))
        .sort(byPositionThenName),
    [players, query],
  )
  const gaeste = useMemo(
    () =>
      (players ?? [])
        .filter((p) => p.isGuest && matchesQuery(p, query))
        .sort(byPositionThenName),
    [players, query],
  )
  const weitere = useMemo(
    () =>
      (players ?? [])
        .filter((p) => p.team !== 'D1' && !p.isGuest && matchesQuery(p, query))
        .sort(byPositionThenName),
    [players, query],
  )

  const searching = query.trim() !== ''
  const einsatzbereit = stamm.filter(
    (p) => availabilityOn(p, absences ?? [], today).available,
  ).length

  return (
    <div className="pb-20">
      <h1 className="px-1 pt-2 font-display text-[26px] font-bold uppercase tracking-wide">
        Kader
      </h1>

      {/* Suche */}
      <div className="relative mt-2">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Spielerin suchen …"
          aria-label="Spielerin suchen"
          className="w-full min-h-11 rounded-xl border border-line bg-card pl-9 pr-3 text-[15px] text-ink placeholder:text-muted shadow-card"
        />
      </div>

      {/* Stammkader */}
      <SectionTitle>Stammkader · {TEAM_LABEL.D1}</SectionTitle>
      {!loading && !searching && (
        <p className="px-1 pb-2 -mt-1 text-[12px] text-muted tnum">
          {stamm.length} Spielerinnen · {einsatzbereit} heute einsatzbereit
        </p>
      )}
      {loading ? (
        <Card className="p-4 text-center text-[13px] text-muted">Lädt …</Card>
      ) : stamm.length === 0 ? (
        <EmptyState
          title={searching ? 'Keine Treffer' : 'Noch keine Spielerinnen'}
          hint={
            searching
              ? 'Suchbegriff anpassen.'
              : 'Lege den Stammkader über „Neue Spielerin" an.'
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {stamm.map((p) => (
              <PlayerRow
                key={p.id}
                player={p}
                absences={absences ?? []}
                appearances={appsByPlayer.get(p.id) ?? []}
                today={today}
                onOpen={openPlayer}
              />
            ))}
          </ul>
        </Card>
      )}

      {/* Gäste */}
      <SectionTitle
        action={
          <button
            onClick={() => setShowGuestSheet(true)}
            className="min-h-11 px-1 text-[13px] font-bold text-accent"
          >
            + Gast hinzufügen
          </button>
        }
      >
        Gäste · temporär im Team
      </SectionTitle>
      {!loading && gaeste.length === 0 ? (
        <EmptyState
          title={searching ? 'Keine Treffer' : 'Keine Gäste im Team'}
          hint={
            searching
              ? undefined
              : `Spielerinnen aus ${TEAM_LABEL.D2} oder ${TEAM_LABEL.AJ} temporär holen — die Festspiel-Regel (§55 SpO) läuft automatisch mit.`
          }
        />
      ) : (
        !loading && (
          <Card>
            <ul className="divide-y divide-line">
              {gaeste.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  absences={absences ?? []}
                  appearances={appsByPlayer.get(p.id) ?? []}
                  today={today}
                  onOpen={openPlayer}
                />
              ))}
            </ul>
          </Card>
        )
      )}

      {/* Weitere (potenzielle Gäste), eingeklappt */}
      {!loading && weitere.length > 0 && (
        <>
          <SectionTitle>Weitere Spielerinnen</SectionTitle>
          <Card>
            <button
              onClick={() => setShowWeitere((v) => !v)}
              aria-expanded={showWeitere || searching}
              className="flex min-h-11 w-full items-center justify-between px-4 py-2 text-left"
            >
              <span className="text-[13px] font-semibold text-muted">
                {weitere.length} aus {TEAM_LABEL.D2} / {TEAM_LABEL.AJ} — mögliche Gäste
              </span>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 text-muted transition-transform ${
                  showWeitere || searching ? 'rotate-90' : ''
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 5 7 7-7 7" />
              </svg>
            </button>
            {(showWeitere || searching) && (
              <ul className="divide-y divide-line border-t border-line">
                {weitere.map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    absences={absences ?? []}
                    appearances={appsByPlayer.get(p.id) ?? []}
                    today={today}
                    onOpen={openPlayer}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* FAB: Neue Spielerin */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-lg justify-end px-4 pb-[calc(env(safe-area-inset-bottom)+4.75rem)]">
        <button
          onClick={() => setShowNewSheet(true)}
          className="pointer-events-auto inline-flex min-h-13 items-center gap-2 rounded-full bg-btn-bg px-5 font-display text-[14px] font-bold uppercase tracking-wide text-btn-ink shadow-card active:opacity-85"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Neue Spielerin
        </button>
      </div>

      <PlayerFormSheet open={showNewSheet} onClose={() => setShowNewSheet(false)} />
      <GuestSheet
        open={showGuestSheet}
        onClose={() => setShowGuestSheet(false)}
        candidates={(players ?? []).filter((p) => !p.isGuest && p.team !== 'D1')}
      />
    </div>
  )
}

/* ---------- Zeile ---------- */

function PlayerRow({
  player,
  absences,
  appearances,
  today,
  onOpen,
}: {
  player: Player
  absences: Absence[]
  appearances: Appearance[]
  today: string
  onOpen: (id: string) => void
}) {
  const avail = availabilityOn(player, absences, today)
  const fest = computeFestspielStatus(player.team, appearances, today)
  const absCat = avail.absence?.category
  const availTone = absCat === 'verletzung' || absCat === 'krankheit' ? 'crit' : 'warn'

  return (
    <li>
      <button
        onClick={() => onOpen(player.id)}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-card-2"
      >
        <Avatar player={player} size="md" />
        <span className="w-6 shrink-0 text-right text-[13px] font-bold text-muted tnum">
          {player.number ?? '–'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">
            {player.firstName} {player.lastName}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <PositionChips main={player.mainPosition} alt={player.altPosition} />
            {player.isGuest && (
              <Badge tone="guest">
                GAST · {TEAM_LABEL[player.team]}
                {player.guestUntil ? ` · bis ${fmtDateShort(player.guestUntil)}` : ''}
              </Badge>
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {avail.available ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ok">
              <span className="h-2.5 w-2.5 rounded-full bg-ok" aria-hidden="true" />
              Verfügbar
            </span>
          ) : (
            <Badge tone={availTone} className="max-w-36">
              <span className="truncate">{avail.reason}</span>
            </Badge>
          )}
          {fest.state === 'festgespielt' && fest.blockedUntil && (
            <Badge tone="crit">Festgespielt bis {fmtDateShort(fest.blockedUntil)}</Badge>
          )}
          {fest.state === 'warnung' && (
            <Badge tone="warn">
              <WarnIcon className="h-3 w-3" />
              1. Einsatz
            </Badge>
          )}
        </span>
      </button>
    </li>
  )
}
