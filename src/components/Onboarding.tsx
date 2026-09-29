import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Icon } from './Icon'
import { haptic, hapticsSupported, unlockHaptics } from '../lib/haptics'
import { useInstallPrompt } from '../lib/install'
import {
  notificationSupport,
  registerPeriodicSync,
  requestNotificationPermission,
  type NotifyPermissionState,
} from '../lib/notifications'

/* ------------------------------------------------------------------ *
 * First run: a short welcome, then permission prompts in the order
 * the browser actually allows them (haptics need a gesture).
 * ------------------------------------------------------------------ */

const POINTS = [
  { icon: 'bell' as const, text: 'Nudges you at the right minute — with actions to log a dose straight from the notification.' },
  { icon: 'haptic' as const, text: 'A satisfying buzz the moment you mark a dose taken.' },
  { icon: 'sparkle' as const, text: 'Confetti when you finish the day, and streaks that keep you honest.' },
  { icon: 'shield' as const, text: 'Everything stays on your phone. No account, no cloud, no tracking.' },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [notif, setNotif] = useState<NotifyPermissionState>(notificationSupport())
  const [hapticsOn, setHapticsOn] = useState(true)
  const [installing, setInstalling] = useState(false)
  const supportsHaptics = hapticsSupported()
  const { canPrompt, canOffer, installed, isIos, install } = useInstallPrompt()

  // A single "start" click satisfies the browser's gesture requirement.
  const begin = async () => {
    unlockHaptics()
    haptic('success')
    if (notificationSupport() === 'default') {
      const res = await requestNotificationPermission()
      setNotif(res)
      if (res === 'granted') await registerPeriodicSync()
    }
    onDone()
  }

  // Installing here is a user gesture, so Chromium will open its dialog.
  const doInstall = async () => {
    setInstalling(true)
    haptic('success')
    await install()
    setInstalling(false)
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="onboard">
      <motion.div
        className="onboard__mark"
        initial={{ scale: 0.7, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        <Icon name="pill" size={34} />
      </motion.div>

      <div>
        <motion.h1
          className="onboard__title"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, type: 'spring', stiffness: 300, damping: 28 }}
        >
          Never miss
          <br />
          a dose again.
        </motion.h1>
        <motion.p
          className="onboard__text"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, type: 'spring', stiffness: 300, damping: 28 }}
        >
          MedsTime is a pill reminder that respects your regimen — OD, BD, TDS, QID, or your own
          every-N schedule.
        </motion.p>
      </div>

      <motion.ul
        className="onboard__list"
        initial="hidden"
        animate="shown"
        variants={{
          hidden: {},
          shown: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } },
        }}
      >
        {POINTS.map((pt) => (
          <motion.li
            key={pt.icon}
            className="onboard__item"
            variants={{
              hidden: { opacity: 0, x: -12 },
              shown: { opacity: 1, x: 0 },
            }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <span className="onboard__bullet">
              <Icon name={pt.icon} size={17} />
            </span>
            <span className="onboard__item-text">{pt.text}</span>
          </motion.li>
        ))}
      </motion.ul>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 28 }}
      >
        {supportsHaptics ? (
          <button
            className="switch-row"
            style={{ width: '100%', textAlign: 'left', padding: 'var(--sp-3) 0' }}
            onClick={() => {
              haptic('toggle')
              setHapticsOn((v) => !v)
            }}
          >
            <div className="switch-row__body">
              <div className="switch-row__title">Haptics</div>
              <div className="switch-row__sub">Buzz when you take a dose</div>
            </div>
            <div className="switch" role="switch" aria-checked={hapticsOn} aria-label="Haptics">
              <motion.span
                className="switch__knob"
                animate={{ x: hapticsOn ? 20 : 0 }}
                transition={{ type: 'spring', stiffness: 620, damping: 34 }}
              />
            </div>
          </button>
        ) : null}

        {canOffer && !installed ? (
          <motion.div
            className="onboard__install"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.42, type: 'spring', stiffness: 300, damping: 28 }}
          >
            {canPrompt ? (
              <button
                className="btn btn--ghost btn--block"
                onClick={doInstall}
                disabled={installing}
              >
                <Icon name="download" size={16} />
                {installing ? 'Installing…' : 'Add MedsTime to my home screen'}
              </button>
            ) : null}
            <p className="field__hint" style={{ textAlign: 'center' }}>
              {isIos ? (
                <>
                  On iPhone, tap{' '}
                  <Icon
                    name="share"
                    size={11}
                    style={{ display: 'inline', verticalAlign: '-2px' }}
                  />{' '}
                  Share, then <b>Add to Home Screen</b> — reminders then work offline.
                </>
              ) : (
                'Runs full-screen, works offline, and keeps reminding you when the tab is closed.'
              )}
            </p>
          </motion.div>
        ) : null}

        <button className="btn btn--primary btn--block btn--lg" onClick={begin}>
          Get started
          <Icon name="chevron-right" size={18} strokeWidth={2.2} />
        </button>

        {notif === 'denied' ? (
          <p className="field__hint" style={{ textAlign: 'center' }}>
            Notifications are blocked — enable them for this site in your browser settings, then
            reopen MedsTime.
          </p>
        ) : null}
      </motion.div>
    </div>
  )
}
