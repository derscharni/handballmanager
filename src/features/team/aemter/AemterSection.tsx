import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../../../lib/db'
import type { Duty, Player } from '../../../lib/types'
import { playerName } from '../../../lib/format'
import { Avatar } from '../../../components/Avatar'
import { Badge, Button, Card, EmptyState, Sheet } from '../../../components/ui'
import { Field, inputCls, TwoStepDelete } from '../../kader/shared'
import type { TeamSectionProps } from '../../props'

/**
 * Team-Ämter: wer kümmert sich um was (Bierwartin, Trikotwäsche, …).
 * Zuweisung per Multi-Select, unbesetzte Ämter werden dezent markiert.
 */
export default function AemterSection({ openPlayer }: TeamSectionProps) {
  const duties = useLiveQuery(() => db.duties.orderBy('order').toArray())
  const players = useLiveQuery(() => db.players.toArray())

  if (!duties || !players) {
    return (
      <div className="flex h-[30dvh] items-center justify-center font-display uppercase tracking-wide text-muted">
        Lädt …
      </div>
    )
  }
  return <AemterInner duties={duties} players={players} openPlayer={openPlayer} />
}

function AemterInner({
  duties,
  players,
  openPlayer,
}: {
  duties: Duty[]
  players: Player[]
  openPlayer: (id: string) => void
}) {
  const [assigning, setAssigning] = useState<Duty | null>(null)
  // 'new' = anlegen, sonst zu bearbeitendes Amt.
  const [editing, setEditing] = useState<Duty | 'new' | null>(null)

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const staffed = duties.filter((d) => d.playerIds.some((id) => playerById.has(id))).length

  return (
    <div className="pb-6">
      {duties.length > 0 && (
        <p className="px-1 pb-1 pt-3 text-[13px] font-semibold text-muted tnum">
          {staffed} von {duties.length} Ämtern besetzt
        </p>
      )}

      {duties.length === 0 ? (
        <div className="pt-2">
          <EmptyState
            title="Noch keine Ämter"
            hint="Bierwartin, Trikotwäsche, Kampfgericht — Aufgaben anlegen und im Team verteilen."
            action={
              <Button variant="secondary" onClick={() => setEditing('new')}>
                + Amt anlegen
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {duties.map((d) => {
            const assigned = d.playerIds
              .map((id) => playerById.get(id))
              .filter((p): p is Player => p !== undefined)
            return (
              <Card key={d.id} className="mt-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[16px] font-bold uppercase leading-tight tracking-wide">
                      {d.label}
                    </h3>
                    {d.note && <p className="mt-0.5 text-[12px] text-muted">{d.note}</p>}
                  </div>
                  <button
                    onClick={() => setEditing(d)}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-card-2 px-2.5 text-[11px] font-bold text-muted"
                  >
                    Bearbeiten
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                  {assigned.length === 0 && <Badge tone="warn">unbesetzt</Badge>}
                  {assigned.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openPlayer(p.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card-2 py-1 pl-1 pr-2.5"
                    >
                      <Avatar player={p} size="sm" />
                      <span className="text-[13px] font-semibold">{p.firstName}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setAssigning(d)}
                    className="inline-flex min-h-11 items-center rounded-full bg-accent-soft px-3 text-[12px] font-bold text-accent"
                  >
                    Zuweisen
                  </button>
                </div>
              </Card>
            )
          })}
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setEditing('new')}>
            + Neues Amt anlegen
          </Button>
        </>
      )}

      <AssignSheet
        duty={assigning}
        onClose={() => setAssigning(null)}
        players={players}
      />
      <DutySheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        duty={editing === 'new' ? null : editing}
        nextOrder={duties.reduce((m, d) => Math.max(m, d.order + 1), 0)}
      />
    </div>
  )
}

/* ---------- Sheet: Spielerinnen zuweisen ---------- */

function AssignSheet({
  duty,
  onClose,
  players,
}: {
  duty: Duty | null
  onClose: () => void
  players: Player[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')

  useEffect(() => {
    if (duty) {
      setSelected(duty.playerIds)
      setNote(duty.note ?? '')
    }
  }, [duty])

  const eligible = useMemo(
    () =>
      players
        .filter((p) => p.team === 'D1' || p.isGuest)
        .sort(
          (a, b) =>
            a.firstName.localeCompare(b.firstName, 'de') ||
            a.lastName.localeCompare(b.lastName, 'de'),
        ),
    [players],
  )

  function toggle(id: string) {
    setSelected((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]))
  }

  async function save() {
    if (!duty) return
    const v = note.trim()
    await db.duties.update(duty.id, {
      playerIds: selected,
      note: v === '' ? undefined : v,
    })
    onClose()
  }

  return (
    <Sheet open={duty !== null} onClose={onClose} title={duty ? `${duty.label} · Zuweisen` : ''}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
          {eligible.map((p) => {
            const sel = selected.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                aria-pressed={sel}
                className={`flex min-h-12 items-center gap-2.5 rounded-xl px-2 text-left transition-colors ${
                  sel ? 'bg-accent-soft' : ''
                }`}
              >
                <Avatar player={p} size="sm" />
                <span
                  className={`min-w-0 flex-1 truncate text-[14px] ${
                    sel ? 'font-bold' : 'font-semibold'
                  }`}
                >
                  {playerName(p)}
                </span>
                {p.isGuest && <Badge tone="guest">Gast</Badge>}
                {sel && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4.5 w-4.5 shrink-0 text-accent"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4.5 12.5l5 5 10-11" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
        <Field label="Notiz (optional)">
          <input
            placeholder="z.B. rotiert monatlich"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button className="flex-1" onClick={() => void save()}>
            Speichern
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/* ---------- Sheet: Amt anlegen / bearbeiten ---------- */

function DutySheet({
  open,
  onClose,
  duty,
  nextOrder,
}: {
  open: boolean
  onClose: () => void
  duty: Duty | null
  nextOrder: number
}) {
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLabel(duty?.label ?? '')
      setNote(duty?.note ?? '')
      setError(null)
    }
  }, [open, duty])

  async function save() {
    if (!label.trim()) {
      setError('Bitte eine Bezeichnung für das Amt angeben.')
      return
    }
    const noteV = note.trim() || undefined
    if (duty) {
      await db.duties.update(duty.id, { label: label.trim(), note: noteV })
    } else {
      await db.duties.add({
        id: uid(),
        label: label.trim(),
        note: noteV,
        playerIds: [],
        order: nextOrder,
      })
    }
    onClose()
  }

  async function remove() {
    if (!duty) return
    await db.duties.delete(duty.id)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={duty ? 'Amt bearbeiten' : 'Neues Amt'}>
      <div className="flex flex-col gap-3">
        <Field label="Bezeichnung">
          <input
            placeholder="z.B. Bierwartin"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Notiz (optional)">
          <input
            placeholder="z.B. rotiert monatlich"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
          />
        </Field>
        {error && <p className="text-[13px] font-semibold text-crit">{error}</p>}
        <div className="flex gap-2 pt-1">
          {duty && (
            <TwoStepDelete
              label="Löschen"
              confirmLabel="Wirklich löschen?"
              size="lg"
              onConfirm={() => void remove()}
              className="flex-1"
            />
          )}
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button className="flex-1" onClick={() => void save()}>
            Speichern
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
