/* ------------------------------------------------------------------ *
 * Frequency presets and slot generation.
 *
 * The heart of MedsTime: turn a Medication + a calendar day into the
 * concrete list of dose slots that fall on that day.
 * ------------------------------------------------------------------ */

import {
  DAY,
  HOUR,
  MINUTE,
  dateKey,
  minutesToTime,
  parseDateKey,
  startOfDay,
  timeOnDay,
  timeToMinutes,
} from './date'
import type {
  DoseId,
  FixedSchedule,
  FreqCode,
  IntervalSchedule,
  IntervalUnit,
  Medication,
  Schedule,
} from './types'

/* ----------------------------- presets ----------------------------- */

export interface FrequencyPreset {
  code: FreqCode
  label: string
  latin: string
  expansion: string
  dosesPerDay: number
  icon: string
  defaultTimes: string[]
  blurb: string
}

export const FREQUENCY_PRESETS: FrequencyPreset[] = [
  {
    code: 'OD',
    label: 'Once daily',
    latin: 'OD',
    expansion: 'Once a day',
    dosesPerDay: 1,
    icon: '\u25CF',
    defaultTimes: ['09:00'],
    blurb: 'One dose each day',
  },
  {
    code: 'BD',
    label: 'Twice daily',
    latin: 'BD',
    expansion: 'Bis die',
    dosesPerDay: 2,
    icon: '\u25D0',
    defaultTimes: ['09:00', '21:00'],
    blurb: 'Morning and night',
  },
  {
    code: 'TDS',
    label: 'Three times daily',
    latin: 'TDS',
    expansion: 'Ter die semis',
    dosesPerDay: 3,
    icon: '\u25D1',
    defaultTimes: ['08:00', '14:00', '20:00'],
    blurb: 'Morning, afternoon, night',
  },
  {
    code: 'QID',
    label: 'Four times daily',
    latin: 'QID',
    expansion: 'Quater in die',
    dosesPerDay: 4,
    icon: '\u25A3',
    defaultTimes: ['08:00', '12:00', '16:00', '20:00'],
    blurb: 'Spread across the day',
  },
  {
    code: 'QHS',
    label: 'At bedtime',
    latin: 'QHS',
    expansion: 'Hora somni',
    dosesPerDay: 1,
    icon: '\u263D',
    defaultTimes: ['22:30'],
    blurb: 'Once, before sleep',
  },
]

export const PRESET_BY_CODE = Object.fromEntries(
  FREQUENCY_PRESETS.map((p) => [p.code, p]),
) as Record<FreqCode, FrequencyPreset>

/* ------------------------- interval helpers ------------------------ */

export const INTERVAL_UNITS: { value: IntervalUnit; label: string; short: string; ms: number }[] = [
  { value: 'minutes', label: 'minutes', short: 'min', ms: MINUTE },
  { value: 'hours', label: 'hours', short: 'hr', ms: HOUR },
  { value: 'days', label: 'days', short: 'day', ms: DAY },
]

export const INTERVAL_STEPS: Record<IntervalUnit, number[]> = {
  minutes: [15, 20, 30, 45, 60, 90, 120],
  hours: [2, 3, 4, 6, 8, 12],
  days: [2, 3, 7, 14, 28],
}

/** Human label for a "q**" schedule, e.g. "Every 6 hours" / "Every 30 minutes". */
export function intervalLabel(s: IntervalSchedule): string {
  const unit = INTERVAL_UNITS.find((u) => u.value === s.unit)
  if (!unit) return `Every ${s.every}`
  const noun = s.every === 1 ? unit.label.replace(/s$/, '') : unit.label
  return `Every ${s.every} ${noun}`
}

/** Compact clinical notation, e.g. "q6h". */
export function intervalCode(s: IntervalSchedule): string {
  const mark = s.unit === 'minutes' ? 'm' : s.unit === 'hours' ? 'h' : 'd'
  return `q${s.every}${mark}`
}

/** Human summary of any schedule. */
export function scheduleLabel(s: Schedule): string {
  if (s.kind === 'prn') return 'As needed'
  if (s.kind === 'interval') return intervalLabel(s)
  return `${s.code} \u00b7 ${s.times.length}\u00d7 a day`
}

/* ----------------------------- dose slots -------------------------- */

export interface DoseSlot {
  id: DoseId
  medId: string
  /** Epoch ms the dose is due. */
  due: number
  /** "HH:MM" wall-clock label. */
  label: string
  /** Position within the medication's schedule for that day. */
  index: number
  /** Epoch ms we should notify, accounting for lead time. */
  notifyAt: number
}

function slotId(medId: string, key: string, time: string): DoseId {
  return `${medId}|${key}|${time}`
}

/** Is the medication active on the given calendar day? */
export function isActiveOn(med: Medication, key: string): boolean {
  if (med.archived) return false
  if (key < med.startDate) return false
  if (med.endDate && key > med.endDate) return false
  return true
}

/** Stepping times ("HH:MM") an interval schedule hits on one calendar day. */
function intervalTimesFor(s: IntervalSchedule, key: string): string[] {
  const unit = INTERVAL_UNITS.find((u) => u.value === s.unit)
  if (!unit) return []
  const step = unit.ms * s.every
  if (step < MINUTE) return []

  const dayStart = startOfDay(parseDateKey(key))
  const dayEnd = dayStart + DAY
  const anchor = timeOnDay(parseDateKey(s.anchorDate), s.anchorTime)

  const out: string[] = []
  let k = Math.max(0, Math.ceil((dayStart - anchor) / step))
  // Guard rail: a malformed schedule must never spin.
  for (let guard = 0; guard < 5000; guard++, k++) {
    const t = anchor + k * step
    if (t >= dayEnd) break
    if (t < dayStart) continue
    out.push(minutesToTime(Math.round((t - dayStart) / MINUTE)))
  }
  return out
}

/** All dose slots for one medication on one calendar day. */
export function slotsForDay(med: Medication, key: string): DoseSlot[] {
  if (!isActiveOn(med, key)) return []
  const s = med.schedule
  if (s.kind === 'prn') return []

  const times = (s.kind === 'fixed' ? [...s.times] : intervalTimesFor(s, key))
    .filter(Boolean)
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))

  const seen = new Set<string>()
  return times.reduce<DoseSlot[]>((acc, t, i) => {
    if (seen.has(t)) return acc
    seen.add(t)
    acc.push({
      id: slotId(med.id, key, t),
      medId: med.id,
      due: timeOnDay(parseDateKey(key), t),
      label: t,
      index: i,
      notifyAt: timeOnDay(parseDateKey(key), t) - med.leadMinutes * MINUTE,
    })
    return acc
  }, [])
}

/** Number of doses a medication delivers per day. */
export function dosesPerDay(med: Medication): number {
  const s = med.schedule
  if (s.kind === 'prn') return 0
  if (s.kind === 'fixed') return s.times.length
  const unit = INTERVAL_UNITS.find((u) => u.value === s.unit)
  if (!unit) return 0
  return Math.max(1, Math.round((24 * HOUR) / (unit.ms * s.every)))
}

/* ----------------------------- factories --------------------------- */

export function makeFixedSchedule(code: FreqCode, times?: string[]): FixedSchedule {
  return { kind: 'fixed', code, times: times ?? [...PRESET_BY_CODE[code].defaultTimes] }
}

export function makeIntervalSchedule(
  every: number,
  unit: IntervalUnit,
  anchorTime = '09:00',
  anchorDate = dateKey(),
): IntervalSchedule {
  return { kind: 'interval', every, unit, anchorTime, anchorDate }
}

export function newMedId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
