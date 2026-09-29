/* ------------------------------------------------------------------ *
 * Local-date helpers. Everything in MedsTime is anchored to the user's
 * own calendar day, never UTC — a dose at 08:00 means 08:00 where they
 * are standing.
 * ------------------------------------------------------------------ */

export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

/** "YYYY-MM-DD" for a Date, in local time. */
export function dateKey(d: Date | number = Date.now()): string {
  const dt = typeof d === 'number' ? new Date(d) : d
  const y = dt.getFullYear()
  const m = `${dt.getMonth() + 1}`.padStart(2, '0')
  const day = `${dt.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse "YYYY-MM-DD" into a local Date at midnight. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Midnight (00:00 local) of the given day. */
export function startOfDay(d: Date | number = Date.now()): number {
  const dt = typeof d === 'number' ? new Date(d) : d
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
}

/** The calendar day that contains `ts`, honouring a custom day-start hour. */
export function logicalDateKey(ts: number, dayStartHour = 0): string {
  const shifted = new Date(ts - dayStartHour * HOUR)
  return dateKey(shifted)
}

/** "HH:MM" -> minutes since local midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Minutes since local midnight -> "HH:MM". */
export function minutesToTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${`${Math.floor(m / 60)}`.padStart(2, '0')}:${`${m % 60}`.padStart(2, '0')}`
}

/** "HH:MM" -> epoch ms on the calendar day containing `base`. */
export function timeOnDay(base: Date | number, time: string): number {
  const dayStart = startOfDay(base)
  return dayStart + timeToMinutes(time) * MINUTE
}

/** Local "HH:MM" label for an epoch timestamp. */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

/** "Today" / "Tomorrow" / "Yesterday" relative to a day key. */
export function relativeDayLabel(key: string, now = Date.now()): string {
  const diff = Math.round(
    (startOfDay(parseDateKey(key)) - startOfDay(now)) / DAY,
  )
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return `In ${diff} days`
  if (diff < -1 && diff > -7) return `${-diff} days ago`
  return new Date(key + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/** Short weekday + date, e.g. "Mon 14". */
export function shortDateLabel(key: string): string {
  return new Date(key + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  })
}

/** Inclusive list of date keys ending at `endKey`, `count` long. */
export function lastNDays(count: number, endKey = dateKey()): string[] {
  const end = startOfDay(parseDateKey(endKey))
  return Array.from({ length: count }, (_, i) => dateKey(end - (count - 1 - i) * DAY))
}

export function addDaysKey(key: string, delta: number): string {
  return dateKey(startOfDay(parseDateKey(key)) + delta * DAY)
}
