/* ------------------------------------------------------------------ *
 * Inline SVG icon set. Stroke-based, 1.75px, sized by `em`.
 * ------------------------------------------------------------------ */

export type IconName =
  | 'check'
  | 'check-circle'
  | 'close'
  | 'plus'
  | 'chevron-right'
  | 'chevron-left'
  | 'bell'
  | 'bell-off'
  | 'chart'
  | 'pill'
  | 'settings'
  | 'home'
  | 'clock'
  | 'calendar'
  | 'flame'
  | 'download'
  | 'trash'
  | 'edit'
  | 'sparkle'
  | 'haptic'
  | 'sun'
  | 'moon'
  | 'share'
  | 'undo'
  | 'skip'
  | 'snooze'
  | 'shield'

const PATHS: Record<IconName, string> = {
  check: 'M4 8.5 6.6 11 12 4.8',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.2 12.2l2.5 2.5 5-5.4',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  'chevron-right': 'M9.5 5.5 16 12l-6.5 6.5',
  'chevron-left': 'M14.5 5.5 8 12l6.5 6.5',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9ZM13.7 19a2 2 0 0 1-3.4 0',
  'bell-off':
    'M17.6 17.6A13 13 0 0 1 18 15.5c0-1-.2-1.9-.5-2.7M6.3 6.3A6 6 0 0 0 6 9c0 5-2 6.5-2 6.5h12M10.3 19a2 2 0 0 0 3.4 0M3 3l18 18',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pill: 'M10.5 3.5 3.5 10.5a5 5 0 0 0 7 7l7-7a5 5 0 0 0-7-7ZM8 6l10 10',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7.1 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.7h-.2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V2.6a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  home: 'M3 10.4 12 3l9 7.4V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 1.8',
  calendar: 'M4.5 6.5h15a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1ZM8 3.5V8M16 3.5V8M3.5 11h17',
  flame:
    'M12 21.5c3.6 0 6.5-2.7 6.5-6 0-4.5-4.5-6.5-4-12-3 2-5 5.2-5 8.5 0 1.5.6 2.6.6 2.6S8.7 13 8 11c-1.3 1.4-2 3.2-2 4.5 0 3.3 2.9 6 6 6Z',
  download: 'M12 3.5v11m0 0 4-4m-4 4-4-4M4 17v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V17',
  trash: 'M4 6.5h16M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7M6.5 6.5 7.4 20a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1l.9-13.5M10 10.5v6M14 10.5v6',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 6.5l3 3',
  sparkle: 'M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7L4.5 11 10.2 9 12 3.5ZM18.5 3v3M20 4.5h-3M6 17v2.5M7.2 18.2H4.7',
  haptic:
    'M8 4.5h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2ZM4 9v6M20 9v6M12 9.5v5M2 10.5v3M22 10.5v3',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  share: 'M12 3.5v12M12 3.5 8 7.5M12 3.5l4 4M4.5 14v5.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14',
  undo: 'M4 9.5h9.5a5.5 5.5 0 0 1 0 11H8M4 9.5 8.5 5M4 9.5 8.5 14',
  skip: 'M6 5.5 15 12l-9 6.5v-13ZM18 5.5v13',
  snooze:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 10h6l-6 5h6',
  shield: 'M12 21s7-3.2 7-9V5.8L12 3 5 5.8V12c0 5.8 7 9 7 9ZM9 11.8l2.1 2.1 4-4.2',
}

const FILLED: Partial<Record<IconName, boolean>> = {}

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  className,
  style,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
}) {
  const d = PATHS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={FILLED[name] ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  )
}
