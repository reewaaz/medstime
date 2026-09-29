/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

/** Options the SW notification API accepts that lib.dom doesn't declare. */
type RichNotificationOptions = NotificationOptions & {
  renotify?: boolean
  timestamp?: number
  actions?: { action: string; title: string }[]
}

/* ------------------------------------------------------------------ *
 * MedsTime service worker
 * ------------------------------------------------------------------ */

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({ cacheName: 'medstime-images' }),
)

registerRoute(
  ({ url }) => url.pathname.endsWith('/manifest.webmanifest'),
  new NetworkFirst({ cacheName: 'medstime-manifest' }),
)

/* --------------------------- dose scheduler ------------------------- */
/* The page mirrors its medication list here; this side keeps a timer so
   reminders still fire while the tab is closed, for as long as the
   browser keeps the worker alive.                                     */

type Unit = 'minutes' | 'hours' | 'days'

interface FixedSchedule {
  kind: 'fixed'
  code: string
  times: string[]
}
interface IntervalSchedule {
  kind: 'interval'
  every: number
  unit: Unit
  anchorTime: string
  anchorDate: string
}
type Schedule = FixedSchedule | IntervalSchedule | { kind: 'prn' }

interface Med {
  id: string
  name: string
  dose: string
  instructions: string
  color: string
  schedule: Schedule
  startDate: string
  endDate: string | null
  leadMinutes: number
  archived: boolean
}

const STORAGE_CACHE = 'medstime-sw-state'
const STORAGE_KEY = '/__state__'
const STALE_MS = 30 * 60_000
const ACCENTS: Record<string, [string, string]> = {
  grape: ['#8B5CF6', '#C4B5FD'],
  coral: ['#FB7185', '#FDA4AF'],
  mint: ['#34D399', '#6EE7B7'],
  sky: ['#38BDF8', '#7DD3FC'],
  amber: ['#FBBF24', '#FCD34D'],
  rose: ['#F472B6', '#F9A8D4'],
  lime: ['#A3E635', '#D9F99D'],
  violet: ['#A78BFA', '#DDD6FE'],
}

/* The Cache API is the only storage a service worker can rely on, and it
   survives the worker being evicted and restarted. */
