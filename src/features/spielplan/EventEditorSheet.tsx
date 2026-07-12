import { useMemo, useState } from 'react'
import { db, todayIso, uid } from '../../lib/db'
import type { EventKind, MatchEvent, Opponent } from '../../lib/types'
import { EVENT_KIND_LABEL } from '../../lib/types'
import { Button, Segmented, Sheet } from '../../components/ui'
import { Field, SelectWrap, fieldBase, inputCls, selectCls, textareaCls } from './inputs'
import { WEEKDAY_SHORT, generateSeriesDates, weekdayOf } from './serien'

const NEW_OPPONENT = '__new__'

const KIND_OPTIONS: { value: EventKind; label: string }[] = (
  ['match', 'training', 'tournament', 'sonstiges'] as const
).map((value) => ({ value, label: EVENT_KIND_LABEL[value] }))

/** Sheet zum Anlegen/Bearbeiten eines Termins. */
export default function EventEditorSheet({
  open,
  event,
  opponents,
  onClose,
  onImportSpielbericht,
}: {
  open: boolean
  /** null = neuer Termin. */
  event: MatchEvent | null
  opponents: Opponent[]
  onClose: () => void
  /** Öffnet den PDF-Spielbericht-Import für diesen Termin. */
  onImportSpielbericht?: (event: MatchEvent) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={event ? 'Termin bearbeiten' : 'Neuer Termin'}>
      {open && (
        <EditorForm
          key={event?.id ?? 'new'}
          event={event}
          opponents={opponents}
          onClose={onClose}
          onImportSpielbericht={onImportSpielbericht}
        />
      )}
    </Sheet>
  )
}

