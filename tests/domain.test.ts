/* ------------------------------------------------------------------ *
 * Domain tests — schedule generation, slot identity and adherence.
 * Run with:  node --test tests/
 * ------------------------------------------------------------------ */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { dateKey, minutesToTime, startOfDay, timeToMinutes } from '../src/lib/date.ts'
import {
  dosesPerDay,
  intervalCode,
  intervalLabel,
  makeFixedSchedule,
  makeIntervalSchedule,
  scheduleLabel,
  slotsForDay,
} from '../src/lib/schedule.ts'
import { adherenceOver, perMedication, statsForDay } from '../src/lib/stats.ts'
import type { AppState, Medication } from '../src/lib/types.ts'

/* ----------------------------- helpers ------------------------------ */

function med(partial: Partial<Medication> & { id: string }): Medication {
  return {
    name: partial.id,
    dose: '',
    instructions: '',
    color: 'grape',
    schedule: makeFixedSchedule('OD'),
    startDate: '2026-01-01',
    endDate: null,
    leadMinutes: 0,
    archived: false,
    createdAt: 0,
    ...partial,
  }
}

const times = (slots: { label: string }[]) => slots.map((s) => s.label)

/* ------------------------------ dates ------------------------------- */

describe('date helpers', () => {
  test('dateKey uses local calendar components', () => {
    const d = new Date(2026, 0, 5, 23, 30)
    assert.equal(dateKey(d), '2026-01-05')
  })

  test('timeToMinutes / minutesToTime round-trip', () => {
    for (const t of ['00:00', '07:05', '09:00', '13:45', '22:30', '23:59']) {
      assert.equal(minutesToTime(timeToMinutes(t)), t)
    }
  })

  test('minutesToTime wraps past midnight', () => {
    assert.equal(minutesToTime(1500), '01:00')
  })

  test('startOfDay is local midnight', () => {
    const d = new Date(2026, 5, 14, 17, 4, 22)
    const s = new Date(startOfDay(d))
    assert.equal(s.getHours(), 0)
    assert.equal(s.getMinutes(), 0)
    assert.equal(dateKey(s), '2026-06-14')
  })
})

/* -------------------------- fixed schedules ------------------------- */

describe('fixed schedules', () => {
  test('OD produces one slot', () => {
    const m = med({ id: 'od', schedule: makeFixedSchedule('OD') })
    assert.deepEqual(times(slotsForDay(m, '2026-03-01')), ['09:00'])
  })

  test('BD produces morning and night', () => {
    const m = med({ id: 'bd', schedule: makeFixedSchedule('BD') })
    assert.deepEqual(times(slotsForDay(m, '2026-03-01')), ['09:00', '21:00'])
  })

  test('TDS produces three', () => {
    const m = med({ id: 'tds', schedule: makeFixedSchedule('TDS') })
    assert.deepEqual(times(slotsForDay(m, '2026-03-01')), ['08:00', '14:00', '20:00'])
  })

  test('QID produces four', () => {
    const m = med({ id: 'qid', schedule: makeFixedSchedule('QID') })
    assert.deepEqual(times(slotsForDay(m, '2026-03-01')), ['08:00', '12:00', '16:00', '20:00'])
  })

  test('slots are sorted even if times are given out of order', () => {
    const m = med({ id: 'x', schedule: { kind: 'fixed', code: 'TDS', times: ['20:00', '08:00', '14:00'] } })
    assert.deepEqual(times(slotsForDay(m, '2026-03-01')), ['08:00', '14:00', '20:00'])
  })

  test('duplicate times collapse to one slot', () => {
    const m = med({ id: 'dup', schedule: { kind: 'fixed', code: 'BD', times: ['09:00', '09:00'] } })
    assert.equal(slotsForDay(m, '2026-03-01').length, 1)
  })

  test('dose ids are stable and day-scoped', () => {
    const m = med({ id: 'od', schedule: makeFixedSchedule('OD') })
    const a = slotsForDay(m, '2026-03-01')[0]
    const b = slotsForDay(m, '2026-03-01')[0]
    const c = slotsForDay(m, '2026-03-02')[0]
    assert.equal(a.id, b.id, 'same day must produce the same id')
    assert.notEqual(a.id, c.id, 'different days must not collide')
    assert.equal(a.id, 'od|2026-03-01|09:00')
  })

  test('lead time shifts notifyAt but not the due time', () => {
    const m = med({ id: 'od', schedule: makeFixedSchedule('OD'), leadMinutes: 15 })
    const slot = slotsForDay(m, '2026-03-01')[0]
    assert.equal(slot.due - slot.notifyAt, 15 * 60_000)
  })

  test('inactive medications produce nothing', () => {
    assert.equal(slotsForDay(med({ id: 'a', startDate: '2026-05-01' }), '2026-04-01').length, 0)
    assert.equal(
      slotsForDay(med({ id: 'a', startDate: '2026-01-01', endDate: '2026-02-01' }), '2026-03-01').length,
      0,
    )
    assert.equal(slotsForDay(med({ id: 'a', archived: true }), '2026-03-01').length, 0)
  })

  test('as-needed produces no slots', () => {
    assert.equal(slotsForDay(med({ id: 'prn', schedule: { kind: 'prn' } }), '2026-03-01').length, 0)
  })
})

