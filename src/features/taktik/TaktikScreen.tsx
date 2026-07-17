import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../../lib/db'
import type { MaterialKind, TacticsBoard } from '../../lib/types'
import { Badge, Button, Card, Segmented, Sheet } from '../../components/ui'
import Court, { COURT_FLOOR, MatGlyph } from './Court'
import {
  FIELD_H,
  FIELD_W,
  MATERIAL_KINDS,
  MATERIAL_LABEL,
  NEW_BOARD_OPTIONS,
  PRESETS,
  buildPresetBoard,
  makeNewBoard,
  oppDefenseTokens,
} from './presets'
import type { NewBoardKind, TaktikPreset } from './presets'
import {
  clampNorm,
  easeInOut,
  pathLenM,
  pointAtPath,
  svgPointNorm,
  useBoardDrag,
} from './useBoardDrag'
import type { Pt } from './useBoardDrag'

/**
 * Taktik — Spielzug-Board: hochkantes Handballfeld mit verschiebbaren Figuren,
 * Laufweg-Aufzeichnung mit Abspiel-Animation, Trainingsmaterial und
 * gespeicherten Zügen (IndexedDB, debounced).
 */

const HINT_DEFAULT =
  'Figuren frei verschieben, antippen = auswählen. „Aufzeichnen“ speichert Laufwege als Pfeil, „Abspielen“ animiert alle Wege gleichzeitig. Weg antippen = löschen.'
const HINT_RECORD =
  'Aufzeichnen aktiv: Figur oder Ball über das Feld ziehen — der Weg wird als Pfeil gespeichert und die Figur kehrt zum Start zurück. Ball = Pass (durchgezogen).'

