import { useEffect, useState } from 'react'
import { db, uid } from '../../lib/db'
import type { Player, Position, TeamId } from '../../lib/types'
import { POSITIONS, POSITION_LABEL, TEAM_LABEL } from '../../lib/types'
import { Avatar } from '../../components/Avatar'
import { Button, Segmented, Sheet } from '../../components/ui'
import { byPositionThenName, Field, inputCls, PositionChips } from './shared'

type GuestTeam = Extract<TeamId, 'D2' | 'AJ'>

/**
 * "Gast hinzufügen": bestehende Spielerin aus Damen 2 / A-Jugend als Gast
 * markieren — oder eine neue Gast-Spielerin direkt anlegen.
 */
export function GuestSheet({
  open,
  onClose,
  candidates,
}: {
  open: boolean
  onClose: () => void
  /** Nicht-Gäste mit team !== 'D1'. */
  candidates: Player[]
}) {
  const [mode, setMode] = useState<'bestehend' | 'neu'>('bestehend')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [guestUntil, setGuestUntil] = useState('')
  // Neuanlage
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [position, setPosition] = useState<Position>('RL')
  const [team, setTeam] = useState<GuestTeam>('D2')

  useEffect(() => {
    if (!open) return
    setMode('bestehend')
    setSelectedId(null)
    setGuestUntil('')
    setFirstName('')
    setLastName('')
    setPosition('RL')
    setTeam('D2')
  }, [open])

  const sorted = [...candidates].sort(byPositionThenName)

  async function addExisting() {
    if (!selectedId) return
    await db.players.update(selectedId, {
      isGuest: true,
      guestUntil: guestUntil || undefined,
    })
    onClose()
  }

  async function addNew() {
    if (firstName.trim() === '' || lastName.trim() === '') return
    await db.players.add({
      id: uid(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      mainPosition: position,
      team,
      isGuest: true,
      guestUntil: guestUntil || undefined,
      available: true,
      createdAt: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Gast hinzufügen">
      <p className="mb-3 text-[13px] text-muted">
        Gäste aus {TEAM_LABEL.D2} oder {TEAM_LABEL.AJ} tragen ein gelbes Gast-Badge — die
        Festspiel-Regel (§55 SpO) läuft automatisch mit.
      </p>

      <Segmented
        options={[
          { value: 'bestehend', label: 'Aus dem Verein' },
          { value: 'neu', label: 'Neu anlegen' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'bestehend' ? (
        <div className="mt-3 flex flex-col gap-3">
          {sorted.length === 0 ? (
            <p className="rounded-xl bg-card-2 p-4 text-center text-[13px] text-muted">
              Keine weiteren Spielerinnen im Verein — lege eine neue Gast-Spielerin an.
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {sorted.map((p) => {
                const selected = selectedId === p.id
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setSelectedId(selected ? null : p.id)}
                      aria-pressed={selected}
                      className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left ${
                        selected ? 'bg-accent-soft' : 'active:bg-card-2'
                      }`}
                    >
                      <Avatar player={p} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="text-[11px] text-muted">{TEAM_LABEL[p.team]}</span>
                      </span>
                      <PositionChips main={p.mainPosition} alt={p.altPosition} />
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          selected ? 'border-accent bg-accent text-btn-ink' : 'border-line'
                        }`}
                      >
                        {selected && (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m5 12.5 4.5 4.5L19 7.5" />
                          </svg>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <Field label="Gast bis (optional)">
            <input
              type="date"
              className={`${inputCls} tnum`}
              value={guestUntil}
              onChange={(e) => setGuestUntil(e.target.value)}
            />
          </Field>
          <Button disabled={!selectedId} onClick={() => void addExisting()}>
            Als Gast aufnehmen
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vorname *">
              <input
                className={inputCls}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="Nachname *">
              <input
                className={inputCls}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          <Field label="Position">
            <select
              className={inputCls}
              value={position}
              onChange={(e) => setPosition(e.target.value as Position)}
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p} — {POSITION_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <span className="mb-1 block text-[12px] font-semibold text-muted">Stammteam</span>
            <Segmented<GuestTeam>
              options={[
                { value: 'D2', label: TEAM_LABEL.D2 },
                { value: 'AJ', label: TEAM_LABEL.AJ },
              ]}
              value={team}
              onChange={setTeam}
            />
          </div>
          <Field label="Gast bis (optional)">
            <input
              type="date"
              className={`${inputCls} tnum`}
              value={guestUntil}
              onChange={(e) => setGuestUntil(e.target.value)}
            />
          </Field>
          <Button
            disabled={firstName.trim() === '' || lastName.trim() === ''}
            onClick={() => void addNew()}
          >
            Gast anlegen
          </Button>
        </div>
      )}
    </Sheet>
  )
}
