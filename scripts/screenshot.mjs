/* ------------------------------------------------------------------ *
 * Visual smoke test.
 *
 * Drives a real Chrome at a phone viewport, walks the primary flows and
 * writes screenshots to .tmp/shots. Run against `vite preview`:
 *
 *   node scripts/screenshot.mjs http://localhost:4173/medstime/
 * ------------------------------------------------------------------ */

import puppeteer from 'puppeteer-core'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = resolve(ROOT, '.tmp/shots')
const URL_BASE = process.argv[2] ?? 'http://localhost:4173/medstime/'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

rmSync(SHOTS, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })

const errors = []

const browser = await puppeteer.launch({
  executablePath: CHROME_CANDIDATES[0],
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
})

const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const shot = async (name) => {
  await new Promise((r) => setTimeout(r, 550))
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`) })
  console.log(`  shot  ${name}.png`)
}

const clickText = async (selector, text) => {
  const handle = await page.evaluateHandle(
    (sel, txt) => [...document.querySelectorAll(sel)].find((el) => el.textContent?.trim().includes(txt)),
    selector,
    text,
  )
  const el = handle.asElement()
  if (!el) throw new Error(`No ${selector} containing "${text}"`)
  await el.click()
  return el
}

console.log(`\nDriving ${URL_BASE}\n`)

await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await shot('01-onboarding')

// --- Get started -------------------------------------------------------
await clickText('button', 'Get started')
await new Promise((r) => setTimeout(r, 1200))
await shot('02-add-sheet-empty')

// --- Fill in the first medication -------------------------------------
await page.type('#med-name', 'Amoxicillin', { delay: 12 })
await page.type('#med-dose', '500 mg', { delay: 12 })
await shot('03-add-filled')

// TDS
await clickText('.freq', 'TDS')
await new Promise((r) => setTimeout(r, 400))
await shot('04-schedule-tds')

// A colour
const swatches = await page.$$('.swatch')
if (swatches[2]) await swatches[2].click()
await new Promise((r) => setTimeout(r, 300))
await shot('05-schedule-colour')

// Interval mode
await clickText('.freq', 'q**')
await new Promise((r) => setTimeout(r, 450))
await shot('06-schedule-interval')

// Back to BD and save
await clickText('.freq', 'BD')
await new Promise((r) => setTimeout(r, 400))
await clickText('.sheet__foot button', 'Add to schedule')
await new Promise((r) => setTimeout(r, 1200))
await shot('07-today-with-med')

// --- Add a second medication, q6h -------------------------------------
await page.click('.nav__fab')
await new Promise((r) => setTimeout(r, 800))
await page.type('#med-name', 'Vitamin D', { delay: 12 })
await page.type('#med-dose', '10 mg', { delay: 12 })
await clickText('.freq', 'q**')
await new Promise((r) => setTimeout(r, 400))
const hourChips = await page.$$('.chip')
for (const c of hourChips) {
  const t = await c.evaluate((el) => el.textContent?.trim())
  if (t === '6') {
    await c.click()
    break
  }
}
await new Promise((r) => setTimeout(r, 400))
const sw2 = await page.$$('.swatch')
if (sw2[3]) await sw2[3].click()
await shot('07b-add-interval-filled')
await clickText('.sheet__foot button', 'Add to schedule')
await new Promise((r) => setTimeout(r, 1400))
await shot('08-today-two-meds')

// --- Mark a dose taken: the celebration --------------------------------
const okButtons = await page.$$('.round-btn--ok')
if (okButtons.length) {
  await okButtons[0].click()
  await new Promise((r) => setTimeout(r, 420))
  await shot('09-celebration')
  await new Promise((r) => setTimeout(r, 2200))
  await shot('10-after-celebration')
} else {
  errors.push('No dose action buttons rendered')
}

// --- Progress tab ------------------------------------------------------
await clickText('.nav__item', 'Progress')
await new Promise((r) => setTimeout(r, 900))
await shot('11-progress')
await page.screenshot({ path: resolve(SHOTS, '11b-progress-full.png'), fullPage: true })

// 30-day range
await clickText('.segmented__item', '30d')
await new Promise((r) => setTimeout(r, 800))
await shot('12-progress-30d')

// --- Meds tab ----------------------------------------------------------
await clickText('.nav__item', 'Meds')
await new Promise((r) => setTimeout(r, 900))
await shot('13-meds')

// --- Settings ----------------------------------------------------------
await clickText('.nav__item', 'Settings')
await new Promise((r) => setTimeout(r, 800))
await shot('14-settings')
await page.screenshot({ path: resolve(SHOTS, '14b-settings-full.png'), fullPage: true })

// Close, then light mode
await page.keyboard.press('Escape')
await new Promise((r) => setTimeout(r, 700))
await page.evaluate(() => {
  const raw = localStorage.getItem('medstime.state.v1')
  const s = JSON.parse(raw)
  s.settings.theme = 'light'
  localStorage.setItem('medstime.state.v1', JSON.stringify(s))
})
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 1000))
await shot('15-light-today')

// --- Empty state -------------------------------------------------------
await page.evaluate(() => localStorage.removeItem('medstime.state.v1'))
await page.reload({ waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 900))
await shot('16-empty-after-reset')

await browser.close()

if (errors.length) {
  console.log('\nRUNTIME ERRORS:')
  for (const e of errors) console.log('  -', e)
  process.exit(1)
}
console.log(`\nNo runtime errors. Screenshots in ${SHOTS}\n`)