/* -------------------------- q** intervals --------------------------- */

describe('every-N interval schedules', () => {
  test('q6h across a full day gives four doses', () => {
    const m = med({
      id: 'q6h',
      schedule: makeIntervalSchedule(6, 'hours', '06:00', '2026-01-01'),
    })
    assert.deepEqual(times(slotsForDay(m, '2026-03-01')), ['00:00', '06:00', '12:00', '18:00'])
  })

  test('q8h gives three doses on a 24h clock', () => {
    const m = med({
      id: 'q8h',
      schedule: makeIntervalSchedule(8, 'hours', '08:00', '2026-01-01'),
    })
    assert.deepEqual(times(slotsForDay(m, '2026-03-01')), ['00:00', '08:00', '16:00'])
  })

  test('q30m produces 48 slots', () => {
    const m = med({
      id: 'q30',
      schedule: makeIntervalSchedule(30, 'minutes', '00:00', '2026-01-01'),
    })
    assert.equal(slotsForDay(m, '2026-03-01').length, 48)
  })

  test('q15m produces 96 slots, keeping the anchor minute offset', () => {
    const m = med({
      id: 'q15',
      schedule: makeIntervalSchedule(15, 'minutes', '09:07', '2026-01-01'),
    })
    const slots = slotsForDay(m, '2026-03-01')
    assert.equal(slots.length, 96)
    // The anchor sits at :07 past the hour, so every dose does too.
    assert.equal(slots[0].label, '00:07')
    assert.equal(slots[95].label, '23:52')
  })

  test('q2d alternates days', () => {
    const m = med({
      id: 'q2d',
      schedule: makeIntervalSchedule(2, 'days', '10:00', '2026-01-01'),
    })
    assert.deepEqual(times(slotsForDay(m, '2026-01-01')), ['10:00'])
    assert.deepEqual(times(slotsForDay(m, '2026-01-02')), [])
    assert.deepEqual(times(slotsForDay(m, '2026-01-03')), ['10:00'])
  })

  test('the anchor day before the schedule start is still honoured', () => {
    const m = med({
      id: 'q6h',
      startDate: '2026-01-05',
      schedule: makeIntervalSchedule(6, 'hours', '00:00', '2026-01-05'),
    })
    assert.deepEqual(times(slotsForDay(m, '2026-01-05')), ['00:00', '06:00', '12:00', '18:00'])
  })

  test('a zero interval is rejected rather than hanging', () => {
    const m = med({ id: 'bad', schedule: { kind: 'interval', every: 0, unit: 'minutes', anchorTime: '09:00', anchorDate: '2026-01-01' } })
    assert.deepEqual(slotsForDay(m, '2026-03-01'), [])
  })

  test('interval labels read like a prescription', () => {
    const six = makeIntervalSchedule(6, 'hours', '09:00', '2026-01-01')
    assert.equal(intervalLabel(six), 'Every 6 hours')
    assert.equal(intervalCode(six), 'q6h')
    assert.equal(intervalCode(makeIntervalSchedule(30, 'minutes')), 'q30m')
    assert.equal(intervalCode(makeIntervalSchedule(2, 'days')), 'q2d')
    assert.equal(intervalLabel(makeIntervalSchedule(1, 'days')), 'Every 1 day')
  })

  test('dosesPerDay estimates sensibly', () => {
    assert.equal(dosesPerDay(med({ id: 'a', schedule: makeFixedSchedule('QID') })), 4)
    assert.equal(dosesPerDay(med({ id: 'b', schedule: makeIntervalSchedule(6, 'hours') })), 4)
    assert.equal(dosesPerDay(med({ id: 'c', schedule: makeIntervalSchedule(8, 'hours') })), 3)
    assert.equal(dosesPerDay(med({ id: 'd', schedule: { kind: 'prn' } })), 0)
  })
})

/* ------------------------------ labels ------------------------------ */

describe('schedule labels', () => {
  test('fixed schedules name the code and the count', () => {
    assert.equal(scheduleLabel(makeFixedSchedule('BD')), 'BD · 2× a day')
  })
  test('PRN reads as-needed', () => {
    assert.equal(scheduleLabel({ kind: 'prn' }), 'As needed')
  })
})

/* ------------------------------ stats ------------------------------- */

