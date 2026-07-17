import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../../lib/db'
import type { MatchEvent, Player } from '../../lib/types'
import { Badge, Button, Sheet } from '../../components/ui'
import { Avatar } from '../../components/Avatar'
import { fmtDayDate } from '../../lib/format'
import {
  type BerichtBlock,
  extractBlocks,
  findOwnBlockIndex,
  guessBlockTeam,
  matchPlayer,
  reconstructLines,
} from './spielbericht'

const SKIP = '__skip__'
const NEW_GUEST = '__new__'

interface PreviewRow {
  key: string
  pdfName: string
  raw: string
  /** Spielerinnen-ID, SKIP oder NEW_GUEST. */
  target: string
  goals: number
  bench: boolean
}

type Phase =
  | { t: 'pick' }
  | { t: 'parsing' }
  | { t: 'blocks'; blocks: BerichtBlock[] }
  | { t: 'preview'; rows: PreviewRow[] }
  | { t: 'manual' }
  | { t: 'done'; count: number }
  | { t: 'error'; message: string }

/**
 * PDF-Spielbericht-Import (nuLiga/nuScore): liest den Kader aus dem PDF,
 * ordnet ihn tolerant unserem Kader zu und schreibt Einsätze + Tore in den
 * Festspiel-Tracker. Fällt nie in eine Sackgasse: manuelle Erfassung als
 * Ausweg an jeder Stelle.
 */
export default function SpielberichtSheet({
  event,
  onClose,
}: {
  /** null = geschlossen. */
  event: MatchEvent | null
  onClose: () => void
}) {
  return (
    <Sheet open={event != null} onClose={onClose} title="Spielbericht importieren">
      {event && <SheetInner key={event.id} event={event} onClose={onClose} />}
    </Sheet>
  )
}

