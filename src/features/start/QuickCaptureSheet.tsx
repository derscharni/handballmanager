import { useEffect, useMemo, useRef, useState } from 'react'
import { db, todayIso, uid } from '../../lib/db'
import type { MatchEvent, Note, NoteCategory, Opponent, Player } from '../../lib/types'
import { EVENT_KIND_LABEL } from '../../lib/types'
import { fmtDayDate } from '../../lib/format'
import { Avatar } from '../../components/Avatar'
import { Badge, Button, Segmented, Sheet } from '../../components/ui'

/* ------------------------------------------------------------------
   Quick-Capture: Sprach- & Textnotiz ("Second Brain"-Moment).
   - SpeechRecognition (de-DE) für Live-Transkript, falls verfügbar.
   - MediaRecorder parallel für die Original-Audiospur, falls erlaubt.
   - Fallback: schlichte Texteingabe ohne Fehlerdrama.
   ------------------------------------------------------------------ */

/* Minimale Typen für die (nicht in lib.dom enthaltene) Web Speech API. */
interface SpeechAlternativeLike {
  transcript: string
}
interface SpeechResultLike {
  isFinal: boolean
  0: SpeechAlternativeLike
}
interface SpeechResultListLike {
  length: number
  [index: number]: SpeechResultLike
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechResultListLike
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const CATEGORY_OPTIONS: { value: NoteCategory; label: string }[] = [
  { value: 'allgemein', label: 'Allgemein' },
  { value: 'training', label: 'Training' },
  { value: 'spiel', label: 'Spiel' },
]

function fmtSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** ISO-Datum um `days` Tage verschieben (UTC-sicher). */
function isoAddDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Chip-Label: "Di 14.07. Training" / "Sa 05.09. SVZ". */
function eventChipLabel(e: MatchEvent, opponentById: Map<string, Opponent>): string {
  let what: string
  if (e.kind === 'match') {
    const opp = e.opponentId ? opponentById.get(e.opponentId) : undefined
    what = opp?.shortName || opp?.name || EVENT_KIND_LABEL.match
  } else if (e.kind === 'sonstiges') {
    what = e.title || EVENT_KIND_LABEL.sonstiges
  } else {
    what = EVENT_KIND_LABEL[e.kind]
  }
  return `${fmtDayDate(e.date)} ${what}`
}

/**
 * Termine im Fenster heute ±7 Tage: vergangene (inkl. heute) zuerst —
 * jüngste voran —, danach die kommenden aufsteigend.
 */
export function relevantCaptureEvents(events: MatchEvent[], today: string): MatchEvent[] {
  const min = isoAddDays(today, -7)
  const max = isoAddDays(today, 7)
  const inRange = events.filter((e) => e.date >= min && e.date <= max)
  const key = (e: MatchEvent) => `${e.date}T${e.time ?? '00:00'}`
  const pastAndToday = inRange
    .filter((e) => e.date <= today)
    .sort((a, b) => key(b).localeCompare(key(a)))
  const future = inRange
    .filter((e) => e.date > today)
    .sort((a, b) => key(a).localeCompare(key(b)))
  return [...pastAndToday, ...future]
}

type RecPhase = 'idle' | 'recording' | 'stopped'

export function QuickCaptureSheet({
  open,
  onClose,
  players,
  events,
  opponents,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  players: Player[]
  events: MatchEvent[]
  opponents: Opponent[]
  onSaved: () => void
}) {
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [category, setCategory] = useState<NoteCategory>('allgemein')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [manualPick, setManualPick] = useState(false)
  const [rating, setRating] = useState<Note['rating'] | undefined>(undefined)
  const [phase, setPhase] = useState<RecPhase>('idle')
  const [listening, setListening] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [saving, setSaving] = useState(false)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioBlobRef = useRef<Blob | null>(null)
  const activeRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  /* ---------- Aufnahme stoppen & Ressourcen freigeben ---------- */
  function stopCapture(nextPhase: RecPhase) {
    activeRef.current = false
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (rec) {
      rec.onresult = null
      rec.onend = null
      rec.onerror = null
      try {
        rec.stop()
      } catch {
        /* bereits beendet */
      }
    }
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        /* bereits beendet */
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setListening(false)
    setInterim('')
    setPhase(nextPhase)
  }

  /* ---------- Start beim Öffnen, Cleanup beim Schließen ---------- */
  useEffect(() => {
    if (!open) return
    // Formular zurücksetzen
    setText('')
    setInterim('')
    setPlayerId(null)
    setManualPick(false)
    // Liegt heute ein Termin, ist er vorselektiert (Kategorie folgt der Termin-Art).
    const today = todayIso()
    const todayEvent = [...events]
      .filter((e) => e.date === today)
      .sort((a, b) => (a.time ?? '00:00').localeCompare(b.time ?? '00:00'))[0]
    setEventId(todayEvent?.id ?? null)
    setCategory(
      todayEvent?.kind === 'training'
        ? 'training'
        : todayEvent?.kind === 'match'
          ? 'spiel'
          : 'allgemein',
    )
    setRating(undefined)
    setElapsed(0)
    setAudioBlob(null)
    audioBlobRef.current = null
    setSaving(false)
    setPhase('idle')
    activeRef.current = true

    let started = false

    // (a) Spracherkennung: Live-Transkript
    const Ctor = getSpeechRecognitionCtor()
    if (Ctor) {
      try {
        const rec = new Ctor()
        rec.lang = 'de-DE'
        rec.continuous = true
        rec.interimResults = true
        rec.onresult = (e) => {
          let interimText = ''
          let finalText = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i]
            if (r.isFinal) finalText += r[0].transcript
            else interimText += r[0].transcript
          }
          if (finalText) {
            setText((prev) => {
              const sep = prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : ''
              return prev + sep + finalText.trim()
            })
          }
          setInterim(interimText.trim())
        }
        rec.onend = () => {
          // Mobile Engines beenden sich gern selbst → weiterlauschen
          if (activeRef.current && recognitionRef.current === rec) {
            try {
              rec.start()
            } catch {
              setListening(false)
            }
          }
        }
        rec.onerror = () => {
          setInterim('')
        }
        rec.start()
        recognitionRef.current = rec
        setListening(true)
        started = true
      } catch {
        recognitionRef.current = null
      }
    }

    // (b) Parallel Audio aufzeichnen (Blob an die Notiz)
    if (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          if (!activeRef.current) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = stream
          const recorder = new MediaRecorder(stream)
          chunksRef.current = []
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data)
          }
          recorder.onstop = () => {
            if (chunksRef.current.length > 0) {
              const blob = new Blob(chunksRef.current, {
                type: recorder.mimeType || 'audio/webm',
              })
              audioBlobRef.current = blob
              setAudioBlob(blob)
            }
            chunksRef.current = []
          }
          recorder.start()
          recorderRef.current = recorder
          setPhase('recording')
        })
        .catch(() => {
          // Kein Mikro / abgelehnt → Texteingabe genügt, kein Drama.
          if (activeRef.current && !recognitionRef.current) setPhase('stopped')
        })
      started = true
    }

    if (started) setPhase('recording')
    else setPhase('stopped') // nichts verfügbar → nur Textfeld

    return () => {
      stopCapture('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* ---------- Laufzeit-Timer während der Aufnahme ---------- */
  const recordingNow = phase === 'recording' && (listening || recorderRef.current !== null)
  useEffect(() => {
    if (!open || phase !== 'recording') return
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [open, phase])

  /* ---------- Spielerinnen-Erkennung im Transkript ---------- */
  const suggestedIds = useMemo(() => {
    const lower = text.toLowerCase()
    if (lower.length < 2) return []
    return players
      .filter((p) => {
        const fn = p.firstName.toLowerCase()
        const ln = p.lastName.toLowerCase()
        const re = new RegExp(
          `(^|[^\\p{L}])(${escapeRegExp(fn)}|${escapeRegExp(ln)})($|[^\\p{L}])`,
          'iu',
        )
        return re.test(lower)
      })
      .map((p) => p.id)
  }, [text, players])

  useEffect(() => {
    if (!manualPick && playerId === null && suggestedIds.length === 1) {
      setPlayerId(suggestedIds[0])
    }
  }, [suggestedIds, manualPick, playerId])

  const sortedPlayers = useMemo(() => {
    const sug = new Set(suggestedIds)
    return [...players].sort((a, b) => {
      const d = Number(sug.has(b.id)) - Number(sug.has(a.id))
      if (d !== 0) return d
      return a.firstName.localeCompare(b.firstName, 'de')
    })
  }, [players, suggestedIds])

  /* ---------- Termin-Auswahl (heute ±7 Tage) ---------- */
  const relevantEvents = useMemo(
    () => relevantCaptureEvents(events, todayIso()),
    [events],
  )
  const opponentById = useMemo(
    () => new Map(opponents.map((o) => [o.id, o])),
    [opponents],
  )

  /** Termin wählen/abwählen; Kategorie folgt der Termin-Art (überschreibbar). */
  function toggleEvent(e: MatchEvent) {
    if (eventId === e.id) {
      setEventId(null)
      return
    }
    setEventId(e.id)
    if (e.kind === 'training') setCategory('training')
    else if (e.kind === 'match') setCategory('spiel')
  }

  /* ---------- Speichern ---------- */
  // Regel A: eine Notiz braucht mindestens einen Bezug — Spielerin und/oder Termin.
  const hasReference = playerId !== null || eventId !== null
  const canSave = (text.trim().length > 0 || audioBlob !== null) && hasReference
  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    stopCapture('stopped')
    // Recorder-Blob trifft asynchron über onstop ein — kurz darauf warten.
    await new Promise((r) => setTimeout(r, 200))
    const note: Note = {
      id: uid(),
      playerId: playerId ?? undefined,
      eventId: eventId ?? undefined,
      category,
      date: todayIso(),
      rating,
      text: text.trim(),
      audio: audioBlobRef.current,
      createdAt: new Date().toISOString(),
    }
    await db.notes.add(note)
    onSaved()
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Eindruck festhalten">
      <div className="flex flex-col gap-4">
        {/* --- Sichtbarkeits-Hinweis (Regel B) --- */}
        <p className="-mt-2 flex items-center gap-1.5 px-1 text-[12px] text-muted">
          <LockIcon className="h-3.5 w-3.5 shrink-0" />
          Nur für das Trainerteam sichtbar
        </p>

        {/* --- Aufnahme-Status --- */}
        {recordingNow ? (
          <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-poster-a to-poster-b px-3 py-2.5 text-poster-ink">
            <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-club-acc opacity-70 motion-reduce:animate-none" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-club-acc" />
            </span>
            <span className="flex-1 font-display text-[13px] font-bold uppercase tracking-wide">
              {listening ? 'Ich höre zu …' : 'Aufnahme läuft …'}
            </span>
            <span className="tnum text-[14px] opacity-90">{fmtSeconds(elapsed)}</span>
            <button
              onClick={() => stopCapture('stopped')}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/35 px-3 font-display text-[12px] font-bold uppercase tracking-wide"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              Stopp
            </button>
          </div>
        ) : audioBlob ? (
          <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-accent">
            <MicIcon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-[13px] font-semibold">
              Sprachnotiz angehängt · {fmtSeconds(elapsed)}
            </span>
            <button
              onClick={() => {
                setAudioBlob(null)
                audioBlobRef.current = null
              }}
              aria-label="Sprachnotiz verwerfen"
              className="grid h-11 w-11 place-items-center rounded-lg"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        ) : null}

        {/* --- Transkript / Text --- */}
        <div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={
              recordingNow
                ? 'Sprich einfach — das Transkript erscheint hier …'
                : 'Was ist dir aufgefallen?'
            }
            className="w-full resize-none rounded-xl border border-line bg-card-2 p-3 text-[15px] text-ink placeholder:text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
          />
          {interim && (
            <p className="mt-1 px-1 text-[13px] italic text-muted" aria-live="polite">
              {interim} …
            </p>
          )}
        </div>

        {/* --- Kategorie --- */}
        <div>
          <p className="mb-1.5 px-1 font-display text-[12px] font-bold uppercase tracking-wide text-muted">
            Kategorie
          </p>
          <Segmented options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        </div>

        {/* --- Spielerin (optional) --- */}
        <div>
          <p className="mb-1.5 px-1 font-display text-[12px] font-bold uppercase tracking-wide text-muted">
            Spielerin <span className="font-normal normal-case">(optional)</span>
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            <button
              onClick={() => {
                setPlayerId(null)
                setManualPick(true)
              }}
              aria-pressed={playerId === null}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold ${
                playerId === null
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-card-2 text-muted'
              }`}
            >
              Team-Notiz
            </button>
            {sortedPlayers.map((p) => {
              const selected = playerId === p.id
              const suggested = suggestedIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setPlayerId(selected ? null : p.id)
                    setManualPick(true)
                  }}
                  aria-pressed={selected}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-[13px] font-semibold ${
                    selected
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-card-2 text-ink'
                  }`}
                >
                  <Avatar player={p} size="sm" />
                  <span className="whitespace-nowrap">{p.firstName}</span>
                  {suggested && !selected && (
                    <Badge tone="accent" className="normal-case">
                      erkannt
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* --- Termin (heute ±7 Tage) --- */}
        {relevantEvents.length > 0 && (
          <div>
            <p className="mb-1.5 px-1 font-display text-[12px] font-bold uppercase tracking-wide text-muted">
              Termin <span className="font-normal normal-case">(optional)</span>
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              {relevantEvents.map((e) => {
                const selected = eventId === e.id
                return (
                  <button
                    key={e.id}
                    onClick={() => toggleEvent(e)}
                    aria-pressed={selected}
                    className={`tnum flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold ${
                      selected
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line bg-card-2 text-ink'
                    }`}
                  >
                    <span className="whitespace-nowrap">{eventChipLabel(e, opponentById)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* --- Bewertung (optional) --- */}
        <div>
          <p className="mb-1.5 px-1 font-display text-[12px] font-bold uppercase tracking-wide text-muted">
            Bewertung <span className="font-normal normal-case">(optional)</span>
          </p>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Bewertung 1 bis 5">
            {([1, 2, 3, 4, 5] as const).map((n) => {
              const filled = rating !== undefined && n <= rating
              return (
                <button
                  key={n}
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} von 5`}
                  onClick={() => setRating(rating === n ? undefined : n)}
                  className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card-2"
                >
                  <span
                    className={`h-4 w-4 rounded-full ${filled ? 'bg-club-acc' : 'bg-line'}`}
                    aria-hidden="true"
                  />
                </button>
              )
            })}
          </div>
        </div>

        {/* --- Pflicht-Bezug (Regel A) --- */}
        {!hasReference && (
          <p className="rounded-xl bg-card-2 px-3 py-2.5 text-[13px] leading-snug text-muted">
            Wähle eine Spielerin oder einen Termin — Eindrücke brauchen einen Bezug.
          </p>
        )}

        {/* --- Aktionen --- */}
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Verwerfen
          </Button>
          <Button className="flex-[2]" disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? 'Speichert …' : 'Notiz speichern'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Kleines Schloss — Kennzeichnung "nur Trainerteam" (Regel B). */
export function LockIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  )
}

export function MicIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9.2" y="3" width="5.6" height="10" rx="2.8" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5M9 20.5h6" />
    </svg>
  )
}
