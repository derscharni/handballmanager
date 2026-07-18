import type { PointerEventHandler, ReactNode, Ref } from 'react'
import type { BoardMaterial, BoardToken, MaterialKind } from '../../lib/types'
import { FIELD_H, FIELD_W } from './presets'
import type { Pt } from './useBoardDrag'

/**
 * Handballfeld hochkant (Tore oben/unten) als SVG in Meter-Koordinaten:
 * x 0..20, y 0..40 — normierte Token-Koordinaten werden mit 20/40 skaliert.
 * Halbfeld = Angriffshälfte oben (nur anderer viewBox-Ausschnitt).
 *
 * Look "Kreidetafel": dunkle Tafel mit Wischspuren; die Spielfeldlinien
 * sind — wie alles auf der Tafel — mit weißer Kreide gezogen: leicht
 * wacklig (Turbulenz-Filter), korrekt vermessen, 9m gestrichelt.
 */

export const COURT_FLOOR = 'color-mix(in srgb, var(--club-900) 12%, #191d20)'
/* Kreide auf der Tafel */
export const CHALK = '#eef1ec'
export const CHALK_DIM = 'rgba(238, 241, 236, 0.6)'
const CHALK_LINE = 'rgba(238, 241, 236, 0.92)'
const AREA_FILL = 'rgba(238, 241, 236, 0.05)'

const VIEWBOX_FULL = '-1.1 -1.7 22.2 43.4'
const VIEWBOX_HALF = '-1.1 -1.7 22.2 22.6'

function FieldLines() {
  const s = {
    stroke: CHALK_LINE,
    strokeWidth: 0.2,
    fill: 'none',
    strokeLinecap: 'round' as const,
  }
  return (
    <g aria-hidden="true">
      <defs>
        {/* Kreide-Wackler: verschiebt die Linien minimal entlang eines
            Rauschfelds — Handstrich-Optik, Geometrie bleibt korrekt. */}
        <filter id="chalk-rough" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="0.3" />
        </filter>
      </defs>
      <rect x={-1.1} y={-1.7} width={22.2} height={43.4} fill={COURT_FLOOR} />
      {/* Kreide-Wischspuren auf der Tafel */}
      <ellipse cx={5} cy={11} rx={8} ry={4.5} fill="rgba(255,255,255,0.035)" />
      <ellipse cx={15} cy={27} rx={9} ry={5} fill="rgba(255,255,255,0.03)" />
      <ellipse cx={7} cy={35} rx={7} ry={4} fill="rgba(255,255,255,0.04)" />
      <g filter="url(#chalk-rough)">
        {/* Torraum-Zonen: hauchdünn schraffiert wirkende Kreidefläche */}
        <path fill={AREA_FILL} d="M2.5 0 A6 6 0 0 0 8.5 6 L11.5 6 A6 6 0 0 0 17.5 0 Z" />
        <path fill={AREA_FILL} d="M2.5 40 A6 6 0 0 1 8.5 34 L11.5 34 A6 6 0 0 1 17.5 40 Z" />
        {/* Außenlinien */}
        <rect {...s} x={0} y={0} width={FIELD_W} height={FIELD_H} rx={0.3} />
        {/* 6-m-Räume: zwei Viertelkreise um die Pfosten + gerades Mittelstück */}
        <path {...s} d="M2.5 0 A6 6 0 0 0 8.5 6 L11.5 6 A6 6 0 0 0 17.5 0" />
        <path {...s} d="M2.5 40 A6 6 0 0 1 8.5 34 L11.5 34 A6 6 0 0 1 17.5 40" />
        {/* 9-m-Linien (gestrichelt) */}
        <path {...s} strokeDasharray="0.8 0.55" d="M0 2.96 A9 9 0 0 0 8.5 9 L11.5 9 A9 9 0 0 0 20 2.96" />
        <path {...s} strokeDasharray="0.8 0.55" d="M0 37.04 A9 9 0 0 1 8.5 31 L11.5 31 A9 9 0 0 1 20 37.04" />
        {/* Mittellinie */}
        <line {...s} x1={0} y1={20} x2={20} y2={20} />
        {/* 7-m-Striche */}
        <line {...s} x1={9.5} y1={7} x2={10.5} y2={7} />
        <line {...s} x1={9.5} y1={33} x2={10.5} y2={33} />
        {/* 4-m-Marken */}
        <line {...s} x1={9.65} y1={4} x2={10.35} y2={4} />
        <line {...s} x1={9.65} y1={36} x2={10.35} y2={36} />
      </g>
      {/* Tore in Vereinsgelb */}
      <rect x={8.5} y={-0.5} width={3} height={0.5} fill="var(--club-acc)" />
      <rect x={8.5} y={40} width={3} height={0.5} fill="var(--club-acc)" />
    </g>
  )
}

