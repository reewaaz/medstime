/* ------------------------------------------------------------------ *
 * The reminder engine.
 *
 * A single class owns "which doses still need a notification", so the
 * app, the service worker and the catch-up-on-launch path all agree.
 * ------------------------------------------------------------------ */

import { dateKey, logicalDateKey, MINUTE } from './date'
import { chime, haptic, setHapticsEnabled } from './haptics'
import { paletteFor } from './colors'
import { slotsForDay, type DoseSlot } from './schedule'
import { showReminder, syncScheduleToWorker } from './notifications'
import { getStateSnapshot } from './store'
import type { AppState, Medication, Settings } from './types'

/** How far ahead we materialise dose slots for the notification queue. */
const HORIZON_DAYS = 2
/** A dose due this long ago is no longer worth interrupting for. */
const STALE_MINUTES = 30

interface FiredEntry {
  /** epoch ms the notification went out. */
  at: number
}

export class ReminderEngine {
  private timer: number | null = null
  private fired: Record<string, FiredEntry> = {}
  private lastSync = 0
  private settings: Settings = getStateSnapshot().settings

  start() {
    setHapticsEnabled(this.settings.haptics)
    this.stop()
    // 20s is responsive to "mark taken" while staying cheap on battery.
    this.timer = window.setInterval(() => this.tick(), 20_000)
    this.tick()
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('focus', this.onVisibility)
    window.addEventListener('online', this.onVisibility)
    return this
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('focus', this.onVisibility)
    window.removeEventListener('online', this.onVisibility)
  }

  private onVisibility = () => {
    if (document.visibilityState === 'visible') this.tick()
  }

  /** Pick up settings changes without a full remount. */
  configure(settings: Settings) {
    this.settings = settings
    setHapticsEnabled(settings.haptics)
  }

  /** Forget a dose so the engine will notify again after a snooze. */
  forget(doseId: string) {
    delete this.fired[doseId]
  }

  isFired(doseId: string) {
    return Boolean(this.fired[doseId])
  }

  /** Every dose slot within the horizon that we could still notify for. */
  private candidates(now: number): { med: Medication; slot: DoseSlot }[] {
    const s: AppState = getStateSnapshot()
    const out: { med: Medication; slot: DoseSlot }[] = []
    const horizon = now + HORIZON_DAYS * 86_400_000

    let key = logicalDateKey(now, this.settings.dayStartHour)
    for (let i = 0; i < HORIZON_DAYS + 1; i++) {
      for (const med of s.meds) {
        if (med.archived) continue
        if (med.startDate > key) continue
        if (med.endDate && med.endDate < key) continue
        for (const slot of slotsForDay(med, key)) {
          if (slot.notifyAt > horizon) continue
          out.push({ med, slot })
        }
      }
      // advance one calendar day
      const d = new Date(key + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      key = dateKey(d)
    }
    return out
  }

  private tick = () => {
    const now = Date.now()
    const s = getStateSnapshot()

    // Drop notifications for doses the user has already logged.
    for (const [doseId, rec] of Object.entries(s.records)) {
      if (rec.status === 'taken' || rec.status === 'skipped') delete this.fired[doseId]
    }

    for (const { med, slot } of this.candidates(now)) {
      if (this.fired[slot.id]) continue
      if (s.records[slot.id]) continue
      if (slot.notifyAt > now) continue
      if (now - slot.due > STALE_MINUTES * MINUTE) continue

      this.fired[slot.id] = { at: now }
      const p = paletteFor(med.color)
      void showReminder({
        doseId: slot.id,
        medId: med.id,
        medName: med.name,
        medDose: med.dose,
        instructions: med.instructions,
        accent: p.base,
        accentBright: p.bright,
        due: slot.due,
      })
      if (this.settings.sound) chime('success')
      haptic('warn')
    }

    // Keep the service worker's copy fresh (at most every 60s).
    if (now - this.lastSync > 60_000) {
      this.lastSync = now
      void syncScheduleToWorker({ meds: s.meds, fired: {}, sentAt: now })
    }
  }
}

export const engine = new ReminderEngine()
