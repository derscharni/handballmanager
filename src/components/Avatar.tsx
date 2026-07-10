import { useEffect, useState } from 'react'
import type { Player } from '../lib/types'
import { initials } from '../lib/format'

const sizes = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-11 w-11 text-[13px]',
  lg: 'h-20 w-20 text-[24px]',
} as const

/**
 * Spielerinnen-Avatar: Foto aus IndexedDB-Blob, sonst Initialen
 * auf Vereinsfarben-Grund. Object-URLs werden sauber freigegeben.
 */
export function Avatar({
  player,
  size = 'md',
  className = '',
}: {
  player: Pick<Player, 'firstName' | 'lastName' | 'photo' | 'isGuest'>
  size?: keyof typeof sizes
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!player.photo) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(player.photo)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [player.photo])

  const ring = player.isGuest ? 'ring-2 ring-club-acc' : 'ring-1 ring-line'

  return url ? (
    <img
      src={url}
      alt={`${player.firstName} ${player.lastName}`}
      className={`${sizes[size]} shrink-0 rounded-full object-cover ${ring} ${className}`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${sizes[size]} shrink-0 rounded-full bg-club-700 text-club-on font-display font-bold inline-flex items-center justify-center ${ring} ${className}`}
    >
      {initials(player.firstName, player.lastName)}
    </span>
  )
}
