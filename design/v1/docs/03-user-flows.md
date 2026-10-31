# 03 · User flows

Each flow lists the happy path, then the branches that the prototype implements. Screen IDs refer to `02-information-architecture.md`.

## F1 · Registration and login (phone)

1. S01 Welcome → **Get started** (or **Log in**).
2. S02 contact step: tab Email / Text message. Validate format on submit only (`novalidate`; our own inline error under the field). Submit → "We sent a code to {contact}".
3. S02 code step: six boxes backed by one hidden input (so paste, autofill `one-time-code`, and screen readers work). Auto-submit on sixth digit. **Resend code** disabled for 30 s with a countdown.
4. New contact → profile step: Name (required), Timezone (prefilled from device), Units (lb / kg). → S04 Home (empty state: "Your first workout starts your progress.").
5. Known contact → straight to S04 Home.

Branches
- Wrong code → boxes clear, focus returns to the first box, inline "That code didn't match. Try again or resend." Five failures → code invalidated, "Request a new code".
- Expired code (10 min) → same inline message with "Resend code" emphasized.
- Unknown contact on **Log in** → "We don't have an account for {contact}." → **Create an account with it** / **Use a different email or number**.
- Known contact on **Register** → silently treated as a login; the code screen says "Welcome back".

## F2 · Shared-device approval and switching (TV + phone)

### F2a First TV launch
1. TV S01 first-run: "Dillan on Living Room Fire TV" → single focused action **Get started** → S03 pairing.
2. S03 TV shows QR + "or go to dillan.app/tv and enter **DLN-7K4M**", 5:00 countdown, **Cancel**.
3. Phone: scan → `/tv?code=DLN-7K4M` → if signed out, S02 first (code kept), then S03 approve: "Allow **Living Room Fire TV** to use your Dillan account as **Luis**?" → **Approve** / **Deny**.
4. TV: approved → brief "Signed in as Luis" → S04 Home. Luis is added to the TV's remembered profiles.

Branches
- Deny → TV "Request denied on the phone" → **Try again** / **Cancel**. Phone confirms "Denied. The TV was not signed in."
- Expired → TV "This code expired" → **New code** (focused) / **Cancel**.
- Code already used / unknown on phone → "That code isn't active. Ask the TV for a new one."
- A QR scan alone never grants access: the phone must be signed in and must tap Approve.

### F2b Returning household: chooser and locked profiles
1. TV S01 chooser "Who's training?" with tiles: Luis (locked), Maya (locked), **Add user**. Initial focus = most recent user's tile.
2. Select Luis → S03 pairing addressed to Luis: "Confirm it's you — scan with Luis's phone" + typed code fallback.
3. Luis's phone approves → TV signs in → S04 Home.

Branches
- Maya's phone scans Luis's request → phone: "This request was for Luis. You're signed in as Maya." → **Sign the TV in as me** / **Cancel**. Choosing the former clears and signs in as Maya.
- No phone at hand: typed code path from any signed-in phone browser.
- Remove a tile: TV Profile → **Remove my profile** (M6) or long hold on tile → Remove.

### F2c Switching users
1. Any TV screen → avatar → S15 → **Switch user** (or Back to Home → **Switch user** in header).
2. TV immediately renders a blank clearing frame (bg only, ~150 ms, no data), then S01 chooser. Prior user's Home/Program/Calendar/health are discarded from the TV view model.
3. Proceed as F2b.

Branch — workout running: M4 "A workout is running" → **Cancel** (focused) / **End and save, then continue**. Ending saves the session with status `ended_early` or `completed` as appropriate before clearing.

### F2d Auto-lock
- Outside workout mode, 15 min with no remote or phone-controller input → TV clears to S01 chooser (profiles remembered, no data). A 60-second warning toast "Locking in 1 minute — press any button to stay" precedes it.
- Never during a running workout (including paused).

## F3 · Apple Health / Watch connection (phone S14, companion app)