/* ---------- Material-Glyphen ---------- */

export function MatGlyph({ kind }: { kind: MaterialKind }): ReactNode {
  switch (kind) {
    case 'huetchen':
      return (
        <>
          <path d="M-.75 .6 L0 -.85 L.75 .6 Z" fill="#E08A3C" stroke="#9A5A20" strokeWidth={0.08} />
          <line x1={-1.05} y1={0.6} x2={1.05} y2={0.6} stroke="#9A5A20" strokeWidth={0.12} />
        </>
      )
    case 'stange':
      return (
        <>
          <ellipse cx={0} cy={1.3} rx={0.6} ry={0.2} fill="#9AA0AA" opacity={0.8} />
          <rect x={-0.14} y={-1.35} width={0.28} height={2.6} rx={0.14} fill="#C0432F" />
          <rect x={-0.14} y={-0.6} width={0.28} height={0.55} fill="#F2E7DC" />
        </>
      )
    case 'leiter':
      return (
        <g stroke="#8B93A2" strokeWidth={0.13} fill="none">
          <line x1={-1.55} y1={-0.55} x2={1.55} y2={-0.55} />
          <line x1={-1.55} y1={0.55} x2={1.55} y2={0.55} />
          <line x1={-1.55} y1={-0.55} x2={-1.55} y2={0.55} />
          <line x1={-0.78} y1={-0.55} x2={-0.78} y2={0.55} />
          <line x1={0} y1={-0.55} x2={0} y2={0.55} />
          <line x1={0.78} y1={-0.55} x2={0.78} y2={0.55} />
          <line x1={1.55} y1={-0.55} x2={1.55} y2={0.55} />
        </g>
      )
    case 'matte':
      return (
        <>
          <rect
            x={-1.35}
            y={-0.85}
            width={2.7}
            height={1.7}
            rx={0.26}
            fill="#4C9EB8"
            opacity={0.9}
            stroke="#2E6E85"
            strokeWidth={0.08}
          />
          <line x1={-0.68} y1={-0.85} x2={-0.68} y2={0.85} stroke="#2E6E85" strokeWidth={0.07} />
          <line x1={0.68} y1={-0.85} x2={0.68} y2={0.85} stroke="#2E6E85" strokeWidth={0.07} />
        </>
      )
    case 'minitor':
      return (
        <>
          <rect x={-1.15} y={-0.8} width={2.3} height={1.6} fill="none" stroke="#C0432F" strokeWidth={0.15} />
          <g stroke="#9AA2AE" strokeWidth={0.05}>
            <line x1={-0.75} y1={-0.8} x2={-0.75} y2={0.8} />
            <line x1={-0.38} y1={-0.8} x2={-0.38} y2={0.8} />
            <line x1={0} y1={-0.8} x2={0} y2={0.8} />
            <line x1={0.38} y1={-0.8} x2={0.38} y2={0.8} />
            <line x1={0.75} y1={-0.8} x2={0.75} y2={0.8} />
            <line x1={-1.15} y1={-0.27} x2={1.15} y2={-0.27} />
            <line x1={-1.15} y1={0.27} x2={1.15} y2={0.27} />
          </g>
        </>
      )
    case 'ball-extra':
      return (
        <>
          <circle r={1.05} fill="none" stroke="#8B93A2" strokeWidth={0.11} />
          <circle cx={-0.34} cy={-0.16} r={0.34} fill="#E3A23F" />
          <circle cx={0.36} cy={-0.1} r={0.34} fill="#E3A23F" />
          <circle cx={0} cy={0.44} r={0.34} fill="#E3A23F" />
        </>
      )
    default:
      return null
  }
}

