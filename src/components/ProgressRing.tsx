import { motion } from 'framer-motion'

/* ------------------------------------------------------------------ *
 * The daily progress ring. Gradient stroke, rounded cap, spring fill.
 * ------------------------------------------------------------------ */

const SIZE = 168
const STROKE = 13
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

export function ProgressRing({
  value,
  taken,
  total,
  caption = 'doses taken',
}: {
  value: number
  taken: number
  total: number
  caption?: string
}) {
  const pct = Math.max(0, Math.min(1, value))
  const dash = C * (1 - pct)
  const complete = total > 0 && taken === total

  return (
    <div className="hero__ring" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} aria-hidden="true">
        <defs>
          <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            {complete ? (
              <>
                <stop offset="0%" stopColor="#6EE7B7" />
                <stop offset="55%" stopColor="#34D399" />
                <stop offset="100%" stopColor="#059669" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="var(--accent-bright)" />
                <stop offset="60%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="var(--accent-deep)" />
              </>
            )}
          </linearGradient>
        </defs>

        <circle
          className="hero__ring-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        <motion.circle
          className="hero__ring-fill"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: dash }}
          transition={{ type: 'spring', stiffness: 90, damping: 20, mass: 0.9 }}
        />
      </svg>

      <div className="ring-center">
        <motion.span
          className="ring-center__value"
          key={taken}
          initial={{ scale: 0.8, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        >
          {taken}
          <span style={{ fontSize: '0.55em', opacity: 0.55, fontWeight: 650 }}> / {total}</span>
        </motion.span>
        <span className="ring-center__label">
          {total === 0 ? 'nothing due' : complete ? 'all done' : caption}
        </span>
      </div>
    </div>
  )
}
