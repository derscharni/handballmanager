import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Player, Position } from '../../lib/types'
import { POSITIONS } from '../../lib/types'

/* ---------- Sortierung & Suche ---------- */

/** Positions-Reihenfolge TW, LA, RA, KM, RL, RM, RR — dann Nachname. */
export function byPositionThenName(a: Player, b: Player): number {
  const pa = POSITIONS.indexOf(a.mainPosition)
  const pb = POSITIONS.indexOf(b.mainPosition)
  if (pa !== pb) return pa - pb
  const ln = a.lastName.localeCompare(b.lastName, 'de')
  if (ln !== 0) return ln
  return a.firstName.localeCompare(b.firstName, 'de')
}

/** Toleranter Namens-Match: case-insensitive Substring über Vor- + Nachname. */
export function matchesQuery(p: Player, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const a = `${p.firstName} ${p.lastName}`.toLowerCase()
  const b = `${p.lastName} ${p.firstName}`.toLowerCase()
  return a.includes(q) || b.includes(q)
}

/* ---------- Kleine Anzeige-Bausteine ---------- */

export function PositionChips({ main, alt }: { main: Position; alt?: Position }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold leading-4 text-accent">
        {main}
      </span>
      {alt && (
        <span className="rounded-md bg-card-2 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-muted">
          {alt}
        </span>
      )}
    </span>
  )
}

/** Bewertungs-Punkte 1–5. */
export function RatingDots({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Bewertung ${rating} von 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${n <= rating ? 'bg-accent' : 'bg-line'}`}
        />
      ))}
    </span>
  )
}

export function WarnIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
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
      <path d="M12 4 2.8 20h18.4L12 4Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  )
}

/* ---------- Formular-Primitive ---------- */

export const inputCls =
  'w-full min-h-11 rounded-xl border border-line bg-card-2 px-3 text-[15px] text-ink placeholder:text-muted'

export function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[12px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  )
}

/** Bewertung 1–5 als antippbare Punkte (optional, erneutes Tippen löscht). */
export function RatingInput({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Bewertung 1 bis 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          aria-pressed={value !== null && n <= value}
          aria-label={`${n} von 5`}
          className="flex h-11 w-11 items-center justify-center"
        >
          <span
            className={`h-4 w-4 rounded-full transition-colors ${
              value !== null && n <= value ? 'bg-accent' : 'bg-card-2 border border-line'
            }`}
          />
        </button>
      ))}
      <span className="ml-1 text-[13px] text-muted tnum">{value ? `${value}/5` : '—'}</span>
    </div>
  )
}

/** Verfügbarkeits-Schalter (role=switch). */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center gap-2.5"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-ok' : 'bg-line'
        }`}
      >
        <span
          className={`absolute h-5.5 w-5.5 rounded-full bg-card shadow-card transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </span>
      <span className={`text-[14px] font-semibold ${checked ? 'text-ok' : 'text-crit'}`}>
        {label}
      </span>
    </button>
  )
}

/* ---------- Zweistufiges Löschen (kein window.confirm) ---------- */

export function TwoStepDelete({
  onConfirm,
  label = 'Löschen',
  confirmLabel = 'Wirklich löschen?',
  size = 'md',
  className = '',
}: {
  onConfirm: () => void
  label?: string
  confirmLabel?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const sizeCls = {
    sm: 'min-h-9 rounded-lg px-2.5 text-[11px]',
    md: 'min-h-11 rounded-xl px-3 text-[13px]',
    lg: 'min-h-11 rounded-xl px-4 font-display uppercase tracking-wide text-[14px]',
  }[size]
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          if (timer.current) clearTimeout(timer.current)
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
          timer.current = setTimeout(() => setArmed(false), 4000)
        }
      }}
      className={`inline-flex shrink-0 items-center justify-center font-bold transition-colors ${sizeCls} ${
        armed ? 'bg-crit text-white' : 'bg-crit-soft text-crit'
      } ${className}`}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}

/* ---------- Audio-Wiedergabe (Object-URL wird sauber revoked) ---------- */

export function AudioButton({ blob }: { blob: Blob }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const stop = () => {
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    setPlaying(false)
  }

  useEffect(
    () => () => {
      // Cleanup bei Unmount: Wiedergabe beenden, URL freigeben.
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const toggle = () => {
    if (playing) {
      stop()
      return
    }
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    urlRef.current = url
    audioRef.current = audio
    audio.onended = stop
    audio.onerror = stop
    void audio.play().catch(stop)
    setPlaying(true)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? 'Sprachnotiz stoppen' : 'Sprachnotiz abspielen'}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 text-[12px] font-bold text-accent"
    >
      {playing ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5L8 5.5Z" />
        </svg>
      )}
      Sprachnotiz
    </button>
  )
}
