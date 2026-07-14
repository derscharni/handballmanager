import type { ReactNode } from 'react'

/**
 * Kleine, gemeinsame UI-Primitive im "Vereinsfarben"-Design.
 * Alle Farben kommen aus den Tokens in theme.css.
 */

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl bg-card shadow-card border border-line ${className}`}>
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between px-1 pt-5 pb-2">
      <h2 className="font-display uppercase tracking-wide text-[13px] text-muted">
        {children}
      </h2>
      {action}
    </div>
  )
}

type BadgeTone = 'ok' | 'warn' | 'crit' | 'accent' | 'guest' | 'neutral'

const badgeTones: Record<BadgeTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
  accent: 'bg-accent-soft text-accent',
  guest: 'bg-club-acc text-club-acc-ink',
  neutral: 'bg-card-2 text-muted',
}

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
}) {
  const styles = {
    primary: 'bg-btn-bg text-btn-ink active:opacity-85',
    secondary: 'bg-accent-soft text-accent active:opacity-85',
    ghost: 'bg-transparent text-accent active:bg-accent-soft',
    danger: 'bg-crit-soft text-crit active:opacity-85',
    accent: 'bg-club-acc text-club-acc-ink active:opacity-85',
  }[variant]
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-display uppercase tracking-wide text-[14px] font-bold transition-opacity disabled:opacity-40 ${styles} ${className}`}
      {...props}
    />
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-xl bg-card-2 border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`flex-1 min-h-9 rounded-[10px] px-2 text-[13px] font-semibold transition-colors ${
            o.value === value ? 'bg-card text-ink shadow-card' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Bottom-Sheet für mobile Dialoge. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        {title && (
          <h3 className="mb-3 font-display uppercase tracking-wide text-[15px] font-bold">
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <p className="font-display uppercase tracking-wide text-[15px] font-bold text-muted">
        {title}
      </p>
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
      {action}
    </Card>
  )
}
