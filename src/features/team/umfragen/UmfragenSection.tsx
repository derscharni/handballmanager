import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../lib/db'
import type { Poll } from '../../../lib/types'
import { Badge, Button, Card, EmptyState, SectionTitle } from '../../../components/ui'
import type { TeamSectionProps } from '../../props'
import PollDetailSheet from './PollDetailSheet'
import PollFormSheet from './PollFormSheet'
import { decisionText, percentOf, pollRoster, tallyPoll } from './poll-utils'

const CLOSED_PREVIEW = 3

/**
 * Team-Umfragen: der Trainer legt Fragen an, trägt Stimmen ein
 * (aus WhatsApp zurückgemeldet oder Handy rumreichen) und teilt Ergebnisse.
 */
export default function UmfragenSection(_props: TeamSectionProps) {
  const polls = useLiveQuery(() => db.polls.toArray(), [])
  const players = useLiveQuery(() => db.players.toArray(), [])

  const [detailId, setDetailId] = useState<string | null>(null)
  const [form, setForm] = useState<{ poll: Poll | null } | null>(null)
  const [showAllClosed, setShowAllClosed] = useState(false)

  const roster = useMemo(() => pollRoster(players ?? []), [players])

  const { openPolls, closedPolls } = useMemo(() => {
    const sorted = [...(polls ?? [])].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    return {
      openPolls: sorted.filter((p) => p.status === 'offen'),
      closedPolls: sorted.filter((p) => p.status === 'geschlossen'),
    }
  }, [polls])

  if (!polls || !players) return null

  const detailPoll = detailId ? (polls.find((p) => p.id === detailId) ?? null) : null
  const visibleClosed = showAllClosed ? closedPolls : closedPolls.slice(0, CLOSED_PREVIEW)
  const hiddenClosed = closedPolls.length - visibleClosed.length

  return (
    <div className="pb-6">
      <SectionTitle
        action={
          polls.length > 0 ? (
            <button
              onClick={() => setForm({ poll: null })}
              className="min-h-11 px-1 font-display text-[13px] font-bold uppercase tracking-wide text-accent"
            >
              + Neue Umfrage
            </button>
          ) : undefined
        }
      >
        Umfragen
      </SectionTitle>

      {polls.length === 0 ? (
        <EmptyState
          title="Noch keine Umfrage"
          hint="Starte die erste — z.B. „Saisonabschluss: Was machen wir?“"
          action={<Button onClick={() => setForm({ poll: null })}>Neue Umfrage</Button>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {openPolls.map((p) => (
            <PollCard key={p.id} poll={p} base={roster.length} onOpen={() => setDetailId(p.id)} />
          ))}
          {openPolls.length === 0 && (
            <p className="px-1 py-1 text-[13px] text-muted">
              Gerade keine offene Umfrage — Zeit für eine neue Frage ans Team.
            </p>
          )}

          {closedPolls.length > 0 && (
            <>
              <SectionTitle>Geschlossen</SectionTitle>
              {visibleClosed.map((p) => (
                <PollCard
                  key={p.id}
                  poll={p}
                  base={roster.length}
                  onOpen={() => setDetailId(p.id)}
                />
              ))}
              {hiddenClosed > 0 && (
                <Button variant="ghost" onClick={() => setShowAllClosed(true)}>
                  {hiddenClosed} weitere anzeigen
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {detailPoll && (
        <PollDetailSheet
          key={detailPoll.id}
          poll={detailPoll}
          roster={roster}
          onClose={() => setDetailId(null)}
          onEdit={() => setForm({ poll: detailPoll })}
        />
      )}

      {form && (
        <PollFormSheet
          key={form.poll?.id ?? 'new'}
          poll={form.poll}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

/* ---------- Listen-Karte ---------- */

function PollCard({
  poll,
  base,
  onOpen,
}: {
  poll: Poll
  base: number
  onOpen: () => void
}) {
  const t = tallyPoll(poll)
  const open = poll.status === 'offen'
  const leader =
    t.leaderIds.length > 0 ? poll.options.find((o) => o.id === t.leaderIds[0]) : undefined
  const leaderPct = leader ? percentOf(t.counts[leader.id] ?? 0, t.ballots) : 0
  const decided = open ? null : decisionText(poll)

  return (
    <Card className={open ? '' : 'opacity-85'}>
      <button onClick={onOpen} className="block w-full p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-display text-[16px] font-bold leading-snug text-ink">
            {poll.question}
          </h3>
          {open ? <Badge tone="accent">Offen</Badge> : <Badge tone="neutral">Geschlossen</Badge>}
        </div>

        <p className="tnum mt-1 text-[13px] text-muted">
          {t.voterIds.length} / {base} abgestimmt
          {poll.multi && ' · Mehrfachauswahl'}
        </p>

        {t.maxCount > 0 && leader ? (
          <div className="mt-2">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
              <span
                className={`min-w-0 truncate font-semibold ${open ? 'text-accent' : 'text-ok'}`}
              >
                {open
                  ? `Vorn: ${t.leaderIds.length > 1 ? 'Gleichstand' : leader.label}`
                  : `Entschieden: ${decided ?? leader.label}`}
              </span>
              <span className="tnum shrink-0 text-muted">{leaderPct} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-card-2">
              <div
                className={`h-full rounded-full ${open ? 'bg-accent' : 'bg-ok'}`}
                style={{ width: `${Math.max(leaderPct, 3)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-muted">Noch keine Stimme — jetzt teilen!</p>
        )}
      </button>
    </Card>
  )
}
