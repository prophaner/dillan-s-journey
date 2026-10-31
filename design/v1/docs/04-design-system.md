# 04 · Design system — tokens and components

Source of truth: `prototype/tokens.css` (tokens) and `prototype/app.css` (components). This document explains intent and rules; values below are copied from those files.

## Brand lineage

Carried forward from the earlier Dillan package: Chalk / Iron / Spot orange, Satoshi type, a mark and wordmark (`prototype/brand/`). Everything new in V1 (zone ramp, dark TV theme, state colors) is derived so that the TV never looks like a different product from the phone.

## Color

### Primitives
| Token | Hex | Use |
|---|---|---|
| `--chalk` | #F6F3EC | Phone/desktop background |
| `--paper` | #FFFDF8 | Cards |
| `--oak` | #EEE7DA | Secondary surfaces, segmented control track |
| `--line-l` | #E3DCCD | Hairlines |
| `--iron` | #1A1A18 | Text, primary buttons, focus ring (light) |
| `--graphite` / `--smoke` | #57544D / #6F6B63 | Secondary / tertiary text |
| `--spot` / `--spot-press` | #FF5A1F / #E84A12 | Accent fill (used sparingly: progress, selected, primary CTA on TV) |
| `--spot-ink` | #B93A0B | Orange as text on chalk — 5.2:1 |
| `--steady` | #276B4A | Saved, done, live |
| `--hold` | #855610 | Needs attention (delayed, unsaved). There is no red "error" color; "Not saved" uses Hold. |
| `--unknown` | #8F8A80 | Unmeasured / unknown |

### Dark theme (TV default)
`--bg` #121210, `--surface` #1D1C1A, `--surface-2` #282724, `--line` #35332E, `--text` #F3EFE6, `--text-2` #B8B3A8, `--accent` #FF6A30, `--focus` #F6F3EC. Body text on bg is 15.6:1; secondary 9.4:1.

### Zone ramp
Zones use a cool→warm ramp that deliberately stops at deep clay, not alarm red, so a high zone is informational rather than a reward or warning.

