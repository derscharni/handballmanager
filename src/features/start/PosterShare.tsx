import { useEffect, useRef, useState } from 'react'
import { db } from '../../lib/db'
import type { MatchEvent } from '../../lib/types'
import { fmtDateLong, fmtWeekday } from '../../lib/format'
import { Button } from '../../components/ui'

/**
 * Spieltag-Poster im Portrait-Vollbild: eigenes Hintergrundbild (Kamera oder
 * Galerie), Vereinsfarben-Layout, und "Als Bild teilen" rendert das Poster
 * auf Canvas (1080×1920, Story-Format) für Social Media.
 * Das Hintergrundbild wird am Termin gespeichert (IndexedDB-Blob).
 */
export function PosterShareOverlay({
  event,
  opponentName,
  clubName,
  teamName,
  onClose,
}: {
  event: MatchEvent
  opponentName?: string
  clubName: string
  teamName: string
  onClose: () => void
}) {
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [bgBlob, setBgBlob] = useState<Blob | null>((event.posterImage as Blob | undefined) ?? null)
  const [sharing, setSharing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!bgBlob) {
      setBgUrl(null)
      return
    }
    const u = URL.createObjectURL(bgBlob)
    setBgUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [bgBlob])

  // Hintergrund schließt Scrollen aus, solange das Overlay offen ist
  useEffect(() => {
    const el = document.getElementById('app-scroll')
    if (el) el.style.overflow = 'hidden'
    return () => {
      if (el) el.style.overflow = ''
    }
  }, [])

  async function onPickBg(file: File | undefined) {
    if (!file) return
    try {
      const resized = await resizeImage(file, 1600)
      setBgBlob(resized)
      await db.events.update(event.id, { posterImage: resized })
    } catch {
      setMsg('Bild konnte nicht geladen werden.')
      setTimeout(() => setMsg(null), 2500)
    }
  }

  async function removeBg() {
    setBgBlob(null)
    await db.events.update(event.id, { posterImage: null })
  }

  async function shareImage() {
    setSharing(true)
    try {
      const blob = await renderPosterPng({
        bg: bgBlob,
        clubName,
        teamName,
        opponentName,
        event,
      })
      const file = new File([blob], 'spieltag.png', { type: 'image/png' })
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean
      }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file] })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'spieltag.png'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        setMsg('Bild heruntergeladen.')
        setTimeout(() => setMsg(null), 2500)
      }
    } catch {
      /* Teilen abgebrochen — kein Fehler */
    } finally {
      setSharing(false)
    }
  }

  const home = event.home ?? true
  const us = shortClub(clubName)

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-poster-b" role="dialog" aria-modal="true" aria-label="Spieltag-Poster">
      {/* Poster-Fläche */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {bgUrl && (
          <img src={bgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: bgUrl
              ? 'linear-gradient(180deg, color-mix(in srgb, var(--club-950) 55%, transparent) 0%, color-mix(in srgb, var(--club-950) 20%, transparent) 45%, color-mix(in srgb, var(--club-950) 88%, transparent) 100%)'
              : 'linear-gradient(160deg, var(--club-900), var(--club-950))',
          }}
        />
        <div className="relative flex h-full flex-col items-center justify-between px-6 py-8 text-club-on">
          <div className="text-center">
            <p className="font-display text-[13px] font-bold uppercase tracking-[0.35em] text-club-acc">
              Spieltag
            </p>
            <p className="mt-1 text-[13px] opacity-85">
              {fmtWeekday(event.date)}, {fmtDateLong(event.date)}
              {event.time ? ` · ${event.time} Uhr` : ''}
            </p>
          </div>

          <div className="w-full text-center">
            <p className="font-display text-[40px] font-bold uppercase leading-[1.05] tracking-wide" style={{ textWrap: 'balance' }}>
              {home ? us : (opponentName ?? 'Gegner')}
            </p>
            <p className="my-2 font-display text-[20px] font-bold uppercase tracking-[0.3em] text-club-acc">
              vs
            </p>
            <p className="font-display text-[40px] font-bold uppercase leading-[1.05] tracking-wide" style={{ textWrap: 'balance' }}>
              {home ? (opponentName ?? 'Gegner') : us}
            </p>
            {event.hall && <p className="mt-3 text-[14px] opacity-85">{event.hall}</p>}
          </div>

          <p className="text-center font-display text-[13px] font-bold uppercase tracking-[0.2em] opacity-90">
            {clubName} · {teamName}
          </p>
        </div>
      </div>

      {/* Aktionen */}
      <div className="flex flex-col gap-2 bg-poster-b p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => camRef.current?.click()}>
            Kamera
          </Button>
          <Button variant="secondary" onClick={() => libRef.current?.click()}>
            Galerie
          </Button>
          <Button variant="secondary" onClick={() => void removeBg()} disabled={!bgBlob}>
            Ohne Bild
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button variant="accent" onClick={() => void shareImage()} disabled={sharing}>
            {sharing ? 'Erstelle Bild …' : 'Als Bild teilen'}
          </Button>
          <Button variant="ghost" className="!text-club-on" onClick={onClose}>
            Schließen
          </Button>
        </div>
        {msg && <p className="text-center text-[12px] font-semibold text-club-on/90">{msg}</p>}
      </div>

      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void onPickBg(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void onPickBg(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** "TuS Köln-Ehrenfeld 1865" → "Köln-Ehrenfeld" (Poster-Kurzform). */
function shortClub(name: string): string {
  return (
    name
      .replace(/\b(TuS|TSV|TV|SV|SC|SG|HSG|HC|VfL|VfB|DJK|FC)\b/gi, '')
      .replace(/\b(18|19|20)\d{2}\b/g, '')
      .replace(/e\.?\s?V\.?/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || name
  )
}

/* ---------- Bild-Helfer ---------- */

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

async function resizeImage(file: File, maxDim: number): Promise<Blob> {
  const img = await loadImage(file)
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.85),
  )
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#0B2158'
}

/** Rendert das Poster als 1080×1920-PNG (Story-Format). */
async function renderPosterPng({
  bg,
  clubName,
  teamName,
  opponentName,
  event,
}: {
  bg: Blob | null
  clubName: string
  teamName: string
  opponentName?: string
  event: MatchEvent
}): Promise<Blob> {
  const W = 1080
  const H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const c900 = cssVar('--club-900')
  const c950 = cssVar('--club-950')
  const on = cssVar('--club-on')
  const acc = cssVar('--club-acc')

  // Hintergrund: Bild (cover) oder Vereins-Verlauf
  if (bg) {
    const img = await loadImage(bg)
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, hexA(c950, 0.6))
    grad.addColorStop(0.45, hexA(c950, 0.25))
    grad.addColorStop(1, hexA(c950, 0.92))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  } else {
    const grad = ctx.createLinearGradient(0, 0, W * 0.4, H)
    grad.addColorStop(0, c900)
    grad.addColorStop(1, c950)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
    // feine Pinstripes
    ctx.save()
    ctx.globalAlpha = 0.04
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    for (let x = -H; x < W + H; x += 48) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + H * 0.42, H)
      ctx.stroke()
    }
    ctx.restore()
  }

  const cx = W / 2
  const condensed = "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif"
  ctx.textAlign = 'center'

  // Kopf
  ctx.fillStyle = acc
  ctx.font = `bold 52px ${condensed}`
  drawSpaced(ctx, 'SPIELTAG', cx, 190, 22)
  ctx.fillStyle = on
  ctx.font = `44px ${condensed}`
  const dateLine = `${fmtWeekday(event.date)}, ${fmtDateLong(event.date)}${event.time ? ` · ${event.time} Uhr` : ''}`
  ctx.fillText(dateLine, cx, 265)

  // Duell
  const home = event.home ?? true
  const us = shortClub(clubName).toUpperCase()
  const them = (opponentName ?? 'GEGNER').toUpperCase()
  const top = home ? us : them
  const bottom = home ? them : us
  ctx.fillStyle = on
  fitText(ctx, top, cx, 900, W - 160, 130, condensed)
  ctx.fillStyle = acc
  ctx.font = `bold 64px ${condensed}`
  drawSpaced(ctx, 'VS', cx, 1010, 26)
  ctx.fillStyle = on
  fitText(ctx, bottom, cx, 1130, W - 160, 130, condensed)
  if (event.hall) {
    ctx.font = `44px ${condensed}`
    ctx.globalAlpha = 0.9
    ctx.fillText(event.hall, cx, 1230)
    ctx.globalAlpha = 1
  }

  // Fuß
  ctx.fillStyle = acc
  ctx.fillRect(cx - 60, 1740, 120, 6)
  ctx.fillStyle = on
  ctx.font = `bold 40px ${condensed}`
  drawSpaced(ctx, `${clubName.toUpperCase()} · ${teamName.toUpperCase()}`, cx, 1810, 6)

  return await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'),
  )
}

/** Text mit Letterspacing zentriert zeichnen. */
function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  spacing: number,
) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1)
  let x = cx - total / 2
  ctx.save()
  ctx.textAlign = 'left'
  ;[...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y)
    x += widths[i] + spacing
  })
  ctx.restore()
}

/** Bold-Condensed-Zeile, Schriftgröße schrumpft bis sie in maxWidth passt. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  startSize: number,
  family: string,
) {
  let size = startSize
  do {
    ctx.font = `bold ${size}px ${family}`
    size -= 6
  } while (ctx.measureText(text).width > maxWidth && size > 40)
  ctx.fillText(text, cx, y)
}

/** #RRGGBB + Alpha → rgba() (Canvas versteht color-mix nicht). */
function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(11,33,88,${alpha})`
  const n = Number.parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
