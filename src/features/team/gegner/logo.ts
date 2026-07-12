/**
 * Gegner-Logo-Verarbeitung: Uploads und URL-Bilder werden clientseitig auf
 * max. 256px Kantenlänge verkleinert und als PNG gespeichert (Transparenz
 * bleibt erhalten — Vereinslogos sind oft freigestellt).
 *
 * Muster analog zu features/kader/photo.ts (dort JPEG für Fotos).
 */

const MAX_EDGE = 256

export async function downscaleLogo(source: Blob): Promise<Blob> {
  const url = URL.createObjectURL(source)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
      i.src = url
    })
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas nicht verfügbar.')
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Logo konnte nicht verarbeitet werden.')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type UrlLogoResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: 'invalid-url' | 'blocked' | 'not-image' }

/**
 * Best-Effort-Laden eines Logos von einer URL. In einer Local-First-PWA
 * scheitert das oft an CORS — der Aufrufer zeigt dann eine ruhige Meldung
 * mit dem manuellen Weg (Bild speichern und hochladen).
 */
export async function loadLogoFromUrl(rawUrl: string): Promise<UrlLogoResult> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'invalid-url' }
  }
  let raw: Blob
  try {
    const res = await fetch(parsed.toString(), { mode: 'cors' })
    if (!res.ok) return { ok: false, reason: 'blocked' }
    raw = await res.blob()
  } catch {
    return { ok: false, reason: 'blocked' }
  }
  if (!raw.type.startsWith('image/')) return { ok: false, reason: 'not-image' }
  try {
    return { ok: true, blob: await downscaleLogo(raw) }
  } catch {
    return { ok: false, reason: 'not-image' }
  }
}

/** Initialen für den Badge-Fallback: bevorzugt Kurzname, sonst Name. */
export function opponentInitials(o: { name: string; shortName?: string }): string {
  const src = (o.shortName ?? '').trim() || o.name.trim()
  const words = src.split(/[\s\-/.]+/).filter((w) => /[A-Za-zÄÖÜäöüß]/.test(w))
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}
