import { useMemo, useState } from 'react'
import { db, uid } from '../../../lib/db'
import type { Poll, PollOption, PollVote } from '../../../lib/types'
import { Button, Sheet } from '../../../components/ui'

const MIN_OPTIONS = 2
const MAX_OPTIONS = 6

interface OptionRow {
  id: string
  label: string
}

/**
 * Umfrage anlegen bzw. bearbeiten (nur solange offen).
 * Optionen mit Stimmen lassen sich nicht entfernen.
 */
export default function PollFormSheet({
  poll,
  onClose,
}: {
  /** null = neue Umfrage. */
  poll: Poll | null
  onClose: () => void
}) {
  const [question, setQuestion] = useState(poll?.question ?? '')
  const [note, setNote] = useState(poll?.note ?? '')
  const [multi, setMulti] = useState(poll?.multi ?? false)
  const [options, setOptions] = useState<OptionRow[]>(() =>
    poll
      ? poll.options.map((o) => ({ id: o.id, label: o.label }))
      : [
          { id: uid(), label: '' },
          { id: uid(), label: '' },
        ],
  )
  const [saving, setSaving] = useState(false)

  const votedOptionIds = useMemo(
    () => new Set((poll?.votes ?? []).map((v) => v.optionId)),
    [poll],
  )
  const hasLockedOptions = options.some((o) => votedOptionIds.has(o.id))

  const filledCount = options.filter((o) => o.label.trim().length > 0).length
  const canSave = question.trim().length > 0 && filledCount >= MIN_OPTIONS

  function setLabel(id: string, label: string) {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)))
  }

  function removeOption(id: string) {
    setOptions((prev) =>
      prev.length > MIN_OPTIONS ? prev.filter((o) => o.id !== id) : prev,
    )
  }

  function addOption() {
    setOptions((prev) =>
      prev.length < MAX_OPTIONS ? [...prev, { id: uid(), label: '' }] : prev,
    )
  }

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    const cleanOptions: PollOption[] = options
      .filter((o) => o.label.trim().length > 0 || votedOptionIds.has(o.id))
      .map((o) => ({ id: o.id, label: o.label.trim() || '—' }))
    const q = question.trim()
    const n = note.trim() || undefined

    if (poll) {
      const keptIds = new Set(cleanOptions.map((o) => o.id))
      let votes: PollVote[] = poll.votes.filter((v) => keptIds.has(v.optionId))
      if (!multi) {
        // Von Mehrfach- auf Einzelauswahl: erste Stimme pro Spielerin behalten.
        const seen = new Set<string>()
        votes = votes.filter((v) => {
          if (seen.has(v.playerId)) return false
          seen.add(v.playerId)
          return true
        })
      }
      await db.polls.update(poll.id, {
        question: q,
        note: n,
        multi,
        options: cleanOptions,
        votes,
      })
    } else {
      await db.polls.add({
        id: uid(),
        question: q,
        options: cleanOptions,
        votes: [],
        multi,
        status: 'offen',
        createdAt: new Date().toISOString(),
        note: n,
      })
    }
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={poll ? 'Umfrage bearbeiten' : 'Neue Umfrage'}>
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-muted">Frage</span>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="z.B. Saisonabschluss: Was machen wir?"
            autoFocus={!poll}
            className="min-h-11 w-full rounded-xl border border-line bg-card-2 px-3 text-[15px] text-ink placeholder:text-muted"
          />
        </label>

        <div>
          <span className="mb-1 block text-[13px] font-semibold text-muted">
            Optionen ({options.length} von {MAX_OPTIONS})
          </span>
          <div className="flex flex-col gap-2">
            {options.map((o, i) => {
              const locked = votedOptionIds.has(o.id)
              const removable = options.length > MIN_OPTIONS && !locked
              return (
                <div key={o.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={o.label}
                    onChange={(e) => setLabel(o.id, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card-2 px-3 text-[15px] text-ink placeholder:text-muted"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(o.id)}
                    disabled={!removable}
                    aria-label={
                      locked
                        ? `Option „${o.label}" hat Stimmen und kann nicht entfernt werden`
                        : `Option ${i + 1} entfernen`
                    }
                    title={locked ? 'Hat schon Stimmen' : 'Entfernen'}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card-2 text-[17px] text-muted transition-opacity active:opacity-70 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={addOption}
              disabled={options.length >= MAX_OPTIONS}
              className="px-3"
            >
              + Option
            </Button>
            {filledCount < MIN_OPTIONS && (
              <span className="text-[12px] text-muted">Mindestens 2 Optionen ausfüllen.</span>
            )}
          </div>
          {hasLockedOptions && (
            <p className="mt-1 text-[12px] text-muted">
              Optionen mit Stimmen können nicht entfernt werden.
            </p>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={multi}
          onClick={() => setMulti((m) => !m)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-line bg-card-2 px-3 text-left"
        >
          <span>
            <span className="block text-[15px] font-semibold text-ink">Mehrfachauswahl</span>
            <span className="block text-[12px] text-muted">
              {multi ? 'Jede darf mehrere Optionen wählen.' : 'Genau eine Stimme pro Spielerin.'}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              multi ? 'bg-accent' : 'bg-line'
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-card shadow-card transition-all ${
                multi ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
              }`}
            />
          </span>
        </button>

        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-muted">
            Notiz <span className="font-normal">(z.B. Abstimmungsfrist)</span>
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z.B. Freitag, 24.07."
            className="min-h-11 w-full rounded-xl border border-line bg-card-2 px-3 text-[15px] text-ink placeholder:text-muted"
          />
        </label>

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            className="flex-1"
            disabled={!canSave || saving}
            onClick={() => void save()}
          >
            {poll ? 'Speichern' : 'Umfrage starten'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
