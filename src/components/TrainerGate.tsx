import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { tryUnlock, useTrainerLock } from '../lib/trainerLock'
import { Button, Card } from './ui'

/**
 * Verriegelt Trainer-Inhalte (Notizen, Bewertungen), solange die
 * Trainer-PIN nicht eingegeben wurde. Ohne konfigurierte PIN ist der
 * Inhalt frei — die Sperre wird in den Einstellungen aktiviert.
 */
export function TrainerGate({
  children,
  compact = false,
}: {
  children: ReactNode
  /** Kompakte Verriegelungs-Anzeige (für kleine Karten/Listen). */
  compact?: boolean
}) {
  const settings = useLiveQuery(() => db.settings.get('app'), [])
  const { locked } = useTrainerLock(settings?.trainerPinHash)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  if (!locked) return <>{children}</>

  async function submit() {
    setError(false)
    const ok = await tryUnlock(pin)
    if (!ok) {
      setError(true)
      setPin('')
    }
  }

  return (
    <Card className={compact ? 'p-3' : 'p-4'}>
      <div className="flex items-center gap-2 text-muted">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
        <span className="font-display text-[13px] font-bold uppercase tracking-wide">
          Trainerbereich gesperrt
        </span>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        Notizen und Bewertungen sind nur für das Trainerteam sichtbar.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Trainer-PIN"
          placeholder="PIN"
          className="tnum min-h-11 w-28 rounded-xl border border-line bg-card-2 px-3 text-center text-[16px] font-bold tracking-[0.3em]"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <Button type="submit" disabled={pin.length === 0}>
          Entsperren
        </Button>
      </form>
      {error && (
        <p className="mt-2 text-[12px] font-semibold text-crit">
          Falsche PIN — Notizen bleiben gesperrt.
        </p>
      )}
    </Card>
  )
}
