import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Sheet } from './Sheet'
import { Icon } from './Icon'
import { ScheduleEditor } from './ScheduleEditor'
import { dateKey, formatClock, relativeDayLabel } from '../lib/date'
import { PALETTES, PALETTE_KEYS } from '../lib/colors'
import { haptic } from '../lib/haptics'
import { makeFixedSchedule, slotsForDay } from '../lib/schedule'
import { actions } from '../lib/store'
import type { Medication, PaletteKey, Schedule } from '../lib/types'

/* ------------------------------------------------------------------ *
 * Add / edit a medication.
 * ------------------------------------------------------------------ */

const COMMON_DOSES = ['1 tablet', '2 tablets', '5 ml', '250 mg', '500 mg', '1 capsule', '10 mg']

const LEAD_OPTIONS = [
  { value: 0, label: 'On time' },
  { value: 5, label: '5 min before' },
  { value: 10, label: '10 min before' },
  { value: 15, label: '15 min before' },
  { value: 30, label: '30 min before' },
]

export function MedEditorSheet({
  open,
  onClose,
  editing,
  existingColors,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  editing: Medication | null
  existingColors: PaletteKey[]
  onSaved: (med: Medication, isNew: boolean) => void
  onDeleted?: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [instructions, setInstructions] = useState('')
  const [color, setColor] = useState<PaletteKey>('grape')
  const [schedule, setSchedule] = useState<Schedule>(() => makeFixedSchedule('OD'))
  const [startDate, setStartDate] = useState(() => dateKey())
  const [leadMinutes, setLeadMinutes] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset the form whenever the sheet opens.
  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    if (editing) {
      setName(editing.name)
      setDose(editing.dose)
      setInstructions(editing.instructions)
      setColor(editing.color)
      setSchedule(editing.schedule)
      setStartDate(editing.startDate)
      setLeadMinutes(editing.leadMinutes)
    } else {
      const free = PALETTE_KEYS.find((k) => !existingColors.includes(k)) ?? 'grape'
      setName('')
      setDose('')
      setInstructions('')
      setColor(free)
      setSchedule(makeFixedSchedule('OD'))
      setStartDate(dateKey())
      setLeadMinutes(0)
    }
  }, [open, editing, existingColors])

  // Live preview of what today's schedule looks like.
  const preview = useMemo(() => {
    const draft: Medication = {
      id: 'preview',
      name: name || 'Medication',
      dose,
      instructions,
      color,
      schedule,
      startDate,
      endDate: null,
      leadMinutes,
      archived: false,
      createdAt: 0,
    }
    return slotsForDay(draft, dateKey())
  }, [name, dose, instructions, color, schedule, startDate, leadMinutes])

  const valid = name.trim().length > 0

  const save = () => {
    if (!valid) return
    haptic('success')
    const payload = {
      name: name.trim(),
      dose: dose.trim(),
      instructions: instructions.trim(),
      color,
      schedule,
      startDate,
      endDate: null,
      leadMinutes,
    }
    if (editing) {
      actions.updateMed(editing.id, payload)
      onSaved({ ...editing, ...payload }, false)
    } else {
      const med = actions.addMed(payload)
      onSaved(med, true)
    }
    onClose()
  }

  const remove = () => {
    if (!editing) return
    const label = editing.name
    actions.removeMed(editing.id)
    onDeleted?.(label)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit medication' : 'Add medication'}
      footer={
        editing ? (
          confirmDelete ? (
            <>
              <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button className="btn btn--danger" style={{ flex: 1 }} onClick={remove}>
                Delete
              </button>
            </>
          ) : (
            <>
              <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={16} />
                Delete
              </button>
              <button className="btn btn--primary" style={{ flex: 2 }} onClick={save} disabled={!valid}>
                Save changes
              </button>
            </>
          )
        ) : (
          <button className="btn btn--primary btn--block btn--lg" onClick={save} disabled={!valid}>
            <Icon name="plus" size={18} strokeWidth={2.2} />
            Add to schedule
          </button>
        )
      }
    >
      {/* preview */}
      <motion.div
        className="next"
        style={{
          ['--accent' as string]: PALETTES[color].base,
          ['--accent-bright' as string]: PALETTES[color].bright,
          ['--accent-deep' as string]: PALETTES[color].deep,
          ['--accent-rgb' as string]: PALETTES[color].rgb,
          marginBottom: 'var(--sp-5)',
        }}
        layout
      >
        <div className="next__pulse">
          <Icon name="pill" size={24} />
        </div>
        <div className="next__info">
          <div className="next__label">Preview</div>
          <div className="next__name">{name.trim() || 'Medication name'}</div>
          <div className="next__time">
            {preview.length === 0
              ? 'No doses scheduled'
              : preview.length <= 4
                ? preview.map((p) => p.label).join('  ·  ')
                : `${preview.length} doses · ${preview[0].label} → ${preview[preview.length - 1].label}`}
          </div>
        </div>
      </motion.div>

      {/* name */}
      <div className="field">
        <label className="field__label" htmlFor="med-name">
          Name
        </label>
        <input
          id="med-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Vitamin D, Amoxicillin"
          maxLength={48}
          autoComplete="off"
          enterKeyHint="next"
        />
      </div>

      {/* dose */}
      <div className="field">
        <label className="field__label" htmlFor="med-dose">
          Strength / amount
        </label>
        <input
          id="med-dose"
          className="input"
          value={dose}
          onChange={(e) => setDose(e.target.value)}
          placeholder="e.g. 500 mg, 1 tablet"
          maxLength={32}
          autoComplete="off"
        />
        <div className="chip-row" style={{ marginTop: 'var(--sp-3)' }}>
          {COMMON_DOSES.map((d) => (
            <button
              key={d}
              type="button"
              className={`chip${dose === d ? ' chip--on' : ''}`}
              onClick={() => {
                haptic('tap')
                setDose(d)
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <ScheduleEditor value={schedule} onChange={setSchedule} startDate={startDate} />

      {/* instructions */}
      <div className="field">
        <label className="field__label" htmlFor="med-notes">
          Instructions
        </label>
        <textarea
          id="med-notes"
          className="input"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Take after food with water"
          maxLength={90}
          rows={2}
        />
        <div className="chip-row" style={{ marginTop: 'var(--sp-3)' }}>
          {['After food', 'With water', 'Before food', 'At bedtime', 'With milk'].map((n) => (
            <button
              key={n}
              type="button"
              className={`chip${instructions === n ? ' chip--on' : ''}`}
              onClick={() => {
                haptic('tap')
                setInstructions(instructions === n ? '' : n)
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* colour */}
      <div className="field">
        <span className="field__label">Colour</span>
        <div className="swatches">
          {PALETTE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`swatch${color === k ? ' swatch--on' : ''}`}
              style={{
                ['--sw' as string]: PALETTES[k].base,
                ['--sw-rgb' as string]: PALETTES[k].rgb,
              }}
              onClick={() => {
                haptic('tap')
                setColor(k)
              }}
              aria-label={PALETTES[k].name}
              aria-pressed={color === k}
            />
          ))}
        </div>
      </div>

      {/* start date */}
      <div className="field">
        <label className="field__label" htmlFor="med-start">
          Start date
        </label>
        <input
          id="med-start"
          type="date"
          className="input"
          value={startDate}
          max={dateKey(Date.now() + 3650 * 86_400_000)}
          onChange={(e) => {
            haptic('tap')
            if (e.target.value) setStartDate(e.target.value)
          }}
        />
        <p className="field__hint">{relativeDayLabel(startDate)}</p>
      </div>

      {/* lead time */}
      {schedule.kind !== 'prn' ? (
        <div className="field">
          <span className="field__label">Remind me</span>
          <div className="chip-row">
            {LEAD_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`chip${leadMinutes === o.value ? ' chip--on' : ''}`}
                onClick={() => {
                  haptic('tap')
                  setLeadMinutes(o.value)
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* summary */}
      {preview.length > 0 ? (
        <div className="card card--solid" style={{ marginBottom: 'var(--sp-5)' }}>
          <div className="card__body">
            <div className="section__title" style={{ marginBottom: 'var(--sp-3)' }}>
              Today&rsquo;s schedule
            </div>
            <div className="time-row">
              {preview.slice(0, 8).map((p) => (
                <span key={p.id} className="badge badge--muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatClock(p.due)}
                </span>
              ))}
              {preview.length > 8 ? (
                <span className="badge badge--muted">+{preview.length - 8} more</span>
              ) : null}
            </div>
            {leadMinutes > 0 ? (
              <p className="field__hint">
                You&rsquo;ll be nudged {leadMinutes} min before each dose.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </Sheet>
  )
}

