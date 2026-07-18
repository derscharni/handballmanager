import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { FIELD_H, FIELD_W } from './presets'

/**
 * Pointer-Logik des Taktikboards: Figuren verschieben, Laufwege aufzeichnen,
 * Antippen (Auswahl / Weg- und Material-Popover) — plus Geometrie-Helfer.
 */

export interface Pt {
  x: number
  y: number
}

export type FieldMode = 'full' | 'half'

/** Client-Koordinaten → normierte Feldkoordinaten (exakt via getScreenCTM). */
export function svgPointNorm(svg: SVGSVGElement, clientX: number, clientY: number): Pt {
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0.5, y: 0.5 }
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
  return { x: p.x / FIELD_W, y: p.y / FIELD_H }
}

const MARGIN_M = 0.6

/** Punkt ins Feld klemmen (Halbfeld: nur die obere Angriffshälfte). */
export function clampNorm(p: Pt, field: FieldMode): Pt {
  const maxY = field === 'half' ? (FIELD_H / 2 - MARGIN_M) / FIELD_H : (FIELD_H - MARGIN_M) / FIELD_H
  return {
    x: Math.min((FIELD_W - MARGIN_M) / FIELD_W, Math.max(MARGIN_M / FIELD_W, p.x)),
    y: Math.min(maxY, Math.max(MARGIN_M / FIELD_H, p.y)),
  }
}

/** Weglänge in Metern (normierte Punkte, Feld 20 × 40 m). */
export function pathLenM(pts: Pt[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i].x - pts[i - 1].x) * FIELD_W
    const dy = (pts[i].y - pts[i - 1].y) * FIELD_H
    len += Math.hypot(dx, dy)
  }
  return len
}

/** Punkt bei Fortschritt u (0..1) entlang der Polylinie — Bogenlängen-parametrisiert. */
export function pointAtPath(pts: Pt[], u: number): Pt {
  if (pts.length === 0) return { x: 0.5, y: 0.5 }
  if (pts.length === 1) return pts[0]
  const segs: number[] = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i].x - pts[i - 1].x) * FIELD_W
    const dy = (pts[i].y - pts[i - 1].y) * FIELD_H
    const l = Math.hypot(dx, dy)
    segs.push(l)
    total += l
  }
  if (total === 0) return pts[0]
  let d = Math.max(0, Math.min(1, u)) * total
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const f = segs[i] > 0 ? Math.min(1, d / segs[i]) : 1
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
      }
    }
    d -= segs[i]
  }
  return pts[pts.length - 1]
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

/* ---------- Drag-Hook ---------- */

type SvgPointerEvent = ReactPointerEvent<SVGSVGElement>

export interface BoardDragOptions {
  mode: 'move' | 'record'
  field: FieldMode
  /** Während der Animation keine Eingaben. */
  disabled: boolean
  getToken: (id: string) => Pt | undefined
  getMaterial: (id: string) => Pt | undefined
  moveToken: (id: string, x: number, y: number) => void
  moveMaterial: (id: string, x: number, y: number) => void
  /** Aufgezeichneten Weg übernehmen (Figur zurück an den Start). */
  commitPath: (id: string, pts: Pt[]) => void
  onTapToken: (id: string, clientX: number, clientY: number) => void
  onTapMaterial: (id: string, clientX: number, clientY: number) => void
  onTapPath: (id: string, clientX: number, clientY: number) => void
  onTapBackground: () => void
  /** Live-Vorschau während der Aufzeichnung (null = keine). */
  onLiveRecord: (tokenId: string | null, pts: Pt[] | null) => void
  onDragStart?: () => void
}

interface DragState {
  pointerId: number
  kind: 'token' | 'material' | 'path'
  id: string
  rec: boolean
  moved: boolean
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  pts: Pt[]
}

/** Mindest-Weglänge (m), damit eine Aufzeichnung als Weg zählt. */
const MIN_PATH_M = 1.2
/** Punkte dichter als ~0.01 (normiert) werden ausgedünnt. */
const THIN_SQ = 0.0001

