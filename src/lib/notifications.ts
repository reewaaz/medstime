/* ------------------------------------------------------------------ *
 * Notifications.
 *
 * Web can't run a task scheduler forever, so MedsTime uses a belt-and-
 * braces approach:
 *
 *   1. The page runs a live ticker (works open or backgrounded).
 *   2. The service worker runs its own timer from a synced schedule,
 *      which keeps firing while the SW process is alive.
 *   3. Anything that fell due while the browser was shut is caught up
 *      on the next launch, inside a grace window.
 * ------------------------------------------------------------------ */

import type { Medication } from './types'

export type NotifyPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

/** Not in every lib.dom version yet, but widely supported at runtime. */
type RichNotificationOptions = NotificationOptions & {
  renotify?: boolean
  timestamp?: number
  vibrate?: number | number[]
  actions?: { action: string; title: string }[]
}

export function notificationSupport(): NotifyPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as NotifyPermissionState
}

export async function requestNotificationPermission(): Promise<NotifyPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  try {
    const result = await Notification.requestPermission()
    return result as NotifyPermissionState
  } catch {
    return Notification.permission as NotifyPermissionState
  }
}

export interface ReminderPayload {
  doseId: string
  medId: string
  medName: string
  medDose: string
  instructions?: string
  accent: string
  accentBright: string
  due: number
  at?: number
}

export const NOTIFY_TAG_PREFIX = 'medstime:'

/** Fire a reminder through the service worker (falls back to the page). */
export async function showReminder(p: ReminderPayload): Promise<void> {
  if (notificationSupport() !== 'granted') return

  const options: RichNotificationOptions = {
    body: [p.medDose, p.instructions].filter(Boolean).join('  \u00b7  '),
    tag: `${NOTIFY_TAG_PREFIX}${p.doseId}`,
    renotify: true,
    requireInteraction: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    timestamp: p.due,
    data: { doseId: p.doseId, medId: p.medId, url: '/' },
    actions: [
      { action: 'taken', title: '\u2713 Taken' },
      { action: 'snooze', title: 'Snooze 10m' },
      { action: 'skip', title: 'Skip' },
    ],
    vibrate: [0, 60, 40, 60],
  }

  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg?.showNotification) {
      await reg.showNotification(`${p.medName} \u2014 time for a dose`, options)
      return
    }
  } catch {
    /* fall through to the page-level path */
  }

  try {
    const n = new Notification(`${p.medName} \u2014 time for a dose`, options)
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* notifications unavailable; the in-app banner still fires */
  }
}

/** A quiet acknowledgement used for onboarding / "it works" checks. */
export async function showTestNotification(): Promise<boolean> {
  if (notificationSupport() !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg?.showNotification) {
      await reg.showNotification('MedsTime is ready', {
        body: 'Notifications are on. You\u2019ll be nudged at dose time.',
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-96.png',
        tag: 'medstime:test',
        data: { url: '/' },
      })
      return true
    }
    new Notification('MedsTime is ready', { body: 'Notifications are on.' })
    return true
  } catch {
    return false
  }
}

/* ------------------------ service worker sync ----------------------- */

export interface ScheduleSync {
  meds: Medication[]
  /** doseId -> "sent", so we never notify twice. */
  fired: Record<string, number>
  sentAt: number
}

export async function syncScheduleToWorker(payload: ScheduleSync) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return
  navigator.serviceWorker.controller.postMessage({ type: 'sync-schedule', payload })
}

export async function registerPeriodicSync() {
  if (typeof navigator === 'undefined') return
  try {
    const reg = await navigator.serviceWorker?.ready
    const sync = (reg as unknown as { periodicSync?: { register(tag: string, opts: { minInterval: number }): Promise<void> } })
      .periodicSync
    if (sync) await sync.register('medstime-tick', { minInterval: 15 * 60 * 1000 })
  } catch {
    /* not supported on this browser — the SW timer covers it */
  }
}
