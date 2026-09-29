import { useCallback, useEffect, useState } from 'react'

/* ------------------------------------------------------------------ *
 * PWA install plumbing.
 *
 * Chromium fires `beforeinstallprompt` and we stash the event so a
 * real user gesture can call `prompt()` later. iOS has no such event,
 * so there we detect the platform and fall back to telling the user to
 * use Share -> Add to Home Screen.
 *
 * The listener is attached at module load, before React mounts, so an
 * event that fires early (it usually does) is never missed.
 * ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function announce() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    window.dispatchEvent(new CustomEvent('medstime:installable'))
    announce()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.dispatchEvent(new CustomEvent('medstime:installed'))
    announce()
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

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'installed'

/**
 * Reactive view of the install state.
 *
 * `canPrompt` means "tapping a button right now would open the browser's
 * install dialog". `canOffer` also covers iOS, where there is no dialog
 * to open but the option is still worth showing.
 */
export function useInstallPrompt() {
  const [, bump] = useState(0)
  const [installed, setInstalled] = useState(isStandalone())

  useEffect(() => {
    const rerender = () => bump((n) => n + 1)
    const onInstalled = () => setInstalled(true)
    listeners.add(rerender)
    window.addEventListener('medstime:installed', onInstalled)
    return () => {
      listeners.delete(rerender)
      window.removeEventListener('medstime:installed', onInstalled)
    }
  }, [])

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (isStandalone()) return 'installed'
    if (!deferredPrompt) return 'unavailable'
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    deferredPrompt = null
    announce()
    if (choice.outcome === 'accepted') setInstalled(true)
    return choice.outcome
  }, [])

  const prompt = deferredPrompt

  return {
    /** A native install dialog is ready to open. */
    canPrompt: Boolean(prompt),
    /** Worth showing the option: Chromium prompt, or iOS instructions. */
    canOffer: Boolean(prompt) || isIos(),
    installed: installed || isStandalone(),
    isIos: isIos(),
    install,
  }
}
