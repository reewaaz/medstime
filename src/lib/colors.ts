import type { PaletteKey } from './types'

/* ------------------------------------------------------------------ *
 * The palette. Each medication owns one accent; every surface derives
 * from it so the whole app recolours around the current medication.
 * ------------------------------------------------------------------ */

export interface Palette {
  key: PaletteKey
  name: string
  /** Solid accent, used for dots, strokes and icon fills. */
  base: string
  /** Brighter tone for gradients and glows. */
  bright: string
  /** Deep tone for text on light backgrounds. */
  deep: string
  /** Translucent wash for card fills. */
  wash: string
  /** Comma-separated RGB triplet for `rgba(..., 0.x)` composition. */
  rgb: string
}

export const PALETTES: Record<PaletteKey, Palette> = {
  grape: {
    key: 'grape',
    name: 'Grape',
    base: '#8B5CF6',
    bright: '#C4B5FD',
    deep: '#5B21B6',
    wash: 'rgba(139,92,246,0.16)',
    rgb: '139,92,246',
  },
  coral: {
    key: 'coral',
    name: 'Coral',
    base: '#FB7185',
    bright: '#FDA4AF',
    deep: '#9F1239',
    wash: 'rgba(251,113,133,0.16)',
    rgb: '251,113,133',
  },
  mint: {
    key: 'mint',
    name: 'Mint',
    base: '#34D399',
    bright: '#6EE7B7',
    deep: '#065F46',
    wash: 'rgba(52,211,153,0.16)',
    rgb: '52,211,153',
  },
  sky: {
    key: 'sky',
    name: 'Sky',
    base: '#38BDF8',
    bright: '#7DD3FC',
    deep: '#075985',
    wash: 'rgba(56,189,248,0.16)',
    rgb: '56,189,248',
  },
  amber: {
    key: 'amber',
    name: 'Amber',
    base: '#FBBF24',
    bright: '#FCD34D',
    deep: '#92400E',
    wash: 'rgba(251,191,36,0.16)',
    rgb: '251,191,36',
  },
  rose: {
    key: 'rose',
    name: 'Rose',
    base: '#F472B6',
    bright: '#F9A8D4',
    deep: '#9D174D',
    wash: 'rgba(244,114,182,0.16)',
    rgb: '244,114,182',
  },
  lime: {
    key: 'lime',
    name: 'Lime',
    base: '#A3E635',
    bright: '#D9F99D',
    deep: '#3F6212',
    wash: 'rgba(163,230,53,0.16)',
    rgb: '163,230,53',
  },
  violet: {
    key: 'violet',
    name: 'Violet',
    base: '#A78BFA',
    bright: '#DDD6FE',
    deep: '#5B21B6',
    wash: 'rgba(167,139,250,0.16)',
    rgb: '167,139,250',
  },
}

export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[]

export function paletteFor(key: PaletteKey | string | undefined): Palette {
  return PALETTES[(key as PaletteKey) ?? 'grape'] ?? PALETTES.grape
}

/** Deterministic accent for a brand-new medication. */
export function nextPaletteKey(existing: PaletteKey[]): PaletteKey {
  const free = PALETTE_KEYS.filter((k) => !existing.includes(k))
  return free[0] ?? PALETTE_KEYS[Math.floor(Math.random() * PALETTE_KEYS.length)]
}
