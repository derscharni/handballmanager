import { chromium } from 'playwright-core'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const out = { schemes: {}, targets: [], alts: [], headings: {}, overflow: {}, motion: null }

function lum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio(a, b) { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05) }

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4183/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  // Token-Farben aus :root computed auflösen (color-mix → rgb)
  const tokens = await page.evaluate(() => {
    const names = ['--bg','--card','--card-2','--ink','--muted','--line','--accent','--accent-soft','--btn-bg','--btn-ink','--ok','--ok-soft','--warn','--warn-soft','--crit','--crit-soft','--club-acc','--club-acc-ink','--club-900','--club-on','--poster-a','--poster-b']
    const probe = document.createElement('div')
    document.body.appendChild(probe)
    const res = {}
    for (const n of names) {
      probe.style.color = `var(${n})`
      const c = getComputedStyle(probe).color
      const m = c.match(/([\d.]+), ([\d.]+), ([\d.]+)/) || c.match(/([\d.]+) ([\d.]+) ([\d.]+)/)
      res[n] = m ? [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])] : null
    }
    probe.remove()
    return res
  })
  const t = tokens
  const pairs = {
    'ink/bg': [t['--ink'], t['--bg']], 'ink/card': [t['--ink'], t['--card']],
    'muted/bg': [t['--muted'], t['--bg']], 'muted/card': [t['--muted'], t['--card']], 'muted/card2': [t['--muted'], t['--card-2']],
    'accent/accent-soft': [t['--accent'], t['--accent-soft']], 'accent/card': [t['--accent'], t['--card']],
    'btn-ink/btn-bg': [t['--btn-ink'], t['--btn-bg']],
    'acc-ink/club-acc': [t['--club-acc-ink'], t['--club-acc']],
    'club-on/club-900': [t['--club-on'], t['--club-900']], 'club-on/poster-a': [t['--club-on'], t['--poster-a']],
    'ok/ok-soft': [t['--ok'], t['--ok-soft']], 'warn/warn-soft': [t['--warn'], t['--warn-soft']], 'crit/crit-soft': [t['--crit'], t['--crit-soft']],
    'line/bg (UI 3:1)': [t['--line'], t['--bg']], 'accent/bg (UI 3:1)': [t['--accent'], t['--bg']],
  }
  out.schemes[scheme] = Object.fromEntries(
    Object.entries(pairs).map(([k, [a, b]]) => [k, a && b ? +ratio(a, b).toFixed(2) : null]),
  )
  if (scheme === 'light') {
    // Touch-Target-Audit über alle Tabs
    for (const tab of ['Start', 'Spielplan', 'Kader', 'Planung', 'Statistik', 'Taktik', 'Team']) {
      await page.locator('nav:visible button', { hasText: tab }).first().click()
      await page.waitForTimeout(800)
      const small = await page.evaluate((tabName) => {
        const els = [...document.querySelectorAll('button, a, input, select, [role="button"]')]
        return els.flatMap((el) => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return []
          if (r.height < 43.5 || r.width < 43.5) {
            const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 34)
            return [{ tab: tabName, label, w: Math.round(r.width), h: Math.round(r.height) }]
          }
          return []
        })
      }, tab)
      out.targets.push(...small)
      const h = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4')].map((x) => x.tagName).join(','))
      out.headings[tab] = h
      out.overflow[tab] = await page.evaluate(() => document.getElementById('app-scroll').scrollWidth > document.getElementById('app-scroll').clientWidth + 1)
      const alts = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length)
      if (alts > 0) out.alts.push({ tab, missing: alts })
    }
    out.motion = await page.evaluate(() => !!document.querySelector('style, link') && getComputedStyle(document.documentElement).getPropertyValue('--bg') !== '')
  }
  await ctx.close()
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
