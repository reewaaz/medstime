/* ------------------------------------------------------------------ *
 * Adherence statistics.
 * ------------------------------------------------------------------ */

import { lastNDays, logicalDateKey } from './date'
import { dosesPerDay, slotsForDay } from './schedule'
import type { AppState, Medication } from './types'

export interface DayStats {
  key: string
  scheduled: number
  taken: number
  skipped: number
  pending: number
  /** 0..1 — taken / scheduled. */
  rate: number
  /** Per-medication taken count that day. */
  byMed: Record<string, number>
}

export interface Adherence {
  days: DayStats[]
  scheduled: number
  taken: number
  skipped: number
  pending: number
  /** taken / (taken + skipped) — the number people actually mean. */
  rate: number
  /** Consecutive days (ending today or yesterday) at 100%. */
  perfectStreak: number
  /** Consecutive days with at least one dose taken. */
  activeStreak: number
}

export function statsForDay(state: AppState, key: string): DayStats {
  let scheduled = 0
  let taken = 0
  let skipped = 0
  const byMed: Record<string, number> = {}

  for (const med of state.meds) {
    const slots = slotsForDay(med, key)
    scheduled += slots.length
    let medTaken = 0
    for (const slot of slots) {
      const rec = state.records[slot.id]
      if (rec?.status === 'taken') {
        taken++
        medTaken++
      } else if (rec?.status === 'skipped') {
        skipped++
      }
    }
    if (medTaken) byMed[med.id] = medTaken
  }

  const pending = Math.max(0, scheduled - taken - skipped)
  return {
    key,
    scheduled,
    taken,
    skipped,
    pending,
    rate: scheduled ? taken / scheduled : 0,
    byMed,
  }
}

export function adherenceOver(state: AppState, days: number, dayStartHour = 0): Adherence {
  const todayKey = logicalDateKey(Date.now(), dayStartHour)
  const keys = lastNDays(days, todayKey)
  const dayList = keys.map((k) => statsForDay(state, k))

  const scheduled = dayList.reduce((a, d) => a + d.scheduled, 0)
  const taken = dayList.reduce((a, d) => a + d.taken, 0)
  const skipped = dayList.reduce((a, d) => a + d.skipped, 0)
  const pending = dayList.reduce((a, d) => a + d.pending, 0)
  const resolved = taken + skipped

  // Streaks walk backwards from today. Today is skipped while it is still
  // in progress — otherwise every morning would read as a broken run.
  const isPerfect = (d: DayStats) => d.scheduled > 0 && d.taken === d.scheduled
  const isActive = (d: DayStats) => d.taken > 0
  const lastIndex = dayList.length - 1

  let perfectStreak = 0
  for (let i = lastIndex; i >= 0; i--) {
    const d = dayList[i]
    if (isPerfect(d)) {
      perfectStreak++
      continue
    }
    if (i === lastIndex && d.pending > 0) continue // today, still in progress
    break
  }

  let activeStreak = 0
  for (let i = lastIndex; i >= 0; i--) {
    const d = dayList[i]
    if (isActive(d)) {
      activeStreak++
      continue
    }
    if (i === lastIndex && d.pending > 0) continue
    break
  }

  return {
    days: dayList,
    scheduled,
    taken,
    skipped,
    pending,
    rate: resolved ? taken / resolved : 0,
    perfectStreak,
    activeStreak,
  }
}

export interface MedStats {
  med: Medication
  scheduled: number
  taken: number
  skipped: number
  rate: number
  perDay: number
}

export function perMedication(state: AppState, days: number, dayStartHour = 0): MedStats[] {
  const todayKey = logicalDateKey(Date.now(), dayStartHour)
  const keys = lastNDays(days, todayKey)
  return state.meds
    .map((med) => {
      let scheduled = 0
      let taken = 0
      let skipped = 0
      for (const key of keys) {
        for (const slot of slotsForDay(med, key)) {
          scheduled++
          const rec = state.records[slot.id]
          if (rec?.status === 'taken') taken++
          else if (rec?.status === 'skipped') skipped++
        }
      }
      const resolved = taken + skipped
      return {
        med,
        scheduled,
        taken,
        skipped,
        rate: resolved ? taken / resolved : scheduled ? 0 : 1,
        perDay: dosesPerDay(med),
      }
    })
    .sort((a, b) => b.rate - a.rate || b.scheduled - a.scheduled)
}

/** Time-of-day histogram of taken doses, 4 buckets. */
export function timeOfDayBreakdown(state: AppState, days: number, dayStartHour = 0) {
  const todayKey = logicalDateKey(Date.now(), dayStartHour)
  const keys = lastNDays(days, todayKey)
  const buckets = [
    { label: 'Night', range: '12a\u20136a', taken: 0, scheduled: 0 },
    { label: 'Morning', range: '6a\u201312p', taken: 0, scheduled: 0 },
    { label: 'Afternoon', range: '12p\u20136p', taken: 0, scheduled: 0 },
    { label: 'Evening', range: '6p\u201312a', taken: 0, scheduled: 0 },
  ]
  for (const key of keys) {
    for (const med of state.meds) {
      for (const slot of slotsForDay(med, key)) {
        const h = new Date(slot.due).getHours()
        const i = h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3
        buckets[i].scheduled++
        if (state.records[slot.id]?.status === 'taken') buckets[i].taken++
      }
    }
  }
  return buckets
}
