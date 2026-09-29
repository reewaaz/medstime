import { useState } from 'react'
import { motion } from 'framer-motion'
import { Icon, type IconName } from './Icon'
import { haptic } from '../lib/haptics'
import { useInstallPrompt } from '../lib/install'

/* ------------------------------------------------------------------ *
 * Bottom tab bar with a centre "+" action and a sliding indicator.
 * ------------------------------------------------------------------ */

export type Tab = 'today' | 'meds' | 'stats'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'meds', label: 'Meds', icon: 'pill' },
  { id: 'stats', label: 'Progress', icon: 'chart' },
]

export function BottomNav({
  tab,
  onTab,
  onAdd,
  onSettings,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  onAdd: () => void
  onSettings: () => void
}) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav__inner">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              className="nav__item"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                haptic('tap')
                onTab(t.id)
              }}
            >
              {active ? (
                <motion.span
                  className="nav__indicator"
                  layoutId="nav-indicator"
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                />
              ) : null}
              <Icon name={t.icon} size={19} strokeWidth={active ? 2.1 : 1.75} />
              <span>{t.label}</span>
            </button>
          )
        })}

        <button className="nav__fab" onClick={onAdd} aria-label="Add medication">
          <Icon name="plus" size={22} strokeWidth={2.3} />
        </button>

        <button
          className="nav__item"
          onClick={() => {
            haptic('tap')
            onSettings()
          }}
          aria-label="Settings"
        >
          <Icon name="settings" size={19} />
          <span>Settings</span>
        </button>
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ *
 * Install prompt.
 *
 * The plumbing lives in lib/install. This is the floating bar that
 * slides in above the nav once there's a medication to remind you
 * about — the moment installing is most compelling. iOS has no install
 * event, so there we show Share -> Add to Home Screen instead.
 * ------------------------------------------------------------------ */

export function InstallBar({ onDismiss }: { onDismiss: () => void }) {
  const { canOffer, canPrompt, installed, isIos, install } = useInstallPrompt()
  const [declined, setDeclined] = useState(false)

  if (installed || !canOffer || declined) return null

  const promptInstall = async () => {
    const outcome = await install()
    if (outcome === 'accepted' || outcome === 'installed') onDismiss()
    if (outcome === 'dismissed') setDeclined(true)
  }

  return (
    <div className="install-bar">
      <div className="med__icon" style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)' }}>
        <Icon name="download" size={17} />
      </div>
      <div className="alert-strip__text">
        {isIos ? (
          <>
            <b>Install MedsTime</b> — tap{' '}
            <Icon name="share" size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Share,
            then <b>Add to Home Screen</b>.
          </>
        ) : (
          <>
            <b>Install MedsTime</b> — full-screen, offline, and reminders that keep working.
          </>
        )}
      </div>
      {canPrompt ? (
        <button className="btn btn--primary btn--sm" onClick={promptInstall}>
          Install
        </button>
      ) : null}
      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onDismiss} aria-label="Dismiss">
        <Icon name="close" size={14} strokeWidth={2.2} />
      </button>
    </div>
  )
}
