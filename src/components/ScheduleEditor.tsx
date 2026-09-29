import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './Icon'
import { haptic } from '../lib/haptics'
import { minutesToTime, timeToMinutes } from '../lib/date'
import {
  FREQUENCY_PRESETS,
  INTERVAL_STEPS,
  INTERVAL_UNITS,
  intervalCode,
  intervalLabel,
  makeFixedSchedule,
  makeIntervalSchedule,
  PRESET_BY_CODE,
} from '../lib/schedule'
import type {
  FreqCode,
  IntervalUnit,
  IntervalSchedule,
  Medication,
  Schedule,
} from '../lib/types'

/* ------------------------------------------------------------------ *
 * Schedule editor: OD / BD / TDS / QID / QHS presets, a custom
 * "every N" interval mode, and editable clock times.
 * ------------------------------------------------------------------ */

type Mode = FreqCode | 'Q**' | 'PRN'

function modeOf(s: Schedule): Mode {
  if (s.kind === 'interval') return 'Q**'
  if (s.kind === 'prn') return 'PRN'
  return s.code
}

export function ScheduleEditor({
  value,
  onChange,
  startDate,
}: {
  value: Schedule
  onChange: (next: Schedule) => void
  startDate: string
}) {
  const mode = modeOf(value)

  const setMode = (m: Mode) => {
    haptic('press')
    if (m === 'PRN') {
      onChange({ kind: 'prn' })
      return
    }
    if (m === 'Q**') {
      onChange(makeIntervalSchedule(6, 'hours', '09:00', startDate))
      return
    }
    onChange(makeFixedSchedule(m as FreqCode))
  }

  return (
    <div>
      <div className="field">
        <span className="field__label">How often?</span>
        <div className="freq-grid freq-grid--wide">
          {FREQUENCY_PRESETS.map((p) => (
            <button
              key={p.code}
              type="button"
              className={`freq${mode === p.code ? ' freq--on' : ''}`}
              aria-pressed={mode === p.code}
              onClick={() => setMode(p.code)}
            >
              <span className="freq__code">{p.code}</span>
              <span className="freq__label">{p.dosesPerDay}× / day</span>
            </button>
          ))}
          <button
            type="button"
            className={`freq${mode === 'Q**' ? ' freq--on' : ''}`}
            aria-pressed={mode === 'Q**'}
            onClick={() => setMode('Q**')}
          >
            <span className="freq__code">q**</span>
            <span className="freq__label">Every n</span>
          </button>
        </div>
        <p className="field__hint">
          {mode === 'Q**'
            ? 'Repeats at a fixed interval around the clock — great for painkillers, antibiotics or anything with an 8-hour gap.'
            : mode === 'PRN'
              ? 'No reminder. Log a dose whenever you take one.'
              : mode === 'OD' || mode === 'QHS'
                ? PRESET_BY_CODE[mode as FreqCode].blurb
                : `${PRESET_BY_CODE[mode as FreqCode].dosesPerDay} doses a day. Tap a time to change it.`}
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {mode === 'PRN' ? null : mode === 'Q**' ? (
          <IntervalEditor
            key="interval"
            value={value as IntervalSchedule}
            onChange={onChange}
            startDate={startDate}
          />
        ) : (
          <TimesEditor key="times" value={value as Extract<Schedule, { kind: 'fixed' }>} onChange={onChange} />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ----------------------------- times -------------------------------- */

/**
 * Open the native time picker. Tapping anywhere in the pill should work,
 * not just the ~52px control the browser actually paints.
 */
function openPicker(input: HTMLInputElement | null) {
  if (!input) return
  haptic('tap')
  const anyInput = input as HTMLInputElement & { showPicker?: () => void }
  try {
    anyInput.showPicker?.()
  } catch {
    input.focus()
  }
}

function TimesEditor({
  value,
  onChange,
}: {
  value: Extract<Schedule, { kind: 'fixed' }>
  onChange: (next: Schedule) => void
}) {
  const times = [...value.times].sort((a, b) => timeToMinutes(a) - timeToMinutes(b))

  const setTime = (i: number, t: string) => {
    if (!/^\d{2}:\d{2}$/.test(t)) return
    const next = [...times]
    next[i] = t
    onChange({ ...value, times: next })
  }

  const addTime = () => {
    haptic('press')
    const used = new Set(times.map(timeToMinutes))
    // Offer the next round half-hour that isn't taken yet.
    let m = times.length ? timeToMinutes(times[times.length - 1]) + 240 : 8 * 60
    m = ((m % 1440) + 1440) % 1440
    for (let i = 0; i < 2880 && used.has(m); i++) m = (m + 30) % 1440
    onChange({ ...value, times: [...times, minutesToTime(m)] })
  }

  const removeTime = (i: number) => {
    if (times.length <= 1) return
    haptic('warn')
    onChange({ ...value, times: times.filter((_, idx) => idx !== i) })
  }

  return (
    <motion.div
      className="field"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      <span className="field__label">Dose times</span>
      <div className="time-row">
        <AnimatePresence initial={false}>
          {times.map((t, i) => (
            <motion.span
              key={`${i}-${t}`}
              className="time-pill"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 480, damping: 30 }}
              onClick={(e) => {
                // Tapping the chip itself opens the picker; the ✕ does not.
                if ((e.target as HTMLElement).closest('.time-pill__x')) return
                const input = e.currentTarget.querySelector('input')
                if (input) openPicker(input)
              }}
            >
              <input
                type="time"
                value={t}
                step={300}
                onChange={(e) => setTime(i, e.target.value)}
                aria-label={`Dose ${i + 1} time`}
              />
              {times.length > 1 ? (
                <button
                  type="button"
                  className="time-pill__x"
                  onClick={() => removeTime(i)}
                  aria-label={`Remove dose at ${t}`}
                >
                  <Icon name="close" size={12} strokeWidth={2.4} />
                </button>
              ) : null}
            </motion.span>
          ))}
        </AnimatePresence>
        {times.length < 6 ? (
          <button type="button" className="add-time" onClick={addTime}>
            <Icon name="plus" size={14} strokeWidth={2.2} /> Add
          </button>
        ) : null}
      </div>
      <p className="field__hint">Up to six doses a day. Tap a time to change it.</p>
    </motion.div>
  )
}

/* ---------------------------- interval ------------------------------ */

function IntervalEditor({
  value,
  onChange,
  startDate,
}: {
  value: IntervalSchedule
  onChange: (next: Schedule) => void
  startDate: string
}) {
  const steps = INTERVAL_STEPS[value.unit]
  const every = value.every
  const perDay = Math.max(1, Math.round((24 * 60) / (value.every * (value.unit === 'minutes' ? 1 : value.unit === 'hours' ? 60 : 1440))))

  const setUnit = (unit: IntervalUnit) => {
    haptic('press')
    const first = INTERVAL_STEPS[unit][1] ?? INTERVAL_STEPS[unit][0]
    onChange({ ...value, unit, every: first })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      <div className="field">
        <span className="field__label">Repeat every</span>
        <div className="chip-row" style={{ marginBottom: 'var(--sp-3)' }}>
          {INTERVAL_UNITS.map((u) => (
            <button
              key={u.value}
              type="button"
              className={`chip${value.unit === u.value ? ' chip--on' : ''}`}
              onClick={() => setUnit(u.value)}
            >
              {u.label}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {steps.map((n) => (
            <button
              key={n}
              type="button"
              className={`chip${every === n ? ' chip--on' : ''}`}
              onClick={() => {
                onChange({ ...value, every: n })
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="field__hint">
          {intervalLabel(value)} &middot; {intervalCode(value)} &middot; about{' '}
          {perDay === 1 ? 'once' : perDay}× a day
        </p>
      </div>

      <div className="field">
        <span className="field__label">First dose at</span>
        <div className="time-row">
          <span
            className="time-pill"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('.time-pill__x')) return
              openPicker(e.currentTarget.querySelector('input'))
            }}
          >
            <input
              type="time"
              value={value.anchorTime}
              step={300}
              onChange={(e) => {
                if (!/^\d{2}:\d{2}$/.test(e.target.value)) return
                onChange({ ...value, anchorTime: e.target.value, anchorDate: startDate })
              }}
              aria-label="First dose time"
            />
          </span>
        </div>
        <p className="field__hint">
          Doses repeat from here around the clock, including overnight.
        </p>
      </div>
    </motion.div>
  )
}

/* -------------------------- read-only summary ----------------------- */

export function ScheduleSummary({ med }: { med: Medication }) {
  const s = med.schedule
  if (s.kind === 'prn') return <span className="med__sub">As needed</span>

  if (s.kind === 'interval') {
    return (
      <span className="med__sub">
        {intervalCode(s)} &middot; {intervalLabel(s)}
      </span>
    )
  }

  return (
    <span className="med__sub">
      <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{s.code}</b>
      &nbsp;&middot;&nbsp;{s.times.join('  ')}
    </span>
  )
}
