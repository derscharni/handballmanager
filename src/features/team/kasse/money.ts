/** Geld-Helfer der Mannschaftskasse — Beträge werden in Cent gespeichert. */

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

/** Cent → "5,00 €" (deutsches Format). */
export function fmtEuro(cents: number): string {
  return eur.format(cents / 100)
}

/** Cent → "+5,00 €" / "-5,00 €" (für Bewegungen im Verlauf). */
export function fmtEuroSigned(cents: number): string {
  return `${cents > 0 ? '+' : ''}${fmtEuro(cents)}`
}

/**
 * Nutzereingabe ("5", "7,50", "7.50", "1.250,00") → Cent.
 * null bei ungültiger Eingabe.
 */
export function parseEuro(input: string): number | null {
  let s = input.trim().replace(/[€\s]/g, '')
  if (s === '') return null
  // Komma = Dezimaltrenner; Punkte davor sind Tausendertrenner.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(Number(s) * 100)
  return Number.isFinite(cents) ? cents : null
}
