import type { Player, Position, SquadNomination } from '../../lib/types'
import { POSITIONS, POSITION_LABEL } from '../../lib/types'
import { initials, playerName } from '../../lib/format'

/**
 * Feld-Ansicht der Kaderplanung: angreifende Hälfte hochkant (Tor oben),
 * Geometrie transponiert aus dem V4-Design (design-c-vereinsfarben.html).
 * Nominierte Spielerinnen clustern als Avatar-Chips an ihrer Positionszone.
 */

export const FIELD_VIEWBOX = { x: -1, y: -1, w: 22, h: 22 }

interface Zone {
  x: number
  y: number
  /** Richtung, in die weitere Chips derselben Zone auffächern. */
  dir: [number, number]
}

/** Positionszonen in Feld-Koordinaten (Tor oben bei y=0, Mittellinie y=20). */
export const FIELD_ZONES: Record<Position, Zone> = {
  TW: { x: 10, y: 1.4, dir: [0, 1] },
  LA: { x: 2.7, y: 4.7, dir: [1, 0.35] },
  RA: { x: 17.3, y: 4.7, dir: [-1, 0.35] },
  KM: { x: 10, y: 7.6, dir: [0, 1] },
  RL: { x: 5.2, y: 12.4, dir: [0, 1] },
  RM: { x: 10, y: 14.4, dir: [0, 1] },
  RR: { x: 14.8, y: 12.4, dir: [0, 1] },
}

/** Nächstgelegene Positionszone zu einem Punkt in Feld-Koordinaten. */
export function nearestZone(x: number, y: number): Position {
  let best: Position = 'TW'
  let bd = Infinity
  for (const pos of POSITIONS) {
    const z = FIELD_ZONES[pos]
    const d = (x - z.x) ** 2 + (y - z.y) ** 2
    if (d < bd) {
      bd = d
      best = pos
    }
  }
  return best
}

const CLUSTER_OFFSETS: [number, number][] = [
  [0, 0], [1.7, -1.15], [1.7, 1.15], [3.4, 0],
  [3.4, -2.3], [3.4, 2.3], [5.1, -1.15], [5.1, 1.15],
]

function clusterPoint(pos: Position, i: number): [number, number] {
  const z = FIELD_ZONES[pos]
  const len = Math.hypot(z.dir[0], z.dir[1])
  const ux = z.dir[0] / len
  const uy = z.dir[1] / len
  const off = CLUSTER_OFFSETS[Math.min(i, CLUSTER_OFFSETS.length - 1)]
  return [
    Math.min(19.2, Math.max(0.8, z.x + ux * off[0] + -uy * off[1])),
    Math.min(20.1, Math.max(-0.2, z.y + uy * off[0] + ux * off[1])),
  ]
}

const lineStyle: React.CSSProperties = {
  stroke: 'color-mix(in srgb, var(--accent) 62%, var(--line))',
  strokeWidth: 0.16,
  fill: 'none',
  strokeLinecap: 'round',
}

const svgFont: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  pointerEvents: 'none',
}

