/* ------------------------------------------------------------------ *
 * Icon generator.
 *
 * Renders MedsTime's mark — a capsule cut on the diagonal — as PNGs at
 * every size the manifest, iOS and Windows need. Pure Node: a tiny
 * signed-distance-field rasteriser plus zlib for the PNG encoding, so
 * there is no image dependency in the tree.
 *
 *   node scripts/generate-icons.mjs
 * ------------------------------------------------------------------ */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/icons')

/* ------------------------------ PNG --------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------- drawing kit --------------------------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a + (b - a) * t
const mixRgb = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]

/** Coverage of a signed distance at a pixel, with a 1px analytic AA band. */
function cover(sd, aa = 1) {
  return clamp01(0.5 - sd / aa)
}

function over(dst, i, rgb, alpha) {
  if (alpha <= 0) return
  const a = clamp01(alpha)
  dst[i] = Math.round(mix(dst[i], rgb[0], a))
  dst[i + 1] = Math.round(mix(dst[i + 1], rgb[1], a))
  dst[i + 2] = Math.round(mix(dst[i + 2], rgb[2], a))
  dst[i + 3] = Math.round(clamp01(dst[i + 3] / 255 + a) * 255)
}

/** Rounded box centred at (cx, cy) in normalised -1..1 space. */
function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

/**
 * The mark: a capsule lying on the 45° diagonal, split into two halves —
 * a light one and a saturated one — over a deep gradient tile.
 */
function renderIcon(size, { padding = 0.16, rounded = 0.5, glyph = 1 } = {}) {
  const buf = Buffer.alloc(size * size * 4)
  const px = 1 / size // one pixel in normalised units
  const aa = px * 1.1

  // Palette, matching the app's dark surface + grape accent.
  const bgTop = [0x1b, 0x14, 0x33]
  const bgBot = [0x0b, 0x0a, 0x14]
  const capA = [0xc4, 0xb5, 0xfd] // light half
  const capB = [0x7c, 0x3a, 0xed] // saturated half
  const shine = [0xff, 0xff, 0xff]

  const pad = padding
  const r = rounded * (1 - pad * 2)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // Normalised coords in -1..1, y up.
      const u = ((x + 0.5) / size) * 2 - 1
      const v = 1 - ((y + 0.5) / size) * 2

      /* --- tile --- */
      const tileSd = sdRoundBox(u, v, 0, 0, 1 - pad, 1 - pad, r)
      const tile = cover(tileSd, aa)
      if (tile > 0) {
        const g = clamp01((v + 1 - pad) / (2 * (1 - pad)))
        // Vertical gradient with a soft diagonal sheen.
        const sheen = Math.max(0, 1 - Math.hypot(u + 0.45, v - 0.55) * 1.15) * 0.16
        const base = mixRgb(bgTop, bgBot, g)
        over(buf, i, mixRgb(base, shine, sheen), tile)
      }

      if (!glyph) continue

      /* --- capsule --- */
      // Rotate the sampling frame so a horizontal capsule lies on the diagonal.
      const a = Math.PI / 4
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const cx = u * ca - v * sa
      const cy = u * sa + v * ca

      const cw = 0.44 // half length
      const ch = 0.185 // half width
      const capR = ch
      const capSd = sdRoundBox(cx, cy, 0, 0, cw, ch, capR)

      const inCap = cover(capSd, aa)
      if (inCap > 0) {
        // Left half light, right half saturated, with a soft seam.
        const seam = clamp01((cx + 0.012) / 0.024)
        const grad = clamp01((cx + cw) / (2 * cw))
        const body = mixRgb(capA, capB, seam * 0.55 + grad * 0.45)
        over(buf, i, body, inCap * tile)

        // Specular highlight along the top edge.
        const hi = clamp01(1 - Math.abs(cy - ch * 0.52) / (ch * 0.34))
        const along = clamp01(1 - Math.abs(cx) / (cw * 0.92))
        over(buf, i, shine, inCap * tile * hi * along * 0.3)

        // Contact shadow beneath the capsule.
        const shSd = sdRoundBox(cx, cy - 0.075, 0, 0, cw * 0.96, ch, capR)
        const sh = cover(shSd, aa) * (1 - inCap)
        over(buf, i, [0, 0, 0], sh * tile * 0.28)
      }
    }
  }

  return encodePNG(size, size, buf)
}

/* ------------------------------ output ------------------------------ */

mkdirSync(OUT, { recursive: true })

const jobs = [
  { file: 'icon-192.png', size: 192, opts: { padding: 0.0, rounded: 0 } },
  { file: 'icon-512.png', size: 512, opts: { padding: 0.0, rounded: 0 } },
  // Maskable icons must survive a circular crop: keep the glyph small.
  { file: 'maskable-512.png', size: 512, opts: { padding: 0.0, rounded: 0.5, glyph: 0.78 } },
  { file: 'apple-touch-icon.png', size: 180, opts: { padding: 0.0, rounded: 0.22 } },
  { file: 'badge-96.png', size: 96, opts: { padding: 0.0, rounded: 0.4, glyph: 0.95 } },
  { file: 'favicon-32.png', size: 32, opts: { padding: 0.0, rounded: 0.28, glyph: 0.95 } },
]

for (const job of jobs) {
  const png = renderIcon(job.size, job.opts)
  writeFileSync(resolve(OUT, job.file), png)
  console.log(`  ${job.file.padEnd(24)} ${String(png.length).padStart(7)} bytes`)
}

// A crisp vector favicon too, for browsers that prefer it.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1433"/><stop offset="1" stop-color="#0b0a14"/>
    </linearGradient>
    <linearGradient id="cap" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ddd6fe"/><stop offset="0.5" stop-color="#a78bfa"/>
      <stop offset="1" stop-color="#6d28d9"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <g transform="rotate(45 32 32)">
    <rect x="14" y="23" width="36" height="18" rx="9" fill="url(#cap)"/>
    <path d="M32 23h9a9 9 0 0 1 0 18h-9z" fill="#7c3aed" opacity=".85"/>
    <rect x="16.5" y="25.6" width="30" height="3.4" rx="1.7" fill="#fff" opacity=".28"/>
  </g>
</svg>
`
writeFileSync(resolve(OUT, 'favicon.svg'), favicon)
console.log('  favicon.svg')

console.log('\nIcons written to public/icons\n')
