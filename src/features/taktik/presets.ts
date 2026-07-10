import { uid } from '../../lib/db'
import type { BoardMaterial, BoardToken, MaterialKind, TacticsBoard } from '../../lib/types'

/**
 * Taktikboard-Grunddaten: Feldmaße, Aufstellungen und ladbare Presets.
 *
 * Koordinaten sind normiert (0..1): x quer (20 m), y längs (40 m) —
 * das Feld steht hochkant, das Angriffs-Tor liegt oben (y = 0),
 * die Angriffshälfte ist y 0..0.5 (Halbfeld-Ansicht).
 */

export const FIELD_W = 20
export const FIELD_H = 40

export const MATERIAL_KINDS: MaterialKind[] = [
  'huetchen',
  'stange',
  'leiter',
  'matte',
  'minitor',
  'ball-extra',
]

export const MATERIAL_LABEL: Record<MaterialKind, string> = {
  huetchen: 'Hütchen',
  stange: 'Stange',
  leiter: 'Leiter',
  matte: 'Matte',
  minitor: 'Minitor',
  'ball-extra': 'Bälle',
}

type Pt = { x: number; y: number }
const pt = (x: number, y: number): Pt => ({ x, y })

function tok(kind: BoardToken['kind'], label: string, x: number, y: number): BoardToken {
  return { id: uid(), kind, label: label || undefined, x, y }
}

function mat(kind: MaterialKind, x: number, y: number): BoardMaterial {
  return { id: uid(), kind, x, y }
}

/** Weg setzen — Figur startet am ersten Wegpunkt. */
function withPath(t: BoardToken, path: Pt[]): BoardToken {
  t.path = path
  t.x = path[0].x
  t.y = path[0].y
  return t
}

/** Angriffs-Grundaufstellung (gegen das obere Tor). */
const ATTACK: [string, number, number][] = [
  ['TW', 0.5, 0.465],
  ['LA', 0.11, 0.11],
  ['RL', 0.28, 0.325],
  ['RM', 0.5, 0.37],
  ['RR', 0.72, 0.325],
  ['KM', 0.5, 0.18],
  ['RA', 0.89, 0.11],
]

/** 6:0-Abwehrpositionen vor dem oberen Tor (von links nach rechts). */
const DEF_SLOTS: [number, number][] = [
  [0.16, 0.13],
  [0.31, 0.175],
  [0.435, 0.195],
  [0.565, 0.195],
  [0.69, 0.175],
  [0.84, 0.13],
]

const GOAL_TOP: [number, number] = [0.5, 0.0325]

/** Eigene 7 in Angriffsformation; beim ganzen Feld steht die TW im eigenen (unteren) Tor. */
export function ownAttackTokens(field: 'full' | 'half'): BoardToken[] {
  return ATTACK.map(([label, x, y]) =>
    tok('own', label, x, label === 'TW' && field === 'full' ? 0.955 : y),
  )
}

/** Gegnerinnen 6+1 in 6:0-Formation vor dem oberen Tor. */
export function oppDefenseTokens(): BoardToken[] {
  const tokens = DEF_SLOTS.map(([x, y], i) => tok('opp', String(i + 1), x, y))
  tokens.push(tok('opp', 'T', GOAL_TOP[0], GOAL_TOP[1]))
  return tokens
}

export function ballToken(x = 0.45, y = 0.3975): BoardToken {
  return tok('ball', '', x, y)
}

/* ---------- Neuer Zug ---------- */

export type NewBoardKind = 'angriff' | 'abwehr' | 'leer'

export const NEW_BOARD_OPTIONS: { kind: NewBoardKind; title: string; sub: string }[] = [
  {
    kind: 'angriff',
    title: 'Angriff 3:2:1 — Grundaufstellung',
    sub: 'Eigene 7 in Angriffsformation, Ball bei RM',
  },
  {
    kind: 'abwehr',
    title: '6:0 Abwehr',
    sub: 'Eigene Abwehr vor dem Tor, Gegnerinnen im Angriff',
  },
  {
    kind: 'leer',
    title: 'Leeres Feld',
    sub: 'Nur der Ball — alles frei aufbauen',
  },
]