async function persist() {
  try {
    const cache = await caches.open(STORAGE_CACHE)
    await cache.put(
      STORAGE_KEY,
      new Response(JSON.stringify({ meds, fired }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  } catch {
    /* storage unavailable — the in-memory ledger still covers this session */
  }
}

async function hydrate() {
  try {
    const cache = await caches.open(STORAGE_CACHE)
    const hit = await cache.match(STORAGE_KEY)
    if (!hit) return
    const parsed = (await hit.json()) as { meds?: Med[]; fired?: Record<string, number> }
    meds = parsed.meds ?? []
    fired = parsed.fired ?? {}
  } catch {
    meds = []
    fired = {}
  }
}

let meds: Med[] = []
let fired: Record<string, number> = {}
let timer: ReturnType<typeof setTimeout> | null = null

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

function pad(n: number) {
  return `${n}`.padStart(2, '0')
}

function dateKey(d: Date | number) {
  const dt = typeof d === 'number' ? new Date(d) : d
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function startOfDay(v: Date | number) {
  const dt = typeof v === 'number' ? new Date(v) : v
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
}

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function fromMinutes(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

function unitMs(unit: Unit) {
  return unit === 'minutes' ? MINUTE : unit === 'hours' ? HOUR : DAY
}

/** Dose times ("HH:MM") a medication delivers on one local day. */
function timesForDay(med: Med, key: string): string[] {
  const s = med.schedule
  if (s.kind === 'prn') return []
  if (s.kind === 'fixed') return [...s.times]

  const step = unitMs(s.unit) * s.every
  if (step < MINUTE) return []
  const dayStart = startOfDay(parseKey(key))
  const dayEnd = dayStart + DAY
  const anchor = startOfDay(parseKey(s.anchorDate)) + toMinutes(s.anchorTime) * MINUTE
  const out: string[] = []
  let k = Math.max(0, Math.ceil((dayStart - anchor) / step))
  for (let guard = 0; guard < 5000; guard++, k++) {
    const t = anchor + k * step
    if (t >= dayEnd) break
    if (t < dayStart) continue
    out.push(fromMinutes(Math.round((t - dayStart) / MINUTE)))
  }
  return out
}

interface Candidate {
  id: string
  med: Med
  due: number
  notifyAt: number
}

function nextCandidates(): Candidate[] {
  const now = Date.now()
  const keys = [0, 1, 2].map((n) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return dateKey(d)
  })
  const out: Candidate[] = []
  for (const med of meds) {
    if (med.archived) continue
    for (const key of keys) {
      if (med.startDate > key) continue
      if (med.endDate && med.endDate < key) continue
      for (const t of timesForDay(med, key).sort((a, b) => toMinutes(a) - toMinutes(b))) {
        const due = startOfDay(parseKey(key)) + toMinutes(t) * MINUTE
        const notifyAt = due - (med.leadMinutes || 0) * MINUTE
        if (notifyAt > now + 2 * DAY) continue
        out.push({ id: `${med.id}|${key}|${t}`, med, due, notifyAt })
      }
    }
  }
  return out
}

function fire(c: Candidate) {
  const [base, bright] = ACCENTS[c.med.color] ?? ACCENTS.grape
  void self.registration.showNotification(`${c.med.name} \u2014 time for a dose`, {
    body: [c.med.dose, c.med.instructions].filter(Boolean).join('  \u00b7  '),
    tag: `medstime:${c.id}`,
    renotify: true,
    requireInteraction: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    timestamp: c.due,
    vibrate: [0, 60, 40, 60],
    data: {
      doseId: c.id,
      medId: c.med.id,
      url: '/',
      color: base,
      bright,
    },
    actions: [
      { action: 'taken', title: '\u2713 Taken' },
      { action: 'snooze', title: 'Snooze 10m' },
      { action: 'skip', title: 'Skip' },
    ],
  } as RichNotificationOptions)
  fired[c.id] = Date.now()
}

function tick() {
  const now = Date.now()
  for (const c of nextCandidates()) {
    if (fired[c.id]) continue
    if (c.notifyAt > now) continue
    if (now - c.due > STALE_MS) continue
    fire(c)
  }
  // Prune the fired ledger.
  for (const [id, at] of Object.entries(fired)) {
    if (now - at > 3 * DAY) delete fired[id]
  }
  persist()
  scheduleNext()
}

function scheduleNext() {
  if (timer) clearTimeout(timer)
  const upcoming = nextCandidates()
    .filter((c) => !fired[c.id] && c.notifyAt > Date.now())
    .sort((a, b) => a.notifyAt - b.notifyAt)[0]
  if (!upcoming) return
  const delay = Math.min(upcoming.notifyAt - Date.now(), 6 * HOUR)
  if (delay <= 0) {
    tick()
    return
  }
  timer = setTimeout(tick, delay)
}

/* ----------------------------- messaging --------------------------- */

self.addEventListener('message', (event) => {
  const data = event.data as
    | { type: 'sync-schedule'; payload: { meds: Med[]; sentAt: number } }
    | { type: 'snooze'; doseId: string; until: number }
    | { type: 'clear-fired'; doseIds: string[] }
    | { type: 'skip-all' }
    | undefined

  if (!data?.type) return

  if (data.type === 'sync-schedule') {
    meds = Array.isArray(data.payload?.meds) ? data.payload.meds : meds
    void persist().then(tick)
    return
  }

  if (data.type === 'snooze') {
    // Drop the ledger entry now, and re-arm once the window has elapsed.
    delete fired[data.doseId]
    void persist()
    setTimeout(
      () => {
        delete fired[data.doseId]
        tick()
      },
      Math.max(1_000, data.until - Date.now()),
    )
    return
  }

  if (data.type === 'clear-fired') {
    data.doseIds.forEach((id) => delete fired[id])
    void persist()
    return
  }

  if (data.type === 'skip-all') {
    fired = {}
    meds = []
    void persist()
  }
})

/* ------------------------- notification taps ----------------------- */

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  const action = event.action
  const data = (notification.data ?? {}) as {
    doseId?: string
    url?: string
  }
  notification.close()

  const focusClient = async (extra?: { flash?: boolean }) => {
    const all = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    for (const client of all) {
      const post = { type: 'dose-action', action, doseId: data.doseId, ...extra }
      if ('postMessage' in client) client.postMessage(post)
      if ('focus' in client) return client.focus()
    }
    if (self.clients.openWindow) {
      const url = new URL(data.url ?? '/', self.location.origin).href
      return self.clients.openWindow(url)
    }
    return undefined
  }

  if (action === 'taken' || action === 'skip' || action === 'snooze') {
    if (data.doseId) delete fired[data.doseId]
    event.waitUntil(focusClient())
    return
  }

  event.waitUntil(focusClient())
})

self.addEventListener('notificationclose', (event) => {
  const data = (event.notification.data ?? {}) as { doseId?: string }
  if (data.doseId) delete fired[data.doseId]
})

/* --------------------- periodic sync (Chromium) -------------------- */

self.addEventListener(
  'periodicsync' as never,
  ((event: ExtendableEvent & { tag?: string }) => {
    if (event.tag === 'medstime-tick') event.waitUntil(Promise.resolve(tick()))
  }) as EventListener,
)

self.addEventListener('activate', (event) => {
  event.waitUntil(
    hydrate().then(() => {
      tick()
    }),
  )
})

self.addEventListener('push', (event) => {
  // Reserved for a future server-driven reminder channel.
  event.waitUntil(
    (async () => {
      let payload: { title?: string; body?: string } = {}
      try {
        payload = event.data ? event.data.json() : {}
      } catch {
        payload = {}
      }
      await self.registration.showNotification(payload.title ?? 'MedsTime', {
        body: payload.body ?? 'You have a dose due.',
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-96.png',
        tag: 'medstime:push',
        data: { url: '/' },
      })
    })(),
  )
})
