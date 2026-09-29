import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './Icon'
import { haptic } from '../lib/haptics'
import { minutesToTime, timeToMinutes } from '../lib/date'
import {
  FREQUENCY_PRESETS,
  INTERVAL_STEPS,
  INTERVAL_UNITS,
  anchorOf,
  earliestTime,
  gapLabel,
  intervalCode,
  intervalDayTimes,
  intervalLabel,
  intervalStepMinutes,
  isAnchored,
  makeAnchoredSchedule,
  makeIntervalSchedule,
  PRESET_BY_CODE,
  shortGapLabel,
  timesFromAnchor,
  wrapsMidnight,
} from '../lib/schedule'
import type {
  FreqCode,
  IntervalSchedule,
  IntervalUnit,
  Medication,
  Schedule,
} from '../lib/types'

/* ------------------------------------------------------------------ *
 * Schedule editor: OD / BD / TDS / QID / QHS presets, a custom
 * "every N" interval mode, and editable clock times.
 *
 * The frequency codes are *anchored*: you set the first dose and the
 * rest of the day is worked out for you. Set a QID first dose to 06:00
 * and the other three land at 12:00, 18:00 and midnight automatically.
 * Anything that doesn't fit an even spread (QID with meals, say) can be
 * unpinned into individual editable times.
 * ------------------------------------------------------------------ */

type Mode = FreqCode | 'Q**' | 'PRN'

/** One-tap alternatives to opening the time picker for the first dose. */
const ANCHOR_CHIPS = ['06:00', '08:00', '09:00', '12:00', '18:00', '22:00']

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
  // null = follow the data. A regimen that is an even spread opens on the
  // one-tap anchored editor; an odd one opens unpinned and stays editable.
  const [unpinned, setUnpinned] = useState<boolean | null>(null)

  const setMode = (m: Mode) => {
    haptic('press')
    setUnpinned(null)
    if (m === 'PRN') {
      onChange({ kind: 'prn' })
      return
    }
    if (m === 'Q**') {
      onChange(makeIntervalSchedule(6, 'hours', '09:00', startDate))
      return
    }
    const code = m as FreqCode
    // Carry the user's existing first dose across so switching BD -> QID
    // re-spreads around the time they actually wake up.
    const keep = value.kind === 'fixed' ? anchorOf(value) : null
    onChange(makeAnchoredSchedule(code, keep ?? PRESET_BY_CODE[code].defaultAnchor))
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
              : PRESET_BY_CODE[mode as FreqCode].blurb}
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
          <FixedEditor
            key="times"
            value={value as Extract<Schedule, { kind: 'fixed' }>}
            onChange={onChange}
            unpinned={unpinned}
            setUnpinned={setUnpinned}
          />
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

