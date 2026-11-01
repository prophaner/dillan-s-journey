# Dillan V1 — UI/UX Design Brief for Perplexity

Version 1.0 · October 29, 2026 · Product owner: Luis Ramos

## Your assignment

Act as the lead product designer for Dillan. Design an implementation-ready mobile web and television experience using this brief as the V1 scope. Produce screen designs, interaction specifications, a clickable prototype if your environment supports one, and a developer handoff for Claude Code. Do not stop at a mood board or general recommendations. Do not pretend to produce a working prototype if you can only provide specifications.

The product is a personal home-gym workout app. Users create reusable workouts, select one when training, follow their exercises while watching live Apple Watch heart-rate metrics, and review their history and notes. Multiple people can use the same television without sharing accounts or health information.

This brief defines a deliberately small V1. Do not bring in AI coaching, multiweek programming, social features, nutrition, subscriptions, leaderboards, or medical assessment. Dillan is the product name; a conversational AI coach is not part of this release.

## Product decisions and terminology

| Term | V1 definition |
|---|---|
| Program tab | A library of saved workouts. No separate program-plan entity or schedule builder. |
| Workout template | A named, reusable, editable collection of exercises and prescribed sets. |
| Routine | The user's term for an exercise entry inside a workout. Use “Exercise” in the UI for clarity. |
| Workout session | One dated execution of a saved workout, with actual sets, timing, health metrics, and notes. |
| Dashboard | The active workout screen. Home is the separate progress overview. |
| Calendar | Historical workout sessions. Future workout planning is out of scope. |

The following are product-manager defaults, not additional user requests: email and SMS one-time codes for authentication; straight sets and supersets as the initial set types; required user-confirmed heart-rate zone boundaries; a weekly consistency goal of three sessions that users may change; and fresh verification when a locked shared-device profile is selected. Flag material concerns, but use these defaults to finish the design instead of blocking on minor choices.

## Platforms and division of responsibilities

- Mobile web is the main place to register, create/edit workouts, log detailed results, write notes, and review history. Desktop web remains usable.
- Television is the primary training display: large text, remote-friendly navigation, uncomplicated controls, and live metrics visible throughout training.
- A Fire TV app will wrap the hosted TV web experience. A TV browser is also useful for early testing. Do not require a mouse or touch on TV.
- Apple Health permissions and live Watch collection take place in native iPhone/Watch companion apps, not the website or Fire TV app. Design the handoff and connection states.
- Phone and TV can show the same authenticated session. The phone is an optional controller; core training controls must remain usable with the TV remote.

## Navigation and screen inventory

Primary signed-in destinations: Home, Program, Calendar. Profile/settings contains Apple Health, heart-rate zones, units, devices, Switch User, and Log out. Workout Now is the primary Home action.

Design these screens and their important variants:

| ID | Screen | Required content/actions |
|---|---|---|
| S01 | Welcome / profile chooser | Register, Log in, remembered profile names/avatars, Add user; no health details |
| S02 | Register / log in | Email or SMS route, code entry, resend cooldown, recovery and validation |
| S03 | Authorize this TV | QR and short URL/code, device name, awaiting approval, approved/expired/denied states |
| S04 | Home | Active user, weekly progress, recent session, Workout Now, connection status |
| S05 | Program library | Create, view, edit, delete workouts; helpful empty state |
| S06 | Workout editor | Name, ordered exercises, sets, reps, weight, optional rest and instructions |
| S07 | Choose workout | Saved workouts, preview, select; never silently start a default workout |
| S08 | Preflight | Chosen workout, active user, Watch readiness, zone setup, Start / Continue without live data |
| S09 | Active dashboard | Current/next exercise, sets, live heart rate/zone/time in zone, duration, Pause, End |
| S10 | Paused / reconnecting | Frozen training timers, Resume/End, explicit sensor or connection state |
| S11 | Finish and summary | Finish confirmation, duration, actual sets, zone totals/coverage, session notes, Save |
| S12 | Calendar | Month navigation, session markers, selected-day list, notes indicators |
| S13 | Session detail | Workout snapshot, actual sets, start/end, duration, zone history, editable notes |
| S14 | Health and zones | Companion setup, permission explanation, availability, connection management, zone boundaries |
| S15 | Account and devices | Units, weekly goal, device authorization/removal, switch, lock/logout |

## Account and shared-device journeys

### New device

Show Register and Log in. On a phone, the user enters an email address or phone number, verifies a one-time code, and sets a display name, timezone, and preferred units. SMS numbers include country code. Only verified contact channels may receive approval codes. Do not accidentally create separate accounts when an existing user adds a second contact method.

