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

/**
 * Spread `count` doses evenly around the clock, starting at `anchor`.
 * Wraps past midnight rather than clamping, so a 4-a-day regimen started
 * at 18:00 keeps all four doses (18:00, 00:00, 06:00, 12:00).
 */
function spread(count: number, anchor: string): string[] {
  const start = timeToMinutes(anchor)
  const gap = count > 1 ? Math.round(1440 / count) : 1440
  return Array.from({ length: count }, (_, i) => minutesToTime(start + i * gap))
}

export interface FrequencyPreset {
  code: FreqCode
  label: string
  latin: string
  expansion: string
  dosesPerDay: number
  icon: string
  /** Clock time the user is expected to take their *first* dose. */
  defaultAnchor: string
  /** Evenly spread from `defaultAnchor`; kept as a fallback and for old data. */
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
    defaultAnchor: '09:00',
    defaultTimes: spread(1, '09:00'),
    blurb: 'One dose at the same time every day',
  },
  {
    code: 'BD',
    label: 'Twice daily',
    latin: 'BD',
    expansion: 'Bis die',
    dosesPerDay: 2,
    icon: '\u25D0',
    defaultAnchor: '09:00',
    defaultTimes: spread(2, '09:00'),
    blurb: 'Every 12 hours — set your first dose and the rest follow',
  },
  {
    code: 'TDS',
    label: 'Three times daily',
    latin: 'TDS',
    expansion: 'Ter die semis',
    dosesPerDay: 3,
    icon: '\u25D1',
    defaultAnchor: '07:00',
    defaultTimes: spread(3, '07:00'),
    blurb: 'Every 8 hours — set your first dose and the rest follow',
  },
  {
    code: 'QID',
    label: 'Four times daily',
    latin: 'QID',
    expansion: 'Quater in die',
    dosesPerDay: 4,
    icon: '\u25A3',
    defaultAnchor: '06:00',
    defaultTimes: spread(4, '06:00'),
    blurb: 'Every 6 hours — set your first dose and the rest follow',
  },
  {
    code: 'QHS',
    label: 'At bedtime',
    latin: 'QHS',
    expansion: 'Hora somni',
    dosesPerDay: 1,
    icon: '\u263D',
    defaultAnchor: '22:30',
    defaultTimes: spread(1, '22:30'),
    blurb: 'Once, before sleep',
  },
]

export const PRESET_BY_CODE = Object.fromEntries(
  FREQUENCY_PRESETS.map((p) => [p.code, p]),
) as Record<FreqCode, FrequencyPreset>

/* ------------------------- anchored dosing ------------------------- */
/*
 * OD / BD / TDS / QID are anchored regimens: you pick the *first* dose and
 * the others fall on an even spread around the clock. A QID started at
 * 06:00 doses at 06:00, 12:00, 18:00 and 00:00; a BD started at 10:00
 * doses at 10:00 and 22:00; a TDS started at 06:00 doses at 06:00, 14:00
 * and 22:00. One input, the whole day falls into place.
 */

/** Minutes between doses for a code. 0 for once-daily codes. */
export function gapMinutes(code: FreqCode): number {
  const n = PRESET_BY_CODE[code].dosesPerDay
  return n > 1 ? Math.round(1440 / n) : 0
}

/**
 * Dose times for `code` when the first dose lands on `anchor`, in dosing
 * order starting from that anchor. Wraps across midnight.
 */
export function timesFromAnchor(code: FreqCode, anchor: string): string[] {
  return spread(PRESET_BY_CODE[code].dosesPerDay, anchor)
}

/** "Every 6 hours" / "Once a day" — how the anchored doses are spaced. */
export function gapLabel(code: FreqCode): string {
  const gap = gapMinutes(code)
  if (!gap) return PRESET_BY_CODE[code].code === 'QHS' ? 'Once, at bedtime' : 'Once a day'
  if (gap % 60 === 0) {
    const h = gap / 60
    return `Every ${h} hour${h === 1 ? '' : 's'}`
  }
  return `Every ${gap} minutes`
}

/** Clinical shorthand for the gap, e.g. "6h" or "90min". */
export function shortGapLabel(code: FreqCode): string {
  const gap = gapMinutes(code)
  if (!gap) return 'once'
  return gap % 60 === 0 ? `${gap / 60}h` : `${gap}min`
}

/**
 * Does this regimen's spread run past midnight back into the early hours?
 *
 * Checks the *last* dose of the spread, not the next one: a QID started at
 * 06:00 only reaches midnight on its fourth dose (06, 12, 18, 00:00).
 * `>=` because landing exactly on 00:00 is the night dose.
 */
export function wrapsMidnight(code: FreqCode, anchor: string): boolean {
  const last = PRESET_BY_CODE[code].dosesPerDay - 1
  if (last < 1) return false
  return timeToMinutes(anchor) + last * gapMinutes(code) >= 1440
}

/** Earliest time of day, the anchor a pre-anchoring schedule is read at. */
export function earliestTime(ts: string[]): string {
  if (!ts.length) return '09:00'
  return [...ts].sort((a, b) => timeToMinutes(a) - timeToMinutes(b))[0]
}

/** The schedule's first dose — its stored anchor, else the earliest time. */
export function anchorOf(s: FixedSchedule): string {
  return s.anchor ?? earliestTime(s.times)
}

/**
 * Are these times an even spread from their own earliest dose?
 *
 * Lets the editor pick the right editing mode without asking: a regimen
 * saved as 09:00/21:00 is already anchored, an odd 08:00/12:00/16:00/20:00
 * is not. Comparison is order-insensitive because a wrap past midnight
 * only rotates the same set of times.
 */
export function isAnchored(code: FreqCode, ts: string[]): boolean {
  if (!ts.length) return true
  const expected = timesFromAnchor(code, earliestTime(ts))
  if (expected.length !== ts.length) return false
  const have = [...ts].sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
  return expected.every((t, i) => t === have[i])
}

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

/** Minutes between doses for an interval schedule, 0 for a multi-day one. */
export function intervalStepMinutes(s: IntervalSchedule): number {
  if (s.unit === 'minutes') return s.every
  if (s.unit === 'hours') return s.every * 60
  return 0
}

/**
 * The clock times an interval schedule hits within a day, starting from
 * its anchor. Capped so a q30min doesn't print 48 chips.
 */
export function intervalDayTimes(s: IntervalSchedule, cap = 8): string[] {
  const step = intervalStepMinutes(s)
  if (step <= 0) return []
  const perDay = Math.max(1, Math.floor(1440 / step))
  const start = timeToMinutes(s.anchorTime)
  return Array.from({ length: Math.min(cap, perDay) }, (_, i) => minutesToTime(start + i * step))
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
  return {
    kind: 'fixed',
    code,
    times: times ?? [...PRESET_BY_CODE[code].defaultTimes],
    anchor: PRESET_BY_CODE[code].defaultAnchor,
  }
}

/** An anchored schedule: the given first dose, and the rest derived from it. */
export function makeAnchoredSchedule(code: FreqCode, anchor: string): FixedSchedule {
  return { kind: 'fixed', code, times: timesFromAnchor(code, anchor), anchor }
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