function FixedEditor({
  value,
  onChange,
  unpinned,
  setUnpinned,
}: {
  value: Extract<Schedule, { kind: 'fixed' }>
  onChange: (next: Schedule) => void
  unpinned: boolean | null
  setUnpinned: (v: boolean | null) => void
}) {
  const code = value.code
  const preset = PRESET_BY_CODE[code]
  const manual = unpinned ?? !isAnchored(code, value.times)
  // Read the anchor the schedule was saved with. Falling back to the
  // earliest time would drift once the spread crosses midnight.
  const anchor = anchorOf(value)
  const derived = timesFromAnchor(code, anchor)
  const wraps = wrapsMidnight(code, anchor)

  const setAnchor = (next: string) => {
    if (!/^\d{2}:\d{2}$/.test(next)) return
    onChange({ ...value, times: timesFromAnchor(code, next), anchor: next })
  }

  return (
    <motion.div
      className="field"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      {manual ? (
        <ManualTimes
          value={value}
          onChange={onChange}
          onEvenOut={() => {
            haptic('press')
            setUnpinned(false)
            onChange({ ...value, times: derived, anchor })
          }}
          evenlySpreads={isAnchored(code, value.times)}
        />
      ) : (
        <>
          <span className="field__label">First dose at</span>
          <div className="time-row">
            <span
              className="time-pill time-pill--hero"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.time-pill__x')) return
                openPicker(e.currentTarget.querySelector('input'))
              }}
            >
              <input
                type="time"
                value={anchor}
                step={300}
                onChange={(e) => setAnchor(e.target.value)}
                aria-label="First dose time"
              />
            </span>
            {preset.dosesPerDay > 1 ? (
              <span className="anchor-derive">
                <Icon name="sparkle" size={13} />
                {gapLabel(code)}
              </span>
            ) : null}
          </div>

          {preset.dosesPerDay > 1 ? (
            <div className="chip-row" style={{ marginTop: 'var(--sp-2)' }}>
              {ANCHOR_CHIPS.map((t) => (
                <button
                  key={t}
                  className={`chip${anchor === t ? ' chip--on' : ''}`}
                  onClick={() => {
                    haptic('tap')
                    setAnchor(t)
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}

          {preset.dosesPerDay > 1 ? (
            <div className="spread-preview">
              <span className="spread-preview__label">Then all day</span>
              <div className="spread-preview__times">
                {derived.map((t, i) => (
                  <motion.span
                    key={t}
                    className="spread-preview__time"
                    initial={{ opacity: 0, y: 6, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 520,
                      damping: 32,
                      delay: i * 0.04,
                    }}
                  >
                    {t}
                  </motion.span>
                ))}
              </div>
              {wraps ? (
                <p className="field__hint" style={{ marginTop: 'var(--sp-2)' }}>
                  The last doses run past midnight into the early hours.
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            className="link-btn"
            onClick={() => {
              haptic('press')
              setUnpinned(true)
            }}
          >
            <Icon name="clock" size={13} />
            Set each dose time myself
          </button>
        </>
      )}
    </motion.div>
  )
}

/** Escape hatch: individual, non-uniform dose times. */
function ManualTimes({
  value,
  onChange,
  onEvenOut,
  evenlySpreads,
}: {
  value: Extract<Schedule, { kind: 'fixed' }>
  onChange: (next: Schedule) => void
  onEvenOut: () => void
  evenlySpreads: boolean
}) {
  const times = [...value.times].sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
  const code = value.code
  const anchor = earliestTime(times)

  // Once the user starts picking individual times they are the source of
  // truth, so drop the anchor rather than leaving a stale one behind.
  const apply = (next: string[]) => onChange({ ...value, times: next, anchor: undefined })

  const setTime = (i: number, t: string) => {
    if (!/^\d{2}:\d{2}$/.test(t)) return
    const next = [...times]
    next[i] = t
    apply(next)
  }

  const addTime = () => {
    haptic('press')
    const used = new Set(times.map(timeToMinutes))
    // Offer the next round half-hour that isn't taken yet.
    let m = times.length ? timeToMinutes(times[times.length - 1]) + 240 : 8 * 60
    m = ((m % 1440) + 1440) % 1440
    for (let i = 0; i < 2880 && used.has(m); i++) m = (m + 30) % 1440
    apply([...times, minutesToTime(m)])
  }

  const removeTime = (i: number) => {
    if (times.length <= 1) return
    haptic('warn')
    apply(times.filter((_, idx) => idx !== i))
  }

  return (
    <>
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

      {PRESET_BY_CODE[code].dosesPerDay > 1 ? (
        <button type="button" className="link-btn" onClick={onEvenOut}>
          <Icon name="sparkle" size={13} />
          {evenlySpreads
            ? `Back to every ${shortGapLabel(code)} from ${anchor}`
            : `Even them out ${gapLabel(code).toLowerCase()} from ${anchor}`}
        </button>
      ) : null}
    </>
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
  const dayTimes = intervalDayTimes(value)

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
            className="time-pill time-pill--hero"
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

        {dayTimes.length > 1 ? (
          <div className="spread-preview">
            <span className="spread-preview__label">Then</span>
            <div className="spread-preview__times">
              {dayTimes.map((t, i) => (
                <motion.span
                  key={t}
                  className="spread-preview__time"
                  initial={{ opacity: 0, y: 6, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 32, delay: i * 0.03 }}
                >
                  {t}
                </motion.span>
              ))}
              {dayTimes.length === 8 ? (
                <span className="spread-preview__more">+ more</span>
              ) : null}
            </div>
          </div>
        ) : intervalStepMinutes(value) === 0 ? (
          <p className="field__hint" style={{ marginTop: 'var(--sp-2)' }}>
            Repeats every {every} days at {value.anchorTime}.
          </p>
        ) : null}
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