function SheetInner({ event, onClose }: { event: MatchEvent; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ t: 'pick' })
  const fileRef = useRef<HTMLInputElement>(null)

  const players = useLiveQuery(
    () => db.players.filter((p) => p.team === 'D1' || p.isGuest).toArray(),
    [],
  )
  const allPlayers = useLiveQuery(() => db.players.toArray(), [])
  const settings = useLiveQuery(() => db.settings.get('app'), [])

  async function onPickPdf(file: File | undefined) {
    if (!file || !allPlayers) return
    setPhase({ t: 'parsing' })
    try {
      const lines = await extractPdfLines(file)
      const blocks = extractBlocks(lines)
      if (blocks.length === 0) {
        setPhase({
          t: 'error',
          message:
            'Im PDF wurden keine Kader-Zeilen erkannt. Du kannst die Einsätze unten manuell erfassen.',
        })
        return
      }
      const own = findOwnBlockIndex(blocks, settings?.clubName ?? '')
      if (own >= 0) setPhase({ t: 'preview', rows: toPreview(blocks[own], allPlayers) })
      else setPhase({ t: 'blocks', blocks })
    } catch {
      setPhase({
        t: 'error',
        message:
          'Das PDF konnte nicht gelesen werden. Ist es ein nuLiga-Spielbericht? Alternativ unten manuell erfassen.',
      })
    }
  }

  function toPreview(block: BerichtBlock, roster: Player[]): PreviewRow[] {
    return block.rows.map((r, i) => {
      const hit = matchPlayer(r, roster)
      return {
        key: `${i}-${r.raw}`,
        pdfName: `${r.lastName}, ${r.firstName}${r.number != null ? ` (#${r.number})` : ''}`,
        raw: r.raw,
        target: hit?.id ?? SKIP,
        goals: r.goals,
        bench: false,
      }
    })
  }

  async function commit(rows: PreviewRow[]) {
    const chosen = rows.filter((r) => r.target !== SKIP)
    const existing = await db.appearances.where('eventId').equals(event.id).toArray()
    let count = 0
    await db.transaction('rw', [db.players, db.appearances], async () => {
      for (const r of chosen) {
        let playerId = r.target
        if (playerId === NEW_GUEST) {
          const [last, first] = r.pdfName.replace(/\s*\(#\d+\)$/, '').split(',')
          const p: Player = {
            id: uid(),
            firstName: (first ?? '').trim() || 'Unbekannt',
            lastName: (last ?? '').trim() || 'Unbekannt',
            mainPosition: 'RM',
            team: 'D2',
            isGuest: true,
            available: true,
            createdAt: new Date().toISOString(),
          }
          await db.players.add(p)
          playerId = p.id
        }
        const prev = existing.find((a) => a.playerId === playerId)
        if (prev) {
          await db.appearances.update(prev.id, { goals: r.goals, bench: r.bench })
        } else {
          await db.appearances.add({
            id: uid(),
            playerId,
            eventId: event.id,
            date: event.date,
            team: 'D1',
            goals: r.goals,
            bench: r.bench,
          })
        }
        count += 1
      }
    })
    setPhase({ t: 'done', count })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted">
        {fmtDayDate(event.date)}
        {event.time ? ` · ${event.time}` : ''} — Einsätze landen im Festspiel-Tracker
        (aufgeführt = Einsatz, Bank zählt laut §55 mit).
      </p>

      {phase.t === 'pick' && (
        <>
          <Button onClick={() => fileRef.current?.click()}>PDF auswählen</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              void onPickPdf(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <Button variant="ghost" onClick={() => setPhase({ t: 'manual' })}>
            Ohne PDF manuell erfassen
          </Button>
        </>
      )}

      {phase.t === 'parsing' && (
        <p className="py-6 text-center font-display uppercase tracking-wide text-muted">
          PDF wird gelesen …
        </p>
      )}

      {phase.t === 'error' && (
        <>
          <p className="rounded-xl bg-warn-soft p-3 text-[13px] font-semibold text-warn">
            {phase.message}
          </p>
          <Button variant="secondary" onClick={() => setPhase({ t: 'pick' })}>
            Anderes PDF versuchen
          </Button>
          <Button variant="ghost" onClick={() => setPhase({ t: 'manual' })}>
            Manuell erfassen
          </Button>
        </>
      )}

      {phase.t === 'blocks' && allPlayers && (
        <>
          <p className="text-[13px] font-semibold">
            Welcher Block ist unser Team? (Vereinsname war nicht eindeutig)
          </p>
          {phase.blocks.map((b, i) => (
            <button
              key={i}
              onClick={() => setPhase({ t: 'preview', rows: toPreview(b, allPlayers) })}
              className="rounded-xl border border-line bg-card-2 p-3 text-left"
            >
              <span className="font-display text-[14px] font-bold uppercase tracking-wide">
                {guessBlockTeam(b) ?? `Block ${String.fromCharCode(65 + i)}`}
              </span>
              <span className="block text-[12px] text-muted">
                {b.rows.length} Spielerinnen · z.B. {b.rows[0].lastName},{' '}
                {b.rows[0].firstName}
              </span>
            </button>
          ))}
        </>
      )}

      {phase.t === 'preview' && players && (
        <PreviewList
          rows={phase.rows}
          players={players}
          onChange={(rows) => setPhase({ t: 'preview', rows })}
          onCommit={(rows) => void commit(rows)}
        />
      )}

      {phase.t === 'manual' && players && (
        <ManualGrid players={players} onCommit={(rows) => void commit(rows)} />
      )}

      {phase.t === 'done' && (
        <>
          <p className="rounded-xl bg-ok-soft p-3 text-center text-[14px] font-bold text-ok">
            {phase.count} Einsätze übernommen — Festspiel-Tracker aktualisiert.
          </p>
          <Button onClick={onClose}>Fertig</Button>
        </>
      )}
    </div>
  )
}

/* ---------- Vorschau nach PDF-Parsing ---------- */

function PreviewList({
  rows,
  players,
  onChange,
  onCommit,
}: {
  rows: PreviewRow[]
  players: Player[]
  onChange: (rows: PreviewRow[]) => void
  onCommit: (rows: PreviewRow[]) => void
}) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => a.lastName.localeCompare(b.lastName, 'de')),
    [players],
  )
  const chosen = rows.filter((r) => r.target !== SKIP).length
  const matched = rows.filter((r) => r.target !== SKIP && r.target !== NEW_GUEST).length

  function patch(key: string, p: Partial<PreviewRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)))
  }

  return (
    <>
      <p className="text-[13px] text-muted">
        <span className="font-bold text-ink tnum">{matched}</span> von{' '}
        <span className="tnum">{rows.length}</span> Zeilen automatisch zugeordnet — bitte
        prüfen und anpassen.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.key} className="rounded-xl border border-line bg-card-2 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-bold">{r.pdfName}</span>
              {r.target === SKIP && <Badge tone="neutral">nicht übernehmen</Badge>}
              {r.target === NEW_GUEST && <Badge tone="guest">neu als Gast</Badge>}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <select
                aria-label={`Zuordnung für ${r.pdfName}`}
                className="min-h-11 w-full rounded-lg border border-line bg-card px-2 text-[13px]"
                value={r.target}
                onChange={(e) => patch(r.key, { target: e.target.value })}
              >
                <option value={SKIP}>— nicht übernehmen —</option>
                {sorted.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.lastName}, {p.firstName}
                    {p.number != null ? ` (#${p.number})` : ''}
                  </option>
                ))}
                <option value={NEW_GUEST}>+ Neue Spielerin (Gast) anlegen</option>
              </select>
              <label className="flex items-center gap-1 text-[12px] font-semibold text-muted">
                Tore
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={30}
                  className="tnum min-h-11 w-14 rounded-lg border border-line bg-card px-1.5 text-center text-[14px] font-bold"
                  value={r.goals}
                  onChange={(e) => patch(r.key, { goals: Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
              <label className="flex min-h-11 items-center gap-1.5 text-[12px] font-semibold text-muted">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={r.bench}
                  onChange={(e) => patch(r.key, { bench: e.target.checked })}
                />
                Bank
              </label>
            </div>
          </div>
        ))}
      </div>
      <Button disabled={chosen === 0} onClick={() => onCommit(rows)}>
        {chosen} Einsätze übernehmen
      </Button>
    </>
  )
}