/* ---------- Wege ---------- */

function PathArrow({ pts, isBall, hitId }: { pts: Pt[]; isBall: boolean; hitId?: string }) {
  const m = pts.map((p) => [p.x * FIELD_W, p.y * FIELD_H] as const)
  const str = m.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const a = m[m.length - 2]
  const b = m[m.length - 1]
  let dx = b[0] - a[0]
  let dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  dx /= len
  dy /= len
  const s = 0.85
  const w = 0.42
  /* Kreidestrich: Läuferinnen weiß-gestrichelt, Pass in Vereinsgelb */
  const color = isBall ? 'var(--club-acc)' : CHALK
  return (
    <g>
      <circle cx={m[0][0]} cy={m[0][1]} r={0.28} fill={color} opacity={0.55} />
      <polyline
        points={str}
        fill="none"
        stroke={color}
        strokeWidth={isBall ? 0.24 : 0.26}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={isBall ? undefined : '0.85 0.6'}
      />
      <path
        d={`M${b[0].toFixed(2)} ${b[1].toFixed(2)} L${(b[0] - dx * s - dy * w).toFixed(2)} ${(b[1] - dy * s + dx * w).toFixed(2)} L${(b[0] - dx * s + dy * w).toFixed(2)} ${(b[1] - dy * s - dx * w).toFixed(2)} Z`}
        fill={color}
      />
      {hitId !== undefined && (
        <polyline
          data-path={hitId}
          points={str}
          fill="none"
          stroke="transparent"
          strokeWidth={1.7}
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        />
      )}
    </g>
  )
}

/* ---------- Figuren ---------- */

/* Kreide-Figuren: eigene = mit Kreide gemalter Kreis (O), Gegnerinnen = X,
   Ball = Vereinsgelb. Passt zur klassischen Trainer-Tafel. */

function TokenG({
  token,
  selected,
  recording,
  registerEl,
}: {
  token: BoardToken
  selected: boolean
  recording: boolean
  registerEl: (el: SVGGElement | null) => void
}) {
  const isBall = token.kind === 'ball'
  const isOpp = token.kind === 'opp'
  const r = isBall ? 0.62 : 1.12
  const hit = isBall ? 1.5 : 1.9
  return (
    <g
      data-tok={token.id}
      ref={registerEl}
      transform={`translate(${(token.x * FIELD_W).toFixed(2)} ${(token.y * FIELD_H).toFixed(2)})`}
      style={{ cursor: 'grab' }}
    >
      {/* großzügige, unsichtbare Trefffläche (Touch ≥ 44 px) */}
      <circle r={hit} fill="transparent" />
      {selected && (
        <circle
          r={r + 0.45}
          fill="none"
          stroke="var(--club-acc)"
          strokeWidth={0.22}
          strokeDasharray="0.55 0.4"
        />
      )}
      {isBall ? (
        <>
          <circle r={r} fill="var(--club-acc)" stroke="color-mix(in srgb, var(--club-acc-ink) 55%, transparent)" strokeWidth={0.14} />
          <path
            d="M-.3 -.48 A.62 .62 0 0 0 -.3 .48 M.3 -.48 A.62 .62 0 0 1 .3 .48"
            stroke="var(--club-acc-ink)"
            strokeWidth={0.09}
            fill="none"
          />
        </>
      ) : isOpp ? (
        /* Gegnerin: gestrichelter, gedimmter Kreide-Kreis — klar als
           Abwehr lesbar, ohne wie ein Fehler-X zu wirken. */
        <circle
          r={r}
          fill="#20242a"
          stroke={CHALK_DIM}
          strokeWidth={0.14}
          strokeDasharray="0.42 0.28"
        />
      ) : (
        /* Eigene als Kreide-O: dunkler Kern, kräftiger Kreidering */
        <circle r={r} fill="#20242a" stroke={CHALK} strokeWidth={0.18} />
      )}
      {recording && <circle r={r + 0.12} fill="none" stroke="#e9a23b" strokeWidth={0.24} />}
      {token.label && (
        <text
          y={0.34}
          textAnchor="middle"
          fontSize={0.92}
          fill={isOpp ? 'rgba(238,241,236,0.8)' : CHALK}
          style={{ fontFamily: 'var(--font-display)', fontWeight: 800, pointerEvents: 'none' }}
        >
          {token.label}
        </text>
      )}
    </g>
  )
}

