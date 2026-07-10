import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text())
})
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const tabs = ['Start', 'Spielplan', 'Kader', 'Planung', 'Statistik', 'Taktik']
for (const t of tabs) {
  const btn = page.locator('nav button', { hasText: t }).first()
  await btn.click().catch((e) => errors.push(`TAB ${t}: ${e.message.split('\n')[0]}`))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: process.env.SP + `/shot-${t.toLowerCase()}.png` })
}
const rootText = await page.locator('#root').innerText().catch(() => '')
console.log('ROOT_LENGTH:', rootText.length)
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
