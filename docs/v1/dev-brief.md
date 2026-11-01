# Dillan V1 — Development Leadership Brief for Claude Code

Version 1.0 · October 29, 2026 · Product owner: Luis Ramos

## Your role and delivery mandate

Act as technical lead and implementation owner for Dillan V1. Build a secure, usable web-first home-gym app with an installable Fire TV display and native Apple Watch/iPhone integration. Use the companion Perplexity UI/UX brief and its resulting designs. This document governs functional semantics, persistence, privacy, and release acceptance. If a design conflicts with these rules, identify the conflict and propose the smallest consistent correction.

Inspect the existing repository and its instructions before choosing tools or restructuring. Preserve useful existing work. Establish an implementation plan, build vertical slices, test meaningful failure cases, and keep setup instructions current. Do not call the project complete when the UI runs against simulated metrics. Simulators and mocks must be visibly labeled and isolated from production records.

This is a new, narrow V1 scope. Older Dillan concepts such as AI coaching, coach portals, medical screening, assessment levels, automatic programming, and nutrition are excluded unless the owner separately approves them. Do not recreate a large earlier PRD by default.

## V1 scope and shared product contract

| ID | Requirement |
|---|---|
| F01 | Register and log in with verified email or SMS; log out |
| F02 | Remember multiple profiles on one device; approve access with email/SMS; switch users safely |
| F03 | Connect Apple Health through native iPhone/Watch companion software |
| F04 | Active dashboard with live BPM, five heart-rate zones, time in zone, active duration, pause/resume/end |
| F05 | Program tab to create, edit, delete, and select saved workouts |
| F06 | Calendar of historical sessions, original workout details, actual sets, and dated notes |
| F07 | Home progression: weekly completed sessions/goal, active minutes, four-week session trend |
| F08 | Mobile web controls and TV display stay synchronized for the same session |

Program means the workout-template library, not multiweek plans. Routine means exercise entry inside a template; use “Exercise” in UI. Workout session means a dated execution. Every Workout Now flow requires selecting a template before starting.

PM defaults to implement: straight sets and supersets only; editable weekly goal default three; Monday–Sunday weeks; 60-second default rest; optional user-confirmed zone boundaries; and fresh verification when entering a locked shared-device profile. Record these defaults so they can be changed without schema redesign.

## Architecture and platform decisions

Prefer one repository with a TypeScript web frontend, backend/API and relational database, plus Swift/SwiftUI iOS and watchOS targets and a thin TV wrapper. React with a familiar modern build framework and managed PostgreSQL/auth/realtime is a reasonable starting point, not a mandate to migrate a working repository. Minimize infrastructure providers. Use a managed authentication provider that actually supports both email and SMS OTP; document SMS configuration and costs without silently omitting SMS.

Suggested boundaries:

- `web`: responsive mobile/desktop routes and `/tv` presentation.
- `backend`: authorization, templates, sessions, health ingestion, realtime delivery, device approval.
- `apple`: companion iOS and watchOS apps, shared typed messages and versioned protocol.
- `tv`: Fire OS or Vega wrapper appropriate to the confirmed device.
- `contracts`: API schemas, fixtures, enums, and validation.
- `docs`: setup, architecture decisions, test evidence, release/runbook.

Data path: Watch workout collection → iPhone companion → authenticated backend → session-scoped realtime channel → web/TV dashboard. HTTPS is required in production. Never place provider secrets or HealthKit privileges in a web client. A plain website cannot acquire Watch HealthKit access; a WebView wrapper does not change that.

Fire OS can use an Android WebView wrapper; Vega requires its own package and Amazon WebView integration. Confirm the target Fire TV model/OS before selecting the wrapper. Build the shared TV web route immediately; do not claim an untested APK supports every Fire TV. Public Appstore release is a separate distribution step, not necessary for the first private hardware validation. Document installation constraints for the actual device.

## Authentication, device approval, and privacy boundaries

Registration verifies email or phone before creating an active identity. Store stable user ID, display name, verified contacts, timezone, units, and weekly goal. Adding a second contact requires authenticated verification and deliberate account linking. Handle expired/incorrect codes, rate limits, resend cooldowns, and recovery without revealing whether an arbitrary account exists.

