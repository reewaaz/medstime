/* ------------------------------------------------------------------ *
 * PWA audit — installability, service worker, offline, reminders.
 *
 *   node scripts/pwa-check.mjs http://localhost:4173/medstime/
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

console.log(`\nPWA audit @ ${URL_BASE}\n`)

await page.goto(URL_BASE, { waitUntil: 'networkidle2' })

// --- Service worker ----------------------------------------------------
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return { registered: false }
  // Give it a beat to finish installing on a cold profile.
  await new Promise((r) => setTimeout(r, 1500))
  return {
    registered: true,
    scope: reg.scope,
    active: Boolean(reg.active),
    waiting: Boolean(reg.waiting),
    state: reg.active?.state ?? null,
    scriptURL: reg.active?.scriptURL ?? null,
  }
})
check('service worker registers', sw.registered, sw.scope ?? '')
check('service worker activates', Boolean(sw.active), sw.state ?? '')

// --- Manifest ----------------------------------------------------------
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]')
  if (!link) return null
  const res = await fetch(link.href)
  return res.ok ? res.json() : null
})
check('manifest is linked', Boolean(manifest))
if (manifest) {
  const icons = manifest.icons ?? []
  check('manifest has name + short_name', Boolean(manifest.name && manifest.short_name), manifest.short_name)
  check('start_url present', Boolean(manifest.start_url), manifest.start_url)
  check('display is standalone', manifest.display === 'standalone', manifest.display)
  check('theme + background colour set', Boolean(manifest.theme_color && manifest.background_color))
  check('has a 192px icon', icons.some((i) => i.sizes === '192x192'))
  check('has a 512px icon', icons.some((i) => i.sizes === '512x512'))
  check('has a maskable icon', icons.some((i) => String(i.purpose ?? '').includes('maskable')))
  check('orientation locked to portrait', manifest.orientation === 'portrait', manifest.orientation ?? 'any')

  // Every declared icon must actually resolve.
  const iconChecks = await page.evaluate(async (icons) => {
    const base = document.querySelector('link[rel="manifest"]').href
    const out = []
    for (const i of icons) {
      const url = new URL(i.src, base).href
      const r = await fetch(url)
      out.push({ src: i.src, ok: r.ok, type: r.headers.get('content-type') })
    }
    return out
  }, icons)
  for (const i of iconChecks) {
    check(`icon ${i.src} serves`, i.ok, i.type ?? '')
  }
}

// --- Installability signals -------------------------------------------
const installable = await page.evaluate(async () => {
  const problems = []
  if (!window.isSecureContext) problems.push('not a secure context')
  const sw = await navigator.serviceWorker.getRegistration()
  if (!sw?.active) problems.push('no active service worker')
  const m = document.querySelector('link[rel="manifest"]')
  if (!m) problems.push('no manifest link')
  return { secure: window.isSecureContext, problems }
})
check('secure context (https or localhost)', installable.secure)

// --- Offline -----------------------------------------------------------
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500)) // let the SW precache finish
await page.setOfflineMode(true)
const offlineOk = await page
  .goto(URL_BASE, { waitUntil: 'domcontentloaded' })
  .then(() => true)
  .catch(() => false)
let offlineRendered = false
if (offlineOk) {
  await new Promise((r) => setTimeout(r, 1200))
  offlineRendered = await page.evaluate(() => Boolean(document.querySelector('.app, .onboard')))
}
check('app shell loads with the network off', offlineOk && offlineRendered)
await page.setOfflineMode(false)

// --- Notification plumbing --------------------------------------------
const notify = await page.evaluate(() => ({
  supported: 'Notification' in window,
  permission: 'Notification' in window ? Notification.permission : 'n/a',
  vibrate: typeof navigator.vibrate === 'function',
  periodicSync: 'periodicSync' in (navigator.serviceWorker ?? {}),
}))
check('Notification API available', notify.supported, `permission=${notify.permission}`)
check('Vibration API available', notify.vibrate)

const swHasScheduler = await page.evaluate(async () => {
  const res = await fetch('sw.js')
  const text = await res.text()
  return {
    served: res.ok,
    schedules: /nextCandidates|showNotification/.test(text),
    handlesClicks: /notificationclick/.test(text),
  }
})
check('service worker script is served', swHasScheduler.served)
check('service worker owns the dose scheduler', swHasScheduler.schedules)
check('service worker handles notification taps', swHasScheduler.handlesClicks)

await browser.close()

const failed = results.filter((r) => !r.pass)
if (errors.length) {
  console.log('\nRuntime errors:')
  for (const e of errors) console.log('  -', e)
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`)
process.exit(failed.length || errors.length ? 1 : 0)
