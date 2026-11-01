# 02 · Information architecture and screen/state map

## Surfaces

| Surface | Primary jobs | Secondary |
|---|---|---|
| Mobile web (390 px, validated at 320) | Register / log in, build and edit workouts, approve TVs, Health & zones, Calendar + notes, Profile | Choose + run a workout (controller), view live dashboard |
| Desktop web (≥1024 px) | Same as mobile with sidebar navigation | — |
| TV (1920×1080, D-pad) | Who's training? chooser, Workout Now → choose → preflight → live dashboard → summary; Home progress; Program (read) ; Calendar (read) | Profile (switch / lock / remove), QR handoffs to phone |
| iPhone + Watch companion (native, out of scope to build here) | Collect HealthKit heart rate, publish live feed and connection state | — |

## Navigation model

**Phone:** three tabs — Home, Program, Calendar — plus Profile from the avatar. Sub-screens stack with a Back button in the top bar; browser Back maps to the same control and never ends a workout.

**TV:** a top segmented nav — Home, Program, Calendar — plus the avatar (Profile). Workout flow is modal to the nav: Workout Now → Choose → Preflight → Dashboard → Summary → Calendar. Back always goes to the logically previous screen; on the Dashboard, Back = Pause.

## Screen map with IDs

Route names in parentheses are the prototype's internal route IDs.

| ID | Screen | Phone | TV | States |
|---|---|---|---|---|
| S01 | Welcome / Who's training? (`welcome`, `chooser`) | ● | ● | first-run (no profiles); profiles remembered (locked tiles + Add user); clearing (blank frame between users) |
| S02 | Register / Log in (`auth`) | ● | — (TV never has a keyboard flow) | contact step (email / SMS tab); validation error; code step (6 boxes; wrong code; resend countdown); merge step (unknown contact on login); profile step (name, timezone, units) |
| S03 | Authorize TV (`pairing` on TV, `approve` on phone) | ● | ● | TV: awaiting (QR + code + countdown), approved, denied, expired, cancelled. Phone: code entry (prefilled by QR), confirm (name + TV name), approved, denied, expired, already used, needs login first, wrong user ("request was for Luis") |
| S04 | Home (`home`) | ● | ● | empty (first workout); normal; workout-in-progress banner (phone) / Back to workout (TV); live-data card in every health state |
| S05 | Program library (`program`) | ● | ● read-only + QR | empty; list; (TV) QR "Edit on your phone" |
| S06 | Workout editor (`editor`) | ● | — | new (one blank exercise); editing; dirty; validation errors (name, exercise name, sets/reps ≥1, weight ≥0, rest ≥0, duplicate name warning); discard dialog; delete dialog |
| S07 | Choose workout (`choose`) | ● | ● | empty → "Create your first workout" + QR; list with preview panel |
| S08 | Preflight (`preflight`) | ● | ● | live-ready; preparing (waiting/reconnecting); not configured; unavailable; zones not set |
| S09 | Active dashboard (`dashboard`) | ● (controller) | ● | working set; rest (with Skip rest, Undo); last set done → End; every health state (see H-states); paused (S10) |
| S10 | Paused / reconnecting overlay (`dashboard` + `live.paused`) | ● | ● | paused; paused + stale reading; "A workout is running" guard dialog |
| S11 | Finish / summary (`summary`) | ● | ● | completed; ended early; no heart-rate data; notes (phone editable / TV read-only) |
| S12 | Calendar (`calendar`) | ● | ● | month grid, selected day list; empty day; no sessions at all; months navigable backwards; no future scheduling |
| S13 | Session detail (`session`) | ● | ● | completed / ended early; per-set results (done / skipped / not reached); zones breakdown with Unmeasured; notes editor (phone) with idle / unsaved / saving / saved / error |
| S14 | Health & zones (`health`, `zones`) | ● | — (TV shows read-only status in preflight/dashboard) | companion: not connected / setup required / waiting / live / delayed / disconnected / paused / reconnecting; zones: not set / confirmed; zone editor validation |
| S15 | Account & devices (`account`) | ● | ● (reduced) | units; weekly goal; devices list with Remove; Approve a TV; Switch user; Log out (with running-workout guard). TV: Switch user; Lock this TV; Remove my profile |