For TV login, implement a device-authorization pattern: TV obtains a short-lived challenge, shows QR/short code, and waits. The phone authenticates via email/SMS, displays the requested device, and explicitly approves. Bind the challenge to the originating device; codes must be high-entropy enough for the rate-limited lifetime, single-use, short-lived (proposed five minutes), and invalidated on approval/denial. Never include a session bearer token in the QR or URL. Return a scoped session only to the originating device after approval. Expiration must not silently extend.

Remembered profiles store only the minimum chooser information (display name/avatar and opaque profile reference). They are not authorization. Selecting a locked user requires verification/approval; normal navigation within the active session does not. Remembering a profile is opt-in. One active identity per TV.

On switch/logout, revoke the active device session, disconnect realtime subscriptions, clear private caches, and blank private content before the chooser appears. Logout may keep an opted-in locked profile; Remove from this device deletes that reference too. Switching during a session offers Cancel or End and save. Expire/lock shared-device UI after 15 inactive minutes outside workout mode; active/paused sessions are exempt. Enforce expiry/revocation server-side, not just with a UI timer. Support revoking a remembered device from account settings.

Use secure session cookies where appropriate; protect against CSRF and XSS. Avoid long-lived bearer tokens in browser local storage. Enforce owner checks on every template, session, note, sample, and realtime subscription. A TV pairing grants access to one user, not all users on that device. Verify Watch/phone account and session ownership before accepting health events. Do not broadcast private health data on shared device IDs or public channels.

Account switching must also clear queued health events for the old identity or upload them only under their original authorized identity; never reassign them to the new login. Logs/analytics must exclude raw health samples, full notes, OTPs, and contact details. Include account data deletion and an explicit disconnect/revoke path; unlinking Apple does not silently erase history, while account deletion does remove owned app data according to the documented retention policy.

## Templates and set behavior

Required template data: name, owner, ordered exercises, revision. Each exercise has name, set type, set count, positive integer reps, rep mode (`total`/`per_side`), optional nonnegative decimal weight, lb/kg unit, load basis (`total_external`/`per_implement` when weighted), optional instructions, and rest seconds (default 60). Blank weight is distinct from zero. Validate counts and lengths server-side as well as in the UI; publish sensible upper bounds.

Straight sets repeat one exercise. Supersets explicitly group at least two exercises with a common round count and ordered members. Complete one set of each member before resting at the end of the round. Each member has its own reps/load; the group has rest duration. Avoid conflicting per-exercise set counts inside a group. Timed exercises, drop sets, pyramids, and circuits are deferred.

Prescribed values remain constant across an exercise's sets in V1. A logged set defaults to those values but permits actual reps/load changes and undo. Per-side completion means both sides completed; asymmetric side logging is deferred. Skip is a separate status, not zero reps. Rest starts after a completed straight set or full superset round; Skip rest cancels the rest countdown without altering workout timing.

Create a deep, immutable workout snapshot when a session starts. Editing/deleting the source template never changes that snapshot or history. Soft-delete templates for safety; hide them from future selection. Sessions remain readable after deletion. Duplicate template names are allowed; IDs determine identity. Session notes are separate from reusable template instructions.

## Session state machine and synchronization

States: `preparing → active ↔ paused → ending → ended`; a pre-start attempt can be canceled without creating a historical workout. Maintain separate health-source status and sync status rather than adding ambiguous combined session states.

