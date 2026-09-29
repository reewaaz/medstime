/* ------------------------------------------------------------------ *
 * Core domain types for MedsTime
 * ------------------------------------------------------------------ */

/** Preset clinical frequency codes. */
export type FreqCode = 'OD' | 'BD' | 'TDS' | 'QID' | 'QHS'

/** Unit for the "q**" (every-N) schedules. */
export type IntervalUnit = 'minutes' | 'hours' | 'days'

export type ScheduleKind = 'fixed' | 'interval' | 'prn'

/**
 * Fixed clock-time schedules (OD / BD / TDS / QID / QHS).
 * `times` are local wall-clock times as "HH:MM", one per daily dose.
 */
export interface FixedSchedule {
  kind: 'fixed'
  code: FreqCode
  times: string[]
}

/**
 * "q**" rolling interval schedules — every N minutes / hours / days,
 * counted from `anchor` and repeating indefinitely.
 */
export interface IntervalSchedule {
  kind: 'interval'
  every: number
  unit: IntervalUnit
  /** Local time of day the first dose is anchored to, "HH:MM". */
  anchorTime: string
  /** Local calendar date the anchor falls on, "YYYY-MM-DD". */
  anchorDate: string
}

/** As-needed medication: no schedule, logged on demand. */
export interface PrnSchedule {
  kind: 'prn'
}

export type Schedule = FixedSchedule | IntervalSchedule | PrnSchedule

export interface Medication {
  id: string
  name: string
  /** Strength / amount, e.g. "500 mg", "1 tablet". */
  dose: string
  /** Free-text instructions, e.g. "After food". */
  instructions: string
  /** Accent key from the palette. */
  color: PaletteKey
  schedule: Schedule
  /** First day the medication is active, "YYYY-MM-DD". */
  startDate: string
  /** Optional last day, "YYYY-MM-DD". */
  endDate: string | null
  /** Remind this many minutes before the scheduled time. */
  leadMinutes: number
  archived: boolean
  createdAt: number
}

export type DoseStatus = 'pending' | 'taken' | 'skipped'

export interface DoseRecord {
  id: DoseId
  medId: string
  status: DoseStatus
  /** Epoch ms the dose was actually taken / skipped. */
  at?: number
}

/** Stable per-day slot identifier: `${medId}|${dateKey}|${HH:MM}`. */
export type DoseId = string

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeChoice
  haptics: boolean
  /** Play a short chime alongside notifications. */
  sound: boolean
  /** Highlight doses due within this window on the timeline. */
  soonWindowMinutes: number
  /** Hour at which "today" rolls over, for night-owl users. */
  dayStartHour: number
  /** How long a missed dose stays eligible for late logging, in hours. */
  graceHours: number
}

export interface AppState {
  meds: Medication[]
  /** doseId -> record. Absent means "pending". */
  records: Record<DoseId, DoseRecord>
  settings: Settings
  onboarded: boolean
}

export type PaletteKey =
  | 'grape'
  | 'coral'
  | 'mint'
  | 'sky'
  | 'amber'
  | 'rose'
  | 'lime'
  | 'violet'
