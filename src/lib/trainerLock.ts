import { useSyncExternalStore } from 'react'
import { db } from './db'

/**
 * Trainer-Sperre (V1, local-first): Notizen/Bewertungen sind nur fürs
 * Trainerteam. Ist eine Trainer-PIN gesetzt, bleiben diese Bereiche
 * verriegelt, bis die PIN eingegeben wurde — Schutz für den Fall, dass
 * das Trainer-Handy in der Kabine weitergereicht wird. Entsperrt gilt
 * für die laufende Sitzung (bis zum Neuladen der App).
 */

let unlocked = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeTrainerLock(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function isUnlocked(): boolean {
  return unlocked
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`hbm-trainer-pin:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Versucht zu entsperren; true bei korrekter PIN (oder ohne gesetzte PIN). */
export async function tryUnlock(pin: string): Promise<boolean> {
  const settings = await db.settings.get('app')
  if (!settings?.trainerPinHash) {
    unlocked = true
    emit()
    return true
  }
  const ok = (await hashPin(pin)) === settings.trainerPinHash
  if (ok) {
    unlocked = true
    emit()
  }
  return ok
}

export function lockAgain(): void {
  unlocked = false
  emit()
}

/**
 * React-Hook: `locked` ist true, wenn eine PIN gesetzt und noch nicht
 * entsperrt wurde. `pinConfigured` sagt, ob überhaupt eine Sperre existiert.
 */
export function useTrainerLock(pinHash: string | undefined): {
  locked: boolean
  pinConfigured: boolean
} {
  const isUnlockedNow = useSyncExternalStore(subscribeTrainerLock, isUnlocked, isUnlocked)
  const pinConfigured = Boolean(pinHash)
  return { locked: pinConfigured && !isUnlockedNow, pinConfigured }
}