- Selection and preflight occur before timing begins. Start is idempotent and creates one session snapshot.
- If the user selects live mode, wait for Watch start acknowledgement before transitioning to active, or offer an explicit start without live data. Missing Apple integration must never trap a user in preflight.
- Allow only one unfinished session per user; enforce with a database constraint/transaction. Multiple displays observe the same session, not parallel sessions.
- Backend is authoritative for shared workout state and event ordering. Clients interpolate timers from timestamps; never persist timer ticks as the source of truth.
- Track UTC timestamps, the session's start timezone, pause intervals, active duration, wall elapsed duration, and rest deadlines.
- Pause excludes time from active duration, rest countdown, and zone totals. Resume continues the remaining rest countdown. Historical records show both active and elapsed duration with clear labels.
- End closes intervals at the effective command timestamp, stops further zone accrual, saves the workout, and requests native session termination. Do not silently keep collecting health data. Surface pending native stop acknowledgement and retry safely after disconnection.
- Session outcome is `completed` when every prescribed set is completed; otherwise `partial`. A user may explicitly discard with confirmation; it does not count in progress. An interrupted session is resumable or endable, never silently labeled completed.
- Reloading, closing a tab, or pressing Back does not end the session. On return, recover the authoritative session. A queued duplicate End must not create a second history row.
- Commands from phone, Watch, and TV include command ID, expected revision, source, and timestamp. Resolve concurrent pause/end edits deterministically; ended is terminal. Show pending/failed commands and reconcile on reconnect rather than falsely confirming success.
- If Internet is lost, retain local timing/set/notes operations in a bounded queue tied to their original user/session. Show “Offline—changes pending.” Resolve competing commands against authoritative revisions. Native background collection may continue but is not proof that the TV is receiving live data.

End automatically persists a summary; adding notes must not be a prerequisite for saving. Notes autosave with revision checks, visible save/error status, and draft recovery. V1 allows historical note edits, not rewriting historic health samples or completed set logs through the UI.

## Apple Health and live metrics implementation

Use a Dillan-owned watchOS workout session and live workout builder; mirror appropriate state/data to the paired iOS companion. Request the minimum HealthKit permissions needed for workouts, heart rate, and any explicitly supported secondary metric. Do not request unrelated sleep, reproductive, or clinical records. Explain upload/display consent separately from Apple's Health permission dialog.

Do not assume you can subscribe to the live internals of an independently started Apple Workout. Apple Watch supports one active workout session at a time; handle an existing workout with clear instructions rather than silently terminating another app's activity. Verify OS/API availability and set explicit minimum supported versions after a hardware spike.

Native iPhone forwards timestamped samples and source state to the backend. HealthKit store synchronization alone is not an acceptable real-time transport. Background delivery from Watch to iPhone may be delayed; test the phone foregrounded, locked, and backgrounded. If reliable V1 delivery requires the companion foregrounded, state that requirement honestly in onboarding and release notes. Do not promise uninterrupted one-second updates.

Health permission UI must distinguish what is knowable. No samples can mean denied access, unavailable data, a disconnected device, or no recent measurement. Do not claim certainty about read denial solely from an empty query. Provide repair instructions and a Continue without live data path.

Sample contract: unique event ID, schema version, session ID, source/device reference, measured-at UTC timestamp, received-at timestamp, sequence number, metric type, value, unit, and quality/availability when supplied. Server derives owner from authentication. Reject ownership mismatches and malformed samples, deduplicate retries, and handle out-of-order events. Keep both measurement and receipt time so buffered data is historical backfill, never a new live reading.

Required metrics: BPM, current zone, accumulated time in zone, active duration. Rings are excluded. Calories are optional and nonblocking. Neither iPhone nor TV should fabricate Watch readings. Demo data requires a persistent “Demo” badge and separate storage.

### Zone model and missing-data accounting

Use Dillan-configured zones, not an unverified assumption that Apple exposes the user's Workout zone boundaries. Store four strictly increasing positive BPM cutoffs plus a configuration version. Define Z1 below b1; Z2 [b1,b2); Z3 [b2,b3); Z4 [b3,b4); Z5 at/above b4. User confirms boundaries; without them show BPM with zones unconfigured. Do not invent an age-based formula in V1. Snapshot zone configuration at session start; edits affect subsequent sessions only.

Proposed freshness/coverage rules, subject to validation on real hardware:

