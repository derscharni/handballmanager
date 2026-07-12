/**
 * Vereinsfarben: Aus ZWEI vom Verein gewählten Farben (Hauptfarbe + Akzent)
 * wird die komplette Club-Token-Skala (--club-950 … --club-on, --club-acc,
 * --club-acc-ink) erzeugt und auf :root gesetzt. Die gesamte App themt sich
 * damit live um — genau wie im Design-C-Konzept "Vereinsfarben".
 */

export interface ClubColors {
  /** Hauptfarbe des Vereins (Hex, z.B. "#14418F"). */
  primary: string
  /** Akzentfarbe (Hex, z.B. "#FFC72C"). */
  accent: string
}

/** TuS Köln-Ehrenfeld 1865 — Königsblau + Vereinsgelb (Standard). */
export const DEFAULT_CLUB_COLORS: ClubColors = {
  primary: '#14418F',
  accent: '#FFC72C',
}

/* ---------- Farb-Mathematik (klein, ohne Dependencies) ---------- */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function hexToHsl(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s * 100, l * 100]
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = Math.max(0, Math.min(100, s)) / 100
  const ln = Math.max(0, Math.min(100, l)) / 100
  const hn = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = ln - c / 2
  let rgb: [number, number, number]
  if (hn < 60) rgb = [c, x, 0]
  else if (hn < 120) rgb = [x, c, 0]
  else if (hn < 180) rgb = [0, c, x]
  else if (hn < 240) rgb = [0, x, c]
  else if (hn < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255)
}

/** Relative Luminanz (0..1) für die Wahl der Tinte auf dem Akzent. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/* ---------- Skala erzeugen & anwenden ---------- */

export interface ClubScale {
  '--club-950': string
  '--club-900': string
  '--club-700': string
  '--club-500': string
  '--club-300': string
  '--club-150': string
  '--club-on': string
  '--club-acc': string
  '--club-acc-ink': string
}

/**
 * Erzeugt die Token-Skala aus den zwei Vereinsfarben. Die Hauptfarbe ist
 * die 700er-Stufe; dunklere/hellere Stufen entstehen über HSL-Lightness
 * (mit sanft reduzierter Sättigung in den Pastell-Stufen).
 */
export function buildClubScale(colors: ClubColors): ClubScale | null {
  const hsl = hexToHsl(colors.primary)
  const acc = hexToRgb(colors.accent)
  if (!hsl || !acc) return null
  const [h, s, l] = hsl

  const accIsLight = luminance(colors.accent) > 0.45
  const dark900 = hslToHex(h, Math.min(100, s * 1.05), Math.max(6, l * 0.55))

  return {
    '--club-950': hslToHex(h, Math.min(100, s * 1.05), Math.max(4, l * 0.34)),
    '--club-900': dark900,
    '--club-700': colors.primary,
    '--club-500': hslToHex(h, s, Math.min(62, l * 1.45)),
    '--club-300': hslToHex(h, s * 0.72, 72),
    '--club-150': hslToHex(h, s * 0.55, 91),
    '--club-on': hslToHex(h, s * 0.4, 98),
    '--club-acc': colors.accent,
    // Tinte auf dem Akzent: dunkler Vereinston auf hellen Akzenten,
    // sonst die helle "on"-Farbe — nie Ton-in-Ton.
    '--club-acc-ink': accIsLight ? hslToHex(h, Math.min(100, s * 1.1), Math.max(8, l * 0.5)) : hslToHex(h, s * 0.4, 98),
  }
}

/** Setzt die Skala auf :root (oder entfernt sie bei Standardfarben). */
export function applyClubColors(colors: ClubColors | undefined): void {
  const root = document.documentElement
  const keys: (keyof ClubScale)[] = [
    '--club-950', '--club-900', '--club-700', '--club-500',
    '--club-300', '--club-150', '--club-on', '--club-acc', '--club-acc-ink',
  ]
  const effective = colors ?? DEFAULT_CLUB_COLORS
  const isDefault =
    effective.primary.toLowerCase() === DEFAULT_CLUB_COLORS.primary.toLowerCase() &&
    effective.accent.toLowerCase() === DEFAULT_CLUB_COLORS.accent.toLowerCase()
  if (isDefault) {
    // Standard: die handjustierte Skala aus theme.css gilt
    for (const k of keys) root.style.removeProperty(k)
    return
  }
  const scale = buildClubScale(effective)
  if (!scale) return
  for (const k of keys) root.style.setProperty(k, scale[k])
}