/* ---------- Feld-Komponente ---------- */

export default function Court({
  field,
  tokens,
  materials,
  selectedId,
  liveTokenId,
  livePath,
  ghost,
  svgRef,
  registerTokenEl,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  field: 'full' | 'half'
  tokens: BoardToken[]
  materials: BoardMaterial[]
  selectedId: string | null
  /** Figur, deren Weg gerade aufgezeichnet wird. */
  liveTokenId: string | null
  livePath: Pt[] | null
  /** Material-Vorschau beim Ziehen aus der Ablage. */
  ghost: { kind: MaterialKind; x: number; y: number } | null
  svgRef: Ref<SVGSVGElement>
  registerTokenEl: (id: string) => (el: SVGGElement | null) => void
  onPointerDown: PointerEventHandler<SVGSVGElement>
  onPointerMove: PointerEventHandler<SVGSVGElement>
  onPointerUp: PointerEventHandler<SVGSVGElement>
  onPointerCancel: PointerEventHandler<SVGSVGElement>
}) {
  const liveToken = liveTokenId ? tokens.find((t) => t.id === liveTokenId) : undefined
  return (
    <svg
      ref={svgRef}
      viewBox={field === 'half' ? VIEWBOX_HALF : VIEWBOX_FULL}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label="Taktikboard — Handballfeld hochkant mit verschiebbaren Figuren"
      className="block h-full w-full select-none"
      style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <FieldLines />
      {/* gespeicherte Wege (der gerade aufgezeichnete wird ausgeblendet) */}
      <g>
        {tokens
          .filter((t) => t.path && t.path.length > 1 && t.id !== liveTokenId)
          .map((t) => (
            <PathArrow key={`path-${t.id}`} pts={t.path!} isBall={t.kind === 'ball'} hitId={t.id} />
          ))}
      </g>
      {/* Live-Vorschau der Aufzeichnung */}
      {livePath && livePath.length > 1 && (
        <PathArrow pts={livePath} isBall={liveToken?.kind === 'ball'} />
      )}
      {/* Trainingsmaterial (wird nie animiert) */}
      <g>
        {materials.map((m) => (
          <g
            key={m.id}
            data-mat={m.id}
            transform={`translate(${(m.x * FIELD_W).toFixed(2)} ${(m.y * FIELD_H).toFixed(2)})`}
            style={{ cursor: 'grab' }}
          >
            <circle r={1.9} fill="transparent" />
            <MatGlyph kind={m.kind} />
          </g>
        ))}
      </g>
      {/* Figuren */}
      <g>
        {tokens.map((t) => (
          <TokenG
            key={t.id}
            token={t}
            selected={t.id === selectedId}
            recording={t.id === liveTokenId}
            registerEl={registerTokenEl(t.id)}
          />
        ))}
      </g>
      {ghost && (
        <g
          opacity={0.6}
          pointerEvents="none"
          transform={`translate(${(ghost.x * FIELD_W).toFixed(2)} ${(ghost.y * FIELD_H).toFixed(2)})`}
        >
          <MatGlyph kind={ghost.kind} />
        </g>
      )}
    </svg>
  )
}