function EditorForm({
  event,
  opponents,
  onClose,
  onImportSpielbericht,
}: {
  event: MatchEvent | null
  opponents: Opponent[]
  onClose: () => void
  onImportSpielbericht?: (event: MatchEvent) => void
}) {
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'match')
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event?.date ?? todayIso())
  const [time, setTime] = useState(event?.time ?? '')
  const [home, setHome] = useState(event?.home ?? true)
  const [opponentId, setOpponentId] = useState(event?.opponentId ?? '')
  const [newOppName, setNewOppName] = useState('')
  const [newOppShort, setNewOppShort] = useState('')
  const [newOppHall, setNewOppHall] = useState('')
  const [hall, setHall] = useState(event?.hall ?? '')
  const [note, setNote] = useState(event?.note ?? '')
  const [goalsUs, setGoalsUs] = useState(event?.goalsUs != null ? String(event.goalsUs) : '')
  const [goalsThem, setGoalsThem] = useState(
    event?.goalsThem != null ? String(event.goalsThem) : '',
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmSeriesDelete, setConfirmSeriesDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  // Serie (nur bei Neuanlage von Training/Event)
  const [repeat, setRepeat] = useState(false)
  const [repeatDays, setRepeatDays] = useState<Set<number>>(new Set())
  const [repeatUntil, setRepeatUntil] = useState('')

  const isMatch = kind === 'match'
  const isSonstiges = kind === 'sonstiges'
  const isPast = date !== '' && date <= todayIso()
  const canRepeat = event == null && (kind === 'training' || isSonstiges)

  const seriesDates = useMemo(() => {
    if (!canRepeat || !repeat || date === '' || repeatUntil === '') return []
    const days = repeatDays.size > 0 ? repeatDays : new Set([weekdayOf(date)])
    return generateSeriesDates(date, days, repeatUntil)
  }, [canRepeat, repeat, date, repeatDays, repeatUntil])

  function toggleRepeatDay(d: number) {
    setRepeatDays((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }
  const showResult = isMatch && (isPast || event?.goalsUs != null)
  const sortedOpponents = [...opponents].sort((a, b) => a.name.localeCompare(b.name, 'de'))

  const canSave =
    date !== '' &&
    (!isSonstiges || title.trim() !== '') &&
    (!isMatch || (opponentId !== '' && (opponentId !== NEW_OPPONENT || newOppName.trim() !== '')))

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      let oppId: string | undefined
      if (isMatch) {
        if (opponentId === NEW_OPPONENT) {
          const opp: Opponent = {
            id: uid(),
            name: newOppName.trim(),
            shortName: newOppShort.trim() || undefined,
            hall: newOppHall.trim() || undefined,
            logo: null,
          }
          await db.opponents.add(opp)
          oppId = opp.id
        } else {
          oppId = opponentId
        }
      }
      const next: MatchEvent = {
        id: event?.id ?? uid(),
        kind,
        title: isSonstiges ? title.trim() : undefined,
        date,
        time: time || undefined,
        home: isMatch ? home : undefined,
        opponentId: oppId,
        hall: hall.trim() || undefined,
        note: note.trim() || undefined,
        goalsUs: isMatch && goalsUs !== '' ? Number(goalsUs) : null,
        goalsThem: isMatch && goalsThem !== '' ? Number(goalsThem) : null,
        source: event?.source ?? 'manual',
        externalId: event?.externalId,
      }
      await db.events.put(next)

      // Serie: weitere Einzeltermine erzeugen, Duplikate (Datum+Art+Uhrzeit) überspringen
      if (seriesDates.length > 0) {
        const existing = await db.events.toArray()
        const taken = new Set(
          existing.map((e) => `${e.date}|${e.kind}|${e.time ?? ''}`),
        )
        const extra = seriesDates
          .filter((d) => !taken.has(`${d}|${kind}|${time || ''}`))
          .map(
            (d): MatchEvent => ({
              ...next,
              id: uid(),
              date: d,
              goalsUs: null,
              goalsThem: null,
              externalId: undefined,
            }),
          )
        if (extra.length > 0) await db.events.bulkAdd(extra)
      }

      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!event) return
    await db.events.delete(event.id)
    onClose()
  }

  /** Pragmatische Serien-Löschung: alle künftigen Trainings mit gleicher Uhrzeit. */
  async function removeFutureSeries() {
    if (!event || event.kind !== 'training') return
    await db.events
      .where('date')
      .aboveOrEqual(event.date)
      .and((e) => e.kind === 'training' && (e.time ?? '') === (event.time ?? ''))
      .delete()
    onClose()
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} />

      {isSonstiges && (
        <Field label="Titel">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='z.B. "Mannschaftsabend", "Helfereinsatz Vereinsfest"'
            required
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Datum">
          <input
            type="date"
            className={`${inputCls} tnum`}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        <Field label="Uhrzeit">
          <input
            type="time"
            className={`${inputCls} tnum`}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
      </div>

      {isMatch && (
        <>
          <Field label="Gegner">
            <SelectWrap>
              <select
                className={selectCls}
                value={opponentId}
                onChange={(e) => setOpponentId(e.target.value)}
              >
                <option value="">Bitte wählen …</option>
                {sortedOpponents.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                <option value={NEW_OPPONENT}>+ Neuer Gegner</option>
              </select>
            </SelectWrap>
          </Field>

          {opponentId === NEW_OPPONENT && (
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-card-2 p-3">
              <Field label="Vereinsname">
                <input
                  className={inputCls}
                  value={newOppName}
                  onChange={(e) => setNewOppName(e.target.value)}
                  placeholder="z.B. HSG Köln-West"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kürzel">
                  <input
                    className={inputCls}
                    value={newOppShort}
                    onChange={(e) => setNewOppShort(e.target.value)}
                    placeholder="KW"
                    maxLength={4}
                  />
                </Field>
                <Field label="Heimhalle">
                  <input
                    className={inputCls}
                    value={newOppHall}
                    onChange={(e) => setNewOppHall(e.target.value)}
                    placeholder="Halle"
                  />
                </Field>
              </div>
            </div>
          )}

          <Segmented
            options={[
              { value: 'home', label: 'Heim' },
              { value: 'away', label: 'Auswärts' },
            ]}
            value={home ? 'home' : 'away'}
            onChange={(v) => setHome(v === 'home')}
          />
        </>
      )}

      <Field label={isSonstiges ? 'Ort' : 'Halle'}>
        <input
          className={inputCls}
          value={hall}
          onChange={(e) => setHall(e.target.value)}
          placeholder={isSonstiges ? 'z.B. Vereinsheim' : 'z.B. Sporthalle Ehrenfeld'}
        />
      </Field>

      <Field label="Notiz">
        <textarea
          className={textareaCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'tournament' ? 'z.B. Ehrenfeld-Cup · Vorbereitungsturnier' : 'Optional'}
          rows={2}
        />
      </Field>

      {canRepeat && (
        <fieldset className="rounded-xl border border-line bg-card-2 p-3">
          <legend className="px-1 font-display text-[12px] font-semibold uppercase tracking-wide text-muted">
            Wiederholen
          </legend>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">Wöchentliche Serie</span>
            <button
              role="switch"
              aria-checked={repeat}
              onClick={() => {
                setRepeat((r) => !r)
                if (!repeat && repeatDays.size === 0 && date !== '') {
                  setRepeatDays(new Set([weekdayOf(date)]))
                }
              }}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                repeat ? 'bg-accent' : 'bg-line'
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-card shadow-card transition-all ${
                  repeat ? 'left-[calc(100%-1.625rem)]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          {repeat && (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wochentage">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const active = repeatDays.has(d)
                  return (
                    <button
                      key={d}
                      aria-pressed={active}
                      onClick={() => toggleRepeatDay(d)}
                      className={`min-h-10 min-w-11 rounded-lg px-2 font-display text-[13px] font-bold ${
                        active ? 'bg-accent text-btn-ink' : 'bg-card text-muted border border-line'
                      }`}
                    >
                      {WEEKDAY_SHORT[d]}
                    </button>
                  )
                })}
              </div>
              <Field label="Bis einschließlich">
                <input
                  type="date"
                  className={`${inputCls} tnum`}
                  value={repeatUntil}
                  min={date}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                />
              </Field>
              {repeatUntil !== '' && (
                <p className="text-[12px] text-muted tnum">
                  Erzeugt {seriesDates.length + 1} Termine (inkl. Start-Termin). Duplikate
                  werden übersprungen.
                </p>
              )}
            </div>
          )}
        </fieldset>
      )}

      {showResult && (
        <fieldset className="rounded-xl border border-line bg-card-2 p-3">
          <legend className="px-1 text-[12px] font-semibold uppercase tracking-wide text-muted font-display">
            Ergebnis (aus unserer Sicht)
          </legend>
          <div className="flex items-center justify-center gap-3">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              aria-label="Tore wir"
              className={`${fieldBase} tnum min-h-12 max-w-24 text-center font-display text-[26px] font-bold`}
              value={goalsUs}
              onChange={(e) => setGoalsUs(e.target.value)}
              placeholder="–"
            />
            <span className="font-display text-[24px] font-bold text-muted">:</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              aria-label="Tore Gegner"
              className={`${fieldBase} tnum min-h-12 max-w-24 text-center font-display text-[26px] font-bold`}
              value={goalsThem}
              onChange={(e) => setGoalsThem(e.target.value)}
              placeholder="–"
            />
          </div>
        </fieldset>
      )}

      {event && isMatch && isPast && onImportSpielbericht && (
        <Button variant="secondary" onClick={() => onImportSpielbericht(event)}>
          Spielbericht (PDF) importieren
        </Button>
      )}

      <div className="mt-1 flex flex-col gap-2">
        <Button onClick={() => void save()} disabled={!canSave || saving}>
          {event ? 'Speichern' : 'Termin anlegen'}
        </Button>

        {event && event.kind === 'training' && event.date >= todayIso() && (
          confirmSeriesDelete ? (
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={() => void removeFutureSeries()}>
                Künftige Serie wirklich löschen?
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmSeriesDelete(false)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmSeriesDelete(true)}>
              Alle künftigen Trainings gleicher Uhrzeit löschen
            </Button>
          )
        )}

        {event &&
          (confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={() => void remove()}>
                Wirklich löschen?
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Abbrechen
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Löschen
            </Button>
          ))}
      </div>
    </div>
  )
}
