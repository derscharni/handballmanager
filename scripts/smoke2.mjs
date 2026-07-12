import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
await page.goto('http://localhost:4174/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
for (const t of ['Spielplan', 'Kader', 'Planung', 'Statistik', 'Taktik', 'Team', 'Start']) {
  await page.locator('nav button', { hasText: t }).first().click().catch((e) => errors.push(`TAB ${t}: ${e.message.split('\n')[0]}`))
  await page.waitForTimeout(1000)
}
// Team-Sektionen durchklicken
await page.locator('nav button', { hasText: 'Team' }).first().click()
await page.waitForTimeout(800)
for (const s of ['Kasse', 'Ämter', 'Umfragen', 'Mehr']) {
  await page.getByRole('button', { name: s, exact: true }).first().click().catch((e) => errors.push(`SECTION ${s}: ${e.message.split('\n')[0]}`))
  await page.waitForTimeout(900)
  await page.screenshot({ path: process.env.SP + `/team-${s.replace('Ä','Ae')}.png` })
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
