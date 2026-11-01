# 05 · Developer handoff (for Claude Code)

This document is the build contract. The prototype in `prototype/` is a faithful reference implementation of the UI logic (store, engine, D-pad, health model) in plain HTML/CSS/JS; port its behavior, not its file structure. Where the prototype and this document disagree, this document wins and the prototype has a bug.

Contents: 1 Architecture boundaries · 2 Responsive rules · 3 TV input model (focus order + Back per screen) · 4 Interaction specs · 5 UI copy · 6 Persistence model · 7 Live-data contract · 8 Acceptance criteria.

---

## 1 · Architecture boundaries

| Layer | Owns | Notes |
|---|---|---|
| **Web app** (phone/desktop/TV in one codebase) | All screens S01–S15, routing per device, the workout engine, zone accounting, notes autosave, pairing UI | TV is the same bundle with `?surface=tv` → `.tv.theme-dark` root, D-pad handler, 1920×1080 safe-area layout |
| **Backend** | Accounts + OTP, templates, sessions, device registry, pairing codes, live heart-rate relay (per user), notes | Realtime channel per user for live data and session mirroring (phone controller ↔ TV) |
| **iPhone companion + Watch app** (native, separate repo) | HealthKit authorization, heart-rate streaming, publishing `companion` state + readings to the backend | Follows [Apple HealthKit authorization](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data) and the mirrored-workout pattern from [WWDC23 session 10023](https://developer.apple.com/videos/play/wwdc2023/10023/) |
| **Fire TV shell** | Launch the web app in a WebView, forward D-pad/OK/Back/Play-Pause as key events, handle Back-at-root exit | Per [Amazon hybrid apps](https://developer.amazon.com/docs/fire-tablets/hybrid-apps-overview.html) and [Vega WebView](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview). The shell must call `window.dillan.onBack()` and exit only when it returns `false`. |

Device identity: each browser/TV gets a stable `deviceId` (localStorage on web, shell-provided on TV). A TV device record stores `remembered[]` profiles (ids + first names only) and never caches any other user data.

---

## 2 · Responsive rules

| Breakpoint | Layout |
|---|---|
| ≤340 px container (320 phones) | 12 px gutters, metric 48 px, `.inline-3` wraps 2+1, hide example tag, set pills 36 px, code boxes 40 px |
| 341–1023 px | Default phone: 16 px gutters, bottom nav 56 px + `env(safe-area-inset-bottom)`, single column, max content 600 px centered on tablets |
| ≥1024 px | Side nav 240 px, content column max 720 px, Program library and editor side-by-side is **not** V1; same stacked screens |
| TV (`.tv`) | Fixed 1920×1080 design canvas scaled with `transform: scale()` to the WebView viewport (letterbox on non-16:9); 64 px safe area; no hover states; no scroll on dashboard (content must fit); vertical scroll only on Program/Calendar lists, moving focus scrolls the container |

Phone dark mode: optional; follow `prefers-color-scheme` by applying `.theme-dark`. Not required for V1 acceptance.

Touch targets: ≥44×44 phone, ≥72×72 TV focusables. Hit areas may exceed visual size via padding.

---

## 3 · TV input model

### Key map
`ArrowUp/Down/Left/Right` move focus · `Enter` activates · `Escape`/`Backspace`/Fire TV Back → `tvBack()` · Fire TV Play/Pause → on dashboard toggles pause; elsewhere ignored · Menu → opens Profile (S15).

### Focus engine (port of `js/dpad.js`)
- Focusables: `[data-focus]` elements that are visible and not `disabled`.
- Spatial navigation: from the focused rect, choose the nearest candidate in the pressed direction by (primary axis distance × 1) + (orthogonal overlap penalty × 2); candidates must overlap ≥1 px on the orthogonal axis or be the nearest if none overlap. Modal open → candidates restricted to the modal.
- Initial focus per screen is declared with `data-autofocus`; when a screen re-renders, focus is restored to the element with the same `data-focus-id` if it still exists, else to `data-autofocus`.
- Focus is remembered per list (last focused item id) so returning to Program/Choose restores the row.
- Keys are ignored while focus is in the prototype toolbar (prototype-only).

### Focus order and Back, per TV screen

| Screen | Focus order (D-pad) | Initial focus | Back |
|---|---|---|---|
| S01 first-run | Get started | Get started | Exit app (shell) |
| S01 chooser | Profile tiles left→right, then Add user | Most recently active profile tile | Exit app (shell) |
| S03 pairing | New code (only when expired/denied) → Cancel | Cancel while awaiting; New code when expired; Try again when denied | Cancel pairing → chooser (or first-run) |
| S04 Home | Nav: Home · Program · Calendar · avatar (row 1) → Workout Now (primary) → Back to workout (only if live) → week card → trend card → Switch user | Workout Now (Back to workout if live) | If live → dashboard; else toast "On Fire TV, Back here exits Dillan. You stay signed in and the TV auto-locks after 15 minutes." and return `false` to the shell → exit |
| S05 Program | Nav → list rows (↓) → Edit on your phone QR card (→) | First row (or QR card if empty) | Home |
| S07 Choose | List rows (↓); → moves to Start workout in preview panel | Last-used workout row; "Create your first workout" QR hint when empty (focus on Back) | Home |
| S08 Preflight | Start workout → Continue without live data → Back | Start workout if health state is Live or Live-data-off; otherwise Continue without live data; never Back | Choose |
| S09 Dashboard (working set) | Complete set → Skip set (→) ; ↓ to All zones ; ↓ Pause ; End | Complete set | **Pause** (opens S10) |
| S09 Dashboard (rest) | Skip rest → Undo ; ↓ All zones ; Pause ; End | Skip rest | Pause |
| S09 after last set | End workout → All zones | End workout | Pause |
| All zones sheet | Close | Close | Close sheet |
| S10 Paused | Resume → End and save → Switch user | Resume | Stay paused (no-op) |
| M3 End this workout? | Keep going → End and save | Keep going | Close (= Keep going) |
| M4 A workout is running | Cancel → End and save, then continue | Cancel | Close (= Cancel) |
| S11 Summary | Done → All zones detail (if present) | Done | Calendar (today) |
| S12 Calendar | Month ‹ › → day grid (2-D) → session list for selected day | Today (or most recent session day in view) | Home |
| S13 Session detail | Back only (TV is read-only) + QR hint | Back | Calendar with that day selected |
| S15 Profile (TV) | Switch user → Lock this TV → Remove my profile → Back | Switch user | Home |
| M5 Lock this TV? | Cancel → Lock | Cancel | Close |
| M6 Remove profile? | Cancel → Remove | Cancel | Close |

Rule: initial focus is never on Delete, Remove, End or a destructive confirm. Destructive confirms are the second button, to the right.

---

## 4 · Interaction specifications

### 4.1 Authentication (S02)
- Contact validation: email RFC-lite (`x@y.z`), phone E.164 after normalization; show inline error only on submit.
- OTP: 6 digits, TTL 10 min, max 5 attempts, resend cooldown 30 s. Input: a single hidden `<input inputmode="numeric" autocomplete="one-time-code" maxlength="6">` positioned over six display boxes; clicking a box focuses the input; auto-submit at 6 digits; on failure clear and refocus; on typing clear the error.
- Session: httpOnly cookie, 90 days sliding on phone/desktop. TV sessions are separate (see 4.2).

### 4.2 Pairing and shared TV (S01/S03/S15)
- `POST /pairing` from TV → `{code, qrUrl, expiresAt}`; code format `DLN-XXXX` from alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; TTL 5 min; single use. TV polls/subscribes for `awaiting | approved | denied | expired | cancelled`.
- `forUserId` optional (set when a locked tile was chosen). Approval by a different user is allowed only after the phone shows the "This request was for {name}" interstitial and the approver explicitly chooses "Sign the TV in as me".
- On `approved`, backend issues a **TV session token** bound to `deviceId` and `userId`; the TV adds the user to `remembered[]` (first name only).
- `lockDevice(tv)`: delete session token client-side and server-side, clear in-memory view model, render a blank frame for ≥120 ms, then chooser. Never render the chooser or the next user's screens with stale data present.
- Auto-lock: `lastActivityAt` updated on any key/controller event; a tick every 5 s checks `session && !live && now - lastActivityAt > 15 min` → lock. 60 s before, show toast "Locking in 1 minute — press any button to stay".
- Switch user / Log out while `live` → M4. "End and save, then continue" calls `endWorkout()` then proceeds.
- Phone S15 "Approve a TV": manual code entry; QR deep link `/tv?code=…` prefills it. "That's not my TV" denies.

### 4.3 Workout editor (S06)
- New: one blank exercise card, Name focused. Draft autosaved to `devices.phone.draft` every change (survives reload); cleared on Save or Discard.
- Field rules: Name required ≤60 chars; Sets/rounds integer 1–20; Reps integer 1–200 with basis Total | Per side; Weight number ≥0 step 0.5 or blank (= Bodyweight); when Weight present, Load basis Per implement | Total load required; Rest integer 0–600 s, default 60; Instructions ≤240 chars.
- Supersets: `group` letter; consecutive members only; header "Superset A · N rounds"; the rounds field lives on the group and overrides members' sets; rest applies after the last member of each round. Reordering a member out of its neighbors breaks the group (inline notice). Group of 1 is invalid; Save offers "Convert to straight sets".
- Duplicate workout name is allowed with a warning line.
- Dirty tracking → Back / browser `popstate` → M1. Use `history.pushState` guard to intercept Back; on Discard, navigate.
- Save writes template `version+1`. Sessions store a snapshot, so templates are safe to edit or delete (`deletedAt` soft-delete; detail shows "from a deleted workout").

### 4.4 Workout engine (S07–S11)
- `startWorkout(userId, workoutId, {liveData})` builds `steps[]` from the snapshot: for straight sets, `[ex, set 1..N]` each followed by `rest` except after the final set of the workout; for a superset group with R rounds, round r = `[A1 set r, A2 set r, …]` then `rest` (group's rest, after last member). Exactly one `live` per user; the TV is the authority; the phone controller sends commands.
- `completeSet(reps?, weight?)` → result `{status:'done', reps, weight}` defaults to target → advance (to rest or next step). `skipSet()` → `{status:'skipped'}` (never `reps:0`) → advance. `undo()` during rest returns to the previous set with its result cleared. `skipRest()` advances.
- Rest: `restEndsAt`; when it elapses the card shows "Rest finished" and waits for Enter/Complete (no auto-advance into a set).
- `pause()` sets `paused=true, pausedAt`; `resume()` adds `now - pausedAt` to `pausedMs` and extends `restEndsAt` by the same amount. Active time = `now - startedAt - pausedMs`.
- Zone accounting runs on a 1 s tick while `live && !paused`: if `liveData && freshness==='live' && zonesConfirmed` → `zoneMs[zone] += dt`, else `unknownMs += dt`. Current-zone timer resets when the zone changes; "Time in this zone" = `now - zoneSince`. Unknown when zone is null.
- `endWorkout()` → session saved immediately (status `completed` if every set has a result, else `ended_early`; unreached sets recorded as `not_reached`), `live=null`, route → Summary. Save is idempotent on `sessionId`; on network failure queue in `pendingSessions` and show the banner.
- Back/reload never ends the workout: `live` is persisted (localStorage + server) and restored on load. On TV restore, show Paused with "Paused while Dillan was in the background".
- Last-set state: after the final set's result, primary = End workout; the summary is not shown until End is pressed (the user may still undo).

### 4.5 Health model (S08/S09/S14)
See §7 for the data contract. Freshness: `age ≤ 10 s → live`, `≤ 30 s → delayed`, else `unavailable`; `none` when no reading ever. Display rules are the H-state table in `02-information-architecture.md`. When paused, label is "Paused" and the detail prefixes the underlying state.

### 4.6 Home metrics (S04)
- Week = Monday 00:00 to Sunday 23:59:59 in the user's timezone. "Sessions this week" counts sessions with `startedAt` in the week (both statuses). Goal from `user.weeklyGoal` (1–14, default 3; stepper on phone, read-only on TV).
- Active minutes this week = Σ `activeMs`.
- Comparison: "vs last week at this point" compares to the previous week's sessions/minutes with `startedAt ≤ (now − 7 days)` — same elapsed portion.
- 4-week trend: bar per ISO week, sessions count, current week highlighted; label "Sessions per week · last 4".
- Empty state when the user has zero sessions: "Your first workout starts your progress." + Workout Now / Create your first workout.

### 4.7 Calendar and notes (S12/S13)
- Month grid Monday-first; previous months navigable; "next" disabled beyond the current month; future days rendered but not interactive. Day cell: date, dot (solid completed / hollow ended early), pencil if any session has a note.
- Notes autosave: debounce 800 ms; statuses `idle | dirty("Unsaved changes") | saving("Saving…") | saved("Saved HH:MM") | error("Not saved — we kept your note on this device")`. On error, keep text in `pendingNotes[sessionId]`, show **Retry now**, retry automatically on `online` and on app start. Restore pending text over server text if newer.
- Session detail lists every set with `done (reps · weight with basis)`, `Skipped`, or `Not reached`. Zone breakdown shows 5 zones + Unmeasured; when `!hadLiveData` show "No heart-rate data — you continued without live data."

---

## 5 · UI copy (canonical strings)

Use these verbatim; they are also what the prototype renders.

**Welcome / auth**
- "Your workouts, on the big screen." / "Your home-gym workouts, your heart rate on the big screen, your history in one place."
- "Register or log in" · "Enter the 6-digit code we sent to {contact}" · "That code didn't match. Try again or resend." · "Resend code (30)" · "What should we call you?" · "Shown on the shared TV. No surname needed."
- "Is this a new account, or are you adding a second way to reach an existing one?"

**Shared TV**
- "Who's training?" · "Profiles on this device show names only. Workouts and health data stay private until you verify." · "Selecting a name sends a verification to that person's phone. Nothing private shows until they approve."
- "Code expires in 4:59" · "Codes last 5 minutes." · "Waiting for approval on your phone…" · "Request declined" · "The phone said this isn't their TV. Nothing was linked." · "This code expired" · "Switching user…"
- Phone: "Type the code shown on the TV screen. Scanning the QR fills it in for you." · "Approving signs this TV in as {Name}." · "Approving a TV links it to your account, so we need to know it's you." · "That's not my TV" · "This request was for {Name}. You're signed in as {You}."
- "This TV locks itself after 15 minutes without activity, except during a workout." · "Locking in 1 minute — press any button to stay" · "On Fire TV, Back here exits Dillan. You stay signed in and the TV auto-locks after 15 minutes."
- M4: "A workout is running" / "Ending saves everything so far. Cancel to go back to it." · Cancel · "End and save, then continue"
- Log out: "Log out ends this phone's session. Your name can stay on the chooser (locked) or be removed from this device."

**Home**
- "This week · Mon–Sun" · "{n} of {goal} sessions" · "Goal is editable in Profile" · "Active minutes" · "vs last week at this point" · "Sessions per week · last 4" · "Your first workout starts your progress." · "Weekly sessions and active minutes will show here." · "Workout running" / "Back to workout"

**Program / editor**
- "No workouts yet" · "Create your first workout" · "Workouts are built on your phone — the remote isn't a good keyboard. Scan to create your first one." · "Edit on your phone" · "Scan to open Program on your phone. Changes appear here as soon as you save."
- "Editing or deleting a workout never changes sessions you've already logged." · "You already have a workout with this name. That's allowed — just make sure you can tell them apart."
- Fields: Name · Set type (Straight sets / Superset) · Sets / Rounds · Reps (Total / Per side) · Weight (placeholder "Bodyweight") · Load basis (Per implement / Total load) · Rest (s) · "Instructions (optional)" / "Shown on screen during this exercise"
- M1 "Discard changes?" Keep editing / Discard changes · M2 "Delete "{name}"?" Cancel / Delete workout

**Choose / preflight**
- "Choose a workout" · "Workout Now needs a saved workout to follow. It takes about two minutes to build one." · "Nothing starts until you press Start on the next screen."
- "Continue without live data" · "Continuing without live data records sets and time only; the session will say "No heart-rate data"." · "Finish setup on your phone: Profile → Live data." · "Zones are five BPM ranges you define. Until you confirm them, Dillan shows BPM only and never guesses a zone."

**Dashboard**
- "Set {n} of {m}" · "{reps} reps" / "{reps} per side" · "{w} {unit} per dumbbell" / "{w} {unit} total" / "Bodyweight" · "Complete set" · "Skip set" · "Rest" · "Skip rest" · "Undo" · "Rest finished" · "Next up" · "Active (excludes pauses)" · "Time in this zone" · "All zones" · "Time in each zone" · "Unmeasured = no fresh reading, paused, or zones not set. Never guessed."
- Health labels/details: see store `healthModel` and the H-table; e.g. "Live · Updated 2s ago", "Delayed · Last reading 14s ago. Counting as unmeasured until it catches up.", "No recent reading · Last reading 1:05 ago. Time is being recorded as unmeasured.", "Paused · Heart rate still updates, but time in zone is not counting.", "Set up zones".
- Paused: "Time in zone and rest are not counting while paused." Resume / End and save / Switch user
- M3 "End this workout?" "Everything so far is saved. Sets you haven't reached are recorded as not reached." Keep going / End and save

**Summary / calendar / notes**
- "Saved automatically." · "Saved automatically. You can edit notes any time from Calendar." · "End the workout to save it. Add notes on your phone." · "No heart-rate data — you continued without live data." · "Ended early" / "Completed" · "Not reached" · "Skipped"
- Notes placeholder "How did it go? Anything to change next time?" · "Unsaved changes" · "Saving…" · "Saved {time}" · "Not saved — we kept your note on this device" · "Retry now"
- "Snapshot of the workout as it was that day. Editing the template later doesn't change this."

**Health & zones**
- "Apple Health & live data" · "Install Dillan on your iPhone and sign in with the same account." · "Allow heart-rate reading in Apple Health when asked. Dillan reads heart rate only." · "Heart-rate zones" · "Suggested starting values" · "These are generic placeholders, not a recommendation. Edit them to match the ranges you already use." · "Boundaries must increase from Zone 2 to Zone 5." · "Confirm zones"

**Profile**
- "Devices signed in as you" · "No TV approved yet. Start on the TV, then enter its code." · "Weeks run Monday–Sunday in this timezone." · TV: "Units, weekly goal, Apple Health, zones, and contact methods are managed on your phone."

---

## 6 · Persistence model

```ts
User { id; name; contacts: {type:'email'|'sms'; value; verifiedAt}[]; timezone; units:'lb'|'kg';
       weeklyGoal:number; zones?: [n,n,n,n]; zonesConfirmedAt?; companion:'not_connected'|'setup_required'|'connected' }
Workout { id; userId; name; version; deletedAt?; exercises: Exercise[] }
Exercise { id; name; order; group?: 'A'|'B'|…; sets; reps; repsBasis:'total'|'perSide';
           weight?: number|null; loadBasis?: 'perImplement'|'total'; restSec; instructions? }
Session { id; userId; workoutId; workoutName; snapshot: Workout; startedAt; endedAt; activeMs; pausedMs;
          status:'completed'|'ended_early'; liveData:boolean; units;
          sets: Record<`${exerciseId}:${setIndex}`, {status:'done'|'skipped'|'not_reached'; reps?; weight?}>;
          zoneMs:[n,n,n,n,n]; unknownMs; notes?; notesUpdatedAt?; pendingSave?:boolean }
Live { sessionId; userId; workoutId; snapshot; steps: Step[]; cursor; startedAt; pausedMs; paused; pausedAt?;
       restEndsAt?; liveData; results: Session['sets']; zoneMs; unknownMs; currentZone?; zoneSince? }
Device { id; kind:'phone'|'tv'; name; session?: {userId; token; unlockedAt}; remembered: {userId; firstName}[];
         lastActivityAt; pairing?: {code; status; forUserId?; expiresAt}; draft?: Workout; pendingNotes: Record<sessionId,string>; pendingSessions: Session[] }
Reading { userId; bpm; at; source:'watch' } ; CompanionState { userId; mode: 'not_connected'|'setup_required'|'waiting'|'live'|'disconnected_phone'|'disconnected_watch'|'reconnecting'; since }
```

Client storage: `localStorage['dillan.v1']` for `device`, `live`, `draft`, `pendingNotes`, `pendingSessions`; everything else fetched. On a TV, user data is held only in memory and cleared on lock.

---

## 7 · Live-data contract (companion → backend → web)

- Companion publishes `CompanionState` on every change and `Reading` at ≤1 Hz while a workout session is running on the Watch (or while the iPhone app is foregrounded and the user has enabled "share heart rate").
- Companion **must** publish `disconnected_watch` when it stops receiving Watch samples for >10 s, and `disconnected_phone` is inferred server-side when the relay heartbeat (every 5 s) is missed for >15 s.
- Web computes freshness from `Reading.at` vs client clock (server-corrected offset). Never trust `mode:'live'` alone to show a BPM as live.
- HealthKit cannot reveal a denied read permission; the companion reports `setup_required` only until the authorization sheet has been shown once, then `waiting`/`live`. The web copy for empty data is "No data available" style, never "you denied access".

---

## 8 · Acceptance criteria (testable)

Each criterion is phrased as a check; the prototype passes all of them with example data.

**Auth**
1. Submitting an invalid email shows an inline message and no native browser bubble.
2. Entering "000000" (test wrong code) clears all six boxes, focuses the first, and shows the mismatch message; typing clears the message.
3. Resend is disabled for 30 s and shows a countdown.

**Shared TV**
4. A fresh TV shows only "Get started"; after scanning/approving on a signed-in phone, the TV shows that user's Home within 2 s.
5. Scanning the QR with a signed-out phone goes to login first and then to the approve screen with the code retained; the TV stays "awaiting" throughout.
6. Deny on phone → TV shows "Request declined" with Try again focused; nothing is signed in.
7. Waiting 5 min → TV shows expired with "New code" focused.
8. Choosing a locked tile does not reveal any workout, history or health data; it opens a pairing request addressed to that user.
9. Switch user renders a blank frame before the chooser; no DOM node containing the prior user's name, workout names or BPM exists at the moment the chooser is painted.
10. Switch user / Log out during a running workout opens "A workout is running" with Cancel focused; Cancel returns to the exact workout state.
11. With no live workout and no input for 15 min, the TV returns to the chooser; with a live or paused workout it does not.

**Editor**
12. New workout opens with Name focused and one blank exercise; Save with empty name focuses Name and shows the error.
13. Weight blank shows "Bodyweight" on preview and dashboard; weight "30" with Per implement renders "30 lb per dumbbell"; with Total load renders "30 lb total".
14. Superset with 2 exercises and 3 rounds produces step order A1, A2, rest, A1, A2, rest, A1, A2 (no trailing rest at workout end).
15. Editing a template after a session exists does not change that session's detail view.
16. Browser Back with unsaved changes shows Discard changes? with Keep editing focused.

**Training**
17. With zero workouts, Workout Now shows "Create your first workout" and the session count stays 0.
18. Preflight never auto-starts; Start is focused only when live data is Live or Live-data-off was chosen.
19. Skip set stores `skipped`; completing with 0 reps stores `done, reps 0`; detail view distinguishes them.
20. Pause stops Active time, rest countdown and zone accrual; Resume continues from the same values.
21. Reloading the phone or TV during a workout restores the same step; TV shows Paused with Resume focused.
22. Back on the TV dashboard pauses; Back on the paused overlay does nothing; Back on Home with a live workout returns to the dashboard.
23. End before completion saves a session with status `ended_early` and unreached sets as Not reached; the Summary appears without a second confirm.

**Health truthfulness**
24. A reading 11 s old shows "Delayed", zone pill "Zone unknown", and zone timers stop; time accrues to Unmeasured.
25. A reading 31 s old shows no BPM and "No recent reading".
26. Without confirmed zones, BPM shows with "Set up zones" and all time accrues to Unmeasured; no zone color is shown.
27. Zone color is never rendered without the "Zone N · lo–hi" text (audit: every `.zone-pill` has non-empty text).
28. No copy anywhere contains "denied" in a health context.

**Home / Calendar / Notes**
29. Week boundaries are Monday–Sunday in the user's timezone; a session at Sunday 23:30 counts in the ending week.
30. Comparison uses the same elapsed portion of the previous week.
31. Calendar shows no controls to add future items; future days are non-interactive.
32. A completed session shows a solid dot; an ended-early session shows a hollow dot and the label "Ended early" in detail.
33. Typing a note shows "Unsaved changes" immediately, "Saving…" after 800 ms idle, then "Saved HH:MM".
34. With the save failure simulated, the note shows "Not saved — we kept your note on this device" + Retry now; after a reload the text is still present and a successful retry shows Saved.

**Platform**
35. Every phone interactive element is ≥44×44 CSS px; every TV focusable is ≥72×72.
36. At 320 px wide, no horizontal scroll and no clipped text on Home, Editor, Dashboard, Calendar.
37. With `prefers-reduced-motion: reduce`, no CSS transition longer than 0 ms runs and the rest ring updates in 1 s steps.
38. The second household user can register, approve the TV, create a workout, train, write a note and find it in Calendar while the first user's name is the only thing about them ever visible on the TV.
