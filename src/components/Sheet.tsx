import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from './Icon'

/* ------------------------------------------------------------------ *
 * Bottom sheet — the app's main surface for adding, editing and
 * settings. Spring physics, drag-to-dismiss, scroll lock.
 * ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  labelledBy?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Lock background scroll while the sheet is up.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <div className="sheet">
            <motion.div
              ref={panelRef}
              className="sheet__panel"
              role="dialog"
              aria-modal="true"
              aria-label={labelledBy ? undefined : title}
              aria-labelledby={labelledBy}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 700) onClose()
              }}
            >
              <div className="sheet__grabber" />
              <div className="sheet__head">
                <h2 className="sheet__title" id={labelledBy}>
                  {title}
                </h2>
                <button className="icon-btn" onClick={onClose} aria-label="Close">
                  <Icon name="close" size={18} strokeWidth={2} />
                </button>
              </div>
              <div className="sheet__body">{children}</div>
              {footer ? <div className="sheet__foot">{footer}</div> : null}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

export interface ToastItem {
  id: number
  text: string
  tone: 'ok' | 'error' | 'info'
}

export function ToastStack({ items }: { items: ToastItem[] }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="toast-stack" role="status" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            className={`toast${t.tone === 'ok' ? ' toast--ok' : t.tone === 'error' ? ' toast--error' : ''}`}
            initial={{ opacity: 0, y: -18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          >
            {t.tone === 'ok' ? <Icon name="check-circle" size={16} /> : null}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const push = (text: string, tone: ToastItem['tone'] = 'info', ttl = 2600) => {
    const id = ++seq.current
    setItems((prev) => [...prev.slice(-2), { id, text, tone }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }, ttl)
  }

  return { items, push }
}
