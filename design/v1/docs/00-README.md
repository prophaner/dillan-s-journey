# Dillan V1 — Design Package (mobile web + TV)

Lead-product-designer deliverable for the Dillan V1 brief: an implementation-ready mobile-web and television experience, with a working clickable prototype and a developer handoff written for Claude Code.

## What is in this package

| # | File / folder | What it covers | Brief output item |
|---|---|---|---|
| 0 | `docs/00-README.md` | This index, how to run the prototype, how the pieces fit | — |
| 1 | `docs/01-interpretation-and-assumptions.md` | Reading of the brief, PM defaults applied, labeled assumptions, material concerns | 1 |
| 2 | `docs/02-information-architecture.md` | IA, complete screen and state map with IDs (S01–S15 + modals + health states) | 2 |
| 3 | `docs/03-user-flows.md` | Registration, shared-device approval and switching, Apple connection, template editing, training, interruption recovery, Calendar notes | 3 |
| 4 | `docs/04-design-system.md` | Tokens, type scales, color, zone ramp, components, motion, accessibility | 6 |
| 5 | `docs/05-developer-handoff.md` | Responsive rules, UI copy, interaction rules, persistence model, TV focus order and Back behavior per screen, testable acceptance criteria | 7 |
| 6 | `docs/06-open-questions.md` | Remaining product questions ranked by blocking status | 8 |
| — | `mockups/` | 42 hi-fi PNG renders captured from the prototype (phone 390 @2x, phone 320, desktop 1280, TV 1920×1080) with synthetic example data | 4 |
| — | `prototype/` | Clickable prototype: static HTML/CSS/JS, no build step | 5 |

## The prototype

- Open `prototype/index.html` from any static server (for example `python3 -m http.server 8765` in `prototype/`), or use the published URL shared in the conversation.
- Top bar: choose **Phone + TV**, **Phone only** or **TV only**; choose the phone width **390**, **320** or **Desktop** (1280). **Jump to screen…** reaches any screen directly.
- **Prototype controls** drawer: sensor state (Not connected, Setup required, Waiting → Live, Live, Delayed, Disconnected (phone / Watch), Reconnecting → Live), "Age last reading 12 s", approval outcome (approve / deny / expire), expire TV code, simulate 15 min idle, fail note saves, reduced motion, reset to example or empty data.
- TV is driven only with the keyboard: arrow keys = D-pad, Enter = OK, Backspace or Escape = Back. No mouse is required (mouse clicks also move focus so reviewers can follow along).
- Both devices share one local store (`localStorage`), so an edit on the phone appears on the TV immediately, exactly like the real product's account sync.
- Everything shown is synthetic example data and is labeled "Example data" / "Prototype · example data" on screen.

### What the prototype is, and is not

It is a real, clickable front-end that implements the full V1 state machine (auth, pairing, locking, editor validation, training engine with straight sets and supersets, rest timers, pause, heart-rate freshness, zone accumulation with unmeasured time, autosaving notes with failure retention, calendar). It is **not** connected to a backend, to Apple HealthKit, or to a Fire TV runtime; those boundaries are documented in `05-developer-handoff.md`.

## Brand lineage

Colors, type and the mark continue the Dillan Design Package v2.0 (Chalk / Iron / Spot orange, Satoshi, "The Spot" mark). The V1 brief removes AI coaching, programming and social features; the visual language is retained and adapted for a dark TV theme.

## Platform references used

- Apple — Design for spatial and TV focus, [WWDC23 session 10023](https://developer.apple.com/videos/play/wwdc2023/10023/)
- Apple — [Authorizing access to health data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data) (apps cannot learn whether read access was denied)
- Amazon — [Fire tablets: hybrid apps overview](https://developer.amazon.com/docs/fire-tablets/hybrid-apps-overview.html)
- Amazon — [Vega: develop your app with WebView](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview)

> Persistence note: the source prototype (`prototype/`) saves state in the browser so reloading demonstrates "reload never ends the workout" and failed-note retention. The hosted preview build (`deploy-preview/`) is memory-only because the preview iframe has no Web Storage; a reload there resets to example data.

### Driving the TV in the prototype

1. Click a profile tile on the TV (or focus it with arrow keys and press Enter). The TV shows the pairing screen with a QR code and a typed code.
2. The phone panel shows a banner "Living Room Fire TV is asking to sign in" (standing in for scanning the QR). Tap **Review**, then **Approve as Luis**. The TV signs in and shows Home.
3. Shortcut: Prototype controls → **Approve the TV code (simulates the phone)**, or pick any TV screen from **Jump to screen…** (it signs the TV in for you and says so in a toast).
