/* ------------------------------------------------------------------ *
 * Persistence + a tiny external store.
 *
 * State lives in localStorage and is read through useSyncExternalStore
 * so the whole app re-renders on a change without a state library.
 * ------------------------------------------------------------------ */

import { useCallback, useRef, useSyncExternalStore } from 'react'
import { dateKey } from './date'
import { newMedId } from './schedule'
import type {
  AppState,
  DoseId,
  DoseStatus,
  Medication,
  Settings,
} from './types'

const STORAGE_KEY = 'medstime.state.v1'
/** Records older than this are pruned so storage never grows unbounded. */
const RECORD_RETENTION_DAYS = 180

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  haptics: true,
  sound: true,
  soonWindowMinutes: 60,
  dayStartHour: 0,
  graceHours: 24,
}

const EMPTY_STATE: AppState = {
  meds: [],
  records: {},
  settings: DEFAULT_SETTINGS,
  onboarded: false,
}

/* ------------------------------ storage ---------------------------- */

function read(): AppState {
  if (typeof localStorage === 'undefined') return EMPTY_STATE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      meds: Array.isArray(parsed.meds) ? parsed.meds : [],
      records: parsed.records && typeof parsed.records === 'object' ? parsed.records : {},
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      onboarded: Boolean(parsed.onboarded),
    }
  } catch {
    return EMPTY_STATE
  }
}

function write(state: AppState) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* private mode / quota — the app keeps working in memory */
  }
}

/* ------------------------------- store ----------------------------- */

let state: AppState = read()
const listeners = new Set<() => void>()

function setState(next: AppState) {
  state = next
  write(state)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getState() {
  return state
}

/**
 * Subscribe to a slice of app state.
 *
 * The selector MUST be referentially stable (wrap it in `useCallback`) and
 * MUST return a stable value for unchanged state — select a stored slice,
 * never a freshly derived array. Derive with `useMemo` in the component.
 */
export function useSlice<T>(selector: (s: AppState) => T): T {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const getSnapshot = useCallback(() => selectorRef.current(getState()), [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getStateSnapshot(): AppState {
  return getState()
}

/* ------------------------------ actions ---------------------------- */

function pruneRecords(next: AppState): AppState {
  const cutoff = dateKey(Date.now() - RECORD_RETENTION_DAYS * 86_400_000)
  let changed = false
  const records: AppState['records'] = {}
  for (const [id, rec] of Object.entries(next.records)) {
    const key = id.split('|')[1] ?? ''
    if (key >= cutoff) records[id] = rec
    else changed = true
  }
  return changed ? { ...next, records } : next
}

export type NewMedInput = Omit<Medication, 'id' | 'createdAt' | 'archived'> & {
  archived?: boolean
}

export const actions = {
  addMed(input: NewMedInput): Medication {
    const med: Medication = {
      ...input,
      id: newMedId(),
      archived: input.archived ?? false,
      createdAt: Date.now(),
    }
    setState(pruneRecords({ ...getState(), meds: [...getState().meds, med] }))
    return med
  },

  updateMed(id: string, patch: Partial<Medication>) {
    setState({
      ...getState(),
      meds: getState().meds.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })
  },

  removeMed(id: string) {
    const s = getState()
    const doomed = new Set<string>()
    for (const rid of Object.keys(s.records)) {
      if (rid.startsWith(`${id}|`)) doomed.add(rid)
    }
    const records = { ...s.records }
    doomed.forEach((k) => delete records[k])
    setState({
      ...s,
      meds: s.meds.filter((m) => m.id !== id),
      records,
    })
  },

  archiveMed(id: string, archived = true) {
    actions.updateMed(id, { archived })
  },

  /** Record a dose as taken / skipped, or clear it back to pending. */
  setDose(doseId: DoseId, medId: string, status: DoseStatus) {
    const s = getState()
    const records = { ...s.records }
    if (status === 'pending') {
      delete records[doseId]
    } else {
      records[doseId] = { id: doseId, medId, status, at: Date.now() }
    }
    setState({ ...s, records })
  },

  setSettings(patch: Partial<Settings>) {
    setState({ ...getState(), settings: { ...getState().settings, ...patch } })
  },

  setOnboarded(v: boolean) {
    setState({ ...getState(), onboarded: v })
  },

  /** Wipe everything — used by "Reset app" in settings. */
  reset() {
    setState({ ...EMPTY_STATE })
  },

  /** Import a previously exported backup. */
  importState(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as Partial<AppState>
      if (!parsed || !Array.isArray(parsed.meds)) return false
      setState({
        meds: parsed.meds,
        records: parsed.records ?? {},
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        onboarded: true,
      })
      return true
    } catch {
      return false
    }
  },
}

export function exportState(): string {
  return JSON.stringify(getState(), null, 2)
}

export const STORAGE_KEY_NAME = STORAGE_KEY

/* ----------------------------- selectors --------------------------- */
/* These select stored slices only — components derive with useMemo.     */

export function useMeds(): Medication[] {
  return useSlice((s: AppState) => s.meds)
}

export function useSettings(): Settings {
  return useSlice((s: AppState) => s.settings)
}

export function useRecords(): AppState['records'] {
  return useSlice((s: AppState) => s.records)
}

export function useOnboarded(): boolean {
  return useSlice((s: AppState) => s.onboarded)
}
