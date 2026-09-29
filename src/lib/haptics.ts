/* ------------------------------------------------------------------ *
 * Haptics. A thin, dependable wrapper over the Vibration API with
 * hand-tuned patterns for each interaction.
 * ------------------------------------------------------------------ */

export type HapticPattern =
  | 'tap' // light confirmation
  | 'press' // entering / selecting
  | 'success' // dose taken — the good one
  | 'celebrate' // milestone (7-day streak, perfect day)
  | 'warn' // skipped / overdue
  | 'toggle' // switch flipped
  | 'undo' // reversing an action

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 12,
  press: [0, 8],
  toggle: [0, 10, 60, 18],
  success: [0, 18, 45, 30, 45, 55],
  celebrate: [0, 22, 40, 22, 40, 22, 40, 45, 60, 90],
  warn: [0, 40, 60, 40],
  undo: [0, 8, 40, 12],
}

let enabled = true
/** True once the user has interacted, which is when Chrome allows vibration. */
let armed = false

export function setHapticsEnabled(on: boolean) {
  enabled = on
  if (on) armHaptics()
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/**
 * Browsers only honour the Vibration API after a real user gesture, and
 * Chrome logs a console error for any attempt before that. So rather
 * than probing with a dummy `vibrate(0)` (which is itself blocked and
 * noisy), we mark haptics as available the moment the user taps
 * anything, and stay silent until then.
 */
export function armHaptics() {
  if (armed) return
  const mark = () => {
    armed = true
    cleanup()
  }
  const opts = { once: true, passive: true, capture: true } as const
  const cleanup = () => {
    window.removeEventListener('pointerdown', mark, true)
    window.removeEventListener('keydown', mark, true)
  }
  window.addEventListener('pointerdown', mark, opts)
  window.addEventListener('keydown', mark, opts)
}

/** Unused externally; kept so callers can force the first real buzz. */
export function unlockHaptics() {
  armHaptics()
}

export function haptic(pattern: HapticPattern = 'tap') {
  if (!enabled || !armed || !hapticsSupported()) return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    /* haptics are a nicety, never a hard failure */
  }
}

/** A short ascending chime built with the Web Audio API (no asset needed). */
let audioCtx: AudioContext | null = null

export function chime(kind: 'success' | 'tap' | 'warn' = 'success') {
  if (typeof window === 'undefined') return
  try {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioCtx ??= new Ctor()
    if (audioCtx.state === 'suspended') void audioCtx.resume()

    const notes =
      kind === 'success'
        ? [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
        : kind === 'warn'
          ? [440, 349.23]
          : [880]

    const now = audioCtx.currentTime
    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator()
      const gain = audioCtx!.createGain()
      const t = now + i * 0.075
      osc.type = kind === 'warn' ? 'triangle' : 'sine'
      osc.frequency.setValueAtTime(freq, t)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.14, t + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
      osc.connect(gain).connect(audioCtx!.destination)
      osc.start(t)
      osc.stop(t + 0.36)
    })
  } catch {
    /* audio is a nicety too */
  }
}
