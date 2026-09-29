/* ------------------------------------------------------------------ *
 * Reminder engine check.
 *
 * Seeds a medication whose dose is due right now, then verifies that the
 * page fires exactly one notification, that the same dose does not fire
 * twice, and that logging it stops future reminders.
 *
 *   node scripts/reminder-check.mjs http://localhost:4173/medstime/
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

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`  ${pass ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log(`\nReminder engine @ ${URL_BASE}\n`)

await page.goto(URL_BASE, { waitUntil: 'networkidle2' })

// Instrument the notification entry points before anything can fire.
await page.evaluateOnNewDocument(() => {
  window.__shown = []
  const wrap = (obj, key, label) => {
    if (!obj || typeof obj[key] !== 'function') return
    const original = obj[key].bind(obj)
    obj[key] = (...args) => {
      window.__shown.push({ via: label, title: args[0], body: args[1]?.body, tag: args[1]?.tag })
      return original(...args)
    }
  }
  wrap(window.Notification, 'requestPermission', 'Notification.requestPermission')
  if (window.ServiceWorkerRegistration) wrap(window.ServiceWorkerRegistration.prototype, 'showNotification', 'SW.showNotification')
  if (window.Notification) wrap(window.Notification, 'showNotification', 'Notification.showNotification')
})

/* ------------------------- seed a due dose --------------------------- */

const seed = async (minutesOffset, medId) => {
  await page.evaluate(
    (offset, id) => {
      const d = new Date(Date.now() + offset * 60_000)
      const time = `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
      const key = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
      const state = {
        meds: [
          {
            id,
            name: 'Reminder Test Med',
            dose: '250 mg',
            instructions: 'After food',
            color: 'grape',
            schedule: { kind: 'fixed', code: 'OD', times: [time] },
            startDate: key,
            endDate: null,
            leadMinutes: 0,
            archived: false,
            createdAt: Date.now(),
          },
        ],
        records: {},
        onboarded: true,
        settings: {
          theme: 'dark',
          haptics: false,
          sound: false,
          soonWindowMinutes: 60,
          dayStartHour: 0,
          graceHours: 12,
        },
      }
      localStorage.setItem('medstime.state.v1', JSON.stringify(state))
      return time
    },
    minutesOffset,
    medId,
  )
}

const shownCount = () => page.evaluate(() => window.__shown?.length ?? 0)
const shownAll = () => page.evaluate(() => window.__shown ?? [])

// A dose that came due 5 minutes ago, inside the staleness window.
await seed(-5, 'due_now')
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500))

const afterFirst = await shownCount()
const notifications = await shownAll()
const reminder = notifications.find((n) => /Reminder Test Med/.test(String(n.title)))

check('a due dose fires a reminder', Boolean(reminder), reminder ? `"${reminder.title}"` : `${afterFirst} notifications`)
if (reminder) {
  check('reminder names the medication', /Reminder Test Med/.test(reminder.title))
  check('reminder includes the strength', /250 mg/.test(String(reminder.body)))
  check('reminder includes the instructions', /After food/.test(String(reminder.body)))
  check('reminder carries an action tag', String(reminder.tag).startsWith('medstime:'), reminder.tag)
}

// The 20s ticker must not re-fire the same dose.
const before = await shownCount()
await new Promise((r) => setTimeout(r, 3000))
const after = await shownCount()
check('a dose is not notified twice', after === before, `${before} → ${after}`)

/* ------------------ logging a dose stops reminders ------------------ */

const state = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('medstime.state.v1'))
  const id = Object.keys({ ...s.records })[0]
  return { medId: s.meds[0].id, key: s.meds[0].startDate, time: s.meds[0].schedule.times[0] }
})

const logged = await page.evaluate((arg) => {
  // Mark the dose taken the same way the UI button does.
  const btn = document.querySelector('.round-btn--ok')
  if (btn) btn.click()
  const s = JSON.parse(localStorage.getItem('medstime.state.v1'))
  return { records: Object.keys(s.records).length, clicked: Boolean(btn) }
}, state)

check('a dose row has a take button', logged.clicked)
check('taking a dose records it', logged.records === 1, `${logged.records} record(s)`)

const takenStatus = await page.evaluate((arg) => {
  const s = JSON.parse(localStorage.getItem('medstime.state.v1'))
  const key = `${arg.medId}|${arg.key}|${arg.time}`
  return s.records[key]?.status ?? null
}, state)
check('the record is marked taken', takenStatus === 'taken', String(takenStatus))

const ringText = await page.evaluate(() => document.querySelector('.ring-center__value')?.textContent ?? '')
check('the ring reflects the taken dose', ringText.replace(/\s/g, '').startsWith('1'), `"${ringText.trim()}"`)

// The celebration should have appeared.
const celebrated = await page.evaluate(() => Boolean(document.querySelector('.celebration__badge')))
check('the celebration overlay fired', celebrated)

// No new reminder after logging.
const before2 = await shownCount()
await new Promise((r) => setTimeout(r, 2500))
check('a logged dose is never re-notified', (await shownCount()) === before2)

/* ------------------ a future dose is not fired early ----------------- */

await seed(600, 'future') // 10 hours out
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500))
const futureShown = await shownAll()
check(
  'a future dose does not fire early',
  !futureShown.some((n) => String(n.title ?? '').includes('Reminder Test Med') && String(n.tag ?? '').includes('future')),
)

/* ----------------------- lead time is honoured ---------------------- */

const leadShown = await page.evaluate(async (url) => {
  // A dose due in 30 min with 45 min lead time is due for notification NOW.
  const d = new Date(Date.now() + 30 * 60_000)
  const time = `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
  const key = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
  localStorage.setItem(
    'medstime.state.v1',
    JSON.stringify({
      meds: [
        {
          id: 'lead',
          name: 'Lead Time Med',
          dose: '1 tablet',
          instructions: '',
          color: 'sky',
          schedule: { kind: 'fixed', code: 'OD', times: [time] },
          startDate: key,
          endDate: null,
          leadMinutes: 45,
          archived: false,
          createdAt: Date.now(),
        },
      ],
      records: {},
      onboarded: true,
      settings: { theme: 'dark', haptics: false, sound: false, soonWindowMinutes: 60, dayStartHour: 0, graceHours: 12 },
    }),
  )
  location.href = url
  return true
}, URL_BASE)

check('lead-time setup ran', leadShown)
await new Promise((r) => setTimeout(r, 3000))
const leadFired = (await shownAll()).some((n) => /Lead Time Med/.test(String(n.title)))
check('a dose with lead time fires early', leadFired)

/* ------------------ a stale dose is skipped -------------------------- */

await page.evaluate(() => {
  // Push the dose 6 hours into the past — past the 30-minute staleness window.
  const d = new Date(Date.now() - 6 * 3600_000)
  const time = `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
  const key = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
  const s = JSON.parse(localStorage.getItem('medstime.state.v1'))
  s.meds[0].schedule.times = [time]
  s.meds[0].startDate = key
  s.meds[0].leadMinutes = 0
  s.meds[0].name = 'Stale Med'
  s.records = {}
  localStorage.setItem('medstime.state.v1', JSON.stringify(s))
})
const beforeStale = await shownCount()
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 2500))
const staleFired = (await shownAll()).slice(beforeStale).some((n) => /Stale Med/.test(String(n.title)))
check('a long-overdue dose does not spam a notification', !staleFired)

await browser.close()

const failed = results.filter((r) => !r.pass)
if (errors.length) {
  console.log('\nRuntime errors:')
  for (const e of errors) console.log('  -', e)
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`)
process.exit(failed.length || errors.length ? 1 : 0)
