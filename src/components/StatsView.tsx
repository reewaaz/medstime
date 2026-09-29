import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './Icon'
import { lastNDays, shortDateLabel } from '../lib/date'
import { adherenceOver, perMedication, timeOfDayBreakdown } from '../lib/stats'
import { paletteFor } from '../lib/colors'
import type { AppState } from '../lib/types'

/* ------------------------------------------------------------------ *
 * Insights — adherence over time, streaks, and when you actually take
 * your medication.
 * ------------------------------------------------------------------ */

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const

export function StatsView({ state }: { state: AppState }) {
  const [days, setDays] = useState<number>(7)
  const stats = useMemo(
    () => adherenceOver(state, days, state.settings.dayStartHour),
    [state, days],
  )
  const perMed = useMemo(
    () => perMedication(state, days, state.settings.dayStartHour).slice(0, 5),
    [state, days],
  )
  const dist = useMemo(
    () => timeOfDayBreakdown(state, days, state.settings.dayStartHour),
    [state, days],
  )
  const todayKey = stats.days.length ? stats.days[stats.days.length - 1].key : ''
  const maxScheduled = Math.max(1, ...dist.map((d) => d.scheduled))
  const resolved = stats.taken + stats.skipped

  return (
    <div>
      <header className="topbar">
        <div className="topbar__titles">
          <div className="topbar__eyebrow">Insights</div>
          <h1 className="topbar__title">Your progress</h1>
        </div>
      </header>

      {stats.scheduled === 0 ? (
        <div className="section">
          <div className="card">
            <div className="empty">
              <div className="empty__art" style={{ width: 64, height: 64 }}>
                <Icon name="chart" size={28} />
              </div>
              <h2 className="empty__title">No data yet</h2>
              <p className="empty__text">
                Add a medication and start marking doses — your adherence history builds from here.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* headline stats */}
          <div className="section">
            <div className="stat-grid">
              <div className="stat">
                <div className="stat__label">Adherence</div>
                <div className="stat__value">{Math.round(stats.rate * 100)}%</div>
                <div className="stat__sub">
                  {stats.taken} of {resolved} resolved
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">Perfect streak</div>
                <div className="stat__value">
                  {stats.perfectStreak}
                  <span style={{ fontSize: '0.5em', fontWeight: 650, opacity: 0.6 }}> d</span>
                </div>
                <div className="stat__sub">
                  {stats.activeStreak > 0 ? `${stats.activeStreak}d streak overall` : 'start today'}
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">Doses taken</div>
                <div className="stat__value">{stats.taken}</div>
                <div className="stat__sub">last {days} days</div>
              </div>
              <div className="stat">
                <div className="stat__label">Missed</div>
                <div className="stat__value" style={{ color: stats.skipped ? 'var(--danger)' : undefined }}>
                  {stats.skipped}
                </div>
                <div className="stat__sub">
                  {stats.pending > 0 ? `${stats.pending} still due` : 'all caught up'}
                </div>
              </div>
            </div>
          </div>

          {/* streak banner */}
          {stats.perfectStreak >= 3 ? (
            <div className="section">
              <div className="milestone">
                <div className="milestone__icon">
                  <Icon name="flame" size={20} />
                </div>
                <div>
                  <div className="milestone__title">{stats.perfectStreak}-day perfect streak</div>
                  <div className="milestone__sub">
                    Every scheduled dose taken. Keep it going.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* daily chart */}
          <div className="section">
            <div className="section__head">
              <h2 className="section__title">Daily</h2>
              <div className="segmented" style={{ width: 150 }}>
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    className="segmented__item"
                    aria-pressed={days === r.days}
                    onClick={() => setDays(r.days)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card__body">
                <div className="chart">
                  {stats.days.map((d, i) => {
                    const total = d.scheduled || 1
                    return (
                      <div className="chart__col" key={d.key}>
                        <div
                          className="chart__stack"
                          title={`${shortDateLabel(d.key)} — ${d.taken}/${d.scheduled} taken`}
                        >
                          {d.scheduled === 0 ? (
                            <div className="chart__seg chart__seg--empty" style={{ height: '4%' }} />
                          ) : (
                            <>
                              <motion.div
                                className="chart__seg chart__seg--skipped"
                                initial={{ height: 0 }}
                                animate={{ height: `${(d.skipped / total) * 100}%` }}
                                transition={{ duration: 0.5, delay: Math.min(i * 0.012, 0.3) }}
                              />
                              <motion.div
                                className="chart__seg chart__seg--taken"
                                initial={{ height: 0 }}
                                animate={{ height: `${(d.taken / total) * 100}%` }}
                                transition={{ duration: 0.5, delay: Math.min(i * 0.012, 0.3) }}
                              />
                            </>
                          )}
                        </div>
                        <span
                          className={`chart__label${d.key === todayKey ? ' chart__label--today' : ''}`}
                        >
                          {d.key === todayKey
                            ? 'now'
                            : new Date(d.key + 'T00:00:00').toLocaleDateString(undefined, {
                                weekday: 'narrow',
                              })}
                        </span>
                        <span className="sr-only">
                          {shortDateLabel(d.key)}: {d.taken} taken, {d.skipped} skipped
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--sp-4)',
                    marginTop: 'var(--sp-4)',
                    justifyContent: 'center',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--ink-3)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <i
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: 'linear-gradient(120deg,var(--accent),var(--accent-bright))',
                        display: 'inline-block',
                      }}
                    />
                    Taken
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <i
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: 'var(--hairline)',
                        display: 'inline-block',
                      }}
                    />
                    Missed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* time of day */}
          <div className="section">
            <div className="section__head">
              <h2 className="section__title">When you take them</h2>
              <span className="section__meta">last {days} days</span>
            </div>
            <div className="card">
              <div className="card__body">
                <div className="dist">
                  {dist.map((d) => (
                    <div className="dist__row" key={d.label}>
                      <span className="dist__label">{d.label}</span>
                      <div className="dist__track">
                        <motion.div
                          className="dist__fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${(d.taken / maxScheduled) * 100}%` }}
                          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <span className="dist__value">{d.taken}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* per medication */}
          {perMed.length > 0 ? (
            <div className="section">
              <div className="section__head">
                <h2 className="section__title">By medication</h2>
              </div>
              <div className="card">
                <div className="card__body">
                  <div className="dist">
                    <AnimatePresence initial={false}>
                      {perMed.map((m) => {
                        const p = paletteFor(m.med.color)
                        return (
                          <motion.div
                            className="dist__row"
                            key={m.med.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            style={{ ['--accent' as string]: p.base, ['--accent-bright' as string]: p.bright }}
                          >
                            <span
                              className="dist__label"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                color: 'var(--ink-2)',
                                width: 92,
                              }}
                            >
                              <i
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: 999,
                                  background: p.base,
                                  flex: 'none',
                                }}
                              />
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {m.med.name}
                              </span>
                            </span>
                            <div className="dist__track">
                              <motion.div
                                className="dist__fill"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.round(m.rate * 100)}%` }}
                                transition={{ duration: 0.6 }}
                              />
                            </div>
                            <span className="dist__value">{Math.round(m.rate * 100)}%</span>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="section">
            <p className="field__hint" style={{ textAlign: 'center', padding: '0 var(--sp-4)' }}>
              {lastNDays(days).length} days tracked. MedsTime stores everything on this device only.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
