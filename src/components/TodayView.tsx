import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'
import { Icon } from './Icon'
import { ProgressRing } from './ProgressRing'
import { DoseRow } from './DoseRow'
import { ConfettiBurst } from './Confetti'
import { CelebrationOverlay, type Celebration } from './Celebration'
import { paletteFor } from '../lib/colors'
import { HOUR, MINUTE, relativeDayLabel } from '../lib/date'
import { chime, haptic } from '../lib/haptics'
import { intervalCode, scheduleLabel } from '../lib/schedule'
import { actions } from '../lib/store'
import { statsForDay } from '../lib/stats'
import type { DoseView } from '../hooks/useDoses'
import type { AppState } from '../lib/types'

/* ------------------------------------------------------------------ *
 * Today — the heart of the app.
 * ------------------------------------------------------------------ */

function countdown(ts: number, now: number): string {
  const diff = ts - now
  if (diff <= 0) return 'due now'
  const mins = Math.round(diff / MINUTE)
  if (mins < 60) return `in ${mins} min`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (hours < 24) return rem ? `in ${hours}h ${rem}m` : `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

export function TodayView({
  state,
  doses,
  now,
  todayKey,
  celebration,
  setCelebration,
  confettiKey,
  fireConfetti,
  onAdd,
}: {
  state: AppState
  doses: DoseView[]
  now: number
  todayKey: string
  celebration: Celebration | null
  setCelebration: (c: Celebration | null) => void
  confettiKey: number
  fireConfetti: (intensity?: number) => void
  onAdd: () => void
}) {
  const stats = useMemo(() => statsForDay(state, todayKey), [state, todayKey])

  const actionable = useMemo(
    () =>
      doses.find(
        (d) => d.status === 'pending' && d.slot.due - now <= 2 * HOUR,
      ) ??
      doses.find((d) => d.status === 'pending') ??
      null,
    [doses, now],
  )

  const upcoming = useMemo(
    () => doses.find((d) => d.status === 'pending' && d.slot.due > now) ?? null,
    [doses, now],
  )

  const rate = stats.scheduled ? stats.taken / stats.scheduled : 0
  const complete = stats.scheduled > 0 && stats.taken === stats.scheduled
  const lateCount = doses.filter((d) => d.status === 'pending' && d.phase === 'late').length

  /* ----------------------------- actions ---------------------------- */

  const take = (d: DoseView) => {
    actions.setDose(d.slot.id, d.med.id, 'taken')
    if (state.settings.sound) chime('success')

    // Re-derive stats after the write so the celebration is accurate.
    const after = statsForDay(
      { ...state, records: { ...state.records, [d.slot.id]: { id: d.slot.id, medId: d.med.id, status: 'taken', at: Date.now() } } },
      todayKey,
    )
    const doneAll = after.scheduled > 0 && after.taken === after.scheduled
    const nextLeft = after.scheduled - after.taken

    if (doneAll) {
      setCelebration({
        id: Date.now(),
        title: 'All done for today',
        subtitle: `${after.taken} dose${after.taken === 1 ? '' : 's'} taken`,
        meta: relativeDayLabel(todayKey),
        grand: true,
      })
      fireConfetti(1.35)
      haptic('celebrate')
    } else {
      setCelebration({
        id: Date.now(),
        title: 'Dose taken',
        subtitle: d.med.name + (d.med.dose ? ` · ${d.med.dose}` : ''),
        meta: `${nextLeft} left today`,
        grand: false,
      })
      fireConfetti(0.8)
    }
  }

  const skip = (d: DoseView) => {
    actions.setDose(d.slot.id, d.med.id, 'skipped')
  }

  const undo = (d: DoseView) => {
    actions.setDose(d.slot.id, d.med.id, 'pending')
  }

  /* ----------------------------- accents ---------------------------- */

  const accent = actionable?.med.color ?? upcoming?.med.color ?? doses[0]?.med.color ?? 'grape'
  const p = paletteFor(accent)

  const hour = new Date(now).getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const dateLabel = new Date(todayKey + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // Show every dose scheduled for today. An anchored QID has a midnight
  // dose, and hiding it here would leave the timeline out of step with the
  // progress ring, which counts all four. `graceHours` bounds how long a
  // missed dose stays listed.
  const dayDoses = doses.filter((d) => d.slot.due > now - state.settings.graceHours * HOUR)
  const remaining = dayDoses.filter((d) => d.status === 'pending')

  return (
    <div
      style={{
        ['--accent' as string]: p.base,
        ['--accent-bright' as string]: p.bright,
        ['--accent-deep' as string]: p.deep,
        ['--accent-rgb' as string]: p.rgb,
      }}
    >
      {/* ------------------------- header ------------------------- */}
      <header className="topbar">
        <div className="topbar__titles">
          <div className="topbar__eyebrow">{dateLabel}</div>
          <h1 className="topbar__title">{greeting}</h1>
        </div>
        {stats.scheduled > 0 ? (
          <div className="chip" style={{ gap: 6 }}>
            <Icon name="flame" size={14} />
            {stats.taken}/{stats.scheduled}
          </div>
        ) : null}
      </header>

      {state.meds.length === 0 ? (
        /* ------------------------- empty ------------------------- */
        <div className="section">
          <div className="card">
            <div className="empty">
              <div className="empty__art">
                <Icon name="pill" size={38} />
              </div>
              <h2 className="empty__title">Nothing scheduled yet</h2>
              <p className="empty__text">
                Add your first medication and MedsTime will remind you at the right time — with a
                buzz, a notification, and a little celebration when you take it.
              </p>
              <button className="btn btn--primary btn--lg" style={{ marginTop: 'var(--sp-2)' }} onClick={onAdd}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                Add medication
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ---------------------- progress ---------------------- */}
          <section className="section hero">
            <div className="card">
              <ProgressRing value={rate} taken={stats.taken} total={stats.scheduled} />
              <div className="hero__summary">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={complete ? 'done' : stats.taken === 0 ? 'start' : 'progress'}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="hero__summary-title">
                      {complete
                        ? 'Perfect day — every dose taken'
                        : stats.scheduled === 0
                          ? 'No doses scheduled today'
                          : stats.taken === 0
                            ? `${stats.scheduled} dose${stats.scheduled === 1 ? '' : 's'} to go today`
                            : `${stats.scheduled - stats.taken} of ${stats.scheduled} left today`}
                    </div>
                    <div className="hero__summary-sub">
                      {stats.scheduled > 0
                        ? `${Math.round(rate * 100)}% of today's doses taken`
                        : 'Rest day — or add a medication'}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </section>

          {/* --------------------- overdue alert ------------------ */}
          <AnimatePresence>
            {lateCount > 0 ? (
              <motion.section
                className="section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="alert-strip">
                  <div
                    className="onboard__bullet"
                    style={{ color: 'var(--warn)', background: 'rgba(var(--warn-rgb),0.14)', borderColor: 'rgba(var(--warn-rgb),0.3)' }}
                  >
                    <Icon name="clock" size={17} />
                  </div>
                  <div className="alert-strip__text">
                    <b>
                      {lateCount} dose{lateCount === 1 ? '' : 's'} overdue
                    </b>{' '}
                    — still time to take {lateCount === 1 ? 'it' : 'them'}.
                  </div>
                </div>
              </motion.section>
            ) : null}
          </AnimatePresence>

          {/* ------------------------ next up --------------------- */}
          {actionable || upcoming ? (
            <section className="section">
              <div className="next">
                <motion.div
                  className="next__pulse"
                  animate={actionable ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                  transition={
                    actionable
                      ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0 }
                  }
                >
                  <Icon name={actionable ? 'bell' : 'clock'} size={22} />
                </motion.div>
                <div className="next__info">
                  <div className="next__label">{actionable ? 'Due now' : 'Up next'}</div>
                  <div className="next__name">{(actionable ?? upcoming)!.med.name}</div>
                  <div className="next__time">
                    {(actionable ?? upcoming)!.med.dose
                      ? `${(actionable ?? upcoming)!.med.dose} · `
                      : ''}
                    {actionable
                      ? 'ready to take'
                      : `${(upcoming!.slot.label)} ${countdown(upcoming!.slot.due, now)}`}
                  </div>
                </div>
                {actionable ? (
                  <button
                    className="btn btn--ok"
                    onClick={() => take(actionable)}
                    aria-label={`Mark ${actionable.med.name} as taken`}
                  >
                    <Icon name="check" size={17} strokeWidth={2.6} />
                    Taken
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* ----------------------- timeline --------------------- */}
          <section className="section">
            <div className="section__head">
              <h2 className="section__title">Today</h2>
              <span className="section__meta">
                {remaining.length > 0
                  ? `${remaining.length} remaining`
                  : stats.scheduled > 0
                    ? 'complete'
                    : '—'}
              </span>
            </div>

            {dayDoses.length === 0 ? (
              <div className="card">
                <div className="empty">
                  <div className="empty__art" style={{ width: 64, height: 64 }}>
                    <Icon name="calendar" size={28} />
                  </div>
                  <h3 className="empty__title">No doses today</h3>
                  <p className="empty__text">
                    None of your medications are due on this day.
                  </p>
                </div>
              </div>
            ) : (
              <div className="timeline">
                <AnimatePresence initial={false} mode="popLayout">
                  {dayDoses.map((d) => (
                    <DoseRow
                      key={d.slot.id}
                      dose={d}
                      isNext={actionable?.slot.id === d.slot.id}
                      onTake={take}
                      onSkip={skip}
                      onUndo={undo}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>

          {/* ------------------------ summary --------------------- */}
          {state.meds.length > 0 ? (
            <section className="section">
              <div className="card">
                <div className="card__body">
                  <div className="section__title" style={{ marginBottom: 'var(--sp-3)' }}>
                    Your regimen
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                    {state.meds.map((m) => {
                      const mp = paletteFor(m.color)
                      const s = m.schedule
                      const code = s.kind === 'interval' ? intervalCode(s) : s.kind === 'fixed' ? s.code : 'PRN'
                      const detail =
                        s.kind === 'fixed'
                          ? s.times.join(' · ')
                          : s.kind === 'interval'
                            ? scheduleLabel(s)
                            : 'as needed'
                      return (
                        <span
                          key={m.id}
                          className="chip"
                          style={{
                            borderColor: `rgba(${mp.rgb},0.35)`,
                            background: `rgba(${mp.rgb},0.12)`,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: mp.base,
                              flex: 'none',
                            }}
                          />
                          <b style={{ color: 'var(--ink-1)' }}>{code}</b>
                          <span style={{ color: 'var(--ink-3)' }}>{detail}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      {/* celebration layer */}
      <ConfettiBurst trigger={confettiKey} intensity={celebration?.grand ? 1.35 : 0.85} />
      <CelebrationOverlay item={celebration} onDone={() => setCelebration(null)} />
    </div>
  )
}

