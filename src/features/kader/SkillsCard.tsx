import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db'
import type { Player } from '../../lib/types'
import { DEFAULT_SKILL_DIMENSIONS, MAX_SKILL_DIMENSIONS } from '../../lib/types'
import { Button, Card } from '../../components/ui'

/**
 * Spinnennetz-Analyse (Radar) pro Spielerin: Einstufung 0–10 je Dimension.
 * Dimensionen sind teamweit konfigurierbar (Settings.skillDimensions,
 * max. 10). Nur fürs Trainerteam — wird hinter dem TrainerGate gerendert.
 */
export function SkillsCard({ player }: { player: Player }) {
  const settings = useLiveQuery(() => db.settings.get('app'), [])
  const dims = settings?.skillDimensions ?? [...DEFAULT_SKILL_DIMENSIONS]
  const skills = player.skills ?? {}

  const [editing, setEditing] = useState(false)
  const [newDim, setNewDim] = useState('')
  const [dimError, setDimError] = useState<string | null>(null)

  async function setValue(dim: string, value: number) {
    const next = { ...skills, [dim]: Math.max(0, Math.min(10, value)) }
    await db.players.update(player.id, { skills: next })
  }

  async function addDimension() {
    const name = newDim.trim()
    setDimError(null)
    if (name === '') return
    if (dims.length >= MAX_SKILL_DIMENSIONS) {
      setDimError(`Maximal ${MAX_SKILL_DIMENSIONS} Dimensionen.`)
      return
    }
    if (dims.some((d) => d.toLowerCase() === name.toLowerCase())) {
      setDimError('Diese Dimension gibt es schon.')
      return
    }
    await db.settings.update('app', { skillDimensions: [...dims, name] })
    setNewDim('')
  }

  async function removeDimension(dim: string) {
    await db.settings.update('app', {
      skillDimensions: dims.filter((d) => d !== dim),
    })
  }

  const rated = dims.filter((d) => skills[d] != null)

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-muted">
          Fähigkeiten · Spinnennetz
        </h3>
        <button
          className="min-h-11 px-1 text-[13px] font-bold text-accent"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? 'Fertig' : 'Einstufen'}
        </button>
      </div>

      {rated.length >= 3 ? (
        <RadarChart dims={dims} skills={skills} />
      ) : (
        <p className="py-4 text-center text-[13px] text-muted">
          {rated.length === 0
            ? 'Noch keine Einstufung — tippe auf „Einstufen".'
            : 'Mindestens 3 bewertete Dimensionen ergeben ein Netz.'}
        </p>
      )}

      {editing && (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
          {dims.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate text-[13px] font-semibold">{d}</span>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={skills[d] ?? 0}
                aria-label={`${d}: ${skills[d] ?? 0} von 10`}
                onChange={(e) => void setValue(d, Number(e.target.value))}
                className="min-h-11 min-w-0 flex-1 accent-[var(--accent)]"
              />
              <span className="w-6 shrink-0 text-right text-[14px] font-bold tnum">
                {skills[d] ?? '–'}
              </span>
              <button
                aria-label={`Dimension ${d} entfernen`}
                className="inline-flex h-11 w-8 shrink-0 items-center justify-center text-muted active:text-crit"
                onClick={() => void removeDimension(d)}
              >
                ×
              </button>
            </div>
          ))}
          {dims.length < MAX_SKILL_DIMENSIONS && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void addDimension()
              }}
            >
              <input
                value={newDim}
                onChange={(e) => setNewDim(e.target.value)}
                placeholder="Neue Dimension, z.B. 7m-Sicherheit"
                maxLength={24}
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card-2 px-3 text-[13px]"
              />
              <Button type="submit" variant="secondary" disabled={newDim.trim() === ''}>
                +
              </Button>
            </form>
          )}
          {dimError && <p className="text-[12px] font-semibold text-crit">{dimError}</p>}
          <p className="text-[11px] text-muted">
            Dimensionen gelten fürs ganze Team ({dims.length} / {MAX_SKILL_DIMENSIONS}).
            Entfernen blendet nur aus — Werte bleiben gespeichert.
          </p>
        </div>
      )}
    </Card>
  )
}

/* ---------- Radar-SVG ---------- */

function RadarChart({
  dims,
  skills,
}: {
  dims: string[]
  skills: Record<string, number>
}) {
  const size = 360
  const cx = size / 2
  const cy = size / 2 + 6
  const R = 92
  const n = dims.length
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i: number, r: number): [number, number] => [
    cx + Math.cos(angle(i)) * r,
    cy + Math.sin(angle(i)) * r,
  ]
  const ringPath = (r: number) =>
    dims.map((_, i) => pt(i, r).join(',')).join(' ')
  const valuePoints = dims.map((d, i) => pt(i, ((skills[d] ?? 0) / 10) * R))

  return (
    <svg
      viewBox={`0 0 ${size} ${size - 40}`}
      className="mx-auto mt-1 w-full max-w-[340px]"
      role="img"
      aria-label={`Spinnennetz: ${dims.map((d) => `${d} ${skills[d] ?? 0} von 10`).join(', ')}`}
    >
      {[2, 4, 6, 8, 10].map((v) => (
        <polygon
          key={v}
          points={ringPath((v / 10) * R)}
          fill="none"
          stroke="var(--line)"
          strokeWidth={v === 10 ? 1.5 : 1}
        />
      ))}
      {dims.map((_, i) => {
        const [x, y] = pt(i, R)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />
      })}
      <polygon
        points={valuePoints.map((p) => p.join(',')).join(' ')}
        fill="var(--accent)"
        fillOpacity="0.18"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {valuePoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="var(--accent)" />
      ))}
      {dims.map((d, i) => {
        const [x, y] = pt(i, R + 16)
        const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end'
        return (
          <text
            key={d}
            x={x}
            y={y + 4}
            textAnchor={anchor}
            fontSize="11"
            fontWeight="600"
            fill="var(--muted)"
          >
            {d} <tspan fill="var(--ink)" fontWeight="700">{skills[d] ?? '–'}</tspan>
          </text>
        )
      })}
    </svg>
  )
}
