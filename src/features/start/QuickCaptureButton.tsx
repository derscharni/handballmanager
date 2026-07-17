import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import { QuickCaptureSheet } from './QuickCaptureSheet'

/**
 * Kleiner Mikro-Button für Listen (Spielplan, Kader, Planung):
 * öffnet "Eindruck festhalten" mit vorverknüpfter Spielerin bzw. Termin.
 * Lädt seine Daten selbst — überall einsetzbar ohne Props-Verdrahtung.
 */
export function QuickCaptureButton({
  playerId,
  eventId,
  className = '',
}: {
  playerId?: string
  eventId?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [savedToast, setSavedToast] = useState(false)

  const players = useLiveQuery(() => db.players.toArray(), [])
  const events = useLiveQuery(() => db.events.toArray(), [])
  const opponents = useLiveQuery(() => db.opponents.toArray(), [])

  return (
    <>
      <button
        aria-label="Eindruck festhalten"
        title="Eindruck festhalten"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-accent-soft active:text-accent ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="3.5" width="6" height="11" rx="3" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
        </svg>
      </button>
      {open && (
        <QuickCaptureSheet
          open
          onClose={() => setOpen(false)}
          players={players ?? []}
          events={events ?? []}
          opponents={opponents ?? []}
          initialPlayerId={playerId ?? null}
          initialEventId={eventId ?? null}
          onSaved={() => {
            setOpen(false)
            setSavedToast(true)
            setTimeout(() => setSavedToast(false), 2200)
          }}
        />
      )}
      {savedToast && (
        <span className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-club-900 px-4 py-2.5 text-[13px] font-semibold text-club-on shadow-card">
          Eindruck gespeichert — nur Trainerteam
        </span>
      )}
    </>
  )
}