/* ---------- Manuelle Erfassung (Fallback) ---------- */

function ManualGrid({
  players,
  onCommit,
}: {
  players: Player[]
  onCommit: (rows: PreviewRow[]) => void
}) {
  const [state, setState] = useState<Map<string, { in: boolean; goals: number; bench: boolean }>>(
    new Map(),
  )
  const sorted = useMemo(
    () => [...players].sort((a, b) => a.lastName.localeCompare(b.lastName, 'de')),
    [players],
  )
  const chosen = [...state.values()].filter((s) => s.in).length

  function patch(id: string, p: Partial<{ in: boolean; goals: number; bench: boolean }>) {
    setState((prev) => {
      const next = new Map(prev)
      const cur = next.get(id) ?? { in: false, goals: 0, bench: false }
      next.set(id, { ...cur, ...p })
      return next
    })
  }

  return (
    <>
      <p className="text-[13px] text-muted">
        Wer war beim Spiel dabei? (Bank zählt als Einsatz)
      </p>
      <div className="flex flex-col gap-1.5">
        {sorted.map((p) => {
          const s = state.get(p.id) ?? { in: false, goals: 0, bench: false }
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-xl border p-2 ${
                s.in ? 'border-accent bg-accent-soft' : 'border-line bg-card-2'
              }`}
            >
              <input
                type="checkbox"
                aria-label={`${p.firstName} ${p.lastName} dabei`}
                className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                checked={s.in}
                onChange={(e) => patch(p.id, { in: e.target.checked })}
              />
              <Avatar player={p} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {p.firstName} {p.lastName}
              </span>
              {s.in && (
                <>
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-muted">
                    Tore
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={30}
                      className="tnum min-h-11 w-12 rounded-lg border border-line bg-card px-1 text-center text-[13px] font-bold"
                      value={s.goals}
                      onChange={(e) =>
                        patch(p.id, { goals: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={s.bench}
                      onChange={(e) => patch(p.id, { bench: e.target.checked })}
                    />
                    Bank
                  </label>
                </>
              )}
            </div>
          )
        })}
      </div>
      <Button
        disabled={chosen === 0}
        onClick={() =>
          onCommit(
            sorted
              .filter((p) => state.get(p.id)?.in)
              .map((p) => {
                const s = state.get(p.id)!
                return {
                  key: p.id,
                  pdfName: `${p.lastName}, ${p.firstName}`,
                  raw: '',
                  target: p.id,
                  goals: s.goals,
                  bench: s.bench,
                }
              }),
          )
        }
      >
        {chosen} Einsätze übernehmen
      </Button>
    </>
  )
}

/* ---------- PDF-Extraktion (pdfjs lazy) ---------- */

async function extractPdfLines(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await task.promise
  try {
    const lines: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      const items = tc.items.flatMap((it) =>
        'str' in it
          ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, width: it.width as number }]
          : [],
      )
      lines.push(...reconstructLines(items))
    }
    return lines
  } finally {
    void task.destroy()
  }
}