export default function FieldView({
  nominations,
  playersById,
  hotZone,
  dragPlayerId,
  onTokenPress,
  onTokenClick,
}: {
  nominations: SquadNomination[]
  playersById: Map<string, Player>
  /** Zone, die beim Ziehen hervorgehoben wird (Einrasten-Vorschau). */
  hotZone: Position | null
  /** Spielerin, die gerade gezogen wird (Token abgedimmt). */
  dragPlayerId: string | null
  onTokenPress: (e: React.PointerEvent, playerId: string, from: Position) => void
  onTokenClick: (playerId: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <svg
        data-drop-field
        viewBox={`${FIELD_VIEWBOX.x} ${FIELD_VIEWBOX.y} ${FIELD_VIEWBOX.w} ${FIELD_VIEWBOX.h}`}
        className="block h-auto w-full select-none"
        role="application"
        aria-label="Feld-Ansicht — Spielerinnen auf Positionszonen ziehen"
      >
        {/* Boden + Spielfeldlinien (Tor oben) */}
        <g aria-hidden="true">
          <rect x={-1} y={-1} width={22} height={22} style={{ fill: 'color-mix(in srgb, var(--club-700) 7%, var(--card))' }} />
          <path d="M2.5 0 A6 6 0 0 0 8.5 6 L11.5 6 A6 6 0 0 0 17.5 0 Z" style={{ fill: 'color-mix(in srgb, var(--accent) 13%, transparent)' }} />
          <rect x={0} y={0} width={20} height={20} rx={0.3} style={lineStyle} />
          {/* 6-m-Kreisraum */}
          <path d="M2.5 0 A6 6 0 0 0 8.5 6 L11.5 6 A6 6 0 0 0 17.5 0" style={lineStyle} />
          {/* 9-m-Linie, gestrichelt */}
          <path d="M0 2.96 A9 9 0 0 0 8.5 9 L11.5 9 A9 9 0 0 0 20 2.96" style={{ ...lineStyle, strokeDasharray: '0.8 0.55' }} />
          {/* 7-m-Strich + 4-m-Torwartgrenze */}
          <line x1={9.4} y1={7} x2={10.6} y2={7} style={lineStyle} />
          <line x1={9.65} y1={4} x2={10.35} y2={4} style={lineStyle} />
          {/* Tor */}
          <rect x={8.5} y={-0.45} width={3} height={0.45} style={{ fill: 'var(--accent)' }} />
        </g>

        {/* Positionszonen */}
        <g aria-hidden="true">
          {POSITIONS.map((pos) => {
            const z = FIELD_ZONES[pos]
            const hot = hotZone === pos
            return (
              <g key={pos}>
                <circle
                  cx={z.x}
                  cy={z.y}
                  r={2.05}
                  style={{
                    fill: hot
                      ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
                      : 'color-mix(in srgb, var(--accent) 7%, transparent)',
                    stroke: hot ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 42%, var(--line))',
                    strokeWidth: hot ? 0.24 : 0.14,
                    strokeDasharray: hot ? undefined : '0.6 0.45',
                  }}
                />
                <text
                  x={z.x}
                  y={z.y + 0.38}
                  textAnchor="middle"
                  style={{
                    ...svgFont,
                    fontSize: '1.05px',
                    letterSpacing: '0.05em',
                    fill: 'color-mix(in srgb, var(--accent) 70%, var(--muted))',
                  }}
                >
                  {pos}
                </text>
              </g>
            )
          })}
        </g>

        {/* Nominierte als Figuren an ihrer Zone */}
        {POSITIONS.map((pos) =>
          nominations
            .filter((n) => n.position === pos)
            .map((n, i) => {
              const p = playersById.get(n.playerId)
              if (!p) return null
              const [x, y] = clusterPoint(pos, i)
              return (
                <g
                  key={n.playerId}
                  transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${playerName(p)} — ${POSITION_LABEL[pos]}, antippen zum Verschieben oder Entfernen`}
                  style={{ cursor: 'grab', opacity: dragPlayerId === n.playerId ? 0.35 : 1 }}
                  onPointerDown={(e) => onTokenPress(e, n.playerId, pos)}
                  onClick={() => onTokenClick(n.playerId)}
                >
                  <circle r={1.7} fill="transparent" />
                  <circle
                    r={1.12}
                    style={{
                      fill: 'var(--btn-bg)',
                      stroke: 'color-mix(in srgb, var(--club-on) 65%, transparent)',
                      strokeWidth: 0.12,
                    }}
                  />
                  <text y={0.3} textAnchor="middle" style={{ ...svgFont, fontSize: '0.78px', fill: 'var(--btn-ink)' }}>
                    {initials(p.firstName, p.lastName)}
                  </text>
                  {p.isGuest && (
                    <>
                      <circle
                        cx={0.95}
                        cy={-0.95}
                        r={0.52}
                        style={{
                          fill: 'var(--club-acc)',
                          stroke: 'color-mix(in srgb, var(--club-acc-ink) 30%, transparent)',
                          strokeWidth: 0.06,
                        }}
                      />
                      <text x={0.95} y={-0.74} textAnchor="middle" style={{ ...svgFont, fontSize: '0.58px', fill: 'var(--club-acc-ink)' }}>
                        G
                      </text>
                    </>
                  )}
                </g>
              )
            }),
        )}
      </svg>
    </div>
  )
}
