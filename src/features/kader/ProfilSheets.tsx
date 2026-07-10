import { useEffect, useState } from 'react'
import { db, todayIso, uid } from '../../lib/db'
import type { AbsenceCategory, NoteCategory, Player, Position, TeamId } from '../../lib/types'
import { ABSENCE_LABEL, POSITIONS, POSITION_LABEL, TEAMS, TEAM_LABEL } from '../../lib/types'
import { Button, Segmented, Sheet } from '../../components/ui'
import { Field, inputCls, RatingInput } from './shared'

type Rating = 1 | 2 | 3 | 4 | 5

function asRating(v: number | null): Rating | undefined {
  return v === null ? undefined : (v as Rating)
}

/* ---------- Einsatz nachtragen ---------- */

export function AppearanceSheet({
  open,
  onClose,
  player,
}: {
  open: boolean
  onClose: () => void
  player: Player
}) {
  const [date, setDate] = useState(todayIso())
  const [team, setTeam] = useState<TeamId>('D1')
  const [bench, setBench] = useState(false)
  const [goals, setGoals] = useState('')
  const [position, setPosition] = useState<'' | Position>('')
  const [rating, setRating] = useState<number | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setDate(todayIso())
    setTeam('D1')
    setBench(false)
    setGoals('')
    setPosition(player.mainPosition)
    setRating(null)
    setNote('')
  }, [open, player.mainPosition])

  async function save() {
    if (!date) return
    const g = goals.trim() === '' ? undefined : Number(goals)
    await db.appearances.add({
      id: uid(),
      playerId: player.id,
      date,
      team,
      bench: bench || undefined,
      goals: Number.isFinite(g) ? g : undefined,
      positionPlayed: position === '' ? undefined : position,
      rating: asRating(rating),
      note: note.trim() === '' ? undefined : note.trim(),
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Einsatz nachtragen">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum *">
            <input
              type="date"
              className={`${inputCls} tnum`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Tore">
            <input
              className={`${inputCls} tnum`}
              inputMode="numeric"
              pattern="[0-9]*"
              value={goals}
              onChange={(e) => setGoals(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-[12px] font-semibold text-muted">Mannschaft</span>
          <Segmented<TeamId>
            options={TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] }))}
            value={team}
            onChange={setTeam}
          />
        </div>

        <label className="flex min-h-11 items-center gap-2.5">
          <input
            type="checkbox"
            checked={bench}
            onChange={(e) => setBench(e.target.checked)}
            className="h-5 w-5 accent-(--accent)"
          />
          <span className="text-[14px]">
            Nur Bank (zählt nach §55 SpO trotzdem als Einsatz)
          </span>
        </label>

        <Field label="Position">
          <select
            className={inputCls}
            value={position}
            onChange={(e) => setPosition(e.target.value as '' | Position)}
          >
            <option value="">— keine Angabe —</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p} — {POSITION_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="mb-1 block text-[12px] font-semibold text-muted">
            Bewertung (optional)
          </span>
          <RatingInput value={rating} onChange={setRating} />
        </div>

        <Field label="Notiz">
          <textarea
            className={`${inputCls} min-h-16 py-2.5`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        <Button disabled={!date} onClick={() => void save()}>
          Einsatz speichern
        </Button>
      </div>
    </Sheet>
  )
}

/* ---------- Abwesenheit eintragen ---------- */

export function AbsenceSheet({
  open,
  onClose,
  player,
}: {
  open: boolean
  onClose: () => void
  player: Player
}) {
  const [category, setCategory] = useState<AbsenceCategory>('urlaub')
  const [from, setFrom] = useState(todayIso())
  const [to, setTo] = useState(todayIso())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setCategory('urlaub')
    setFrom(todayIso())
    setTo(todayIso())
    setNote('')
  }, [open])

  const rangeInvalid = from !== '' && to !== '' && from > to
  const canSave = from !== '' && to !== '' && !rangeInvalid

  async function save() {
    if (!canSave) return
    await db.absences.add({
      id: uid(),
      playerId: player.id,
      category,
      from,
      to,
      note: note.trim() === '' ? undefined : note.trim(),
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Abwesenheit eintragen">
      <div className="flex flex-col gap-3">
        <Field label="Kategorie">
          <select
            className={inputCls}
            value={category}
            onChange={(e) => setCategory(e.target.value as AbsenceCategory)}
          >
            {(Object.keys(ABSENCE_LABEL) as AbsenceCategory[]).map((c) => (
              <option key={c} value={c}>
                {ABSENCE_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Von *">
            <input
              type="date"
              className={`${inputCls} tnum`}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Bis *">
            <input
              type="date"
              className={`${inputCls} tnum`}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        {rangeInvalid && (
          <p className="text-[12px] font-semibold text-crit" role="alert">
            „Bis" darf nicht vor „Von" liegen.
          </p>
        )}

        <Field label="Notiz">
          <textarea
            className={`${inputCls} min-h-16 py-2.5`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z.B. Bänderriss, Reha bis Ende Juli"
          />
        </Field>

        <Button disabled={!canSave} onClick={() => void save()}>
          Abwesenheit speichern
        </Button>
      </div>
    </Sheet>
  )
}

/* ---------- Notiz hinzufügen ---------- */

const NOTE_CATEGORY_LABEL: Record<NoteCategory, string> = {
  training: 'Training',
  spiel: 'Spiel',
  allgemein: 'Allgemein',
}

export function NoteSheet({
  open,
  onClose,
  player,
}: {
  open: boolean
  onClose: () => void
  player: Player
}) {
  const [category, setCategory] = useState<NoteCategory>('training')
  const [date, setDate] = useState(todayIso())
  const [rating, setRating] = useState<number | null>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    setCategory('training')
    setDate(todayIso())
    setRating(null)
    setText('')
  }, [open])

  const canSave = date !== '' && text.trim() !== ''

  async function save() {
    if (!canSave) return
    await db.notes.add({
      id: uid(),
      playerId: player.id,
      category,
      date,
      rating: asRating(rating),
      text: text.trim(),
      createdAt: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Notiz hinzufügen">
      <div className="flex flex-col gap-3">
        <div>
          <span className="mb-1 block text-[12px] font-semibold text-muted">Kategorie</span>
          <Segmented<NoteCategory>
            options={(Object.keys(NOTE_CATEGORY_LABEL) as NoteCategory[]).map((c) => ({
              value: c,
              label: NOTE_CATEGORY_LABEL[c],
            }))}
            value={category}
            onChange={setCategory}
          />
        </div>

        <Field label="Datum *">
          <input
            type="date"
            className={`${inputCls} tnum`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <div>
          <span className="mb-1 block text-[12px] font-semibold text-muted">
            Bewertung (optional)
          </span>
          <RatingInput value={rating} onChange={setRating} />
        </div>

        <Field label="Notiz *">
          <textarea
            className={`${inputCls} min-h-20 py-2.5`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Beobachtung aus Training oder Spiel …"
          />
        </Field>

        <Button disabled={!canSave} onClick={() => void save()}>
          Notiz speichern
        </Button>
      </div>
    </Sheet>
  )
}

export { NOTE_CATEGORY_LABEL }