export function useBoardDrag(o: BoardDragOptions) {
  const drag = useRef<DragState | null>(null)

  const onPointerDown = (e: SvgPointerEvent) => {
    if (o.disabled || drag.current) return
    const target = e.target as Element
    const tokEl = target.closest('[data-tok]')
    const matEl = tokEl ? null : target.closest('[data-mat]')
    const pathEl = tokEl || matEl ? null : target.closest('[data-path]')
    if (!tokEl && !matEl && !pathEl) {
      o.onTapBackground()
      return
    }
    e.preventDefault()
    const base = {
      pointerId: e.pointerId,
      moved: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
    }
    if (pathEl) {
      drag.current = {
        ...base,
        kind: 'path',
        id: pathEl.getAttribute('data-path') ?? '',
        rec: false,
        startX: 0,
        startY: 0,
        pts: [],
      }
    } else {
      const isMat = !!matEl
      const id = (isMat ? matEl.getAttribute('data-mat') : tokEl!.getAttribute('data-tok')) ?? ''
      const pos = isMat ? o.getMaterial(id) : o.getToken(id)
      if (!pos) return
      drag.current = {
        ...base,
        kind: isMat ? 'material' : 'token',
        id,
        rec: !isMat && o.mode === 'record',
        startX: pos.x,
        startY: pos.y,
        pts: [{ x: pos.x, y: pos.y }],
      }
      o.onDragStart?.()
      if (drag.current.rec) o.onLiveRecord(id, null)
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* Pointer bereits weg — unkritisch */
    }
  }

  const onPointerMove = (e: SvgPointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    if (Math.abs(e.clientX - d.startClientX) + Math.abs(e.clientY - d.startClientY) > 7) {
      d.moved = true
    }
    if (d.kind === 'path') return
    const p = clampNorm(svgPointNorm(e.currentTarget, e.clientX, e.clientY), o.field)
    if (d.kind === 'material') {
      o.moveMaterial(d.id, p.x, p.y)
      return
    }
    o.moveToken(d.id, p.x, p.y)
    if (d.rec) {
      const last = d.pts[d.pts.length - 1]
      const dx = p.x - last.x
      const dy = p.y - last.y
      if (dx * dx + dy * dy > THIN_SQ) d.pts.push(p)
      o.onLiveRecord(d.id, d.pts.length > 0 ? d.pts.concat([p]) : null)
    }
  }

  const endDrag = (e: SvgPointerEvent, cancelled: boolean) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    if (d.kind === 'path') {
      if (!cancelled && !d.moved) o.onTapPath(d.id, e.clientX, e.clientY)
      return
    }
    if (d.kind === 'material') {
      if (cancelled) o.moveMaterial(d.id, d.startX, d.startY)
      else if (!d.moved) o.onTapMaterial(d.id, e.clientX, e.clientY)
      return
    }
    if (d.rec) {
      o.onLiveRecord(null, null)
      const p = clampNorm(svgPointNorm(e.currentTarget, e.clientX, e.clientY), o.field)
      const pts = d.pts.slice()
      const last = pts[pts.length - 1]
      if (last.x !== p.x || last.y !== p.y) pts.push(p)
      if (!cancelled && pts.length > 1 && pathLenM(pts) > MIN_PATH_M) {
        o.commitPath(d.id, pts)
      } else {
        o.moveToken(d.id, d.startX, d.startY)
        if (!cancelled && !d.moved) o.onTapToken(d.id, e.clientX, e.clientY)
      }
      return
    }
    if (cancelled || !d.moved) {
      o.moveToken(d.id, d.startX, d.startY)
      if (!cancelled && !d.moved) o.onTapToken(d.id, e.clientX, e.clientY)
    }
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: SvgPointerEvent) => endDrag(e, false),
    onPointerCancel: (e: SvgPointerEvent) => endDrag(e, true),
  }
}
