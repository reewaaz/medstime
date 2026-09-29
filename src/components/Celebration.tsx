import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './Icon'

/* ------------------------------------------------------------------ *
 * The "dose taken" celebration: a check that springs in, a soft veil,
 * and a caption that tells you what just happened.
 * ------------------------------------------------------------------ */

export interface Celebration {
  id: number
  title: string
  subtitle: string
  meta?: string
  /** Escalates the animation for milestones like a perfect day. */
  grand: boolean
}

export function CelebrationOverlay({
  item,
  onDone,
}: {
  item: Celebration | null
  onDone: () => void
}) {
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="celebration"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="celebration__veil"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.35, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          />
          <motion.div
            className="celebration__badge"
            initial={{ scale: 0.72, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: -10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 22, mass: 0.7 }}
          >
            <motion.div
              className="celebration__check"
              initial={{ scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                stiffness: 520,
                damping: 16,
                delay: 0.06,
              }}
            >
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.16, duration: 0.18 }}
              >
                <Icon
                  name="check"
                  size={40}
                  strokeWidth={2.6}
                  style={item.grand ? { color: '#3b2400' } : undefined}
                />
              </motion.div>
            </motion.div>

            <motion.div
              className="celebration__title"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 400, damping: 28 }}
            >
              {item.title}
            </motion.div>

            <motion.div
              className="celebration__sub"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, type: 'spring', stiffness: 400, damping: 28 }}
            >
              {item.subtitle}
            </motion.div>

            {item.meta ? (
              <motion.div
                className="celebration__meta"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.26, duration: 0.3 }}
              >
                {item.meta}
              </motion.div>
            ) : null}

            {/* A second ring that pulses out for milestone moments. */}
            {item.grand ? (
              <>
                {[0, 0.18, 0.36].map((delay) => (
                  <motion.div
                    key={delay}
                    style={{
                      position: 'absolute',
                      width: 76,
                      height: 76,
                      borderRadius: 999,
                      border: '2px solid rgba(251,191,36,0.7)',
                    }}
                    initial={{ scale: 1, opacity: 0.75 }}
                    animate={{ scale: 3.1, opacity: 0 }}
                    transition={{ duration: 1.1, delay, ease: 'easeOut' }}
                  />
                ))}
              </>
            ) : null}
          </motion.div>

          {/* Auto-dismiss. */}
          <motion.div
            key={`timer-${item.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
            style={{ position: 'absolute', inset: 0 }}
            onAnimationComplete={onDone}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
