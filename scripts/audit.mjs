/* ------------------------------------------------------------------ *
 * Layout audit.
 *
 * Screenshots can't be reviewed automatically, so this asserts the
 * things a visual pass would catch: horizontal overflow, elements
 * escaping the viewport, tap targets that are too small, text with no
 * visible colour, and empty regions.
 *
 *   node scripts/audit.mjs http://localhost:4173/medstime/
 * ------------------------------------------------------------------ */

import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
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
].filter(Boolean)

mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME_CANDIDATES[0],
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
})
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])

const problems = []
const notes = []

const audit = async (label) => {
  const report = await page.evaluate((vw, vh) => {
    const out = { overflowX: [], offscreen: [], tiny: [], invisible: [], empty: [], counts: {} }
    const doc = document.documentElement
    out.overflowX = [
      doc.scrollWidth,
      doc.clientWidth,
    ]

    const all = [...document.querySelectorAll('body *')]
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue

      // Horizontal escape (ignore intentionally off-screen carousels).
      if (r.right > vw + 1.5 || r.left < -1.5) {
        const cls = el.className?.toString?.().slice(0, 46) ?? ''
        if (!el.closest('.aurora') && cls !== 'next__indicator') {
          out.offscreen.push({ cls: cls || el.tagName, left: +r.left.toFixed(1), right: +r.right.toFixed(1) })
        }
      }

      // Touch target sizing.
      const interactive = el.matches('button, a, input, [role="switch"], [role="button"]')
      if (interactive && r.width > 0 && (r.width < 28 || r.height < 28)) {
        const cls = el.className?.toString?.().slice(0, 46) ?? ''
        out.tiny.push({ cls: cls || el.tagName, w: +r.width.toFixed(1), h: +r.height.toFixed(1) })
      }

      // Visible text with no colour, or fully transparent.
      const hasOwnText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent?.trim(),
      )
      if (hasOwnText) {
        const color = cs.color
        const alpha = /rgba?\(([^)]+)\)/.exec(color)?.[1]?.split(',')
        const a = alpha?.length === 4 ? Number(alpha[3]) : 1
        if (a === 0) {
          const cls = el.className?.toString?.().slice(0, 46) ?? ''
          out.invisible.push({ cls: cls || el.tagName, color, text: el.textContent?.trim().slice(0, 30) })
        }
      }

      // Containers that rendered nothing at all.
      if (
        (el.className?.toString?.() ?? '').match(/^(card|section|stat|dose|med|chart__col|dist__row)/) &&
        el.textContent?.trim() === '' &&
        r.height < 4
      ) {
        out.empty.push({ cls: el.className?.toString?.().slice(0, 46) })
      }
    }

    out.counts = {
      buttons: document.querySelectorAll('button').length,
      doses: document.querySelectorAll('.dose').length,
      cards: document.querySelectorAll('.card').length,
      sheets: document.querySelectorAll('.sheet__panel').length,
    }
    out.title = document.querySelector('.topbar__title')?.textContent ?? null
    return out
  }, 390, 844)

  if (report.overflowX[0] > report.overflowX[1] + 1) {
    problems.push(`[${label}] horizontal overflow: scrollWidth ${report.overflowX[0]} > ${report.overflowX[1]}`)
  }
  for (const o of report.offscreen.slice(0, 6)) {
    problems.push(`[${label}] element escapes viewport: ${o.cls} (${o.left} → ${o.right})`)
  }
  for (const t of report.tiny.slice(0, 6)) {
    problems.push(`[${label}] tap target too small: ${t.cls} ${t.w}×${t.h}`)
  }
  for (const i of report.invisible.slice(0, 6)) {
    problems.push(`[${label}] invisible text: ${i.cls} "${i.text}" ${i.color}`)
  }
  for (const e of report.empty.slice(0, 6)) {
    problems.push(`[${label}] collapsed container: ${e.cls}`)
  }
  notes.push(`[${label}] ${JSON.stringify(report.counts)} title=${JSON.stringify(report.title)}`)
}

/* ------------------------- seed some data --------------------------- */

await page.goto(URL_BASE, { waitUntil: 'networkidle2' })

