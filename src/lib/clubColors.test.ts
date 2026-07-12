import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLUB_COLORS,
  buildClubScale,
  hexToHsl,
  hslToHex,
  luminance,
} from './clubColors'

describe('Farb-Konvertierung', () => {
  it('hex → hsl → hex ist stabil (±1 pro Kanal)', () => {
    for (const hex of ['#14418f', '#ffc72c', '#9e1b2c', '#1b6b38', '#808080']) {
      const hsl = hexToHsl(hex)!
      const back = hslToHex(...hsl)
      const a = Number.parseInt(hex.slice(1), 16)
      const b = Number.parseInt(back.slice(1), 16)
      for (const shift of [16, 8, 0]) {
        expect(Math.abs(((a >> shift) & 255) - ((b >> shift) & 255))).toBeLessThanOrEqual(1)
      }
    }
  })

  it('lehnt ungültige Hex-Werte ab', () => {
    expect(hexToHsl('blau')).toBeNull()
    expect(hexToHsl('#12')).toBeNull()
  })
})

describe('buildClubScale', () => {
  it('erzeugt eine monoton hellere Skala', () => {
    const scale = buildClubScale({ primary: '#9E1B2C', accent: '#E8C892' })!
    const lum = (k: keyof typeof scale) => luminance(scale[k])
    expect(lum('--club-950')).toBeLessThan(lum('--club-900'))
    expect(lum('--club-900')).toBeLessThan(lum('--club-700'))
    expect(lum('--club-700')).toBeLessThan(lum('--club-500'))
    expect(lum('--club-500')).toBeLessThan(lum('--club-300'))
    expect(lum('--club-300')).toBeLessThan(lum('--club-150'))
    expect(lum('--club-150')).toBeLessThan(lum('--club-on'))
  })

  it('heller Akzent bekommt dunkle Tinte, dunkler Akzent helle', () => {
    const hell = buildClubScale({ primary: '#14418F', accent: '#FFC72C' })!
    expect(luminance(hell['--club-acc-ink'])).toBeLessThan(0.2)
    const dunkel = buildClubScale({ primary: '#14418F', accent: '#0B2158' })!
    expect(luminance(dunkel['--club-acc-ink'])).toBeGreaterThan(0.7)
  })

  it('Standardfarben entsprechen dem TuS-Blau/Gelb', () => {
    expect(DEFAULT_CLUB_COLORS.primary).toBe('#14418F')
    expect(DEFAULT_CLUB_COLORS.accent).toBe('#FFC72C')
  })
})