describe('adherence', () => {
  const today = dateKey()
  const yesterday = dateKey(startOfDay(new Date()) - 86_400_000)

  function stateWith(meds: Medication[], taken: string[]): AppState {
    const records: AppState['records'] = {}
    for (const id of taken) {
      const medId = id.split('|')[0]
      records[id] = { id, medId, status: 'taken', at: Date.now() }
    }
    return { meds, records, settings: baseSettings, onboarded: true }
  }

  const baseSettings = {
    theme: 'system' as const,
    haptics: true,
    sound: true,
    soonWindowMinutes: 60,
    dayStartHour: 0,
    graceHours: 12,
  }

  test('a day with nothing logged counts as pending', () => {
    const s = stateWith([med({ id: 'a', schedule: makeFixedSchedule('BD') })], [])
    const d = statsForDay(s, today)
    assert.equal(d.scheduled, 2)
    assert.equal(d.taken, 0)
    assert.equal(d.pending, 2)
  })

  test('a logged dose moves from pending to taken', () => {
    const s = stateWith(
      [med({ id: 'a', schedule: makeFixedSchedule('BD') })],
      [`a|${today}|09:00`],
    )
    const d = statsForDay(s, today)
    assert.equal(d.taken, 1)
    assert.equal(d.pending, 1)
    assert.equal(d.rate, 0.5)
    assert.deepEqual(d.byMed, { a: 1 })
  })

  test('skipped doses count against adherence, not as pending', () => {
    const m = med({ id: 'a', schedule: makeFixedSchedule('BD') })
    const s: AppState = {
      meds: [m],
      records: { [`a|${today}|09:00`]: { id: `a|${today}|09:00`, medId: 'a', status: 'skipped' } },
      settings: baseSettings,
      onboarded: true,
    }
    const d = statsForDay(s, today)
    assert.equal(d.skipped, 1)
    assert.equal(d.pending, 1)
    const a = adherenceOver(s, 7)
    assert.equal(a.rate, 0, 'a skipped-only day is 0% adherence')
  })

  test('an empty schedule does not distort the rate', () => {
    const s = stateWith([med({ id: 'a', schedule: { kind: 'prn' } })], [])
    const a = adherenceOver(s, 7)
    assert.equal(a.scheduled, 0)
    assert.equal(a.rate, 0)
    assert.equal(Number.isNaN(a.rate), false)
  })

  test('a perfect yesterday builds a streak', () => {
    const m = med({ id: 'a', schedule: makeFixedSchedule('OD') })
    const s = stateWith([m], [`a|${yesterday}|09:00`])
    const a = adherenceOver(s, 7)
    assert.equal(a.perfectStreak, 1)
  })

  test('an in-progress today does not break yesterday\u2019s streak', () => {
    // Today has one dose still pending; yesterday was perfect.
    const m = med({ id: 'a', schedule: makeFixedSchedule('OD') })
    const s = stateWith([m], [`a|${yesterday}|09:00`])
    const today = statsForDay(s, dateKey())
    assert.equal(today.pending, 1, 'precondition: today is unfinished')
    assert.equal(adherenceOver(s, 7).perfectStreak, 1)
  })

  test('a finished today with nothing taken does break the streak', () => {
    // Today is fully skipped, so it is resolved rather than pending.
    const m = med({ id: 'a', schedule: makeFixedSchedule('OD') })
    const id = `a|${today}|09:00`
    const s: AppState = {
      meds: [m],
      records: {
        [id]: { id, medId: 'a', status: 'skipped' },
        [`a|${yesterday}|09:00`]: { id: `a|${yesterday}|09:00`, medId: 'a', status: 'taken' },
      },
      settings: baseSettings,
      onboarded: true,
    }
    assert.equal(statsForDay(s, today).pending, 0)
    assert.equal(adherenceOver(s, 7).perfectStreak, 0)
  })

  test('a run of perfect days counts correctly', () => {
    const m = med({ id: 'a', schedule: makeFixedSchedule('OD') })
    const keys = [0, 1, 2, 3].map((n) => dateKey(startOfDay(new Date()) - n * 86_400_000))
    const s = stateWith([m], keys.map((k) => `a|${k}|09:00`))
    // Today is also perfect, so the whole run counts.
    assert.equal(adherenceOver(s, 7).perfectStreak, 4)
  })

  test('per-medication stats only count that medication', () => {
    const s = stateWith(
      [
        med({ id: 'a', schedule: makeFixedSchedule('OD') }),
        med({ id: 'b', schedule: makeFixedSchedule('OD') }),
      ],
      [`a|${today}|09:00`, `a|${yesterday}|09:00`],
    )
    const list = perMedication(s, 7)
    assert.equal(list.length, 2)
    const a = list.find((x) => x.med.id === 'a')!
    const b = list.find((x) => x.med.id === 'b')!
    assert.equal(a.taken, 2)
    assert.equal(b.taken, 0)
    assert.ok(a.rate > b.rate)
  })

  test('records for other days do not leak into today', () => {
    const s = stateWith(
      [med({ id: 'a', schedule: makeFixedSchedule('OD') })],
      [`a|${yesterday}|09:00`, `a|${today}|09:00`],
    )
    assert.equal(statsForDay(s, today).taken, 1)
    assert.equal(statsForDay(s, yesterday).taken, 1)
  })
})