// Skip onboarding, and add three medications covering every schedule kind.
await page.evaluate(() => {
  const today = new Date()
  const key = (d) =>
    `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
  const yest = new Date(today)
  yest.setDate(yest.getDate() - 1)

  const meds = [
    {
      id: 'm1',
      name: 'Amoxicillin',
      dose: '500 mg',
      instructions: 'After food',
      color: 'mint',
      schedule: { kind: 'fixed', code: 'BD', times: ['08:00', '20:00'] },
      startDate: key(today),
      endDate: null,
      leadMinutes: 10,
      archived: false,
      createdAt: Date.now(),
    },
    {
      id: 'm2',
      name: 'Vitamin D3',
      dose: '10 mg',
      instructions: 'With breakfast',
      color: 'amber',
      schedule: { kind: 'fixed', code: 'OD', times: ['09:00'] },
      startDate: key(today),
      endDate: null,
      leadMinutes: 0,
      archived: false,
      createdAt: Date.now(),
    },
    {
      id: 'm3',
      name: 'Paracetamol',
      dose: '1 tablet',
      instructions: '',
      color: 'coral',
      schedule: { kind: 'interval', every: 6, unit: 'hours', anchorTime: '00:00', anchorDate: key(today) },
      startDate: key(today),
      endDate: null,
      leadMinutes: 0,
      archived: false,
      createdAt: Date.now(),
    },
  ]

  const records = {}
  for (const d of [yest, today]) {
    const k = key(d)
    for (const m of meds) {
      const times =
        m.schedule.kind === 'fixed'
          ? m.schedule.times
          : ['00:00', '06:00', '12:00', '18:00']
      times.forEach((t, i) => {
        // Make yesterday perfect, today partial.
        const take = d === yest || (d === today && i === 0)
        if (!take) return
        const id = `${m.id}|${k}|${t}`
        records[id] = { id, medId: m.id, status: 'taken', at: Date.now() }
      })
    }
  }

  localStorage.setItem(
    'medstime.state.v1',
    JSON.stringify({
      meds,
      records,
      onboarded: true,
      settings: {
        theme: 'dark',
        haptics: true,
        sound: false,
        soonWindowMinutes: 60,
        dayStartHour: 0,
        graceHours: 12,
      },
    }),
  )
})

for (const theme of ['dark', 'light']) {
  for (const [action, label] of [
    ['today', 'today'],
    ['meds', 'meds'],
    ['stats', 'stats'],
  ]) {
    await page.evaluate(
      (t, a) => {
        const raw = JSON.parse(localStorage.getItem('medstime.state.v1'))
        raw.settings.theme = t
        localStorage.setItem('medstime.state.v1', JSON.stringify(raw))
      },
      theme,
      action,
    )
    await page.goto(`${URL_BASE}?view=${action}`, { waitUntil: 'networkidle2' })
    await new Promise((r) => setTimeout(r, 900))
    await audit(`${theme}/${label}`)
  }
}

// Sheet layouts.
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 600))
await page.click('.nav__fab')
await new Promise((r) => setTimeout(r, 800))
await audit('dark/add-sheet')

const open = async (sel) => {
  await page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find(
      (e) => e.textContent?.trim() === 'q**' || e.textContent?.includes('Q**'),
    )
    el?.click()
  }, sel)
}
await open('.freq')
await new Promise((r) => setTimeout(r, 500))
await audit('dark/add-sheet-interval')
await page.keyboard.press('Escape')
await new Promise((r) => setTimeout(r, 600))

await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.nav__item')]
  btns.find((b) => b.textContent?.includes('Settings'))?.click()
})
await new Promise((r) => setTimeout(r, 800))
await audit('dark/settings')

// Empty state (no medications at all).
await page.evaluate(() => localStorage.removeItem('medstime.state.v1'))
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 900))
await audit('dark/onboarding')

// A very long medication name, to check truncation.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('medstime.state.v1') || '{}')
  s.onboarded = true
  s.settings = { theme: 'dark', haptics: true, sound: false, soonWindowMinutes: 60, dayStartHour: 0, graceHours: 12 }
  s.meds = [
    {
      id: 'long',
      name: 'Methylprednisolone Acetate',
      dose: '16 mg',
      instructions: 'Take with a full glass of water, not on an empty stomach',
      color: 'violet',
      schedule: { kind: 'fixed', code: 'QID', times: ['06:00', '12:00', '18:00', '23:30'] },
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
      leadMinutes: 15,
      archived: false,
      createdAt: Date.now(),
    },
  ]
  s.records = {}
  localStorage.setItem('medstime.state.v1', JSON.stringify(s))
})
await page.goto(URL_BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 900))
await audit('dark/long-names')

await browser.close()

console.log('\n--- layout notes ---')
for (const n of notes) console.log(' ', n)

if (problems.length) {
  console.log('\n--- problems ---')
  for (const p of problems) console.log('  !', p)
  process.exit(1)
}
console.log('\nNo layout problems found.\n')