On TV, favor QR/short-code pairing rather than typing a password with the remote. The user opens the approval page on their phone, registers or authenticates using email/SMS, sees the TV's device name, and explicitly approves it. A QR scan alone never grants account access. Show progress on TV without displaying the code sent to the user's inbox or phone.

### Existing shared device

Show remembered display names/avatars plus Add user. A remembered profile is not an unlocked session. Selecting a locked profile initiates email/SMS verification and device approval. Contact information is masked and exposed only as needed in the sign-in flow. A fresh code is not required every time a user navigates between tabs within one active session.

Add user follows the same login/register process and adds a separate profile. Only one user controls the TV at a time. Switching clears the prior user's workout/history/health display before showing the chooser. The next user's data must never flash while accounts change.

Log out revokes the active device session and returns to the chooser; an explicitly remembered name/avatar can remain locked. “Remove from this device” also removes that local profile. During a workout, Switch User or Log out must first offer Cancel or End and save; never silently discard a running workout. Auto-lock the shared TV after 15 minutes of inactivity outside workout mode; an active or paused workout is exempt, with a clearly visible active-user name.

## Program and workout editor

A workout requires a name and at least one exercise. An exercise includes:

| Field | Behavior |
|---|---|
| Name | Required text; manual creation is sufficient, no external exercise catalog needed |
| Order | Move up/down controls as well as optional drag on touch devices |
| Set type | Straight sets or superset; a superset explicitly groups at least two exercises |
| Set amount | Positive integer; means rounds for a superset |
| Reps | Positive integer, labeled Total or Per side |
| Weight | Optional number with lb/kg; blank means unspecified/bodyweight, not zero load |
| Load basis | If weight entered: total external load or per implement; prevent “30 lb” ambiguity |
| Rest | Optional seconds, default 60; after each straight set or full superset round |
| Instructions | Optional template text displayed during the workout |

For V1, each exercise uses the same prescribed reps/load across its sets. Actual results can vary set by set. Timed exercises, drop sets, pyramids, circuits, automatic rep counting, and complex progression rules are deferred.

For a superset, show A1 and A2 (and further members if needed), the shared round count, each exercise's reps/load, and rest after the last exercise in the round. Do not use an unexplained “superset” label without membership and order.

Example: “Upper Body A” includes Dumbbell Floor Press, 3 × 10 total, 30 lb per dumbbell; One-arm Row, 3 × 10 per side, 30 lb per implement; and an optional superset of two manually entered exercises. Example values are UI fixtures, not exercise prescriptions.

Provide save validation, unsaved-change protection, delete confirmation, and duplicate-name tolerance. Deleting or editing a template must not change previous sessions. Template instructions are distinct from dated session notes.

## Workout Now and active dashboard

The flow is Home → Workout Now → choose saved workout → readiness check → Start → active dashboard → End → summary → Calendar.

If no workouts exist, show Create your first workout. Do not create a hidden blank session. The readiness check shows whether live data is available, preparing, unavailable, or not configured. The user may continue without live data; the screen must then clearly say so. Live integration is still a required V1 capability, not satisfied by the fallback.

Make the following visible throughout workout mode, including while a rest timer runs:

- Current heart rate in BPM, with freshness status.
- Current numbered heart-rate zone and its BPM bounds.
- Time accumulated in the current zone, with all-zone totals one action away or visible in a compact panel.
- Active workout duration, excluding pauses.
- Current exercise, prescribed sets/reps/load, completed sets, next exercise.
- Pause/Resume and End controls that are easy to reach.

Use a TV composition with the exercise area roughly two-thirds of the width and health metrics in a persistent side panel. This is a starting direction, not a restriction if another layout tests better. On phones, keep metrics compact and persistent above set controls.

“Complete set” records the prescribed values as actuals by default and allows editing/undo. Per-side completion means both sides; make this explicit. “Skip set” is distinct from completing zero reps. Actual set changes do not change the saved template. Start rest automatically after the relevant set/round; allow skipping rest.

Pause freezes active duration and rest/zone accumulation; the session remains resumable. A heart-rate display that updates while paused must still say “Paused” and not imply that time-in-zone is increasing. End opens a brief confirmation, then ends collection and shows the summary. Save the session automatically when ended; notes can be added or edited afterward. Back navigation or reloading must not silently end the workout.

## Live health UX rules

V1 prioritizes BPM, five numbered zones, time in zone, and duration. Activity rings are excluded. Calories are optional secondary data only if reliably supplied; do not design them as a mandatory headline.

