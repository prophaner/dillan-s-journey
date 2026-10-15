# 05 · Web platform behavior

Version 2.0 (web-first). This document maps the browser-specific requirements of the product brief (§4.1, §10.2, AT-29 to AT-36) to concrete UI behavior, so Claude can build them as designed states rather than inventing them. It does not pick a framework or a host. The brief says a TypeScript web stack is a reasonable proposal, not a mandate.

The short version: **the browser is the product.** Installing is optional. Every capability the browser might not have (push, background timers, persistent storage, health data) gets an honest state in the UI instead of a promise.

## 1. Acceptance tests, mapped to screens

| AT | Situation | Required outcome | Designed behavior | Mockup |
|---|---|---|---|---|
| **AT-29** | Phone browser, not installed | Core coaching and logging work without home-screen installation | Every screen in this package works in a normal tab. Install is offered once, after the first completed session, as an optional sheet. Settings keeps the option forever. No feature is gated on install except web push on iOS, which is stated plainly. | S01, S19 |
| **AT-30** | Push denied or unavailable | In-app reminders work; no permission nagging or blocked workflow | In-app reminders are always on and never require permission. The Reminders screen shows push as On / Off / Not available here (with the reason) and offers email. Permission is requested only when the user turns the row on, never on load, and never re-asked after a denial. | S22 |
| **AT-31** | Screen locked during rest | Correct time on return; no promised background alarm | Timers render `now − startedAt`. On `visibilitychange` the display is recomputed before the next paint. If rest already ended, S18 shows "Rest ended · 2:14 ago" with the settled mark. The banner under every timer says: "Keeps correct time if your screen locks. No sound while the screen is off." | S05, S18 |
| **AT-32** | New deployment during an active session | No reload, no lost workout | The waiting service worker is never told to `skipWaiting` while a session route is open. The "A new version is ready · Update" banner appears on Today only. Session drafts persist in IndexedDB with a schema version, so a later activation finds them. | S21 |
| **AT-33** | Account switch with local data | No leakage, no outbox replay under a new identity | Every IndexedDB record carries `accountId`. Sign-out warns about unsynced items, then clears that account's stores. A different sign-in on the same device gets fresh stores and never sees or replays the previous outbox. The Your data sheet shows who is signed in. | S21 |
| **AT-34** | Storage unavailable, quota exceeded, or cleared | Honest save state; no false "safe" | `navigator.storage.estimate()` and a write probe at startup. If persistence fails: banner on Today, immediate per-set sync with the save state visible, and "Didn't sync" when the server can't be reached. The Your data sheet states that clearing browser data removes unsynced sets. `navigator.storage.persist()` is requested after the first completed session, result shown as a footnote. | S21 |
| **AT-35** | Narrow screen and keyboard open | Log and stop never obstructed, no horizontal overflow | S17 keyboard-open layout: sticky action row tracks `visualViewport`, measures collapse, End stays in the run bar. Layout verified at 320, 360 and 390 widths with a 260–320 px keyboard. | S17 |
| **AT-36** | First visit offline | Honest offline-unavailable screen | The service worker's precached fallback page (S20) says a first visit needs a connection, what works afterwards, and that nothing was lost. After one successful load of the plan, offline becomes a calm banner. | S20 |

## 2. Save and sync model, as the user sees it

The brief (§10.2) requires an IndexedDB outbox with stable local IDs, expected server versions and idempotency keys, and says that **server acknowledgement is the only basis for a "synced" label.** The design makes that lifecycle visible with exactly three words:

```
tap Log set
  → write to IndexedDB (local id, accountId, idempotency key, expectedVersion)
  → UI shows the set as logged + "Saved on this device"           (≤ 300 ms, no network)
  → outbox worker POSTs while the app is visible
      ack 2xx                  → "Synced"
      offline / 5xx            → stays "Saved on this device", retry with backoff
      409 version conflict     → Conflict card (Yours / Theirs / Compare), never silent
      4xx permanent / exhausted→ "Didn't sync" + Retry, previous value still shown
```

Rules the UI must follow:

- Never show "Synced" optimistically, and never show a spinner for the outbox.
- The count of local items is visible wherever it matters: Today eyebrow ("3 unsynced"), session card header, sidebar footer, Session complete footer, Your data sheet.
- Background Sync API is an enhancement; the outbox drains whenever the app is open. The copy says "will sync when you're online and Dillan is open."
- Sign-out and "clear this device" flows show the unsynced count and offer Sync now first.
- Do not promise that a remote device's cache can be wiped before it reconnects.

