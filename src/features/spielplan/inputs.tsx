import type { ReactNode } from 'react'

/** Gemeinsame Formular-Bausteine des Spielplan-Features. */

/** Basis ohne Höhe/Schriftgröße — Varianten ergänzen genau eine davon. */
export const fieldBase =
  'w-full rounded-xl border border-line bg-card-2 px-3 text-ink placeholder:text-muted'

export const inputCls = `${fieldBase} min-h-11 text-[15px]`

export const textareaCls = `${fieldBase} min-h-24 py-2.5 text-[15px]`

export const codeTextareaCls = `${fieldBase} min-h-28 py-2.5 font-mono text-[12px]`

export const selectCls = `${inputCls} appearance-none pr-8`

/** Kompaktes Select für Listenzeilen (z.B. Import-Vorschau). */
export const selectSmCls =
  'appearance-none rounded-lg border border-line bg-card-2 pl-2 pr-7 min-h-9 text-[12.5px] text-ink'

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
      <span className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-muted font-display">
        {label}
      </span>
      {children}
    </label>
  )
}

/** Select mit eigenem Chevron (native Pfeile passen nicht zu den Tokens). */
export function SelectWrap({ children }: { children: ReactNode }) {
  return (
    <span className="relative block">
      {children}
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  )
}
