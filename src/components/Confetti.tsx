import { useEffect, useRef } from 'react'
import { PALETTES } from '../lib/colors'

/* ------------------------------------------------------------------ *
 * Confetti burst.
 *
 * A self-contained canvas particle system — no dependency, no
 * per-frame React renders. Rounded rectangles in the app's palette,
 * with gravity, drag and spin. Auto-terminates when every particle
 * has fallen off-screen.
 * ------------------------------------------------------------------ */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  vr: number
  color: string
  life: number
  ttl: number
  shape: 0 | 1 | 2 // rect, circle, pill
  spin: number
}

export function ConfettiBurst({
  trigger,
  intensity = 1,
  origin = { x: 0.5, y: 0.45 },
  duration = 2600,
}: {
  /** Change this value to fire a new burst. */
  trigger: number
  intensity?: number
  origin?: { x: number; y: number }
  duration?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const triggerRef = useRef(trigger)

  useEffect(() => {
    if (trigger === triggerRef.current) return
    triggerRef.current = trigger
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const palette = Object.values(PALETTES).flatMap((p) => [p.base, p.bright, p.deep])
    const ox = origin.x * w
    const oy = origin.y * h
    const count = Math.round(110 * intensity)

    const particles: Particle[] = []
    for (let i = 0; i < count; i++) {
      // Two cones: a wide spray and a tight upward jet.
      const tight = i % 3 === 0
      const angle = tight
        ? -Math.PI / 2 + (Math.random() - 0.5) * 0.9
        : Math.random() * Math.PI * 2
      const speed = (tight ? 9 : 5.5) * (0.55 + Math.random() * 0.85) * intensity
      const size = 5 + Math.random() * 7
      particles.push({
        x: ox + (Math.random() - 0.5) * 40,
        y: oy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
        vy: Math.sin(angle) * speed,
        w: size,
        h: size * (0.4 + Math.random() * 0.5),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.34,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: 0,
        ttl: 90 + Math.random() * 70,
        shape: (Math.random() < 0.28 ? 1 : Math.random() < 0.5 ? 2 : 0) as 0 | 1 | 2,
        spin: 0.86 + Math.random() * 0.3,
      })
    }

    let frame = 0
    const started = performance.now()

    const step = () => {
      ctx.clearRect(0, 0, w, h)
      let alive = 0

      for (const p of particles) {
        p.life++
        if (p.life > p.ttl) continue

        p.vy += 0.34 // gravity
        p.vx *= 0.992
        p.vy *= 0.992
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr

        if (p.y > h + 60) continue
        alive++

        const fade = 1 - Math.max(0, (p.life - (p.ttl - 26)) / 26)
        ctx.save()
        ctx.globalAlpha = Math.max(0, fade)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color

        if (p.shape === 1) {
          ctx.beginPath()
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx.fill()
        } else if (p.shape === 2) {
          const r = p.h / 2
          ctx.beginPath()
          ctx.roundRect(-p.w / 2, -r, p.w, p.h, r)
          ctx.fill()
        } else {
          const sq = Math.abs(Math.cos(p.rot))
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w * (0.35 + sq * 0.65), p.h)
        }
        ctx.restore()
      }

      frame++
      const elapsed = performance.now() - started
      if (alive > 0 && elapsed < duration) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        ctx.clearRect(0, 0, w, h)
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [trigger, intensity, origin.x, origin.y, duration])

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />
}
