import { useEffect, useState } from 'react'
import { opponentInitials } from './logo'

const sizes = {
  sm: 'h-9 w-9 text-[11px]',
  md: 'h-11 w-11 text-[13px]',
  lg: 'h-24 w-24 text-[26px]',
} as const

/**
 * Gegner-Logo: rundes Bild aus dem IndexedDB-Blob, sonst Initialen-Badge
 * in Vereinsfarben. Object-URLs werden sauber freigegeben.
 */
export function OpponentLogo({
  name,
  shortName,
  logo,
  size = 'md',
  className = '',
}: {
  name: string
  shortName?: string
  logo?: Blob | null
  size?: keyof typeof sizes
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!logo) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(logo)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [logo])

  return url ? (
    <span
      className={`${sizes[size]} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-2 ring-1 ring-line ${className}`}
    >
      <img
        src={url}
        alt={`Logo ${name}`}
        className="h-full w-full object-contain p-1"
        draggable={false}
      />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={`${sizes[size]} inline-flex shrink-0 items-center justify-center rounded-full bg-club-700 font-display font-bold text-club-on ring-1 ring-line ${className}`}
    >
      {opponentInitials({ name, shortName })}
    </span>
  )
}
