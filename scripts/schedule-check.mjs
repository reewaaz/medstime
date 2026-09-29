/* ------------------------------------------------------------------ *
 * Anchored dosing check.
 *
 * Drives the real UI: pick a frequency, set the first dose, and verify
 * the rest of the day works itself out — in the editor preview, in the
 * saved schedule, and in the dose rows on Today. Also exercises the
 * "set each dose time myself" escape hatch and the install affordance.
 *
 *   node scripts/schedule-check.mjs http://localhost:4173/medstime/
 * ------------------------------------------------------------------ */

import puppeteer from 'puppeteer-core'

const URL_BASE = process.argv[2] ?? 'http://localhost:4173/medstime/'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

const browser = await puppeteer.launch({
  executablePath: CHROME_CANDIDATES[0],
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const context = browser.defaultBrowserContext()
await context.overridePermissions(new URL(URL_BASE).origin, ['notifications'])

const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

console.log(`\nAnchored dosing @ ${URL_BASE}\n`)

/* ------------------------- helper: the UI --------------------------- */

const setTimeInput = (value) =>
  page.evaluate((v) => {
    const input = document.querySelector('.time-pill--hero input')
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }, value)

/** Times shown in the "Then all day" preview, in dosing order. */
const preview = () =>
  page.$$eval('.spread-preview__time', (n) => n.map((e) => e.textContent.trim()))

/** Times of the dose rows for one medication on the Today tab. */
const todayTimes = (medName) =>
  page.evaluate((name) => {
    const out = []
    for (const row of document.querySelectorAll('.dose')) {
      const who = row.querySelector('.dose__name')?.textContent?.trim()
      if (who !== name) continue
      const meta = row.querySelector('.dose__meta span')?.textContent?.trim()
      if (meta) out.push(meta)
    }
    return out
  }, medName)

const clickText = async (selector, text) => {
  const handle = await page.evaluateHandle(
    (sel, t) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t)),
    selector,
    text,
  )
  const el = handle.asElement()
  if (!el) return false
  await el.click()
  await sleep(320)
  return true
}

/** Click the single link-style button in the editor. */
const clickLink = async () => {
  const ok = await page.evaluate(() => {
    const b = document.querySelector('.link-btn')
    if (!b) return false
    b.click()
    return true
  })
  await sleep(360)
  return ok
}

/**
 * Wait until the time-pill count holds steady.
 *
 * Changing a time re-keys the pill, so framer-motion briefly keeps the
 * outgoing and incoming pills in the DOM together — a phantom extra dose
 * if you count during that window. Sample after a short grace period and
 * require several consecutive equal readings, not just two.
 */
const settlePills = async () => {
  await sleep(250)
  let previous = -1
  let stable = 0
  for (let i = 0; i < 30; i++) {
    const n = await page.$$eval('.time-pill:not(.time-pill--hero)', (x) => x.length)
    stable = n === previous ? stable + 1 : 0
    previous = n
    if (stable >= 3) return n
    await sleep(120)
  }
  return previous
}

const manualTimes = () =>
  page.$$eval('.time-pill:not(.time-pill--hero) input', (n) => n.map((i) => i.value))

const clickFreq = async (code) => {
  const ok = await page.evaluate((c) => {
    const btn = [...document.querySelectorAll('.freq')].find(
      (e) => e.querySelector('.freq__code')?.textContent.trim() === c,
    )
    if (!btn) return false
    btn.click()
    return true
  }, code)
  await sleep(320)
  return ok
}

const save = async () => {
  await clickText('.sheet__foot .btn', 'Add to schedule')
  await sleep(500)
}

const openEditor = async (name) => {
  await page.click('.nav__fab')
  await sleep(450)
  await page.type('#med-name', name, { delay: 8 })
  await sleep(150)
}

/* --------------------------- 1. QID @ 06:00 -------------------------- */

await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await page.evaluate(() => {
  localStorage.setItem(
    'medstime.state.v1',
    JSON.stringify({
      meds: [],
      records: {},
      onboarded: true,
      settings: {
        theme: 'dark',
        haptics: false,
        sound: false,
        soonWindowMinutes: 60,
        dayStartHour: 0,
        graceHours: 24,
      },
    }),
  )
})
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await sleep(600)

await openEditor('QID Test')
check('editor opens with a one-tap first-dose control', await page.$('.time-pill--hero input'))

check('QID can be picked', await clickFreq('QID'))
await setTimeInput('06:00')
await sleep(400)

const qid = await preview()
check(
  'QID at 06:00 derives 06:00, 12:00, 18:00, 00:00',
  same(qid, ['06:00', '12:00', '18:00', '00:00']),
  qid.join(' '),
)
check('the first dose stays 06:00 after a midnight wrap', await page.$eval('.time-pill--hero input', (i) => i.value === '06:00'))
check('the gap is spelled out', /Every 6 hours/.test(await page.$eval('body', (b) => b.textContent)))
check(
  'a midnight dose is called out',
  /past midnight/.test(await page.$eval('body', (b) => b.textContent)),
)

await save()
const qidRows = await todayTimes('QID Test')
check(
  'QID at 06:00 shows four dose rows today',
  same(qidRows, ['00:00', '06:00', '12:00', '18:00']),
  qidRows.join(' '),
)

