// Screenshot des (verbreiterten) Spinnennetz-Radars im Spielerinnen-Profil.
import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? '/tmp/radar-wide.png'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('ERR', e.message))
await page.goto('http://localhost:4173/handballmanager/')
await page.waitForTimeout(1500)

await page.locator('nav:visible button', { hasText: 'Kader' }).first().click()
await page.waitForTimeout(600)
// Erste Spielerin öffnen
await page.locator('main button', { hasText: /.+/ }).filter({ hasText: /TW|LA|RA|KM|RL|RM|RR/ }).first().click()
await page.waitForTimeout(800)

// Einstufen öffnen und Slider setzen
const edit = page.locator('button', { hasText: 'Einstufen' }).first()
await edit.scrollIntoViewIfNeeded()
await edit.click()
await page.waitForTimeout(300)
const sliders = page.locator('input[type=range]')
const n = await sliders.count()
const vals = [8, 6, 9, 5, 7, 4, 6, 8, 5, 7]
for (let i = 0; i < n; i++) {
  await sliders.nth(i).evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    set.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, vals[i % vals.length])
  await page.waitForTimeout(120)
}
await page.waitForTimeout(500)
await page.locator('button', { hasText: 'Fertig' }).first().click()
await page.waitForTimeout(500)

const svg = page.locator('svg[aria-label^="Spinnennetz"]').first()
const visible = await svg.isVisible().catch(() => false)
console.log('RADAR_VISIBLE:', visible ? 1 : 0)
if (visible) {
  const card = page.locator('h3', { hasText: 'Spinnennetz' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await card.screenshot({ path: OUT })
  console.log('SHOT:', OUT)
}
await browser.close()
