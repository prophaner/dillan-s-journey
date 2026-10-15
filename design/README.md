# Dillan: Design Package v2.0 (web-first)

**For:** Claude (development partner), Luis Ramos (product owner), and ChatGPT (product manager)
**Pairs with:** `Dillan_Product_Requirements_Web_First_v2.md` (the product brief). That brief defines **what** to build. This package defines **how it looks, feels, and speaks.**
**Date:** October 15, 2026
**What changed from v1.0:** the product is now a **mobile-first responsive web app** (brief §4.1), not an iPhone app. Same brand, same signature moments, same voice. New: web fonts and icons, a Train tab, desktop layouts, and honest browser states for install, offline, sync, timers, reminders and health data. Everything native (SwiftUI theme, Live Activity, Watch, HealthKit) is gone.

---

## Start here, Claude

1. Read the product brief first, then this README, then `docs/02-design-system.md` and `docs/05-web-platform.md`.
2. Open `mockups/*.png` to see the target. Open `prototype/screens.html`, `prototype/desktop.html` and `prototype/coach.html` in a browser to inspect exact spacing and styles. Their CSS is the reference implementation.
3. Use `tokens/tokens.css` as the theme layer (CSS custom properties), or `tokens/tailwind.preset.cjs` if you choose Tailwind. Never hard-code a color, font, radius or duration in a component; always go through a token.
4. Build the components in `02-design-system.md` before building screens.
5. Build screens in the order below. Each screen spec in `docs/03-screens.md` lists the brief requirements (FR/AT) it satisfies.
6. Do not start a SwiftUI, React Native, Capacitor or Watch project. The web app is the production product (brief §17.3).

## What's in the box

```
README.md                     ← you are here
docs/
  01-brand.md                 name, idea, logo rules, color story, web typography rule, icons
  02-design-system.md         principles, responsive layout, navigation, components, states, a11y, motion
  03-screens.md               screen-by-screen spec: S01–S23 phone, D01–D02 desktop, S15 coach workspace
  04-voice-and-copy.md        Dillan's voice, words to use/avoid, microcopy incl. install/offline/sync/reminders
  05-web-platform.md          AT-29…36 mapped to UI, outbox/sync model, service worker, timers, PWA, push
tokens/
  tokens.json                 source of truth (colors, type, space, radius, motion, breakpoints)
  tokens.css                  CSS custom properties, light + Night Gym, reduced motion (used by the prototype)
  tailwind.preset.cjs         same values as a Tailwind preset (optional)
brand/
  dillan-mark.svg, dillan-wordmark.svg, dillan-wordmark-reversed.svg, dillan-lockup.svg
  app-icon.png (+ -light, -tinted) and SVG sources → manifest icons, apple-touch-icon, favicon
mockups/
  s01-today.png … s14-memory.png, s16-train.png … s23-health.png   phone, 390×844 @2x (s17 is 360×780)
  d01-today-desktop.png, d02-routine-editor.png                     desktop, 1440×900
  s15-coach-workspace.png                                           coach view inside the same app, 1440×900
prototype/
  screens.html, desktop.html, coach.html, tokens.css, app.css        live HTML reference for every mockup
```

## The design in 60 seconds

