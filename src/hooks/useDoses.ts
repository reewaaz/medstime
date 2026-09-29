import { useEffect, useMemo, useState } from 'react'
import { MINUTE } from '../lib/date'
import { slotsForDay, type DoseSlot } from '../lib/schedule'
import type { AppState, DoseStatus, Medication } from '../lib/types'

/** A clock that re-renders on an interval. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export interface DoseView {
  slot: DoseSlot
  med: Medication
  status: DoseStatus
  takenAt?: number
  /** "now", "soon", "due", "late", or "done" */
  phase: 'done' | 'late' | 'due' | 'soon' | 'later'
  minutesFromNow: number
}

/** Flatten every dose across every active medication for a given day. */
export function useDayDoses(
  state: AppState,
  dayKey: string,
  now: number,
): DoseView[] {
  return useMemo(() => {
    const soonWindow = state.settings.soonWindowMinutes * MINUTE
    const out: DoseView[] = []

    for (const med of state.meds) {
      for (const slot of slotsForDay(med, dayKey)) {
        const rec = state.records[slot.id]
        const status: DoseStatus = rec?.status ?? 'pending'
        const diff = slot.due - now

        let phase: DoseView['phase']
        if (status !== 'pending') phase = 'done'
        else if (diff < 0) phase = diff > -2 * 60 * MINUTE ? 'due' : 'late'
        else if (diff <= soonWindow) phase = 'soon'
        else phase = 'later'

        out.push({
          slot,
          med,
          status,
          takenAt: rec?.at,
          phase,
          minutesFromNow: Math.round(diff / MINUTE),
        })
      }
    }

    return out.sort((a, b) => a.slot.due - b.slot.due)
  }, [state, dayKey, now])
}

/** The dose the user should act on right now. */
export function nextActionable(doses: DoseView[]): DoseView | null {
  return (
    doses.find((d) => d.status === 'pending' && d.slot.due - Date.now() <= 2 * 60 * MINUTE) ??
    doses.find((d) => d.status === 'pending') ??
    null
  )
}

/** The next dose still to come, for the "up next" hero. */
export function nextUpcoming(doses: DoseView[], now: number): DoseView | null {
  return doses.find((d) => d.status === 'pending' && d.slot.due > now) ?? null
}

