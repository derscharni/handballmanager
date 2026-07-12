import { useEffect, useRef, useState } from 'react'
import type { Position } from '../../lib/types'
import { FIELD_VIEWBOX, nearestZone } from './FieldView'

/**
 * Drag & Drop der Kaderplanung — reine Pointer Events (kein HTML5-DnD).
 *
 * - Touch: Drag startet nach ~200 ms Halten; >8 px Bewegung davor = Scrollen,
 *   der Kandidat wird verworfen. Seitenscroll bleibt so immer intakt.
 * - Maus: Drag startet ab 6 px Bewegung, darunter zählt es als Tap.
 * - Drop-Ziele werden per Rect-Hit-Test gefunden: [data-drop-pos] (Listen-
 *   gruppen), [data-drop-field] (Feld-SVG → nächstgelegene Zone) und
 *   [data-drop-remove] (Entfernen-Zone, nur beim Ziehen aus einer Gruppe).
 */

export type DropTarget = Position | 'remove'

export interface DragState {
  playerId: string
  /** Position, aus der gezogen wird; null = aus dem Verfügbaren-Pool. */
  from: Position | null
  x: number
  y: number
  over: DropTarget | null
}

const HOLD_MS = 200
const TOUCH_CANCEL_PX = 8
const MOUSE_START_PX = 6
const SCROLL_EDGE_PX = 84

interface PressInfo {
  pointerId: number
  playerId: string
  from: Position | null
  touch: boolean
  x0: number
  y0: number
  lastX: number
  lastY: number
  el: Element
}

function inRect(r: DOMRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

function hitTest(x: number, y: number, fromNominated: boolean): DropTarget | null {
  if (fromNominated) {
    const rm = document.querySelector('[data-drop-remove]')
    if (rm && inRect(rm.getBoundingClientRect(), x, y)) return 'remove'
  }
  const field = document.querySelector('[data-drop-field]')
  if (field) {
    const r = field.getBoundingClientRect()
    if (r.width > 0 && inRect(r, x, y)) {
      const fx = FIELD_VIEWBOX.x + ((x - r.left) / r.width) * FIELD_VIEWBOX.w
      const fy = FIELD_VIEWBOX.y + ((y - r.top) / r.height) * FIELD_VIEWBOX.h
      return nearestZone(fx, fy)
    }
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-drop-pos]'))) {
    if (inRect(el.getBoundingClientRect(), x, y)) return el.dataset.dropPos as Position
  }
  return null
}

interface Controller {
  startPress: (e: React.PointerEvent, playerId: string, from: Position | null) => void
  consumeClick: () => boolean
  destroy: () => void
}

function createController(
  emit: (s: DragState | null) => void,
  onDropRef: { current: (playerId: string, from: Position | null, target: DropTarget) => void },
): Controller {
  let press: PressInfo | null = null
  let state: DragState | null = null
  let holdT: number | null = null
  let rafId: number | null = null
  let suppressClick = false

  const guard = (ev: TouchEvent) => ev.preventDefault()
  const guardCtx = (ev: Event) => ev.preventDefault()

  function set(next: DragState | null) {
    state = next
    emit(next)
  }

  function clearHold() {
    if (holdT !== null) {
      clearTimeout(holdT)
      holdT = null
    }
  }

  function teardown() {
    clearHold()
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onCancel)
    document.removeEventListener('touchmove', guard)
    document.removeEventListener('contextmenu', guardCtx)
    document.body.style.userSelect = ''
    document.body.style.removeProperty('-webkit-user-select')
    if (press) {
      try {
        press.el.releasePointerCapture(press.pointerId)
      } catch {
        /* Pointer war nicht (mehr) gefangen — unkritisch */
      }
    }
    press = null
    if (state) set(null)
  }

  function autoScroll() {
    rafId = null
    if (!state) return
    // Gescrollt wird der App-Frame-Container (#app-scroll), nicht die Seite —
    // die Seite selbst ist seit dem Sticky-Nav-Fix nicht mehr scrollbar.
    const scroller = document.getElementById('app-scroll')
    const rect = scroller?.getBoundingClientRect()
    const top = rect?.top ?? 0
    const bottom = rect?.bottom ?? window.innerHeight
    let v = 0
    if (state.y < top + SCROLL_EDGE_PX) v = -Math.ceil((top + SCROLL_EDGE_PX - state.y) / 6)
    else if (state.y > bottom - SCROLL_EDGE_PX)
      v = Math.ceil((state.y - (bottom - SCROLL_EDGE_PX)) / 6)
    if (v !== 0) {
      if (scroller) scroller.scrollBy(0, v)
      else window.scrollBy(0, v)
      set({ ...state, over: hitTest(state.x, state.y, state.from !== null) })
    }
    rafId = requestAnimationFrame(autoScroll)
  }

  function begin() {
    if (!press || state) return
    clearHold()
    suppressClick = true
    try {
      press.el.setPointerCapture(press.pointerId)
    } catch {
      /* nicht unterstützt — Dokument-Listener reichen */
    }
    document.addEventListener('touchmove', guard, { passive: false })
    document.addEventListener('contextmenu', guardCtx)
    document.body.style.userSelect = 'none'
    document.body.style.setProperty('-webkit-user-select', 'none')
    set({
      playerId: press.playerId,
      from: press.from,
      x: press.lastX,
      y: press.lastY,
      over: hitTest(press.lastX, press.lastY, press.from !== null),
    })
    rafId = requestAnimationFrame(autoScroll)
  }

  function onMove(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return
    press.lastX = e.clientX
    press.lastY = e.clientY
    if (!state) {
      const dist = Math.abs(e.clientX - press.x0) + Math.abs(e.clientY - press.y0)
      if (press.touch) {
        // Nutzerin scrollt — Drag-Kandidat verwerfen, Scroll nicht anfassen.
        if (dist > TOUCH_CANCEL_PX) teardown()
      } else if (dist > MOUSE_START_PX) {
        begin()
      }
      return
    }
    e.preventDefault()
    set({ ...state, x: e.clientX, y: e.clientY, over: hitTest(e.clientX, e.clientY, state.from !== null) })
  }

  function onUp(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return
    const done = state
    teardown()
    if (done && done.over) onDropRef.current(done.playerId, done.from, done.over)
  }

  function onCancel(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return
    teardown()
  }

  function startPress(e: React.PointerEvent, playerId: string, from: Position | null) {
    if (press || state) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    suppressClick = false
    press = {
      pointerId: e.pointerId,
      playerId,
      from,
      touch: e.pointerType !== 'mouse',
      x0: e.clientX,
      y0: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      el: e.currentTarget,
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    if (press.touch) holdT = window.setTimeout(begin, HOLD_MS)
  }

  function consumeClick(): boolean {
    const s = suppressClick
    suppressClick = false
    return s
  }

  return { startPress, consumeClick, destroy: teardown }
}

export function usePlanDrag(
  onDrop: (playerId: string, from: Position | null, target: DropTarget) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop
  const ctrlRef = useRef<Controller | null>(null)
  ctrlRef.current ??= createController(setDrag, onDropRef)
  const ctrl = ctrlRef.current

  useEffect(() => () => ctrl.destroy(), [ctrl])

  return { drag, startPress: ctrl.startPress, consumeClick: ctrl.consumeClick }
}
