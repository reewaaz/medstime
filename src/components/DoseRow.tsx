import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './Icon'
import { paletteFor } from '../lib/colors'
import { formatClock } from '../lib/date'
import { haptic } from '../lib/haptics'
import { intervalCode } from '../lib/schedule'
import type { DoseView } from '../hooks/useDoses'

/* ------------------------------------------------------------------ *
 * One row in today's timeline.
 * ------------------------------------------------------------------ */

function phaseBadge(d: DoseView) {
  if (d.status === 'taken')
    return { cls: 'badge--ok', text: d.takenAt ? `at ${formatClock(d.takenAt)}` : 'Taken' }
  if (d.status === 'skipped') return { cls: 'badge--muted', text: 'Skipped' }
  if (d.phase === 'late') return { cls: 'badge--late', text: `${Math.abs(d.minutesFromNow)}m late` }
  if (d.phase === 'due') return { cls: 'badge--warn', text: 'now' }
  if (d.phase === 'soon') return { cls: 'badge--muted', text: `in ${d.minutesFromNow}m` }
  return null
}

export function DoseRow({
  dose,
  isNext,
  onTake,
  onSkip,
  onUndo,
}: {
  dose: DoseView
  isNext: boolean
  onTake: (d: DoseView) => void
  onSkip: (d: DoseView) => void
  onUndo: (d: DoseView) => void
}) {
  const p = paletteFor(dose.med.color)
  const badge = phaseBadge(dose)
  const pending = dose.status === 'pending'

  const s = dose.med.schedule
  const code = s.kind === 'interval' ? intervalCode(s) : s.kind === 'fixed' ? s.code : 'PRN'
  const count =
    s.kind === 'fixed' ? `${dose.slot.index + 1}/${s.times.length}` : dose.slot.label

  return (
    <motion.div
      layout="position"
      className={[
        'dose',
        dose.status === 'taken' ? 'dose--taken' : '',
        dose.status === 'skipped' ? 'dose--skipped' : '',
        isNext && pending ? 'dose--next' : '',
        dose.phase === 'due' && pending ? 'dose--due' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ['--dot' as string]: p.base,
        ['--dot-rgb' as string]: p.rgb,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      <div className="dose__glyph">
        <Icon name="pill" size={18} />
      </div>

      <div className="dose__body">
        <div className="dose__name">{dose.med.name}</div>
        <div className="dose__meta">
          <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{dose.slot.label}</span>
          <span>&middot;</span>
          <span>{dose.med.dose || code}</span>
          <span>&middot;</span>
          <span>{count}</span>
          <AnimatePresence>
            {badge ? (
              <motion.span
                className={`badge ${badge.cls}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              >
                {badge.text}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="dose__actions">
        <AnimatePresence mode="popLayout" initial={false}>
          {pending ? (
            <motion.button
              key="skip"
              className="round-btn"
              onClick={() => {
                haptic('warn')
                onSkip(dose)
              }}
              aria-label={`Skip ${dose.med.name} at ${dose.slot.label}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Icon name="skip" size={16} />
            </motion.button>
          ) : null}
        </AnimatePresence>

        <button
          className="round-btn round-btn--ok"
          data-done={!pending}
          onClick={() => {
            if (pending) {
              haptic('success')
              onTake(dose)
            } else {
              haptic('undo')
              onUndo(dose)
            }
          }}
          aria-label={pending ? `Mark ${dose.med.name} as taken` : `Undo ${dose.med.name}`}
        >
          <Icon name={pending ? 'check' : 'undo'} size={18} strokeWidth={pending ? 2.6 : 2} />
        </button>
      </div>
    </motion.div>
  )
}

