import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { BottomNav, InstallBar, type Tab } from './components/BottomNav'
import { CelebrationOverlay, type Celebration } from './components/Celebration'
import { ConfettiBurst } from './components/Confetti'
import { MedEditorSheet } from './components/MedEditorSheet'
import { MedsView } from './components/MedsView'
import { Onboarding } from './components/Onboarding'
import { SettingsSheet } from './components/SettingsSheet'
import { StatsView } from './components/StatsView'
import { TodayView } from './components/TodayView'
import { ToastStack, useToasts } from './components/Sheet'

import { paletteFor } from './lib/colors'
import { engine } from './lib/engine'
import { chime, haptic, setHapticsEnabled, unlockHaptics } from './lib/haptics'
import { registerPeriodicSync } from './lib/notifications'
import { actions, useMeds, useOnboarded, useRecords, useSettings } from './lib/store'
import { useNow } from './hooks/useDoses'
import { useDayDoses } from './hooks/useDoses'
import { getStateSnapshot } from './lib/store'
import { logicalDateKey } from './lib/date'
import type { Medication, PaletteKey } from './lib/types'

/* ------------------------------------------------------------------ *
 * App shell: theme, reminder engine, navigation, overlays.
 * ------------------------------------------------------------------ */

export default function App() {
  const meds = useMeds()
  const records = useRecords()
  const settings = useSettings()
  const onboarded = useOnboarded()

  const [tab, setTab] = useState<Tab>('today')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Medication | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [installDismissed, setInstallDismissed] = useState(
    () => sessionStorage.getItem('medstime.installDismissed') === '1',
  )
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [confettiKey, setConfettiKey] = useState(0)

  const now = useNow(1000)
  const toasts = useToasts()

  // One live object the views can read without prop-drilling selectors.
  const state = useMemo(
    () => ({ meds, records, settings, onboarded }),
    [meds, records, settings, onboarded],
  )

  const todayKey = useMemo(
    () => logicalDateKey(Date.now(), settings.dayStartHour),
    [settings.dayStartHour, now],
  )
  const doses = useDayDoses(state, todayKey, now)

  const fireConfetti = useCallback((intensity = 1) => {
    setConfettiKey((k) => k + 1)
    void intensity
  }, [])

  /* ----------------------------- theme ----------------------------- */

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark =
        settings.theme === 'dark' || (settings.theme === 'system' && media.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      root.style.colorScheme = dark ? 'dark' : 'light'
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
      if (meta) meta.content = dark ? '#0b0a14' : '#f7f5ff'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  /* ------------------------ reminder engine ------------------------ */

  useEffect(() => {
    unlockHaptics()
    setHapticsEnabled(settings.haptics)
    engine.configure(settings)
    engine.start()
    void registerPeriodicSync()
    return () => engine.stop()
  }, [settings])

  /* --------------------- notification actions ---------------------- */

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; action?: string; doseId?: string }
      if (data?.type !== 'dose-action' || !data.doseId) return

      const live = getStateSnapshot()
      const medId = data.doseId.split('|')[0]
      const med = live.meds.find((m) => m.id === medId)
      if (!med) return

      if (data.action === 'taken') {
        actions.setDose(data.doseId, medId, 'taken')
        if (live.settings.sound) chime('success')
        setCelebration({
          id: Date.now(),
          title: 'Dose taken',
          subtitle: med.name + (med.dose ? ` · ${med.dose}` : ''),
          grand: false,
        })
        setConfettiKey((k) => k + 1)
      } else if (data.action === 'skip') {
        actions.setDose(data.doseId, medId, 'skipped')
      } else if (data.action === 'snooze') {
        navigator.serviceWorker.controller?.postMessage({
          type: 'snooze',
          doseId: data.doseId,
          until: Date.now() + 10 * 60_000,
        })
        engine.forget(data.doseId)
        toasts.push('Snoozed 10 minutes')
      }
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [toasts])

  /* ------------------------- app shortcuts ------------------------- */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('action') === 'add') {
      setEditing(null)
      setEditorOpen(true)
    }
    const view = params.get('view')
    if (view === 'stats') setTab('stats')
    if (view === 'meds') setTab('meds')
    if (params.has('action') || view) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  /* --------------------------- handlers ---------------------------- */

  const openAdd = useCallback(() => {
    unlockHaptics()
    haptic('press')
    setEditing(null)
    setEditorOpen(true)
  }, [])

  const openEdit = useCallback((med: Medication) => {
    haptic('tap')
    setEditing(med)
    setEditorOpen(true)
  }, [])

  const existingColors = useMemo(
    () => meds.filter((m) => m.id !== editing?.id).map((m) => m.color as PaletteKey),
    [meds, editing],
  )

  // The shell's accent follows whatever is happening right now.
  const shellAccent = useMemo(() => {
    const focus =
      doses.find((d) => d.status === 'pending' && d.phase !== 'later') ??
      doses.find((d) => d.status === 'pending') ??
      doses[0]
    const key = editing?.color ?? focus?.med.color ?? 'grape'
    return paletteFor(key)
  }, [doses, editing])

  if (!onboarded) {
    return (
      <>
        <Aurora />
        <Onboarding
          onDone={() => {
            actions.setOnboarded(true)
            setTimeout(openAdd, 380)
          }}
        />
        <ToastStack items={toasts.items} />
      </>
    )
  }

  return (
    <div
      className="app"
      style={{
        ['--accent' as string]: shellAccent.base,
        ['--accent-bright' as string]: shellAccent.bright,
        ['--accent-deep' as string]: shellAccent.deep,
        ['--accent-rgb' as string]: shellAccent.rgb,
      }}
    >
      <Aurora />
      <div className="grain" />

      <div className="shell">
        <div className="page scroll-area no-scrollbar" key={tab}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {tab === 'today' ? (
                <TodayView
                  state={state}
                  doses={doses}
                  now={now}
                  todayKey={todayKey}
                  celebration={celebration}
                  setCelebration={setCelebration}
                  confettiKey={confettiKey}
                  fireConfetti={fireConfetti}
                  onAdd={openAdd}
                />
              ) : tab === 'meds' ? (
                <MedsView state={state} onEdit={openEdit} onAdd={openAdd} />
              ) : (
                <StatsView state={state} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {!installDismissed && meds.length > 0 ? (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 'calc(var(--nav-h) + var(--safe-bottom) + 10px)',
            zIndex: 29,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 var(--sp-4)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: 'var(--shell-max)' }}>
            <InstallBar
              onDismiss={() => {
                sessionStorage.setItem('medstime.installDismissed', '1')
                setInstallDismissed(true)
              }}
            />
          </div>
        </div>
      ) : null}

      <BottomNav
        tab={tab}
        onTab={setTab}
        onAdd={openAdd}
        onSettings={() => {
          haptic('tap')
          setSettingsOpen(true)
        }}
      />

      <MedEditorSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        editing={editing}
        existingColors={existingColors}
        onSaved={(med, isNew) => {
          toasts.push(isNew ? `${med.name} added` : `${med.name} updated`, 'ok')
          if (isNew && !med.archived && med.schedule.kind !== 'prn') {
            haptic('success')
          }
        }}
        onDeleted={(name) => toasts.push(`${name} deleted`, 'ok')}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        state={state}
        pushToast={toasts.push}
      />

      <ConfettiBurst trigger={confettiKey} intensity={celebration?.grand ? 1.4 : 0.85} />
      <CelebrationOverlay item={celebration} onDone={() => setCelebration(null)} />
      <ToastStack items={toasts.items} />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Animated background
 * ------------------------------------------------------------------ */

function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="a1" />
      <span className="a2" />
      <span className="a3" />
      <span className="a4" />
    </div>
  )
}