- **Name:** the app is **Dillan**. The coach and the product share a name.
- **Idea:** **The Spot.** Like a gym spotter, Dillan is close enough to catch you and never in your way. The logo is a dot (you) held just above a cradle (Dillan).
- **Look:** warm Chalk background, Iron text, and one safety-orange **Spot** accent per screen. Dark mode is called "Night Gym." There is no red anywhere.
- **Type rule:** **Dillan speaks in serif (Newsreader). Records and people use sans (Satoshi). Numbers use M PLUS Rounded 1c.** You can always tell who's talking. All three are open-license web fonts, self-hosted in production.
- **Feel:** no streaks, no guilt, no confetti. Shortened sessions and rest days count as steady. Stop is always one tap.
- **Honesty about the browser:** three save states (Synced / Saved on this device / Didn't sync), timers that survive a locked screen, install offered once and never required, reminders that say what the browser can do, and no health "connect" button that can't work.
- **Signature moments:** the time control (Full / Short / Priority only), the Course week strip, the set card with one-tap logging, the rest timer drawn as the logo, and the "Spot drop" animation on every logged set.

## Build order (matches the brief's phases, §15)

**Phase 0: Web foundations**
1. Project scaffold with `tokens.css`, the three fonts self-hosted, Lucide icons, routing (`/today`, `/train`, `/session/:id`, `/progress`, `/dillan`, menu routes), bottom nav + desktop sidebar shell.
2. Components: buttons, chips, status tag, save state, card, option row, sheet (`<dialog>`), banner, toast with undo, Spot mark, numeric input, sticky action row.
3. Feasibility spikes from `05-web-platform.md`: IndexedDB outbox with idempotency keys, timestamp timers across lock, service-worker update policy, `visualViewport` keyboard handling, push capability detection. Validate the first-session flow in a phone browser and the coach view on desktop (phase-0 gate).

**Phase 1: Personal training core (no AI dependency)**
4. S12 Onboarding (equipment, goals, existing routine; skippable)
5. S01/S02 Today with time control and the Course strip. Use stored plan purpose text where Dillan's sentence will go later. D01 at ≥ 1024.
6. S16 Train → S04 Set card → S17 keyboard-open → S05 Rest → S18 back from lock → S06 Superset → S07 Session complete. **This is the heart of the app; polish it most.**
7. S11 Something feels off
8. S08 Progress (objectives, Steady weeks, measurements) + manual measurement entry [spec only]
9. Plan + Routine editor (D02 desktop, phone variant spec only) + Exercise detail [spec only]
10. S21 Your data / save state, S20 first-visit offline, storage warning, and all states: empty, loading, offline, failed write, unknown value, conflict

**Phase 2: Accountable Dillan**
11. S09 Dillan chat + proposal card lifecycle
12. S10 Override sheet
13. S13 Directives, S14 Memory, Periodic review [spec only]
14. Replace stored purpose text on Today with Dillan's sentence (with fallback)

**Phase 3: Human coaching and web release**
15. S15 Coach workspace (My training / Coaching toggle), Coach invite [spec only], Privacy & data [spec only]
16. S19 Install (optional PWA), S22 Reminders with push detection and email fallback, S23 Health data
17. Tested offline / resume / update behavior against AT-29…36

**Phase 4 (optional): data integrations.** Only the provenance model is designed now (S23 states it). No UI for imports until one is approved.
**Phase 5: refinement.** Voice logging where supported, richer content.

## Non-negotiables (design QA checklist)

Check every screen against this list before calling it done.

- [ ] Only the three brand fonts, self-hosted. Newsreader **only** for Dillan-authored text.
- [ ] At most one Spot-orange filled element per screen. Iron text on orange, never white.
- [ ] No red. No streak counters. No guilt copy (see `04-voice-and-copy.md`).
- [ ] Every status shows icon + word, never color alone.
- [ ] Unknown values show "—" with a dashed "Not yet known" tag, never 0.
- [ ] "Synced" appears only after server acknowledgement; local-only data says "Saved on this device."
- [ ] End / Stop / Something feels off is reachable in one tap from every training screen, including with the keyboard open, with no confirmation dialog.
- [ ] Every data change triggered from chat appears as a proposal card with a real status (Waiting / Applied / Didn't save).
- [ ] Logging a set works offline and acknowledges in under 300 ms.
- [ ] No horizontal scroll at 320 px. Verified at 320 / 360 / 390 / 430 / 768 / 1024 / 1440.
- [ ] All inputs ≥ 16 px with the right `inputmode`; no `type="number"`.
- [ ] Timers are correct after a locked screen or a background tab; no sound is promised while hidden.
- [ ] No install prompt, permission request or update reload during a session or before the first completed session.
- [ ] 200% browser zoom doesn't clip or overlap; keyboard focus is visible everywhere; the set card reads as a sentence in a screen reader.
- [ ] `prefers-reduced-motion` replaces movement with crossfades; `prefers-color-scheme` picks Night Gym.
- [ ] Notifications and email subjects contain no health details.
- [ ] No "Connect Apple Health" or any health control the browser can't fulfil; missing data is shown as unavailable, never zero.
- [ ] Demo data is synthetic and labeled as such.

## Paste-ready prompt for Claude

> You are building Dillan, a mobile-first responsive web app that is an AI gym coach for trainees and their human coaches. Attached are (1) the product brief v2 (web-first), which is the source of truth for requirements, and (2) the Dillan Design Package v2.0, which is the source of truth for brand, UI, interaction, and copy. Read the brief, then the package README, `docs/02-design-system.md`, `docs/05-web-platform.md`, and `docs/03-screens.md`. Study `mockups/` and the `prototype/*.html` files.
>
> Build the web application as the production product. Do not start a SwiftUI, React Native, Capacitor, native shell, or Watch project, and do not make HealthKit or any health integration an MVP dependency. Propose a TypeScript web stack and hosting, but treat that as your proposal, not a mandate. Use `tokens/tokens.css` (or `tokens/tailwind.preset.cjs`) as the theme layer, the three brand web fonts self-hosted, and Lucide icons. Build the shared components first, then the Phase 0 spikes and Phase 1 screens in the order listed in the README. Match the mockups closely in hierarchy, spacing, and tone.
>
> Follow the "Non-negotiables" checklist in the README and the acceptance tests AT-29 to AT-36 as mapped in `docs/05-web-platform.md`. When the brief and the design package seem to conflict, the brief wins on behavior and data; the design package wins on presentation and copy. Flag the conflict in your delivery notes. For each delivery, list which screens (S/D-IDs) and requirements (FR/AT IDs) are covered, with screenshots at 360 and 390 px wide (including keyboard open), at 1280 px wide, in light and Night Gym, and at 200% zoom.

## Open design questions for Luis

These are my recommendations. They don't block the build.

1. **App name = Dillan?** Recommended. If you'd rather keep a separate product brand, the system still works: only the wordmark changes and the Spot mark stays. Run a trademark search in fitness/software classes before public launch, and check domain availability (`dillan.app` in the mockups is a placeholder).
2. **Units default:** I used lb in the mockups (US pilot). The setting supports kg.
3. **Rest-end sound:** off by default with an optional soft "tok," played only while the page is visible. Confirm.
4. **Escalation copy** in "Something feels off" is a placeholder and needs a qualified reviewer before release (brief §19).
5. **Exercise media style:** real-person video on Chalk background vs. line drawings. Decide once a content source is licensed.
6. **Sign-in method:** I specified email magic link or passkey (no passwords at the gym). Confirm, or tell me if you want a password option.
7. **Email reminders:** they need a sending domain and a privacy line. Confirm you want them in Phase 3, or keep in-app only for the pilot.