export function makeNewBoard(kind: NewBoardKind): TacticsBoard {
  const base = {
    id: uid(),
    field: 'half' as const,
    materials: [] as BoardMaterial[],
    updatedAt: new Date().toISOString(),
  }
  if (kind === 'angriff') {
    return { ...base, title: 'Angriff 3:2:1', tokens: [...ownAttackTokens('half'), ballToken()] }
  }
  if (kind === 'abwehr') {
    const labels = ['LA', 'RL', 'KM', 'RM', 'RR', 'RA']
    const own = DEF_SLOTS.map(([x, y], i) => tok('own', labels[i], x, y))
    own.push(tok('own', 'TW', GOAL_TOP[0], GOAL_TOP[1]))
    const opp = ATTACK.filter(([label]) => label !== 'TW').map(([, x, y], i) =>
      tok('opp', String(i + 1), x, y),
    )
    return { ...base, title: '6:0 Abwehr', tokens: [...own, ...opp, ballToken(0.5, 0.39)] }
  }
  return { ...base, title: 'Neuer Spielzug', tokens: [ballToken(0.5, 0.3)] }
}

/* ---------- Presets ---------- */

export interface TaktikPreset {
  id: string
  /** Kurzer Chip-Text. */
  chip: string
  title: string
  /** Ein Satz Beschreibung. */
  description: string
  field: 'full' | 'half'
  build: () => Pick<TacticsBoard, 'tokens' | 'materials'>
}

export const PRESETS: TaktikPreset[] = [
  {
    id: 'kreuzung',
    chip: 'Kreuzung RM/RL',
    title: 'Kreuzung RM/RL mit Einläufer',
    description:
      'RM und RL kreuzen im Rückraum, KM läuft als Einläuferin an den Kreis — der Ball wandert per Pass von RM auf RL.',
    field: 'half',
    build: () => {
      const own = ownAttackTokens('half')
      const find = (label: string) => own.find((t) => t.label === label)!
      withPath(find('RM'), [
        pt(0.5, 0.37),
        pt(0.405, 0.335),
        pt(0.335, 0.2875),
        pt(0.31, 0.2425),
      ])
      withPath(find('RL'), [
        pt(0.28, 0.325),
        pt(0.395, 0.35),
        pt(0.495, 0.3075),
        pt(0.53, 0.245),
      ])
      withPath(find('KM'), [pt(0.5, 0.27), pt(0.44, 0.225), pt(0.375, 0.19), pt(0.33, 0.17)])
      const ball = withPath(ballToken(), [pt(0.45, 0.3975), pt(0.41, 0.335), pt(0.52, 0.25)])
      return { tokens: [...own, ...oppDefenseTokens(), ball], materials: [] }
    },
  },
  {
    id: 'anspiel-kreis',
    chip: 'Training: Anspiel Kreis',
    title: 'Training: Anspiel Kreis unter Druck',
    description:
      'KM fordert am Kreis, RM spielt gegen den Druck von RL und RR an — die Hütchen markieren die Druckzonen.',
    field: 'half',
    build: () => {
      const rm = withPath(tok('own', 'RM', 0, 0), [
        pt(0.5, 0.385),
        pt(0.51, 0.34),
        pt(0.48, 0.305),
      ])
      const km = withPath(tok('own', 'KM', 0, 0), [pt(0.37, 0.235), pt(0.45, 0.2), pt(0.56, 0.17)])
      const rl = tok('own', 'RL', 0.35, 0.26)
      const rr = tok('own', 'RR', 0.66, 0.26)
      const ball = withPath(ballToken(), [pt(0.47, 0.3675), pt(0.47, 0.29), pt(0.52, 0.185)])
      return {
        tokens: [rm, km, rl, rr, ball],
        materials: [
          mat('huetchen', 0.31, 0.285),
          mat('huetchen', 0.69, 0.285),
          mat('huetchen', 0.35, 0.36),
          mat('huetchen', 0.65, 0.36),
          mat('ball-extra', 0.88, 0.46),
        ],
      }
    },
  },
]

/** Preset als eigenständiges Board (für die Erst-Befüllung). */
export function buildPresetBoard(preset: TaktikPreset): TacticsBoard {
  const built = preset.build()
  return {
    id: uid(),
    title: preset.title,
    field: preset.field,
    tokens: built.tokens,
    materials: built.materials,
    updatedAt: new Date().toISOString(),
  }
}