1. S14 Health & zones: card "Live heart rate — Not connected" → **Set up the iPhone app** (opens App Store / companion deep link; on non-iOS browsers shows "Needs an iPhone and Apple Watch").
2. Companion requests HealthKit read authorization for heart rate (per [Apple's HealthKit authorization guidance](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data) the app cannot learn if reading was denied, so the web shows "No data available" states, never "denied"). The Watch app streams heart rate during a workout session per [WWDC23 "Build a multi-device workout app"](https://developer.apple.com/videos/play/wwdc2023/10023/).
3. Companion publishes connection state → web card shows "Setup required" (permission dialog not completed), then "Waiting for first reading", then "Live — 72 bpm, updated 2 s ago".
4. Zones card: "Zones not set — BPM shows without a zone until you confirm four boundaries." → **Set up zones** → S14 zone editor: four fields (Zone 2 starts at, Zone 3…, Zone 4…, Zone 5…), live preview of the five ranges, validation (integers, strictly increasing, 60–220), **Confirm zones**. Confirmation records `zonesConfirmedAt`.

Branches
- Reconnecting / Disconnected states display with timestamp of the last reading and the specific link that failed (phone vs Watch).
- Changing zones later does not recompute past sessions (they keep their snapshot).

## F4 · Template editing (phone S05 → S06)

1. S05 Program → **New workout** → S06 with Name focused and one blank exercise card.
2. Fill exercise: Name, Set type (Straight sets / Superset), Sets, Reps (number + Total / Per side), Weight (blank = Bodyweight; when filled, Load basis Per implement / Total load appears and is required), Rest (default 60 s), Instructions.
3. **Add exercise** appends a card and scrolls to it. ▲▼ reorder; … → Duplicate / Delete.
4. Superset: set an exercise to Superset → it gets group letter A; the next exercise defaults to joining A ("A1, A2"); the group header shows "Superset A · 3 rounds". Group needs ≥2 members; a single-member group shows an inline warning and saves as straight sets after confirmation.
5. **Save** validates: workout name required; each exercise needs a name and sets ≥1 and reps ≥1; weight ≥0; rest ≥0. Errors are inline and the first invalid field is focused and scrolled into view.
6. Save → S05 with toast "Saved". The template version increments; existing sessions keep their snapshot.

Branches
- Back / browser Back with unsaved changes → M1 "Discard changes?" **Keep editing** / Discard changes.
- Delete template → M2; sessions referencing it keep name and snapshot ("from a deleted workout" in detail).
- Edit from TV: S05/S07 on TV show a QR "Edit on your phone" deep link to the exact template.

## F5 · Training (TV primary, phone controller)

1. TV S04 → **Workout Now** → S07 Choose: list left, preview right (exercises, sets×reps, est. time). Initial focus = last-used workout. Empty → "Create your first workout" + QR; nothing is created silently.
2. S08 Preflight: workout name, live-data card (current H-state), zones status, **Start workout** (focused only when live or when the user chose to continue without live data), **Continue without live data**, **Back**. Waiting/Reconnecting show a spinner-free "Preparing…" line with age of last reading.
3. S09 Dashboard. Left 2/3: current exercise, set N of M, target reps/weight (with load basis in words), instruction line, **Complete set** (focused) · **Skip set**. Right 1/3: BPM + freshness line; Zone pill (number + bounds); Time in this zone; **All zones** (opens breakdown incl. Unmeasured); Active time (excludes pauses); Next up.
4. Complete set → rest card (countdown, **Skip rest**, **Undo**), then next step. In supersets, rounds alternate A1 → A2 → rest → A1…
5. Last set completed → **End workout** becomes primary → S11 Summary (auto-saved already; the summary is read-only): duration, sets done/skipped, zone bars with Unmeasured, "Add a note on your phone" QR, **Done** → S12 Calendar on today.

Branches
- **Skip set** records `skipped` (not 0 reps). Phone controller can edit actual reps/weight (M7) for the just-completed set.
- **End** before the end → M3 "End this workout?" **Keep going** / End and save → status `ended_early`, remaining sets "not reached".
- TV Back on dashboard → Pause (S10), not exit.
- Health state changes during the set are reflected in the right column; zone timer stops accruing in Delayed/Disconnected and the gap is attributed to Unmeasured.

## F6 · Interruption recovery

| Event | Behavior |
|---|---|
| Phone browser Back / reload during a workout | Live session is persisted; S09 restores at the same step with the timer continuing from the stored start (paused time preserved). A banner on Home/Program/Calendar: "Workout in progress · 12:40" → **Back to workout**. |
| TV app backgrounded / WebView reload | Same persistence; on return TV shows S10 Paused overlay with **Resume** focused ("Paused while Dillan was in the background"). |
| Heart-rate link lost | S09 continues; right column flips to Reconnecting → Disconnected; time → Unmeasured. No sound, no flashing. |
| Phone controller disconnects | TV unaffected (TV is the source of truth for the running session). |
| Switch user / Log out | M4 guard; never silently discards. |
| Auto-lock | Never fires while `live` exists. |
| Save failure at end | Session is kept locally with `pendingSave`; summary shows "Saved on this device — will sync when online". |

## F7 · Calendar and notes (phone + TV read)

1. S12 month grid, Monday-first, today outlined, dots: solid = completed, hollow = ended early, pencil = has note. Future days are plain (no scheduling). Tap a day → list of that day's sessions.
2. Tap a session → S13 detail: status chip, duration, exercise table with per-set result (✓ 10 reps · 30 lb per dumbbell / Skipped / Not reached), zone breakdown incl. Unmeasured (or "No heart-rate data for this session"), Notes.
3. Notes textarea: status line Idle → "Unsaved changes" → "Saving…" (800 ms after last keystroke) → "Saved 14:32".
4. Failure → "Not saved — we kept your note on this device" + **Retry now**; the draft persists across reload and retries automatically on reconnect.
5. TV S12/S13: same read-only views; note is shown with "Edit on your phone" QR.
