import type { Poll } from '../../../lib/types'
import { tallyPoll } from './poll-utils'

/** WhatsApp-taugliche Texte für Umfragen + Teilen-/Kopieren-Helfer. */

/** "📊 Frage\n\n1. Option …\n\nStimmt ab …" */
export function pollInviteText(poll: Poll): string {
  const lines = [`📊 ${poll.question}`, '']
  poll.options.forEach((o, i) => lines.push(`${i + 1}. ${o.label}`))
  if (poll.multi) {
    lines.push('')
    lines.push('Mehrfachauswahl möglich!')
  }
  lines.push('')
  lines.push(poll.note ? `Stimmt ab bis: ${poll.note}` : 'Stimmt ab! 🙋')
  return lines.join('\n')
}

/** "📊 Frage — Ergebnis: Kanutour ▮▮▮▮▮ 5 · Kegeln ▮▮ 2 …" */
export function pollResultText(poll: Poll): string {
  const t = tallyPoll(poll)
  const parts = [...poll.options]
    .sort((a, b) => (t.counts[b.id] ?? 0) - (t.counts[a.id] ?? 0))
    .map((o) => {
      const n = t.counts[o.id] ?? 0
      const bar = '▮'.repeat(Math.min(n, 12))
      return n > 0 ? `${o.label} ${bar} ${n}` : `${o.label} 0`
    })
  return `📊 ${poll.question} — Ergebnis: ${parts.join(' · ')}`
}

/** navigator.share, sonst WhatsApp-Web-Fallback (wa.me). */
export async function shareText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text })
      return
    } catch {
      // Abbruch durch Nutzer:in oder nicht unterstützt → Fallback
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}

/** In die Zwischenablage kopieren; true bei Erfolg. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback für ältere WebViews
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    return ok
  }
}
