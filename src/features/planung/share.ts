import type { MatchEvent, Player, SquadNomination } from '../../lib/types'
import { POSITIONS, POSITION_LABEL } from '../../lib/types'
import { fmtDayDate, playerName } from '../../lib/format'

/** WhatsApp-/Teilen-Text für den freigegebenen Spieltagskader. */
export function buildShareText(opts: {
  event: MatchEvent
  opponentName?: string
  nominations: SquadNomination[]
  playersById: Map<string, Player>
  meetTime?: string
  meetPlace?: string
  clubName: string
}): string {
  const { event, opponentName, nominations, playersById, meetTime, meetPlace, clubName } = opts

  const where =
    event.kind === 'tournament'
      ? (event.note ?? 'Turnier')
      : `${event.home ? 'Heim vs' : 'Auswärts @'} ${opponentName ?? 'Gegner'}`

  const lines: string[] = []
  lines.push(`📋 Spieltagskader — ${fmtDayDate(event.date)}${event.time ? ` · ${event.time}` : ''}`)
  lines.push(`${where}${event.hall ? ` · ${event.hall}` : ''}`)
  if (meetTime || meetPlace) {
    lines.push(`Treffpunkt: ${[meetTime, meetPlace].filter(Boolean).join(' · ')}`)
  }
  lines.push('')

  for (const pos of POSITIONS) {
    const names = nominations
      .filter((n) => n.position === pos)
      .map((n) => {
        const p = playersById.get(n.playerId)
        if (!p) return null
        return `${p.number != null ? `#${p.number} ` : ''}${playerName(p)}${p.isGuest ? ' (Gast)' : ''}`
      })
      .filter((s): s is string => s !== null)
    if (names.length) lines.push(`${POSITION_LABEL[pos]}: ${names.join(', ')}`)
  }

  lines.push('')
  lines.push(`— Trainerteam ${clubName}`)
  return lines.join('\n')
}

/** Teilt via Web-Share-API, sonst wa.me-Link in neuem Tab. */
export async function shareViaWhatsApp(text: string): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return
    } catch {
      /* abgebrochen oder nicht möglich → wa.me-Fallback */
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}

/** Kopiert in die Zwischenablage, mit Textarea-Fallback. Liefert Erfolg. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* Clipboard-API nicht verfügbar → Fallback */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