- Reading age ≤10 seconds: eligible to appear live. Age >10 seconds: delayed label. Age >30 seconds: replace headline BPM with unavailable and retain timestamped last value only as secondary information.
- For zone duration, hold each valid sample forward to the next sample or at most 10 seconds, whichever comes first. Intersect that interval with active workout periods only. Missing intervals are unmeasured, not assigned to the last zone indefinitely.
- Recompute by measurement time after deduplicated backfill; don't double-count intervals or add paused time. Exclude samples outside session boundaries, and tolerate documented clock skew without reclassifying old samples as live.
- Sum of zones plus unmeasured active time equals active duration within rounding tolerance. Show coverage and unmeasured time in summary. Before zones are configured, classification is unavailable rather than all time being Z1.
- Use the same pure calculation module/specification for live aggregates and saved history. Persist the algorithm version and zone snapshot so results are explainable.

V1 stores the samples needed to reconstruct the user's session history until the user deletes that history/account. Document this retention choice and provide deletion; do not keep a second undeletable analytics copy. Do not offer medical diagnoses or treat zone time as proof of fitness improvement.

## Data model and API responsibilities

Use normalized relational ownership and foreign keys, with snapshots where history must be immutable.

| Entity | Important contents |
|---|---|
| UserProfile | Auth ID, display name, timezone, units, weekly goal, verified contact references |
| Device / DeviceProfile / DeviceGrant | Device identity, remembered profiles, active authorization, expiry/revocation |
| ApprovalChallenge | Origin binding, hashed secret, lifecycle, expiry, attempt limits |
| HealthConnection | User/source binding, app/device status, consent metadata; not assumed read-permission certainty |
| ZoneConfiguration | Four cutoffs, version, confirmation date |
| WorkoutTemplate / Exercise / SupersetGroup | Ordered prescriptions, owner, revision, deletion timestamp |
| WorkoutSession | Owner, template snapshot, timezone, timestamps, state/revision, outcome, zone snapshot |
| SessionEvent / SetLog | Idempotent commands, pause/resume intervals, actual reps/load, completion/skip state |
| HealthSample | Owner/session, event ID, measurement/receipt timestamps, metric/value/unit |
| SessionSummary / SessionNote | Duration, zone totals/coverage, note text/revision, calculation version |

Expose authenticated operations for template CRUD; challenge creation/approval/status; session start/pause/resume/end/recovery; set completion/undo/skip; notes; health ingestion; calendar/history; and device revocation. Define schemas before wiring UI. Realtime messages include state revision, sample timestamps, and session ID. Authorize every subscription and disconnect it on revocation.

Progress uses completed sessions only for weekly goal/trend; show partial sessions separately and include their saved active minutes with explicit wording. Deleted/discarded sessions do not count. Week-to-date comparisons use the same elapsed portion of the prior week in the user's timezone. Calendar assigns a session to its local start date using the stored start timezone, including cross-midnight sessions; history does not move when traveling. Month queries must handle timezone/DST boundaries. Display multiple sessions per day and a notes indicator.

## UI implementation and reliability

Use the companion screen IDs S01–S15 to trace implementation. TV controls must work with D-pad/Select/Back without touch or mouse. Implement deterministic focus restoration, readable metrics at room distance, visible selected user, and safe modal focus. Keep the display awake during active/paused training where the native platform permits; restore normal behavior afterward. Test the actual wrapper's navigation, video behavior if added, cookies, networking, and reconnect handling.

Do not embed privileged JavaScript bridges unnecessarily. Restrict wrapper navigation to approved HTTPS origins, handle external links safely, and validate authentication redirects. A TV wrapper is not a substitute for server authorization.

No exercise video library is required for V1; names/instructions are sufficient. Optional design illustrations must not create a new content-licensing dependency. No push notification service, billing, social login, or AI backend is required.

## Delivery sequence and release gates

1. **Hardware feasibility spike:** identify Fire TV OS; prove a real Watch → iPhone → backend → TV BPM path. Measure latency, sample gaps, foreground/background behavior, and session lifecycle. Document minimum OS/device requirements and blockers. This is the highest-risk dependency; do it before polishing all screens.
2. **Accounts and device isolation:** email and SMS verification, QR approval, remembered profiles, switching/logout/revocation, and cross-user access tests.
3. **Workout library and history foundation:** CRUD, validation, snapshots, set semantics, persistence, Calendar and notes.
4. **Training session engine:** start/pause/resume/end, phone/TV synchronization, rest, actual set logs, recovery, and progress.
5. **Production health integration:** zones, freshness, coverage, backfill, native pause/end reconciliation, permissions and fallback UX.
6. **TV packaging and release candidate:** device-specific wrapper, complete user journeys, security review, deployment/runbook, and owner demonstration.

