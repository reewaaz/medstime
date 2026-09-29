import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Icon, type IconName } from './Icon'
import { haptic } from '../lib/haptics'

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
 * Chromium fires `beforeinstallprompt`, which we stash until the user
 * has actually added a medication — the moment installing is most
 * compelling. iOS has no such event, so we detect it and show the
 * "Share → Add to Home Screen" instructions instead.
 * ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    window.dispatchEvent(new CustomEvent('medstime:installable'))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.dispatchEvent(new CustomEvent('medstime:installed'))
  })
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export function InstallBar({ onDismiss }: { onDismiss: () => void }) {
  const [ready, setReady] = useState(false)
  const ios = isIos()

  useEffect(() => {
    const onReady = () => setReady(true)
    window.addEventListener('medstime:installable', onReady)
    if (deferredPrompt) setReady(true)
    return () => window.removeEventListener('medstime:installable', onReady)
  }, [])

  if (isStandalone() || (!ready && !ios)) return null

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      deferredPrompt = null
      if (choice.outcome === 'accepted') onDismiss()
      else setReady(false)
    }
  }

  return (
    <div className="install-bar">
      <div className="med__icon" style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)' }}>
        <Icon name="download" size={17} />
      </div>
      <div className="alert-strip__text">
        {ios ? (
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
      {!ios ? (
        <button className="btn btn--primary btn--sm" onClick={install}>
          Install
        </button>
      ) : null}
      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onDismiss} aria-label="Dismiss">
        <Icon name="close" size={14} strokeWidth={2.2} />
      </button>
    </div>
  )
}