## 3. Service worker policy

| Cache | Policy |
|---|---|
| App shell (HTML, JS, CSS, fonts, icons, the S20 fallback page) | Precache, versioned. |
| Routine snapshots the user has opened, exercise content they've viewed | Cache on demand, bound to `accountId`, cleared on sign-out. |
| Authenticated API responses, coach–client records, conversations | **Not cached by the service worker.** Live data comes from the network or from the app's own IndexedDB stores. |

Update flow: new worker installs and waits. If `location.pathname` starts with `/session/`, hold. Otherwise show the Today banner; on tap, post `SKIP_WAITING`, then reload once `controllerchange` fires. On cold start with a waiting worker and no open session, activate silently.

## 4. Timers and wake lock

- All timers (rest, session elapsed, superset transitions) are derived from stored timestamps, never from `setInterval` counts.
- Request `navigator.wakeLock.request('screen')` when the session runner is visible; re-request on `visibilitychange` back to visible; release on End. If unavailable, nothing else changes.
- Tab title mirrors the rest countdown on desktop. No audio is scheduled while `document.hidden` is true.
- The optional rest-end chime uses Web Audio, unlocked by the user's first tap in the session (browsers require a gesture).

## 5. Installation (optional PWA)

- Manifest: `name` Dillan, `short_name` Dillan, `start_url` `/today`, `display` `standalone`, `background_color` Iron, `theme_color` Chalk, icons 192/512 plus maskable, shortcuts "Start today's session" and "Log a set."
- `beforeinstallprompt` is captured and deferred; it fires only from S19's "Show me how" or from Settings → Install.
- iOS: no API exists, so S19 shows the Share → Add to Home Screen path. Detect standalone mode with `display-mode: standalone` to hide install entries once installed.
- Install is never shown during a session, before the first completed session, or more than once unprompted.

## 6. Reminders and push

- In-app reminders are computed client-side from the schedule and shown on Today. No permission needed.
- Web push is offered only when `'Notification' in window && 'PushManager' in window`. On iOS it also requires standalone mode; the row explains this.
- Permission is requested from S22 only, after a user turns the row on. A denial is remembered; the row flips to "Not available here" with "Change in browser settings."
- Email reminders are an opt-in fallback with generic text and no health details. A missed reminder is never followed up (FR-11).

## 7. Inputs and keyboards

- Loads: `<input type="text" inputmode="decimal">`, accepts `.` and `,`. Reps, seconds, rounds: `inputmode="numeric"`. Never `type="number"` (spinner arrows, scroll-to-change and locale issues).
- Font size of any input is at least 16 px so iOS Safari never zooms.
- `enterkeyhint="done"` on the last field in a card; Enter logs the set.
- `touch-action: manipulation` on all buttons to remove the 300 ms double-tap delay and zoom.
- The sticky action row listens to `window.visualViewport` `resize` and `scroll` and positions itself at `visualViewport.height − rowHeight`.

## 8. Viewport, safe areas and widths

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`. Do not disable user zoom.
- Use `100dvh` for full-height routes and `env(safe-area-inset-*)` for anything fixed.
- No horizontal scroll at 320 px: long names wrap, tables become stacked rows below 768, charts shrink with the container.
- Verify at 320, 360, 390, 430, 768, 1024, 1280, 1440.

## 9. Health data

- There is no browser API for Apple Health or Google Health Connect. The UI never shows a "Connect" control that can't work (AT-20).
- Manual entry is first-class: measurements, body weight, and after-the-fact sessions, each stamped `source: user_entered`.
- Keep a clean external-data adapter and provenance fields (`source`, `importedAt`, `originalId`) so a Phase 4 file import or provider integration can land without redesign. Until then, S23 says exactly that.

## 10. Security notes that touch the UI

- Session cookies are `HttpOnly`; nothing secret lives in `localStorage`. AI provider keys never reach the browser (§10.2).
- A restrictive CSP means no inline event handlers and no CDN fonts in production: self-host Satoshi, Newsreader and M PLUS Rounded 1c.
- Content from notes, uploads and coach text is rendered as text, never as HTML.

## 11. Browser support

Evergreen Chrome, Edge, Firefox and Safari (last two major versions), iOS Safari 16.4+ (first version with web push for installed apps), Android Chrome. Features used progressively, with a fallback for each: wake lock, `beforeinstallprompt`, push, `navigator.share`, `storage.persist`, Background Sync.
