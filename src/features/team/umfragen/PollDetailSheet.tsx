import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../../../lib/db'
import type { Player, Poll, PollVote } from '../../../lib/types'
import { Badge, Button, Segmented, Sheet } from '../../../components/ui'
import { Avatar } from '../../../components/Avatar'
import { playerName } from '../../../lib/format'
import { decisionText, pendingPlayers, percentOf, tallyPoll } from './poll-utils'
import { copyText, pollInviteText, pollResultText, shareText } from './share'

type Mode = 'ergebnis' | 'abstimmen'

/**
 * Umfrage-Detail: Ergebnisbalken, Abstimm-Modus (Stimmen eintragen /
 * Handy rumreichen), Teilen, Schließen/Öffnen und zweistufiges Löschen.
 */
export default function PollDetailSheet({
  poll,
  roster,
  onClose,
  onEdit,
}: {
  poll: Poll
  roster: Player[]
  onClose: () => void
  onEdit: () => void
}) {
  const [mode, setMode] = useState<Mode>('ergebnis')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const open = poll.status === 'offen'
  const tally = useMemo(() => tallyPoll(poll), [poll])
  const pending = useMemo(() => pendingPlayers(poll, roster), [poll, roster])
  const decided = decisionText(poll)

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    },
    [],
  )

  async function setVote(playerId: string, optionId: string) {
    const has = poll.votes.some(
      (v) => v.playerId === playerId && v.optionId === optionId,
    )
    let votes: PollVote[]
    if (poll.multi) {
      votes = has
        ? poll.votes.filter((v) => !(v.playerId === playerId && v.optionId === optionId))
        : [...poll.votes, { playerId, optionId }]
    } else {
      const rest = poll.votes.filter((v) => v.playerId !== playerId)
      votes = has ? rest : [...rest, { playerId, optionId }]
    }
    await db.polls.update(poll.id, { votes })
  }

  async function toggleStatus() {
    await db.polls.update(poll.id, {
      status: open ? 'geschlossen' : 'offen',
    })
    if (open) setMode('ergebnis')
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await db.polls.delete(poll.id)
    onClose()
  }

  async function copyShareText() {
    const ok = await copyText(open ? pollInviteText(poll) : pollResultText(poll))
    if (!ok) return
    setCopied(true)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Sheet open onClose={onClose} title={poll.question}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <Badge tone="accent">Offen</Badge>
          ) : (
            <Badge tone="neutral">Geschlossen</Badge>
          )}
          {!open && decided && <Badge tone="ok">Entschieden: {decided}</Badge>}
          {poll.multi && <Badge tone="neutral">Mehrfachauswahl</Badge>}
          <span className="tnum ml-auto text-[13px] text-muted">
            {tally.voterIds.length} / {roster.length} abgestimmt
          </span>
        </div>

        {poll.note && <p className="text-[13px] text-muted">📌 {poll.note}</p>}

        {open && (
          <Segmented<Mode>
            options={[
              { value: 'ergebnis', label: 'Ergebnis' },
              { value: 'abstimmen', label: 'Abstimmen' },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}

        {mode === 'ergebnis' || !open ? (
          <ResultView poll={poll} roster={roster} pending={pending} />
        ) : (
          <VoteView poll={poll} roster={roster} onVote={(p, o) => void setVote(p, o)} />
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
          <Button
            variant="secondary"
            onClick={() => void shareText(open ? pollInviteText(poll) : pollResultText(poll))}
          >
            {open ? 'Umfrage teilen' : 'Ergebnis teilen'}
          </Button>
          <Button variant="ghost" onClick={() => void copyShareText()}>
            {copied ? 'Kopiert ✓' : 'Text kopieren'}
          </Button>
          {open ? (
            <>
              <Button variant="ghost" onClick={onEdit}>
                Bearbeiten
              </Button>
              <Button variant="primary" onClick={() => void toggleStatus()}>
                Umfrage schließen
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => void toggleStatus()}>
              Wieder öffnen
            </Button>
          )}
          <Button
            variant="danger"
            className={confirmDelete ? 'col-span-2' : ''}
            onClick={() => void remove()}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? 'Wirklich löschen? Tippe nochmal.' : 'Löschen'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ---------- Ergebnis-Ansicht ---------- */

function ResultView({
  poll,
  roster,
  pending,
}: {
  poll: Poll
  roster: Player[]
  pending: Player[]
}) {
  const t = tallyPoll(poll)
  const closed = poll.status === 'geschlossen'

  return (
    <div className="flex flex-col gap-3">
      {t.ballots === 0 && (
        <p className="text-[13px] text-muted">
          Noch keine Stimme — teile die Umfrage oder reiche das Handy rum.
        </p>
      )}
      <ul className="flex flex-col gap-2.5">
        {poll.options.map((o) => {
          const count = t.counts[o.id] ?? 0
          const pct = percentOf(count, t.ballots)
          const leading = t.leaderIds.includes(o.id)
          const winner = closed && leading
          return (
            <li key={o.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span
                  className={`min-w-0 truncate text-[14px] ${
                    winner
                      ? 'font-bold text-ok'
                      : leading
                        ? 'font-bold text-accent'
                        : count === 0
                          ? 'text-muted'
                          : 'text-ink'
                  }`}
                >
                  {winner && '🏆 '}
                  {o.label}
                </span>
                <span className="tnum shrink-0 text-[13px] text-muted">
                  <span className={leading ? 'font-bold text-ink' : ''}>{pct} %</span>
                  {' · '}
                  {count} {count === 1 ? 'Stimme' : 'Stimmen'}
                </span>
              </div>
              <div
                className={`overflow-hidden rounded-full bg-card-2 ${
                  count === 0 ? 'h-1' : 'h-2.5'
                }`}
              >
                <div
                  className={`h-full rounded-full transition-all ${
                    winner ? 'bg-ok' : leading ? 'bg-accent' : 'bg-accent/55'
                  }`}
                  style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {roster.length > 0 &&
        (pending.length === 0 ? (
          <p className="text-[13px] font-semibold text-ok">
            Alle haben abgestimmt — starke Quote! 🎉
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[13px] text-muted">
              Wer hat noch nicht? <span className="tnum">({pending.length})</span>
            </span>
            <AvatarStack players={pending} />
          </div>
        ))}
    </div>
  )
}

function AvatarStack({ players, max = 8 }: { players: Player[]; max?: number }) {
  const shown = players.slice(0, max)
  const rest = players.length - shown.length
  return (
    <div
      className="flex min-w-0 items-center overflow-hidden"
      title={players.map(playerName).join(', ')}
    >
      {shown.map((p) => (
        <Avatar
          key={p.id}
          player={p}
          size="sm"
          className="-ml-2 ring-2 ring-card first:ml-0"
        />
      ))}
      {rest > 0 && (
        <span className="tnum -ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card-2 text-[11px] font-bold text-muted ring-2 ring-card">
          +{rest}
        </span>
      )}
    </div>
  )
}

/* ---------- Abstimm-Modus ---------- */

function VoteView({
  poll,
  roster,
  onVote,
}: {
  poll: Poll
  roster: Player[]
  onVote: (playerId: string, optionId: string) => void
}) {
  const votesByPlayer = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const v of poll.votes) {
      const s = m.get(v.playerId) ?? new Set<string>()
      s.add(v.optionId)
      m.set(v.playerId, s)
    }
    return m
  }, [poll.votes])

  if (roster.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        Keine Spielerinnen im Kader — lege zuerst den Kader an.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      <p className="pb-2 text-[13px] text-muted">
        Stimmen eintragen — Chip antippen setzt die Stimme
        {poll.multi ? ' (mehrere möglich)' : ', erneutes Tippen entfernt sie'}.
      </p>
      <ul className="divide-y divide-line">
        {roster.map((p) => {
          const chosen = votesByPlayer.get(p.id) ?? new Set<string>()
          return (
            <li key={p.id} className="flex gap-3 py-2.5">
              <Avatar player={p} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">
                  {playerName(p)}
                  {chosen.size === 0 && (
                    <span className="ml-2 text-[11px] font-normal text-muted">offen</span>
                  )}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {poll.options.map((o) => {
                    const active = chosen.has(o.id)
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => onVote(p.id, o.id)}
                        aria-pressed={active}
                        className={`inline-flex min-h-11 max-w-full items-center rounded-xl border px-3 text-[13px] font-semibold transition-colors ${
                          active
                            ? 'border-transparent bg-btn-bg text-btn-ink'
                            : 'border-line bg-card-2 text-ink active:bg-accent-soft'
                        }`}
                      >
                        <span className="truncate">{o.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
