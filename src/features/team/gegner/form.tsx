import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Lokale Formular-Primitive der Gegner-Sektion (bewusst eigenständig,
 * damit die Sektion unabhängig von anderen Feature-Ordnern bleibt).
 */

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

/** Zweistufiges Löschen — kein window.confirm. */
export function TwoStepDelete({
  onConfirm,
  label = 'Löschen',
  confirmLabel = 'Wirklich löschen?',
  className = '',
}: {
  onConfirm: () => void
  label?: string
  confirmLabel?: string
  className?: string
}) {
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
      className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 font-display text-[14px] font-bold uppercase tracking-wide transition-colors ${
        armed ? 'bg-crit text-white' : 'bg-crit-soft text-crit'
      } ${className}`}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}