Work may proceed with labeled mocks while hardware dependencies are unresolved, but call that a web prototype, not completed V1. Obtain missing device identifiers, Apple signing/access, and SMS provider credentials only when needed; never invent them or commit secrets. Automated tests passing do not replace physical-device verification.

## Acceptance and verification matrix

| Test | Passing result |
|---|---|
| New account | Email and SMS registration/login work with real configured providers; expiry/resend errors recover |
| Shared TV | Two distinct users can authorize and switch; no prior private data flashes or remains queryable |
| Approval abuse | Expired/replayed/wrong-device challenges fail; guessing is rate-limited |
| Tenant isolation | User B cannot fetch, mutate, or subscribe to user A's templates, sessions, notes, or samples |
| Template lifecycle | Create/edit/delete works; old sessions preserve original prescriptions |
| Set semantics | Total/per-side, load units/basis, straight sets, supersets, skip/undo all behave consistently |
| Session race | Duplicate starts/ends and simultaneous phone/TV actions produce one valid history record |
| Timing | Pause and app reload preserve duration/rest accurately; DST does not corrupt history |
| Real health | Physical Watch samples arrive on the target TV; measured source age and gaps are reported |
| Data loss | Sensor/Internet/phone-background gaps produce delayed/unavailable states, not invented live values |
| Zone accounting | Exact boundaries, pause intervals, duplicates, gaps, and backfill yield correct totals/coverage |
| Recovery | Interrupted session and offline note/set changes recover under the correct account |
| End | Workout stops, history saves even without notes, native stop acknowledgement is handled |
| Notes/history | Notes survive refresh and appear on the correct Calendar day/session |
| TV usability | Remote-only selection, completion, pause/resume/end, navigation, and user switch work |
| Progress | Completed vs partial rules, same-period comparisons, and empty states are correct |

Use unit tests for zone/timing math, integration tests for authorization/persistence, and end-to-end tests for main web journeys. Add a concise physical-device checklist with actual results, device/OS versions, measured latency distribution, foreground/background behavior, known limitations, and unresolved defects. Proposed target: new samples reach the TV within five seconds of phone receipt on stable Wi-Fi; report measurement age separately. Treat this as a target to test, not a guaranteed sensor refresh rate.

## Required handoff from Claude Code

Deliver runnable source, migration/seed scripts with synthetic fixtures, environment-variable template, setup commands, Apple signing/HealthKit entitlement instructions, Fire TV installation instructions, API/data documentation, tests/results, and a rollback/deployment runbook. Maintain an issue list with blockers separated from optional improvements. Provide a short demonstration script covering a two-user gym session and real Watch metrics.

Explain what is implemented, what was actually tested, what requires hardware or external credentials, and what remains. Do not label a fallback, mock, or unverified native integration as complete. Resolve reversible implementation choices autonomously and record them; escalate only genuine scope conflicts or unavailable external requirements.

## Primary platform references

- Apple multi-device workout explanation: https://developer.apple.com/videos/play/wwdc2023/10023/
- Apple sample: https://developer.apple.com/documentation/healthkit/building-a-multidevice-workout-app
- Health authorization: https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- Workout sessions: https://developer.apple.com/documentation/healthkit/hkworkoutsession
- Remote session data delivery: https://developer.apple.com/documentation/healthkit/hkworkoutsessiondelegate/workoutsession(_:didreceivedatafromremoteworkoutsession:)
- Fire OS WebView: https://developer.amazon.com/docs/fire-tablets/hybrid-apps-overview.html
- Vega WebView: https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview
- Fire TV platform overview: https://developer.amazon.com/docs/fire-tv/get-started-with-fire-tv.html

Re-check current SDK documentation at implementation time. The freshness thresholds, zone algorithm, schema, delivery target, and product defaults above are Dillan design decisions, not claims of guarantees from Apple or Amazon.
