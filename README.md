<div align="center">

# <img src="public/icons/favicon.svg" width="88" height="88" alt="MedsTime" />

# MedsTime

**A beautiful, colorful, minimal pill reminder that installs to your home screen.**

Schedule `OD` · `BD` · `TDS` · `QID` · `QHS`, or roll your own **every-N** interval.
Get a buzz, a notification you can act on directly, and a small celebration
when you take a dose.

[![Live](https://img.shields.io/badge/live-medstime-8B5CF6?style=flat-square&labelColor=0b0a14)](https://reewaaz.github.io/medstime/)
[![License: MIT](https://img.shields.io/badge/license-MIT-34D399?style=flat-square&labelColor=0b0a14)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&labelColor=0b0a14)](tsconfig.json)
[![PWA](https://img.shields.io/badge/PWA-installable-FBBF24?style=flat-square&labelColor=0b0a14)](public/icons/icon-512.png)

</div>

---

## What it does

<table>
<tr>
<td width="50%">

**Schedules that match a prescription**

Pick a frequency, set your **first dose**, and the rest of the day works
itself out:

| Code | Meaning | Gap | First dose 06:00 gives |
|------|---------|-----|--------------------------|
| `OD` | Once daily | — | 06:00 |
| `BD` | Twice daily | 12 h | 06:00, 18:00 |
| `TDS` | Three times daily | 8 h | 06:00, 14:00, 22:00 |
| `QID` | Four times daily | 6 h | 06:00, 12:00, 18:00, **00:00** |
| `QHS` | At bedtime | — | one dose |
| `q**` | Every N min / hr / day | your N | rolls around the clock |
| `PRN` | As needed | — | — |

Times wrap past midnight rather than being clamped, so a `QID` started at
18:00 keeps all four doses (18:00, 00:00, 06:00, 12:00) and the app says
so. One-tap chips cover the common first doses, and the native picker is
there for everything else.

Not an even spread? **Set each dose time myself** unpins the schedule into
individual editable times, with a button to snap back to the even spread.

</td>
<td width="50%">

**Reminders that actually reach you**

- Notifications with **✓ Taken · Snooze 10m · Skip** buttons
- Haptics on every interaction, with distinct patterns per action
- A rising chime, synthesised in-app — no audio assets
- Works offline, installs to the home screen, launches full-screen

</td>
</table>

**Tracking that means something**

- A daily progress ring, an "up next" card, and a live timeline
- 7 / 30 / 90-day adherence, perfect-day streaks, per-medication breakdown
- A time-of-day histogram so you can see *when* you actually take things
- Missed doses are marked, not silently dropped

**And it respects you**

- Dark and light themes, following the system by default
- Eight accent colours; the whole interface recolours around the current dose
- Night-owl mode: roll the day over at 4&nbsp;am
- Everything stored on-device. No account, no server, no analytics.
- One-tap JSON export/import for backups

---

## Install it

<div align="center">

### iOS (Safari)
Open the link → tap <b>Share</b> → **Add to Home Screen**

### Android (Chrome)
Open the link → menu → **Install app**

### Desktop (Chrome / Edge)
Open the link → install icon in the address bar

</div>

Once installed it runs full-screen, offline, and remembers your regimen
between launches.

You don't have to hunt for the menu: the welcome screen offers **Add
MedsTime to my home screen** on first run, there's a persistent entry in
**Settings**, and a bar slides in once you've added your first
medication.

---

## Screens

| Today | Progress | Add a medication |
|:-:|:-:|:-:|
| Progress ring, live timeline, overdue alerts | Adherence, streaks, time-of-day | Every schedule type, custom times, colour |

---

## Running it locally

```bash
npm install
npm run dev          # http://localhost:5173/medstime/
```

```bash
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build (needed for the PWA checks)
npm test             # domain unit tests
```

### Verification

The interesting parts of this app are the parts a screenshot can't prove, so
they're covered by real browser checks:

```bash
npm run preview &          # required: service workers need a real origin
npm run audit              # everything below
```

| Script | What it proves |
|--------|----------------|
| `npm test` | Schedule generation (anchored OD/BD/TDS/QID, `q6h`, `q15m`, `q2d`), stable dose IDs, adherence and streak maths |
| `npm run audit:layout` | No horizontal overflow, no off-screen elements, no tiny tap targets, no invisible text — across dark/light × all three tabs × the sheets, at 390&nbsp;×&nbsp;844 |
| `npm run audit:pwa` | Service worker activates, manifest is complete, every icon resolves, and the app shell loads **with the network off** |
| `npm run audit:reminders` | A due dose fires exactly one notification, respects lead time, never double-fires, never re-fires after logging, and ignores long-stale doses |
| `npm run audit:schedule` | Driving the real editor: set a first dose and the derived times, the saved schedule, and the Today timeline all agree — including the QID midnight dose and the per-time escape hatch |
| `npm run shots` | Screenshots of the whole flow into `.tmp/shots` |

### Icons

The app icons are generated, not committed as opaque binaries:

```bash
npm run icons     # SDF-rasterises the capsule mark into public/icons/
```

`scripts/generate-icons.mjs` is a small signed-distance-field renderer plus a
PNG encoder built on Node's `zlib` — no image dependency, and every size is
generated from the same description.

---

## How it works

```
src/
├─ lib/
│  ├─ types.ts        Domain model
│  ├─ date.ts         Local-calendar date maths (never UTC)
│  ├─ schedule.ts     Anchored presets + slot generation  ← the core
│  ├─ stats.ts        Adherence, streaks, distributions
│  ├─ store.ts        localStorage + useSyncExternalStore
│  ├─ engine.ts       Reminder scheduler (ticker + staleness window)
│  ├─ install.ts      beforeinstallprompt plumbing
│  ├─ notifications.ts Permission + delivery
│  ├─ haptics.ts      Vibration patterns + Web Audio chime
│  └─ colors.ts       Accent palette
├─ components/        Views, sheets, charts, confetti
├─ hooks/useDoses.ts  Live dose derivation
├─ sw.ts              Service worker: precache + dose scheduler
└─ styles/            Design tokens + component CSS
```

**Anchored dosing.** `OD`/`BD`/`TDS`/`QID`/`QHS` store an *anchor* — the time
of the first dose — and the remaining times are spread evenly around the 24-hour
clock, wrapping past midnight rather than being clamped. A `QID` at 06:00 is
therefore 06:00, 12:00, 18:00 and 00:00 with one input. The anchor is persisted
rather than re-derived from the earliest time, so a regimen that crosses
midnight doesn't drift its first dose to 00:00. Unpinning into individual times
drops the anchor and the explicit list becomes the source of truth; `isAnchored`
decides which editing mode the editor opens in, so existing uneven regimens keep
their exact times.

**Dose identity.** Every dose gets a stable, day-scoped id —
`medId | YYYY-MM-DD | HH:MM` — so marking a dose taken survives a reload,
a service-worker restart, and a daylight-saving shift, and the same dose is
never counted twice.

**Three-layer reminder delivery.** Browsers can't run a task scheduler
forever, so MedsTime is belt-and-braces:

1. a 20-second ticker in the page, which is exact while it's open;
2. a timer inside the service worker, driven by a schedule the page mirrors
   to it, which keeps firing while the worker is alive;
3. a catch-up pass on launch, so anything missed while the browser was shut
   still surfaces (within a 30-minute staleness window, so you aren't
   notified for a dose from six hours ago).

Chromium's Periodic Background Sync is used when available. This is the best
a browser-only app can do — a native app can alarm more reliably. See
[Limitations](#limitations).

**Local time, always.** A dose at 08:00 means 08:00 where you are standing.
Date keys are built from local calendar components rather than ISO/UTC, and
"today" respects your chosen day-start hour.

---

## Deployment

Pushing to `main` builds and publishes to GitHub Pages:

```yaml
# .github/workflows/deploy.yml
- run: npm run build
  env:
    BASE_PATH: /${{ github.event.repository.name }}/
```

`BASE_PATH` sets the Vite `base`, which is what makes the service worker and
asset URLs resolve correctly under `https://<user>.github.io/<repo>/`.
`npm run dev` and `npm run preview` default to `/medstime/`.

To deploy anywhere else, build with the right base and serve `dist/` over
**HTTPS** — service workers, notifications, and haptics all require a secure
context.

---

## Limitations

- **Background reliability.** Without a push server, reminders depend on the
  service worker process staying alive. All three delivery layers above cover
  the common cases, but a browser that evicts the worker *and* is fully closed
  will miss a notification. The in-app timeline and the catch-up pass mean you
  still see the dose.
- **iOS haptics.** Safari supports the Vibration API inconsistently; the
  setting is hidden where the API is absent.
- **iOS notifications** require the app to be installed to the home screen.
- **A four-times-a-day regimen crosses midnight.** Any evenly spread `QID`
  includes a 00:00 dose. MedsTime keeps it on the same calendar day and tells
  you when the spread runs overnight; if that's wrong for you, unpin the
  schedule and set the times yourself.
- **No cloud sync.** Data is per-device by design. Use Export/Import to move
  between phones.

---

## Contributing

Issues and pull requests are welcome. Please run `npm run audit` before
opening a PR — it covers types, unit tests, layout, PWA installability, the
reminder engine, and the schedule editor.

## Disclaimer

MedsTime is an educational reference implementation, **not a medical device**.
Never change a schedule based on it, and always follow the dosing instructions
from a qualified healthcare professional.

## License

[MIT](LICENSE) © MedsTime contributors