### Modals and sheets

| ID | Where | Title | Actions (initial focus in bold) |
|---|---|---|---|
| M1 | S06 | Discard changes? | **Keep editing** · Discard changes |
| M2 | S06 | Delete "{name}"? | **Cancel** · Delete workout |
| M3 | S09/S10 | End this workout? | **Keep going** · End and save |
| M4 | S10, S15 | A workout is running | **Cancel** · End and save, then continue |
| M5 | S15 (TV) | Lock this TV? | **Cancel** · Lock |
| M6 | S15 | Remove {name} from this TV? | **Cancel** · Remove |
| M7 | S09 (phone) | {Exercise} · set N (edit actual reps / weight) | fields, **Save** |
| M8 | S15 (phone) | Remove {TV}? | **Cancel** · Remove |

## Health (H) states — shown wherever live data appears

| H | Label | BPM | Zone pill | Time-in-zone | Copy (detail) |
|---|---|---|---|---|---|
| H0 | Not connected | –– | hidden | Unmeasured | "Set up the Dillan iPhone app to see heart rate here." |
| H1 | Setup required | –– | hidden | Unmeasured | "Finish Apple Health access in the iPhone app." |
| H2 | Waiting for first reading | –– | hidden | Unmeasured | "Connected. Keep the iPhone app open until the first beat arrives." |
| H3 | Live | value | Zone N · bounds (if zones confirmed) else "Set up zones" | counting | "Updated Ns ago" |
| H4 | Delayed (10–30 s) | value, de-emphasized | Zone unknown | Unmeasured | "Last reading Ns ago. Counting as unmeasured until it catches up." |
| H5 | No recent reading (>30 s) | –– | Zone unknown | Unmeasured | "Last reading m:ss ago. Time is being recorded as unmeasured." |
| H6 | Disconnected (phone) | –– | Zone unknown | Unmeasured | "Lost the link to your iPhone. Time in zone is paused as unmeasured." |
| H7 | Disconnected (Watch) | –– | Zone unknown | Unmeasured | "iPhone is connected, but it has lost the Watch. Check the Watch is on your wrist." |
| H8 | Reconnecting… | last value if ≤30 s | Zone unknown | Unmeasured | "Trying to reach your iPhone. Last reading shown below." |
| H9 | Paused | value if fresh | Zone N (informational) | not counting | "Heart rate still updates, but time in zone is not counting." |
| H10 | Live data off | –– | hidden | Unmeasured | "You chose to continue without live heart rate." |

Rules: BPM is never shown as "Live" when the reading is older than 10 s. Zone color is always paired with the zone number and bounds text. "No data available" copy never asserts that the user denied permission.

## Data entities (for the handoff)

- **User** — id, name, contact(s), timezone, units, weeklyGoal, zones[4] + zonesConfirmed, companion state.
- **Workout (template)** — id, name, exercises[]: name, order, group (superset letter or null), sets/rounds, reps, repsBasis (total | perSide), weight (null = bodyweight), loadBasis (perImplement | total), rest s, instructions.
- **Session** — id, userId, workoutId, workoutName, **snapshot** (copy of the template at start), startedAt, endedAt, activeMs, status (completed | ended_early), sets{ "ex-set": {status: done|skipped, reps, weight} }, zoneMs[5], unknownMs, hadLiveData, notes, notesUpdatedAt.
- **Device** — id, kind (phone | tv), name, session {userId, unlockedAt} | null, remembered[] (profiles shown as locked tiles), authorized[] (profiles approved at least once), lastActivityAt, pairing (TV), draft / pendingNotes (phone).
- **Live** — the single running session (one per user, one per TV), cursor into steps[], rest {endsAt}, paused + pausedAt, currentZone, zoneSince.