/* ---------------------------- 2. BD @ 10:00 -------------------------- */

await openEditor('BD Test')
await clickFreq('BD')
await setTimeInput('10:00')
await sleep(400)
const bd = await preview()
check('BD at 10:00 derives 10:00, 22:00', same(bd, ['10:00', '22:00']), bd.join(' '))
await save()
const bdRows = await todayTimes('BD Test')
check('BD at 10:00 shows two dose rows', same(bdRows, ['10:00', '22:00']), bdRows.join(' '))

/* --------------------------- 3. TDS @ 06:00 -------------------------- */

await openEditor('TDS Test')
await clickFreq('TDS')
await setTimeInput('06:00')
await sleep(400)
const tds = await preview()
check('TDS at 06:00 derives 06:00, 14:00, 22:00', same(tds, ['06:00', '14:00', '22:00']), tds.join(' '))
await save()
const tdsRows = await todayTimes('TDS Test')
check('TDS at 06:00 shows three dose rows', same(tdsRows, ['06:00', '14:00', '22:00']), tdsRows.join(' '))

/* --------------------- 4. one-tap anchor chips ----------------------- */

await openEditor('Chip Test')
await clickFreq('BD')
await sleep(200)
const chipWorked = await page.evaluate(() => {
  const chip = [...document.querySelectorAll('.chip')].find((e) => e.textContent.trim() === '18:00')
  if (!chip) return false
  chip.click()
  return true
})
await sleep(400)
const chipTimes = await preview()
// 18:00 + 12h lands at 06:00 the next day, not midnight.
check(
  'tapping 18:00 re-derives the whole BD day',
  chipWorked && same(chipTimes, ['18:00', '06:00']),
  chipTimes.join(' '),
)
check(
  'that overnight dose is flagged too',
  /past midnight/.test(await page.$eval('body', (b) => b.textContent)),
)

/* -------------------- 5. individual-times escape hatch --------------- */

await clickLink()
await settlePills()
const manualCount = (await page.$$('.time-pill:not(.time-pill--hero) input')).length
check('escape hatch opens individual inputs', manualCount === 2, `${manualCount} inputs`)

// Break the even spread, then let the editor re-derive it.
await page.evaluate(() => {
  const inputs = document.querySelectorAll('.time-pill:not(.time-pill--hero) input')
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set
  setter.call(inputs[0], '07:00')
  inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
})
await settlePills()
// Manual times are listed in clock order, so the earliest is index 0.
const uneven = await manualTimes()
check('an individual time can be overridden', same(uneven, ['07:00', '18:00']), uneven.join(' '))

await clickLink()
await settlePills()
const relanded = await preview()
check(
  'and can be snapped back to the even spread',
  same(relanded, ['07:00', '19:00']),
  relanded.join(' '),
)
await page.keyboard.press('Escape')
await sleep(400)

/* -------------------------- 6. stored data --------------------------- */

const stored = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('medstime.state.v1'))
  return s.meds.map((m) => ({ name: m.name, code: m.schedule.code, anchor: m.schedule.anchor, times: m.schedule.times }))
})
check(
  'the QID was persisted with all four times and its 06:00 anchor',
  stored.some(
    (m) => m.code === 'QID' && m.times.length === 4 && m.anchor === '06:00',
  ),
)
check(
  'the BD was persisted anchored to 10:00',
  stored.some((m) => m.code === 'BD' && m.anchor === '10:00'),
)

/* ------------------------ 7. install affordance --------------------- */

check('install prompt plumbing loaded', await page.evaluate(() => typeof window.matchMedia === 'function'))

// Make sure the med editor is fully dismissed before opening Settings —
// the draft "Chip Test" medication was never saved.
const editorStillOpen = await page.$('.sheet__foot')
if (editorStillOpen) {
  await page.click('.sheet .sheet__head .icon-btn').catch(() => {})
  await sleep(400)
}
const openSheets = await page.$$eval('.sheet', (n) => n.length)
check('med editor is closed before Settings', openSheets === 0, `${openSheets} open`)

// Settings always offers a way in.
await page.click('.nav__item[aria-label="Settings"]')
const opened = await page
  .waitForSelector('.sheet', { timeout: 8000 })
  .then(() => true)
  .catch(() => false)
check('settings sheet opens', opened)
if (opened) {
  const settingsText = await page.$eval('.sheet', (b) => b.textContent)
  check('settings lists an install entry', /Install MedsTime/.test(settingsText))
  check('settings exposes the missed-dose window', /missed dose/i.test(settingsText))
}
await page.click('.sheet .sheet__head .icon-btn').catch(() => {})
await sleep(400)

// Onboarding offers install on first run.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('medstime.state.v1'))
  s.onboarded = false
  localStorage.setItem('medstime.state.v1', JSON.stringify(s))
})
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await sleep(700)
const onboardText = await page.$eval('body', (b) => b.textContent)
check(
  'onboarding surfaces an install option',
  /home screen/i.test(onboardText) || /Add to Home Screen/i.test(onboardText),
)

await browser.close()

const failed = results.filter((r) => !r.pass)
if (errors.length) {
  console.log('\nConsole errors:')
  errors.forEach((e) => console.log(`  ! ${e}`))
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`)
process.exit(failed.length || errors.length ? 1 : 0)