| Zone | Light (text-safe on chalk) | Light tint | Dark (on #121210) | Dark tint |
|---|---|---|---|---|
| 1 | #3F6E9A | #DEE9F3 | #7FA9D6 | #1B2836 |
| 2 | #1F7A6E | #D7EEEA | #5FC4B4 | #163029 |
| 3 | #6B7A1E | #E9EEC9 | #B9C95A | #2A2F14 |
| 4 | #B45A12 | #FBE4D0 | #F0924A | #3A2412 |
| 5 | #9A3B2E | #F6DDD6 | #E07A66 | #3A1F1B |
| Unmeasured | #8F8A80 | #ECE9E2 | #7D786F | #2A2926 |

Rule: zone color never appears without the zone number and its bounds in text (e.g. "Zone 3 · 133–152"). Zone tints are used for the pill background and the breakdown bars; the saturated value is used for text and bar fill.

## Typography

Satoshi (Fontshare) with Inter → system-ui fallback. Tabular numerals (`font-variant-numeric: tabular-nums`) on all timers and BPM.

| Step | Phone/desktop | TV | Use |
|---|---|---|---|
| xs | 12 | 20 | eyebrows, status lines |
| sm | 13 | 22 | help text, chips |
| base | 15 | 28 | body |
| md | 17 | 32 | list titles |
| lg | 20 | 40 | card titles |
| xl | 24 | 48 | screen titles |
| 2xl | 30 | 64 | TV exercise name, summary numbers |
| 3xl | 38 | 88 | phone metric, TV secondary metric |
| metric | 56 | 168 | BPM |

TV sizes are tuned for 3 m viewing on a 1920×1080 canvas; the smallest TV text is 20 px.

## Spacing, radius, size

4 px grid on phone (`--s-1…--s-16` = 4…64), 6 px-based on TV (6…96). Radii 10/14/20 (phone), 14/20/28 (TV), pill 999. Touch target `--tap` 44 px phone, 72 px TV. TV safe area `--safe` 64 px on all sides (overscan). Focus ring `--focus-w` 3 px phone / 5 px TV plus a soft halo (`--focus-halo`), always drawn outside the element so layout never shifts.

## Motion

`--dur-fast` 120 ms, `--dur` 200 ms, ease `cubic-bezier(.2,.7,.2,1)`. Only opacity/transform animate. Rest ring and progress use linear time, not easing. `prefers-reduced-motion: reduce` (and the `.reduce-motion` class) set durations to 0; the rest ring then updates once per second as a stepped value. Nothing blinks or pulses; state changes (Live → Delayed) crossfade the status line and change the pill tone.

## Components

| Component | Class | Variants / states | Notes |
|---|---|---|---|
| Button | `.btn` | primary (Iron fill light / Spot fill TV), secondary (outline), quiet, danger (Iron fill with "Delete"/"End" verb), disabled; sizes sm/md/lg | Min height `--tap`; TV buttons grow on focus via ring only (no scale) |
| Segmented control | `.segmented`/`.seg` | 2–3 options, `role="radiogroup"` | Used for Email/SMS, Straight/Superset, Total/Per side, Per implement/Total load, lb/kg |
| Field | `.field` + `.input` / `.textarea` / `.stepper` | default, focused, invalid (Hold outline + inline message `aria-describedby`), help text | Numeric fields use `inputmode="numeric"`; no native validation bubbles |
| Code entry | `.code-wrap` `.code-boxes` `.code-input` | 6 boxes; hidden real input overlays the boxes | Supports paste, iOS autofill, screen readers |
| Card / Row card | `.card`, `.rowcard`, `.list` | default, pressable, selected | List rows are 56 px phone / 96 px TV |
| Chip | `.chip` | neutral, ok, warn, zone-n, unknown | Always text + optional dot |
| Zone pill | `.zone-pill`, `.zone-compact` | zone 1–5, unknown, not-set | Shows "Zone N · lo–hi" or "Zone unknown" or "Set up zones" |
| Metric | `.metric` + `.num` | BPM, timers | Tabular numerals; freshness line underneath |
| Status line | `.status-line` | live (Steady dot), delayed (Hold), unavailable (Unknown), saving/saved/error for notes | `aria-live="polite"` |
| Rest card | `.rest-card` + `.rest-ring` | counting, finished | Skip rest / Undo |
| Set pills | `.set-pills` `.set-pill` | todo, current, done, skipped, not-reached | Skipped uses a slash glyph, not a zero |
| Calendar | `.cal` | day: plain, today, selected, has-completed (solid dot), has-ended-early (hollow dot), has-note (pencil) | 7 equal columns `minmax(0,1fr)`; fixed cell height (44 phone / 84 TV) |
| Zone bars | `.bars` `.zonebar` | 5 zones + Unmeasured | Bar + label + duration text |
| Dialog | `.scrim` + `.dialog` | confirm, danger-confirm, form (M7) | Focus trapped; initial focus on the safe action; Esc/Back closes = Cancel |
| Sheet | `.sheet` | phone bottom sheet | Used for All zones, exercise menu |
| Toast | `.toast` | info | Iron on Chalk (inverted on TV), 3 s, below dialogs (z 15 < scrim) |
| Banner | `.banner` | workout-in-progress, pending save | Full-width, one action |
| Top bar | `.topbar` | title, Back, trailing action | Back is always a real button, also bound to browser Back |
| Bottom nav / Side nav / TV nav | `.bottomnav` `.sidenav` `.tv-nav` | Home, Program, Calendar + avatar | Phone <1024, desktop ≥1024, TV always top |
| TV tile | `.tv-tile`, `.tv-chooser` | profile (locked), add-user, workout | 280×280 on chooser; focus ring 5 px |
| TV panel | `.tv-panel` | default, live-data | Right-column container on dashboard |
| QR | `.qr` | with caption + typed fallback | Never the only path |
| Empty | `.empty` | with one primary action | Copy in `05-developer-handoff.md` |
| Skeleton | `.skeleton` | loading | Used for lists and calendar while fetching; never for live BPM (which shows "Waiting…" text instead) |

## Layout

- Phone 390: single column, 16 px gutters, bottom nav 56 px + safe-area inset.
- 320 (container query ≤340 px): gutters 12 px, metric 48 px, inline-3 field groups wrap to 2 + 1, example tag hidden, set pills shrink to 36 px.
- Desktop ≥1024: 240 px side nav + 720 px max content column, centered.
- TV 1920×1080: 64 px safe area; dashboard is a 2/3 + 1/3 grid (`.tv-grid`), nav 96 px tall, footer `.tv-footer` for hints ("Back = Pause").

## Accessibility

- All text ≥4.5:1 against its surface; large TV text ≥3:1 minimum but in practice ≥7:1.
- Every interactive element reachable by keyboard/D-pad; visible focus always.
- Live regions: status lines and toasts `aria-live="polite"`; BPM itself is not announced every second — the freshness/state change is.
- Color never carries meaning alone (zone number, chip text, dot + label).
- Reduced motion honored; no flashing; no audio.
- Language avoids judgment: "ended early" not "failed", "needs attention" not "error", no praise for high heart rate.