function Icon({ d, className = 'h-3.5 w-3.5' }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

const IC_SHIELD = 'M12 3l7 2.5V11c0 4.5-3 7.6-7 9.5-4-1.9-7-5-7-9.5V5.5Z'
const IC_PLAY = 'M8 5.5v13l10-6.5Z'
const IC_PLUS = 'M12 5v14M5 12h14'
const IC_RESET = 'M4.5 12a7.5 7.5 0 1 1 2.2 5.3M4.5 13.5v-4h4'
const IC_TRASH = 'M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13'
const IC_BOOKMARK = 'M7 4h10v16l-5-3.5L7 20Z'
const IC_CONE = 'M12 4l4 9H8Z M5.5 16.5h13'

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={pressed}
      className={`inline-flex min-h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold ${
        pressed
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line bg-card text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** "10.07.2026, 18:42" (lokale Zeit) */
function fmtStamp(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ---------- "Meine Züge"-Sheet ---------- */

function BoardsSheet({
  open,
  onClose,
  currentId,
  onLoad,
  onRename,
  onDelete,
  onNew,
}: {
  open: boolean
  onClose: () => void
  currentId: string | null
  onLoad: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onNew: () => void
}) {
  const boards = useLiveQuery(() => db.boards.orderBy('updatedAt').reverse().toArray(), [])
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tagEditId, setTagEditId] = useState<string | null>(null)
  const [tagVal, setTagVal] = useState('')

  useEffect(() => {
    if (!open) {
      setRenameId(null)
      setConfirmId(null)
      setTagFilter(null)
      setTagEditId(null)
    }
  }, [open])

  /* ---------- Tags: Ordnen der Züge/Übungen ---------- */
  const allTags = Array.from(
    new Set((boards ?? []).flatMap((b) => b.tags ?? [])),
  ).sort((a, b) => a.localeCompare(b, 'de'))
  const visibleBoards = (boards ?? []).filter(
    (b) => tagFilter === null || (b.tags ?? []).includes(tagFilter),
  )

  async function addTag(id: string) {
    const tag = tagVal.trim()
    setTagVal('')
    if (tag === '') {
      setTagEditId(null)
      return
    }
    const b = await db.boards.get(id)
    if (!b) return
    const tags = Array.from(new Set([...(b.tags ?? []), tag]))
    await db.boards.update(id, { tags })
    setTagEditId(null)
  }

  async function removeTag(id: string, tag: string) {
    const b = await db.boards.get(id)
    if (!b) return
    const tags = (b.tags ?? []).filter((t) => t !== tag)
    await db.boards.update(id, { tags })
    if (tagFilter === tag && !(boards ?? []).some((x) => x.id !== id && (x.tags ?? []).includes(tag))) {
      setTagFilter(null)
    }
  }

  const saveRename = (id: string) => {
    onRename(id, renameVal.trim() || 'Ohne Titel')
    setRenameId(null)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Meine Züge">
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={onNew}>
          <Icon d={IC_PLUS} className="h-4 w-4" /> Neuer Zug
        </Button>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nach Tag filtern">
            <button
              aria-pressed={tagFilter === null}
              onClick={() => setTagFilter(null)}
              className={`min-h-9 rounded-full px-3 text-[12px] font-semibold ${
                tagFilter === null ? 'bg-accent text-btn-ink' : 'border border-line text-muted'
              }`}
            >
              Alle
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                aria-pressed={tagFilter === t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`min-h-9 rounded-full px-3 text-[12px] font-semibold ${
                  tagFilter === t ? 'bg-accent text-btn-ink' : 'border border-line text-muted'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {boards && boards.length === 0 && (
          <p className="py-2 text-center text-[13px] text-muted">Noch keine gespeicherten Züge.</p>
        )}
        {boards && boards.length > 0 && visibleBoards.length === 0 && (
          <p className="py-2 text-center text-[13px] text-muted">
            Kein Zug mit diesem Tag — Filter oben zurücksetzen.
          </p>
        )}
        {visibleBoards.map((b) => (
          <Card key={b.id} className="p-3">
            {renameId === b.id ? (
              <div className="flex items-center gap-2">
                <input
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(b.id)
                  }}
                  aria-label="Neuer Name"
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-line bg-card-2 px-2 py-2 text-[14px] text-ink outline-none focus:border-accent"
                />
                <Button onClick={() => saveRename(b.id)} className="flex-none">
                  OK
                </Button>
              </div>
            ) : (
              <>
                <button className="block w-full text-left" onClick={() => onLoad(b.id)}>
                  <p className="flex items-center gap-2 truncate font-display text-[14px] font-bold uppercase tracking-wide">
                    <span className="truncate">{b.title || 'Ohne Titel'}</span>
                    {b.id === currentId && <Badge tone="accent">Geöffnet</Badge>}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {fmtStamp(b.updatedAt)} · {b.tokens.length} Figuren
                    {b.materials.length > 0 ? ` · ${b.materials.length}× Material` : ''}
                    {b.field === 'full' ? ' · ganzes Feld' : ''}
                  </p>
                </button>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {(b.tags ?? []).map((t) => (
                    <span
                      key={t}
                      className="inline-flex min-h-8 items-center gap-1 rounded-full bg-club-acc px-2.5 text-[11px] font-semibold text-club-acc-ink"
                    >
                      {t}
                      <button
                        aria-label={`Tag ${t} entfernen`}
                        className="px-0.5 font-bold"
                        onClick={() => void removeTag(b.id, t)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {tagEditId === b.id ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void addTag(b.id)
                      }}
                    >
                      <input
                        value={tagVal}
                        onChange={(e) => setTagVal(e.target.value)}
                        onBlur={() => void addTag(b.id)}
                        aria-label="Neuer Tag"
                        placeholder="z.B. Angriff"
                        autoFocus
                        maxLength={24}
                        className="min-h-8 w-28 rounded-full border border-line bg-card-2 px-2.5 text-[12px] outline-none focus:border-accent"
                      />
                    </form>
                  ) : (
                    <button
                      className="min-h-8 rounded-full border border-dashed border-line px-2.5 text-[11px] font-semibold text-muted active:bg-accent-soft active:text-accent"
                      onClick={() => {
                        setTagEditId(b.id)
                        setTagVal('')
                      }}
                    >
                      + Tag
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="min-h-9 flex-1 rounded-lg bg-accent-soft px-2 text-[12px] font-semibold text-accent active:opacity-80"
                    onClick={() => onLoad(b.id)}
                  >
                    Laden
                  </button>
                  <button
                    className="min-h-9 flex-1 rounded-lg border border-line px-2 text-[12px] font-semibold text-ink active:bg-card-2"
                    onClick={() => {
                      setRenameId(b.id)
                      setRenameVal(b.title)
                      setConfirmId(null)
                    }}
                  >
                    Umbenennen
                  </button>
                  <button
                    className={`min-h-9 flex-1 rounded-lg px-2 text-[12px] font-semibold active:opacity-80 ${
                      confirmId === b.id
                        ? 'bg-crit text-white'
                        : 'bg-crit-soft text-crit'
                    }`}
                    onClick={() => {
                      if (confirmId === b.id) {
                        setConfirmId(null)
                        onDelete(b.id)
                      } else {
                        setConfirmId(b.id)
                      }
                    }}
                  >
                    {confirmId === b.id ? 'Wirklich löschen?' : 'Löschen'}
                  </button>
                </div>
              </>
            )}
          </Card>
        ))}
      </div>
    </Sheet>
  )
}

/* ---------- Hauptscreen ---------- */

export default function TaktikScreen() {
  const [board, setBoard] = useState<TacticsBoard | null>(null)
  const boardRef = useRef<TacticsBoard | null>(null)
  boardRef.current = board

  const [mode, setMode] = useState<'move' | 'record'>('move')
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [liveTokenId, setLiveTokenId] = useState<string | null>(null)
  const [livePath, setLivePath] = useState<Pt[] | null>(null)
  const [trayOpen, setTrayOpen] = useState(false)
  const [ghost, setGhostState] = useState<{ kind: MaterialKind; x: number; y: number } | null>(null)
  const [sheetView, setSheetView] = useState<'boards' | 'new' | null>(null)
  const [presetDesc, setPresetDesc] = useState<string | null>(null)
  const [popover, setPopover] = useState<{
    kind: 'path' | 'material'
    id: string
    title: string
    x: number
    y: number
    below: boolean
  } | null>(null)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const tokenEls = useRef(new Map<string, SVGGElement>())
  const skipPersistRef = useRef(true)
  const pendingPersistRef = useRef(false)
  const ghostRef = useRef<typeof ghost>(null)
  const matDragRef = useRef<{
    kind: MaterialKind
    pointerId: number
    startClientX: number
    startClientY: number
    moved: boolean
  } | null>(null)

  const reducedMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  /* ---- Laden & Persistenz (debounced ~400 ms) ---- */

  useEffect(() => {
    let alive = true
    void (async () => {
      const latest = await db.boards.orderBy('updatedAt').reverse().limit(1).toArray()
      if (!alive) return
      let b = latest[0]
      if (!b) {
        b = buildPresetBoard(PRESETS[0])
        await db.boards.put(b)
        if (!alive) return
        setPresetDesc(PRESETS[0].description)
      }
      skipPersistRef.current = true
      setBoard(b)
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!board) return
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    pendingPersistRef.current = true
    const timer = window.setTimeout(() => {
      pendingPersistRef.current = false
      void db.boards.put({ ...board, updatedAt: new Date().toISOString() })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [board])

  // Beim Verlassen ausstehende Änderungen sofort sichern.
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (pendingPersistRef.current && boardRef.current) {
        void db.boards.put({ ...boardRef.current, updatedAt: new Date().toISOString() })
      }
    },
    [],
  )

  /* ---- Anzeige-Helfer (Animation läuft direkt am DOM) ---- */

  const registerTokenEl = useCallback(
    (id: string) => (el: SVGGElement | null) => {
      if (el) tokenEls.current.set(id, el)
      else tokenEls.current.delete(id)
    },
    [],
  )

  const setTokenTransform = useCallback((id: string, x: number, y: number) => {
    tokenEls.current
      .get(id)
      ?.setAttribute('transform', `translate(${(x * FIELD_W).toFixed(2)} ${(y * FIELD_H).toFixed(2)})`)
  }, [])

  const seek = useCallback(
    (u: number) => {
      const b = boardRef.current
      if (!b) return
      for (const t of b.tokens) {
        if (!t.path || t.path.length < 2) continue
        // Ball ~1,3× schneller = Pass kommt vor den Läuferinnen an
        const uu = t.kind === 'ball' ? Math.min(1, u * 1.3) : u
        const p = pointAtPath(t.path, easeInOut(uu))
        setTokenTransform(t.id, p.x, p.y)
      }
    },
    [setTokenTransform],
  )

  const stopPlay = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setPlaying(false)
  }, [])

  /** Alle Figuren zurück an ihre Startpunkte (Wege bleiben). */
  const resetPositions = useCallback(() => {
    stopPlay()
    setStep(0)
    setBoard((b) =>
      b
        ? {
            ...b,
            tokens: b.tokens.map((t) =>
              t.path && t.path.length > 1 ? { ...t, x: t.path[0].x, y: t.path[0].y } : t,
            ),
          }
        : b,
    )
    const b = boardRef.current
    if (b) {
      for (const t of b.tokens) {
        const hasPath = t.path && t.path.length > 1
        setTokenTransform(t.id, hasPath ? t.path![0].x : t.x, hasPath ? t.path![0].y : t.y)
      }
    }
  }, [stopPlay, setTokenTransform])

  // Replay- und Moduswechsel-sicher: Animation stoppen, Anzeige = Zustand.
  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setPlaying(false)
    setStep(0)
    const b = boardRef.current
    if (b) for (const t of b.tokens) setTokenTransform(t.id, t.x, t.y)
  }, [mode, board?.id, board?.field, setTokenTransform])

  /* ---- Abspielen ---- */

  const movers = board?.tokens.filter((t) => t.path && t.path.length > 1) ?? []

  const onPlayPress = () => {
    if (movers.length === 0) return
    setPopover(null)
    if (reducedMotion) {
      // Schritt-Modus bei reduzierter Bewegung: 0 % → 25 % → 50 % → 75 % → 100 %
      const next = step >= 4 ? 0 : step + 1
      setStep(next)
      if (next === 0) resetPositions()
      else seek(next / 4)
      return
    }
    stopPlay()
    const maxLen = movers.reduce((m, t) => Math.max(m, pathLenM(t.path!)), 0)
    // ~2,5 s für einen 10-m-Weg, skaliert mit dem längsten Weg
    const dur = Math.min(4200, Math.max(1400, maxLen * 250))
    seek(0)
    setPlaying(true)
    const t0 = performance.now()
    const frame = (now: number) => {
      const u = Math.min(1, (now - t0) / dur)
      seek(u)
      if (u < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        rafRef.current = null
        setPlaying(false)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  /* ---- Board-Mutationen ---- */

  const moveToken = useCallback((id: string, x: number, y: number) => {
    setBoard((b) =>
      b ? { ...b, tokens: b.tokens.map((t) => (t.id === id ? { ...t, x, y } : t)) } : b,
    )
  }, [])

  const moveMaterial = useCallback((id: string, x: number, y: number) => {
    setBoard((b) =>
      b ? { ...b, materials: b.materials.map((m) => (m.id === id ? { ...m, x, y } : m)) } : b,
    )
  }, [])

  const commitPath = useCallback((id: string, pts: Pt[]) => {
    setBoard((b) =>
      b
        ? {
            ...b,
            tokens: b.tokens.map((t) =>
              t.id === id ? { ...t, path: pts, x: pts[0].x, y: pts[0].y } : t,
            ),
          }
        : b,
    )
  }, [])

  const openPopover = (kind: 'path' | 'material', id: string, clientX: number, clientY: number) => {
    const b = boardRef.current
    if (!b) return
    let title: string
    if (kind === 'path') {
      const t = b.tokens.find((x) => x.id === id)
      title =
        t?.kind === 'ball'
          ? 'Passweg · Ball'
          : `Laufweg · ${t?.kind === 'opp' ? `Abwehr ${t.label ?? ''}` : (t?.label ?? 'Figur')}`
    } else {
      const m = b.materials.find((x) => x.id === id)
      if (!m) return
      title = MATERIAL_LABEL[m.kind]
    }
    setSelectedId(null)
    setPopover({
      kind,
      id,
      title,
      x: Math.min(window.innerWidth - 100, Math.max(100, clientX)),
      y: clientY,
      below: clientY < 170,
    })
  }

  const onPopoverDelete = () => {
    const p = popover
    if (!p) return
    setPopover(null)
    if (p.kind === 'path') {
      setBoard((b) =>
        b
          ? { ...b, tokens: b.tokens.map((t) => (t.id === p.id ? { ...t, path: undefined } : t)) }
          : b,
      )
    } else {
      setBoard((b) => (b ? { ...b, materials: b.materials.filter((m) => m.id !== p.id) } : b))
    }
  }

  const dragHandlers = useBoardDrag({
    mode,
    field: board?.field ?? 'half',
    disabled: playing,
    getToken: (id) => boardRef.current?.tokens.find((t) => t.id === id),
    getMaterial: (id) => boardRef.current?.materials.find((m) => m.id === id),
    moveToken,
    moveMaterial,
    commitPath,
    onTapToken: (id) => {
      setPopover(null)
      setSelectedId((s) => (s === id ? null : id))
    },
    onTapMaterial: (id, cx, cy) => openPopover('material', id, cx, cy),
    onTapPath: (id, cx, cy) => openPopover('path', id, cx, cy),
    onTapBackground: () => {
      setPopover(null)
      setSelectedId(null)
    },
    onLiveRecord: (id, pts) => {
      setLiveTokenId(id)
      setLivePath(pts ? pts.slice() : null)
    },
    onDragStart: () => setPopover(null),
  })

  /* ---- Feld / Abwehr / Presets / Züge ---- */

  const hasOpp = board?.tokens.some((t) => t.kind === 'opp') ?? false

  const toggleDefense = () => {
    stopPlay()
    setStep(0)
    setBoard((b) => {
      if (!b) return b
      return b.tokens.some((t) => t.kind === 'opp')
        ? { ...b, tokens: b.tokens.filter((t) => t.kind !== 'opp') }
        : { ...b, tokens: [...b.tokens, ...oppDefenseTokens()] }
    })
  }

  const setField = (f: 'full' | 'half') => {
    stopPlay()
    setStep(0)
    setBoard((b) => {
      if (!b || b.field === f) return b
      if (f === 'full') return { ...b, field: f }
      // Halbfeld: alles in die sichtbare Angriffshälfte holen, Wege mitschieben
      const maxY = (FIELD_H / 2 - 0.6) / FIELD_H
      const tokens = b.tokens.map((t) => {
        const ny = Math.min(t.y, maxY)
        const pathBelow = t.path?.some((p) => p.y > maxY) ?? false
        if (ny === t.y && !pathBelow) return t
        const dy = ny - t.y
        const path = t.path?.map((p) => ({
          x: p.x,
          y: Math.min(maxY, Math.max(0.015, p.y + dy)),
        }))
        return { ...t, y: ny, path }
      })
      const materials = b.materials.map((m) => (m.y > maxY ? { ...m, y: maxY } : m))
      return { ...b, field: f, tokens, materials }
    })
  }

  const resetTransient = useCallback(() => {
    stopPlay()
    setStep(0)
    setSelectedId(null)
    setPopover(null)
    setLiveTokenId(null)
    setLivePath(null)
  }, [stopPlay])

  const loadPreset = (p: TaktikPreset) => {
    resetTransient()
    const built = p.build()
    setBoard((b) =>
      b ? { ...b, title: p.title, field: p.field, tokens: built.tokens, materials: built.materials } : b,
    )
    setPresetDesc(p.description)
  }

  const loadBoard = (id: string) => {
    void (async () => {
      const b = await db.boards.get(id)
      if (!b) return
      skipPersistRef.current = true
      setBoard(b)
      resetTransient()
      setPresetDesc(null)
      setSheetView(null)
    })()
  }

  const createBoard = (kind: NewBoardKind) => {
    void (async () => {
      const nb = makeNewBoard(kind)
      await db.boards.put(nb)
      skipPersistRef.current = true
      setBoard(nb)
      resetTransient()
      setPresetDesc(null)
      setSheetView(null)
    })()
  }

  const renameBoard = (id: string, title: string) => {
    void db.boards.update(id, { title, updatedAt: new Date().toISOString() })
    if (boardRef.current?.id === id) {
      skipPersistRef.current = true
      setBoard((b) => (b ? { ...b, title } : b))
    }
  }

  const deleteBoard = (id: string) => {
    void (async () => {
      await db.boards.delete(id)
      if (boardRef.current?.id !== id) return
      const rest = await db.boards.orderBy('updatedAt').reverse().limit(1).toArray()
      let nb = rest[0]
      if (!nb) {
        nb = makeNewBoard('leer')
        await db.boards.put(nb)
      }
      skipPersistRef.current = true
      setBoard(nb)
      resetTransient()
      setPresetDesc(null)
    })()
  }

  /* ---- Material aus der Ablage aufs Feld ziehen ---- */

  const setGhost = (g: { kind: MaterialKind; x: number; y: number } | null) => {
    ghostRef.current = g
    setGhostState(g)
  }

  const addMaterial = (kind: MaterialKind, x: number, y: number) => {
    setBoard((b) => (b ? { ...b, materials: [...b.materials, { id: uid(), kind, x, y }] } : b))
  }

  const matPointerDown = (kind: MaterialKind) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    matDragRef.current = {
      kind,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* unkritisch */
    }
  }

  const matPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = matDragRef.current
    const svg = svgRef.current
    if (!d || e.pointerId !== d.pointerId || !svg) return
    if (Math.abs(e.clientX - d.startClientX) + Math.abs(e.clientY - d.startClientY) > 6) {
      d.moved = true
    }
    if (!d.moved) return
    const fieldMode = boardRef.current?.field ?? 'half'
    const raw = svgPointNorm(svg, e.clientX, e.clientY)
    const inCourt =
      raw.x > -0.06 && raw.x < 1.06 && raw.y > -0.05 && raw.y < (fieldMode === 'half' ? 0.55 : 1.05)
    setGhost(inCourt ? { kind: d.kind, ...clampNorm(raw, fieldMode) } : null)
  }

  const matPointerEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = matDragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    matDragRef.current = null
    const g = ghostRef.current
    setGhost(null)
    if (e.type === 'pointercancel') return
    if (g) {
      addMaterial(g.kind, g.x, g.y)
    } else if (!d.moved) {
      // Antippen: in der Feldmitte ablegen, leicht versetzt je Anzahl
      const b = boardRef.current
      const n = b?.materials.length ?? 0
      const fieldMode = b?.field ?? 'half'
      const p = clampNorm(
        {
          x: 0.5 + ((n % 3) - 1) * 0.13,
          y: (fieldMode === 'half' ? 0.3 : 0.5) + ((Math.floor(n / 3) % 3) - 1) * 0.055,
        },
        fieldMode,
      )
      addMaterial(d.kind, p.x, p.y)
    }
  }

  /* ---- Render ---- */

  if (!board) {
    return (
      <div className="flex h-[50dvh] items-center justify-center font-display uppercase tracking-wide text-muted">
        Lädt …
      </div>
    )
  }

  const hint = mode === 'record' ? HINT_RECORD : (presetDesc ?? HINT_DEFAULT)
  const playLabel = reducedMotion
    ? step === 0
      ? 'Schritt'
      : `Schritt ${step}/4`
    : playing
      ? 'Läuft …'
      : 'Abspielen'

  return (
    <div className="flex flex-col">
      {/* Kopfzeile: Titel (inline editierbar) + Meine Züge */}
      <div className="flex items-center gap-2">
        <input
          value={board.title}
          onChange={(e) => setBoard((b) => (b ? { ...b, title: e.target.value } : b))}
          aria-label="Name des Spielzugs — antippen zum Umbenennen"
          placeholder="Name des Spielzugs"
          className="min-w-0 flex-1 border-b border-dashed border-muted/60 bg-transparent pb-1 font-display text-[18px] font-bold uppercase tracking-wide text-ink outline-none focus:border-accent"
        />
        <button
          onClick={() => setSheetView('boards')}
          className="inline-flex min-h-11 flex-none items-center gap-1.5 rounded-xl bg-accent-soft px-3 font-display text-[12px] font-bold uppercase tracking-wide text-accent active:opacity-80"
        >
          <Icon d={IC_BOOKMARK} className="h-4 w-4" />
          Meine Züge
        </button>
      </div>

      {/* Feld-Umschalter + Chips */}
      <div className="mt-2 flex items-center gap-2">
        <div className="w-32 flex-none">
          <Segmented<'full' | 'half'>
            options={[
              { value: 'full', label: 'Ganz' },
              { value: 'half', label: 'Halb' },
            ]}
            value={board.field}
            onChange={setField}
          />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          <Chip pressed={hasOpp} onClick={toggleDefense}>
            <Icon d={IC_SHIELD} /> Abwehr einblenden
          </Chip>
          <Chip pressed={trayOpen} onClick={() => setTrayOpen((v) => !v)}>
            <Icon d={IC_CONE} /> Material
          </Chip>
          {PRESETS.map((p) => (
            <Chip key={p.id} onClick={() => loadPreset(p)}>
              <Icon d={IC_PLAY} /> {p.chip}
            </Chip>
          ))}
          <Chip onClick={() => setSheetView('new')}>
            <Icon d={IC_PLUS} /> Neuer Zug
          </Chip>
        </div>
      </div>

      {/* Material-Ablage (aufs Feld ziehen) */}
      {trayOpen && (
        <div
          className="mt-2 flex items-stretch gap-1.5 overflow-x-auto py-0.5"
          aria-label="Trainingsmaterial — aufs Feld ziehen oder antippen zum Platzieren"
        >
          {MATERIAL_KINDS.map((k) => (
            <button
              key={k}
              onPointerDown={matPointerDown(k)}
              onPointerMove={matPointerMove}
              onPointerUp={matPointerEnd}
              onPointerCancel={matPointerEnd}
              style={{ touchAction: 'none' }}
              className="flex min-h-[60px] min-w-16 flex-none flex-col items-center justify-center gap-1 rounded-xl border border-line bg-card px-2 py-1.5 text-[10px] font-semibold text-muted active:border-accent"
            >
              <svg viewBox="-2 -2 4 4" className="h-6 w-6" aria-hidden="true">
                <MatGlyph kind={k} />
              </svg>
              {MATERIAL_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      {/* Feld */}
      <div
        className="relative mt-2 overflow-hidden rounded-2xl border border-line shadow-card"
        style={{
          background: COURT_FLOOR,
          height: trayOpen ? 'calc(100dvh - 384px)' : 'calc(100dvh - 312px)',
          minHeight: 300,
          maxHeight: 640,
        }}
      >
        {mode === 'record' && (
          <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-crit px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-widest text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
            Aufzeichnen
          </span>
        )}
        <Court
          field={board.field}
          tokens={board.tokens}
          materials={board.materials}
          selectedId={selectedId}
          liveTokenId={liveTokenId}
          livePath={livePath}
          ghost={ghost}
          svgRef={svgRef}
          registerTokenEl={registerTokenEl}
          {...dragHandlers}
        />
      </div>

      {/* Aktionen */}
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Segmented<'move' | 'record'>
            options={[
              { value: 'move', label: 'Bewegen' },
              { value: 'record', label: 'Aufzeichnen' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
        <Button onClick={onPlayPress} disabled={movers.length === 0} className="flex-none px-3">
          <Icon d={IC_PLAY} className="h-4 w-4" />
          {playLabel}
        </Button>
        <Button
          variant="secondary"
          onClick={resetPositions}
          aria-label="Zurücksetzen — Figuren zurück an die Startpunkte"
          className="flex-none px-3"
        >
          <Icon d={IC_RESET} className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-1.5 px-1 text-[11.5px] leading-snug text-muted">{hint}</p>

      {/* Popover: Weg / Material löschen */}
      {popover && (
        <>
          <button
            aria-label="Popover schließen"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setPopover(null)}
          />
          <div
            role="dialog"
            aria-label={popover.title}
            className="fixed z-50 w-44 rounded-xl border border-line bg-card p-1.5 shadow-card"
            style={{
              left: popover.x,
              top: popover.y,
              transform: popover.below ? 'translate(-50%, 16px)' : 'translate(-50%, calc(-100% - 16px))',
            }}
          >
            <p className="truncate px-2 py-1 text-[11px] font-semibold text-muted">{popover.title}</p>
            <button
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-[13px] font-semibold text-crit active:bg-crit-soft"
              onClick={onPopoverDelete}
            >
              <Icon d={IC_TRASH} className="h-4 w-4" />
              {popover.kind === 'path' ? 'Weg löschen' : 'Vom Feld entfernen'}
            </button>
          </div>
        </>
      )}

      {/* Sheets */}
      <BoardsSheet
        open={sheetView === 'boards'}
        onClose={() => setSheetView(null)}
        currentId={board.id}
        onLoad={loadBoard}
        onRename={renameBoard}
        onDelete={deleteBoard}
        onNew={() => setSheetView('new')}
      />
      <Sheet open={sheetView === 'new'} onClose={() => setSheetView(null)} title="Neuer Zug">
        <div className="flex flex-col gap-2">
          {NEW_BOARD_OPTIONS.map((o) => (
            <button
              key={o.kind}
              onClick={() => createBoard(o.kind)}
              className="rounded-xl border border-line bg-card-2 px-3 py-3 text-left active:border-accent"
            >
              <p className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">
                {o.title}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">{o.sub}</p>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
