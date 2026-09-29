import { motion } from 'framer-motion'
import { Icon } from './Icon'
import { ScheduleSummary } from './ScheduleEditor'
import { paletteFor } from '../lib/colors'
import { dosesPerDay } from '../lib/schedule'
import { perMedication } from '../lib/stats'
import type { AppState, Medication } from '../lib/types'

/* ------------------------------------------------------------------ *
 * Medications — the regimen, with per-medication adherence.
 * ------------------------------------------------------------------ */

export function MedsView({
  state,
  onEdit,
  onAdd,
}: {
  state: AppState
  onEdit: (m: Medication) => void
  onAdd: () => void
}) {
  const stats = perMedication(state, 30, state.settings.dayStartHour)

  return (
    <div>
      <header className="topbar">
        <div className="topbar__titles">
          <div className="topbar__eyebrow">Regimen</div>
          <h1 className="topbar__title">Medications</h1>
        </div>
        <button className="icon-btn icon-btn--accent" onClick={onAdd} aria-label="Add medication">
          <Icon name="plus" size={20} strokeWidth={2.2} />
        </button>
      </header>

      {state.meds.length === 0 ? (
        <div className="section">
          <div className="card">
            <div className="empty">
              <div className="empty__art">
                <Icon name="pill" size={36} />
              </div>
              <h2 className="empty__title">No medications yet</h2>
              <p className="empty__text">
                Add a medication, pick a schedule — OD, BD, TDS, QID or your own every-N interval —
                and MedsTime takes it from there.
              </p>
              <button className="btn btn--primary btn--lg" onClick={onAdd}>
                <Icon name="plus" size={18} strokeWidth={2.4} />
                Add medication
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="section">
          <div className="section__head">
            <h2 className="section__title">30-day adherence</h2>
            <span className="section__meta">{state.meds.length} medications</span>
          </div>

          {stats.map((s, i) => {
            const p = paletteFor(s.med.color)
            const daily = dosesPerDay(s.med)
            return (
              <motion.button
                key={s.med.id}
                className={`med${s.med.archived ? ' med--archived' : ''}`}
                style={{
                  ['--accent' as string]: p.base,
                  ['--accent-bright' as string]: p.bright,
                  ['--accent-deep' as string]: p.deep,
                  ['--accent-rgb' as string]: p.rgb,
                }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3), type: 'spring', stiffness: 380, damping: 32 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onEdit(s.med)}
              >
                <div className="med__icon">
                  <Icon name="pill" size={20} />
                </div>
                <div className="med__body">
                  <div className="med__name">
                    {s.med.name}
                    {s.med.archived ? (
                      <span className="badge badge--muted" style={{ marginLeft: 8 }}>
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <ScheduleSummary med={s.med} />
                  {s.med.instructions ? (
                    <div className="med__sub" style={{ marginTop: 2, color: 'var(--ink-4)' }}>
                      {s.med.instructions}
                    </div>
                  ) : null}
                  {daily > 0 ? (
                    <div className="med__sub" style={{ marginTop: 2 }}>
                      {daily}× a day &middot; {s.scheduled} scheduled / 30 days
                    </div>
                  ) : null}
                </div>
                <div className="med__right">
                  <span className="med__pct">
                    {s.scheduled > 0 ? `${Math.round(s.rate * 100)}%` : '—'}
                  </span>
                  {s.scheduled > 0 ? (
                    <div className="med__bar">
                      <motion.span
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(s.rate * 100)}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  ) : null}
                  <Icon name="chevron-right" size={16} style={{ color: 'var(--ink-4)', marginTop: 2 }} />
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      {state.meds.length > 0 ? (
        <div className="section">
          <button className="btn btn--ghost btn--block" onClick={onAdd}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            Add another medication
          </button>
        </div>
      ) : null}
    </div>
  )
}