Heart-rate zones are Dillan's configurable ranges, not a claim to import Apple's personal Workout zone settings. Ask users to confirm four increasing BPM boundaries before displaying zone classifications. Without configured zones, show BPM and “Set up zones”; do not fabricate a classification. Zone numbering is descriptive, not a medical or fitness score.

Design: Not connected, Setup required, Waiting for first reading, Live, Delayed, Disconnected, Paused, and Reconnecting. Distinguish Watch→phone problems from phone→dashboard problems when the system knows the difference. “No data available” must not assert that the user denied permission, because read-access status may not be distinguishable.

Proposed freshness policy: a reading older than 10 seconds is delayed; older than 30 seconds is unavailable. Confirm these thresholds through real-device testing. Never display a stale BPM as live. Show unknown/unmeasured time rather than assigning missing intervals to a zone. Do not promise one-second sensor updates or continuous delivery when the iPhone app is backgrounded.

The connection screen should explain that users start the workout through Dillan's companion flow, rather than expecting Dillan to intercept an independently started Apple Workout. A short foreground-phone instruction may be necessary until hardware testing proves a reliable background mode.

## Home progression and Calendar

Use simple factual progression: completed sessions this week against the editable weekly goal, active workout minutes this week, and a four-week sessions-per-week trend. “This week” is Monday–Sunday in the user's timezone. Compare the current week-to-date with the same elapsed portion of the previous week; do not imply a physiological improvement or compare a partial week to a full week without labeling it. Empty state: “Your first workout starts your progress.”

Calendar shows saved session dates, with multiple sessions listed separately per day. Show a note icon when notes exist, and the note text in session detail. Mobile month view must have a readable day list. TV selection must work entirely with the remote. History preserves the original workout prescription and actual results even if the template is edited/deleted. Incomplete sessions remain identifiable; do not label every ended session completed.

Session detail permits editing session notes only in V1; historic set and metric corrections are deferred. Preserve line breaks, support autosave with visible saving/saved/error states, and retain unsaved notes after a temporary failure. No future-calendar scheduling controls.

## Visual and accessibility direction

Use a calm, polished training interface: dark TV mode, high contrast, restrained accent color, readable numerals, minimal animation, generous spacing. Avoid a gaming dashboard or dense clinical monitor. Heart-rate color must always be accompanied by text/zone number. Avoid flashing alerts or language that rewards high heart rate.

Design at 390 px mobile width, desktop, and 1920 × 1080 TV; validate responsive behavior at 320 px mobile width. Use at least 44 px touch targets, obvious keyboard focus, accessible labels, and reduced-motion support. Establish practical TV typography by checking readability from typical room distance rather than simply scaling a phone screen. Nothing essential may depend on hover, dragging, color alone, or precision pointer input.

Specify D-pad focus order and Back behavior for every TV screen and modal. Initial focus should land on the likely next action, never Delete or End confirmation. Provide QR handoff to edit on phone, while preserving basic TV workout selection, pause, resume, set completion, and ending.

## Required output from Perplexity

1. A short interpretation and explicitly labeled assumptions; keep the agreed scope intact.
2. Information architecture and complete screen/state map using the IDs above.
3. User flows for registration, shared-device approval/switching, Apple connection, template editing, training, recovery from interruption, and Calendar notes.
4. High-fidelity Home, Program editor, active dashboard, Calendar/detail, and shared-device authorization designs for mobile and TV. Use synthetic data labeled as examples.
5. A clickable prototype where supported; otherwise exact navigation/state specifications. Include empty, loading, validation, denied/expired approval, missing health, stale health, reconnect, and save-failure states.
6. A component/token specification: colors, typography, spacing, cards, forms, focus rings, metrics, zone bars, timers, dialogs, and status messages.
7. A developer handoff with responsive rules, all relevant UI copy, interactions, persistence expectations, and testable acceptance criteria.
8. Any remaining product questions ranked by whether they truly block implementation. Resolve reversible aesthetic choices yourself.

Acceptance: a new user can authorize a TV, create a workout on the phone, select it on TV, complete a session with truthful live/missing metric states, write a note, and find it in Calendar. A second user can perform the same journey without seeing the first user's private information.

## Platform references for design constraints

- Apple multi-device workout architecture: https://developer.apple.com/videos/play/wwdc2023/10023/
- Apple Health authorization: https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- Fire OS WebView approach: https://developer.amazon.com/docs/fire-tablets/hybrid-apps-overview.html
- Vega WebView: https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview

These sources establish platform capabilities, not a guarantee about a particular Fire TV model or live-data latency. Confirm implementation constraints with Claude Code. The companion development brief contains the authoritative data, session, and security rules; design changes to those rules must be recorded explicitly.
