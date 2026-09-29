import { useState } from 'react'
import { motion } from 'framer-motion'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { haptic, hapticsSupported, unlockHaptics } from '../lib/haptics'
import { useInstallPrompt } from '../lib/install'
import {
  notificationSupport,
  registerPeriodicSync,
  requestNotificationPermission,
  showTestNotification,
} from '../lib/notifications'
import { actions, exportState } from '../lib/store'
import type { AppState, ThemeChoice } from '../lib/types'

/* ------------------------------------------------------------------ *
 * Settings — notifications, haptics, appearance, data.
 * ------------------------------------------------------------------ */

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic('toggle')
        onChange(!checked)
      }}
    >
      <motion.span
        className="switch__knob"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 620, damping: 34 }}
      />
    </button>
  )
}

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function SettingsSheet({
  open,
  onClose,
  state,
  pushToast,
}: {
  open: boolean
  onClose: () => void
  state: AppState
  pushToast: (text: string, tone?: 'ok' | 'error' | 'info') => void
}) {
  const [permission, setPermission] = useState(notificationSupport())
  const [confirmReset, setConfirmReset] = useState(false)
  const { settings } = state
  const { canPrompt, canOffer, installed, isIos, install } = useInstallPrompt()

  const askPermission = async () => {
    unlockHaptics()
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') {
      await registerPeriodicSync()
      pushToast('Notifications enabled', 'ok')
    } else if (result === 'denied') {
      pushToast('Blocked in browser settings', 'error')
    } else {
      pushToast('Permission dismissed', 'info')
    }
  }

  const testNotification = async () => {
    unlockHaptics()
    if (permission !== 'granted') {
      await askPermission()
      return
    }
    const ok = await showTestNotification()
    pushToast(ok ? 'Test notification sent' : 'Could not show notification', ok ? 'ok' : 'error')
  }

  const exportData = () => {
    const blob = new Blob([exportState()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `medstime-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    pushToast('Backup downloaded', 'ok')
  }

  const importData = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const ok = actions.importState(String(reader.result ?? ''))
        pushToast(ok ? 'Backup restored' : 'That file could not be read', ok ? 'ok' : 'error')
        if (ok) onClose()
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const permRow = (
    <div className="switch-row">
      <div className="switch-row__body">
        <div className="switch-row__title">Notifications</div>
        <div className="switch-row__sub">
          {permission === 'granted'
            ? 'On — you\u2019ll be nudged at dose time.'
            : permission === 'denied'
              ? 'Blocked. Enable it for this site in your browser settings.'
              : permission === 'unsupported'
                ? 'This browser does not support notifications.'
                : 'Not enabled yet.'}
        </div>
      </div>
      {permission === 'granted' ? (
        <button className="btn btn--ghost btn--sm" onClick={testNotification}>
          Test
        </button>
      ) : (
        <button className="btn btn--primary btn--sm" onClick={askPermission} disabled={permission === 'denied'}>
          Enable
        </button>
      )}
    </div>
  )

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      {/* appearance */}
      <div className="field">
        <span className="field__label">Appearance</span>
        <div className="segmented">
          {THEMES.map((t) => (
            <button
              key={t.value}
              className="segmented__item"
              aria-pressed={settings.theme === t.value}
              onClick={() => {
                haptic('tap')
                actions.setSettings({ theme: t.value })
              }}
            >
              {t.value === 'light' ? <Icon name="sun" size={15} style={{ margin: '0 auto' }} /> : null}
              {t.value === 'dark' ? <Icon name="moon" size={15} style={{ margin: '0 auto' }} /> : null}
              {t.value === 'system' ? t.label : null}
            </button>
          ))}
        </div>
      </div>

      {/* reminders */}
      <div className="field">
        <span className="field__label">Reminders</span>
        <div className="card card--solid">
          <div className="card__body" style={{ padding: '0 var(--sp-4)' }}>
            {permRow}

            <div className="switch-row">
              <div className="switch-row__body">
                <div className="switch-row__title">Haptics</div>
                <div className="switch-row__sub">
                  {hapticsSupported()
                    ? 'A short buzz when you mark a dose taken.'
                    : 'Not available on this device.'}
                </div>
              </div>
              <Switch
                checked={settings.haptics && hapticsSupported()}
                onChange={(v) => {
                  actions.setSettings({ haptics: v })
                  if (v) unlockHaptics()
                }}
                label="Haptics"
              />
            </div>

            <div className="switch-row">
              <div className="switch-row__body">
                <div className="switch-row__title">Sound</div>
                <div className="switch-row__sub">A short chime when a dose is due.</div>
              </div>
              <Switch
                checked={settings.sound}
                onChange={(v) => actions.setSettings({ sound: v })}
                label="Sound"
              />
            </div>

            {installed || canOffer ? (
              <div className="switch-row">
                <div className="switch-row__body">
                  <div className="switch-row__title">Install MedsTime</div>
                  <div className="switch-row__sub">
                    {installed
                      ? 'Installed — running as an app.'
                      : isIos
                        ? 'Tap Share, then Add to Home Screen.'
                        : 'Run it full-screen, offline, with reminders.'}
                  </div>
                </div>
                {installed ? (
                  <span className="pill-done">
                    <Icon name="check" size={12} strokeWidth={2.6} />
                    Installed
                  </span>
                ) : canPrompt ? (
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={async () => {
                      haptic('press')
                      const outcome = await install()
                      if (outcome === 'accepted' || outcome === 'installed') {
                        pushToast('MedsTime installed', 'ok')
                      }
                    }}
                  >
                    Install
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* schedule window */}
      <div className="field">
        <span className="field__label">Highlight doses due within</span>
        <div className="chip-row">
          {[30, 60, 120, 240].map((m) => (
            <button
              key={m}
              className={`chip${settings.soonWindowMinutes === m ? ' chip--on' : ''}`}
              onClick={() => {
                haptic('tap')
                actions.setSettings({ soonWindowMinutes: m })
              }}
            >
              {m < 60 ? `${m} min` : `${m / 60} h`}
            </button>
          ))}
        </div>
      </div>

      {/* day start */}
      <div className="field">
        <span className="field__label">Start my day at</span>
        <div className="chip-row">
          {[0, 2, 4, 6].map((h) => (
            <button
              key={h}
              className={`chip${settings.dayStartHour === h ? ' chip--on' : ''}`}
              onClick={() => {
                haptic('tap')
                actions.setSettings({ dayStartHour: h })
              }}
            >
              {h === 0 ? 'Midnight' : `${h}:00 am`}
            </button>
          ))}
        </div>
        <p className="field__hint">
          Night owls can roll the day over at 4&nbsp;am so late-night doses still count as
          &ldquo;today&rdquo;.
        </p>
      </div>

      {/* grace window */}
      <div className="field">
        <span className="field__label">Keep a missed dose tappable for</span>
        <div className="chip-row">
          {[6, 12, 18, 24].map((h) => (
            <button
              key={h}
              className={`chip${settings.graceHours === h ? ' chip--on' : ''}`}
              onClick={() => {
                haptic('tap')
                actions.setSettings({ graceHours: h })
              }}
            >
              {h} h
            </button>
          ))}
        </div>
        <p className="field__hint">
          How long a dose you missed stays on the list so you can still log it. Keep it at 24&nbsp;h
          if you take anything at midnight.
        </p>
      </div>

      {/* data */}
      <div className="field">
        <span className="field__label">Your data</span>
        <div className="btn-row" style={{ marginBottom: 'var(--sp-3)' }}>
          <button className="btn btn--ghost" style={{ flex: 1 }} onClick={exportData}>
            <Icon name="download" size={15} />
            Export
          </button>
          <button className="btn btn--ghost" style={{ flex: 1 }} onClick={importData}>
            <Icon name="share" size={15} />
            Import
          </button>
        </div>

        {confirmReset ? (
          <div className="card card--solid" style={{ borderColor: 'rgba(var(--danger-rgb),0.35)' }}>
            <div className="card__body">
              <div style={{ fontWeight: 650, marginBottom: 4 }}>Delete everything?</div>
              <p className="field__hint" style={{ marginBottom: 'var(--sp-3)' }}>
                This removes all {state.meds.length} medications and your full dose history from this
                device. It cannot be undone.
              </p>
              <div className="btn-row">
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ flex: 1 }}
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--danger btn--sm"
                  style={{ flex: 1 }}
                  onClick={() => {
                    actions.reset()
                    setConfirmReset(false)
                    pushToast('All data cleared', 'ok')
                    onClose()
                  }}
                >
                  Delete all
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button className="btn btn--quiet" onClick={() => setConfirmReset(true)}>
            <Icon name="trash" size={14} />
            Reset all data
          </button>
        )}
      </div>

      <div className="field">
        <p className="field__hint" style={{ textAlign: 'center' }}>
          <Icon name="shield" size={12} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
          MedsTime keeps everything on this device. No accounts, no servers, no tracking.
        </p>
      </div>
    </Sheet>
  )
}
