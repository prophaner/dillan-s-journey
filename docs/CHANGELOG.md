# Changelog

Reviewed through: a4e8574

One entry per accepted slice, newest first, written by the docs-writer agent after the owner
accepts. Tooling changes merged by the owner (agent config, docs scaffolding) get a short
entry under "Tooling" so the history stays complete; they are not slices.

## Unreleased
- 0002/0003: prescriptions reference exercises by id; backfill for existing routines
  (0003 landed at 0f55c7b, approved by the owner; see DECISIONS 2026-10-15)

### 2026-10-16 — Profile and Settings shells, migration 0005, with states fixes
Commits 133775c..a4e8574 (migration 0005 at a4e8574, approved by the owner; Lovable build a4e8574).
Accepted with known issues (listed below): the owner paused Lovable spending for manual phone testing.
Screens: Profile (equipment, limitations, availability, experience, units, time zone), Settings (Your
data on this phone, units, Coming later, Sign out), S21 Your data (storage label), S20/sign-in offline,
conflict card (profile rows, routine-save rebase), S04/S07 Session (storage phrase, note status), Plan
(fix), D02 Routine editor (loads in your unit), S08 Progress (units from preferences). FRs/ATs: FR-01
partial (equipment, limitations, availability, experience, units, time zone; no preferences or
integrations); FR-04 partial (available toggle; no locations or temporary availability); FR-09 partial
(status accommodated / avoided / pending / resolved on each note, editable note; no per-routine view);
FR-17 partial (Your data and Sign out on Settings; privacy, export and deletion are Coming later);
AT-22 held (units change display only); AT-34 label ("Kept in this tab only"). Verified on phone: no.

- Profile lists your equipment: name, detail or "—", "Demo data" on sample gear, an Available /
  Not available box, and a bin. "No equipment yet. Add what you train with. Dillan only plans with
  what's here and available." when empty.
- Add equipment by name (up to 80 characters; "e.g. Kettlebell 16 kg"); it shows at once and syncs
  through the outbox with a device-made id, so offline edits to it follow.
- Remove equipment sets it aside (archived, never deleted); toast "<name> removed" with Undo.
- Limitations, newest first: area and side (or "Something felt off"), origin ("You, during a
  session", "You, onboarding", "You, in Profile", "Coach note") with date, "Linked: <exercise>" or
  "Linked exercise: —", a status tag ("Noted" for a fresh note), four status chips Accommodated /
  Avoided / Pending / Resolved, an editable note (280 characters, saved when you leave the box),
  "A dated note, not a diagnosis.", Remove with Undo. Empty: "Nothing noted. Anything you mark with
  “Something feels off” shows up here with its date."
- Availability: Days per week (1–7, Not sure), Training days in the order of your week, Typical
  session (20–90 min, Not sure), Week starts on (Mon, Sun, Sat; "Monday until you choose."). Days
  per week is the weekly target Progress uses for Steady weeks; the other three are stored and not
  yet used by Today or Progress.
- Experience: New to lifting / Coming back / Experienced; "Helps Dillan explain things at the right
  level. It's never used to pick your loads."
- Units card on Profile and Settings: Pounds (lb) / Kilograms (kg), Inches (in) / Centimeters (cm);
  "Changes how numbers are shown. What you entered is kept as you typed it." Units now live in
  profiles.preferences.units (the old columns kept in step); Progress reads them from there.
- Time zone: a list of zones, "Sessions are dated by the day where you train.", and "Use this
  device's (<zone>)" when the device differs.
- Every Profile change goes through the outbox as a versioned row update (update:profiles |
  equipment_items | limitations), validated on the device and the server; a second change to a row
  whose first has not left this device is merged into it, so an offline session of edits never
  conflicts with itself. A replay of a change already stored is accepted silently.
- Write-failure banner on Profile: "That didn't save. This browser isn't keeping data between visits
  (private mode or storage full)." with Try again; the Units card has its own.
- Load states per section: skeleton; "Couldn't load your equipment / limitations / profile" with
  "Check your connection and try again." or, offline, "Open Profile online once to see this."
- Settings: "On this phone" row "Your data on this phone" with "N not synced yet" / "Everything is
  synced" opens the Your data sheet (still in the menu too); Units; six "Coming later" cards
  (Notifications, Privacy, AI data permissions, Export, Deletion, Accessibility) with one honest
  line each; Account: "Signed in as <email>", Sign out, "Signing out clears this device's copy."
- Session Done screen: each "Noted today" line shows the status you set in Profile (for example
  Resolved) next to its save word; nothing extra while it is just Noted.
- Conflict card: profile, equipment and limitation changes are resolvable ("Your profile changed on
  another device. Keep yours, keep theirs, or compare?"); Compare lists each changed field with
  Yours / Theirs (units as "lb · in", status words, Available / Not available, Removed / Kept).
- States fix (AT-34): when storage is unavailable, "Saved on this device" reads "Kept in this tab
  only" in every save word and toast, and the Your data sheet row explains "This browser isn't
  keeping data, so closing this tab loses it. Sync before you close."
- States fix (sign-in): offline, the sign-in page no longer tries the server check; it shows "Dillan
  needs a connection to sign you in again. Open it online once." with Try again.
- States fix (conflicts): Keep yours on a routine save that an unsynced session depends on now moves
  the save itself onto the newest version (new id, next number) and re-points the queued session and
  its on-device copy, instead of leaving the save behind: "Kept yours as the newest version. The
  session you started on it will sync after it." Keep editing on Plan does the same and retries.
- States fix (conflicts): Keep yours on your setup (onboarding) resends with the original
  idempotency key, so child rows are never doubled; the server checks the profile version before
  writing anything.
- Fix (outbox): an item rewritten while queued is sent and marked from its fresh copy, not the
  stale one read at the start of the drain.
- Migration 0005 (a4e8574): limitations.status check now allows accommodated, avoided, pending
  (alongside active, resolved, archived); profiles.experience (new, returning, experienced),
  profiles.training_days smallint[], profiles.week_start 0–6. Mirrored in docs/profile-schema.sql.
  Approved by the owner.

Known issues (accepted as is; see the manual's Known issues):
- The Units card on Settings may flip back to the old value after a sync until the screen is
  reopened. Profile shows the right value; use Profile to change units.
- Undo after removing gear that never synced does nothing: the add was taken back, so there is
  nothing to restore.
- Undo on a removed limitation may put it back as Pending instead of its earlier status (a fresh
  "Noted" note comes back as Pending).
- The routine editor shows loads in the unit they were saved in, not your display unit.
- Tapping the same Profile setting twice very quickly can produce a "Changed on another device"
  card (the second change raced the first); Keep yours resolves it.

Phase 1 code-complete except swap alternatives + exercise preferences; paused for owner phone testing.

### 2026-10-16 — Your data, offline and conflicts (S21, S20), with Plan fixes
Commits 4827521..f1afd3a (Lovable build 42eeca5, fix round f1afd3a). No migration.
Screens: S21 Your data (sheet in the menu), S20 first-visit offline page, S01 Today (update banner,
offline banner, storage banner, "N unsynced" eyebrow), conflict card on every app screen, S04/S07
Session ("resolve on Today" pointer), Plan (Versions row, fixes), D02 Routine editor (fix).
FRs/ATs: AT-21 met (a refused change shows a conflict card with Keep yours / Keep theirs / Compare;
nothing resolves itself); AT-29 met (first visit offline shows "Dillan needs a connection the first
time."; afterwards the shell reopens offline with a calm banner); AT-32 met (a new version is offered
on Today only with no session open, never applied mid-session, applied quietly on a cold start);
AT-36 met (offline, the sign-in stored on this device is trusted); AT-34 partial (startup storage
probe and warning; no per-set blocking sync when storage is unavailable). Verified on phone: no.

- "Your data on this phone" sheet from the menu: Synced ("Stored on your account. Safe if this phone
  is lost."), Saved on this device ("Kept here. Sends when you're online and Dillan is open."),
  Didn't sync ("Tried and stopped. Retry, or choose a version if it changed elsewhere."), with
  counts from this device's queue.
- "Sync now" requeues failed items and sends everything waiting; conflicts with a card stay put.
- Clearing-data note: "Clearing your browser data would remove the N unsynced items. Sync first if
  you can." or "Everything here is synced. Clearing your browser data only removes this device's
  copy."; footer "Signed in as <email> · Signing out clears this device's copy."
- Today's date line adds "· N unsynced" with an alert mark when anything is waiting or failed.
- Update banner on Today, only with no session open: "A new version of Dillan is ready" with Update.
  A waiting version is never activated on a session route; a cold start with no session open
  activates it quietly.
- Offline banner on Today once the routine is on this device: "You're offline. Logging works; it'll
  sync when you're back."
- Storage warning on Today from a startup probe (storage estimate plus a real write): "This browser
  isn't keeping data between visits (private mode or storage full). Logging still works while the
  tab is open; nothing is saved here when you leave."
- First-visit offline page rewritten in Dillan's voice: "Dillan needs a connection the first time.",
  the after-first-load promise, Try again, "Nothing was lost. There's nothing saved here yet."
- The service worker caches the app shell HTML (never signed-in data) so a device that has loaded
  Dillan once reopens offline to Today instead of the offline page.
- Offline sign-in: when the server check cannot run, the session stored on this device is trusted;
  otherwise the sign-in page.
- Conflict card at the top of every app screen, one per item: "Changed on another device", "Your
  plan changed on another device. Keep yours, keep theirs, or compare?" (routine save, goal level) or
  "This changed on another device …" (set change, session finish, setup). Compare shows Yours /
  Theirs rows (Goal level; Reps, Load, Reps in reserve; Ended as, Feeling, Note; Setup) or, for a
  routine save, the plain "What changed" list against their vN; "Couldn't load their version. Check
  your connection." when it cannot load.
- Keep yours resends your change on the newest version (never silent; the user chose it); for a
  routine save it becomes a draft on the newest version and opens the editor ("Your edit is back as
  a draft on the newest version."); "That item no longer exists, so there's nothing to keep." when
  the row is gone.
- Keep theirs drops your change from this device and refetches; refused for a routine save that an
  unsynced session was started on ("A session you started on this version hasn't synced yet, so this
  save has to stay until it does.").
- Retry no longer requeues a conflict that has a card; conflicts without a card are still requeued.
- Session: a conflicting change from the open session shows "Changed on another device · resolve on
  Today" in the set screen header and the Done footer instead of the save word.
- Plan Versions: a save in conflict reads "Changed on another device · resolve above"; Keep editing
  and Discard this save are offered only for a save that failed for another reason.
- Fix (Plan): Discard this save is refused while a session started on that version has not synced.
- Fix (Plan): Keep editing writes the draft first, then takes the save back, so nothing is lost if
  the second step fails; if a session on that version has not synced, the save stays and the draft
  is made ("A session on this version hasn't synced yet, so the save stays; your edit is also a
  draft on the newest version.").
- Fix (Plan): "What changed" keeps the same exercise in two blocks as two entries instead of merging
  them.
- Fix (Plan): a version still being written by a concurrent save is retried rather than reported as
  stored; only a locked version counts.
- Fix (D02): "Rest between (s)" is empty when not set, with the hint "default 20 s", instead of
  showing 20 as if typed.
- Fix round (f1afd3a): the build at 42eeca5 broke because the conflict actions module (which pulls in
  the Supabase client) was imported statically into shared UI; it is now `conflict-actions.ts`,
  loaded on demand. The same round added the setup (onboarding) conflict card, the "This changed …"
  headline, the storage probe at app start, the "resolve on Today" / "resolve above" pointers, the
  alert mark on the eyebrow, and stopped the service worker caching redirected HTML as the shell.

### 2026-10-16 — Plan + Routine editor, migration 0004, with S08 fixes
Commits bf08eba..7ab9b9c (migration 0004 at ff320db, approved by the owner; Lovable build ff320db,
fix round 7ab9b9c).
Screens: Plan (routine, versions, goal levels), D02 Routine editor, Exercise detail; S08 Progress
(fixes), S01 Today and S04 Set logging (priority block). FRs/ATs: FR-05 met (sets, reps, load, rest,
supersets with rounds and two rests, reorder, Required / Priority / Optional, add and remove
exercises; exercise badge Reviewed / Yours / Not reviewed); FR-02 level met (Improve / Maintain /
Defer per goal, stored in goals.level, shown on Plan and Progress); AT-03 met (Save as vN+1 makes a
new locked version; sessions already done keep their snapshot). Exercise detail partial: emphasis,
cues and equipment show when stored, alternatives are Not yet known. Verified on phone: no.

- Plan shows your routine with an "In use" tag, "Version N", block count and "about N min
  (estimate)", one row per block (Required / Priority / Optional, "superset · N rounds"), and
  Edit routine; the account-wide save word sits in the header.
- "How this plan works" shows the purpose text with "From your plan · vN", or Not yet known
  ("Why this plan is built this way isn't written down yet.").
- "Exercises in this routine" lists each exercise; tap one for its detail page.
- Versions, newest first, with date, "In use" on the version in use and "Locked" on stored
  versions; an unsent save sits on top as vN+1 with its save word. "Saving an edit makes a new
  version. Sessions you've done keep the version they used."
- "Goals · this period": Improve / Maintain / Defer chips per active goal, "Level not yet set."
  until you pick; saved through the outbox with the goal's version, works offline, shows its own
  save word; "Couldn't save on this device. Nothing changed." when the device cannot store it.
- Routine editor: "Editing <name>", "Draft of vN+1", banner "Saving creates version N+1. Sessions
  you've already done keep version N exactly as it was." The draft is kept on this device as you
  edit and survives reload, lock and offline; it belongs to the version it started from.
- Blocks: Required / Priority / Optional chips (one Priority at most; marking another clears the
  first), Move up / Move down, Remove block. Exercise fields Sets, Reps, Load (decimals, comma
  accepted), Rest (s); empty means not set ("—"); sets and rounds 1–20.
- Supersets: "Group with next" merges two blocks (rounds = the larger set count), with Rounds,
  "Rest between (s)" (20 s default; FR-05 transition rest editable) and "Round rest (s)"; letters
  A, B, …; per-exercise remove; "Ungroup" splits back into one block per exercise with sets = rounds.
- "Add an exercise" by name: a new Required block of 3 × 10; "Matched to the exercise library by
  name; otherwise saved as your own exercise." (matched on the server, never by name alone in the
  stored prescription).
- "Dillan's check" is marked "Coming with Dillan": "A check against your goals, limitations and
  equipment."
- "What changed from vN": plain-language list (Added / Removed, sets, reps, load, rest, priority,
  position, superset membership, rounds, round rest, rest between) or "Nothing yet."; optional
  "Why" (300 characters) stored with the version; problems that block saving listed in place.
- Time estimate for Full / Short / Priority only, updated as you edit; "Minutes, estimated from
  sets, rest and setup."
- "Save as vN+1" (also Ctrl/Cmd+S) is greyed out until something changed and nothing blocks it;
  toast "Saved as vN+1 · saved on this device", back to Plan. The save goes through the outbox;
  Train and Today use the unsent version at once, and a session started on it waits behind the
  save when syncing. The server stores the version once (idempotent), resolves exercise ids, then
  locks it; earlier versions and session snapshots are never touched. "Discard draft" drops the
  draft with no question.
- A save the server refused (a newer version saved elsewhere) shows "Didn't sync" in Versions with
  "Keep editing" (reopens the editor on the newest version with your blocks) and "Discard this
  save"; while it is failed, Train uses the stored version.
- Exercise detail: name, badge Reviewed / Yours / Not reviewed, "Demo data"; Intended emphasis
  ("What the exercise aims at. How it feels doesn't prove which muscles worked."), Cues, Equipment,
  each Not yet known when empty; Alternatives "No reviewed alternatives are stored yet.";
  "Couldn't load this exercise" / "Exercise not found".
- Today and Session: Priority only keeps the block marked Priority (first required block when none
  is marked); Short keeps required and priority blocks; the set screen tags a priority block
  "Priority".
- Fix (S08): the goal card shows the Improve / Maintain / Defer tag when set, "Level not yet known"
  otherwise.
- Fix (S08): Steady weeks counts only weeks from your first finished session ("N of M", M up to 7);
  Not yet known until the first session is known.
- Fix (S08): a measurement in a unit the app cannot convert shows Not yet known instead of the raw
  number or 0; a pending entry without a value is never shown as 0; BMI is Not yet known when
  either input cannot be converted. BMI tag is "Derived" with "kg / m² · v1".
- Fix (S08): the server rejects a measurement dated more than five minutes in the future.
- Fix (S08): chart labels and week labels use the UI font at footnote size.
- Fix (Today): "Resume session · N min in" wraps to a second line under 360 px instead of
  overflowing.
- Fix (outbox): an unsent item that has just started sending is no longer removed by a replace.
- Migration 0004 (ff320db): `goals.level` nullable text with check (improve, maintain, defer);
  `routine_blocks.priority` check now allows "priority". Approved by the owner.

### 2026-10-16 — S08 Progress, with Today fixes
Commits 61b7835..cec1ef3 (Lovable build cec1ef3).
Screens: S08 Progress (Goals, Body, History; "Add a measurement" sheet), S01 Today (review fixes),
S07 Session complete (discard Undo made safe). FRs/ATs: FR-10 met (objectives, Steady weeks from real
sessions, body measurements with manual entry, left and right kept apart, the typed value and unit
stored, conversion on screen only — AT-22); FR-02 goal level deferred (goals has no level column;
cards show "Level not yet known"). Verified on phone: no.

- Progress has three views, Goals, Body and History, with the account-wide save word in the header
  and the plan purpose text "From your plan · vN".
- One card per active goal: "Level not yet known" tag, "Goal N of M", the goal in your words, the
  latest measurement for its metric with date (or "—" Not yet known), "from <value> on <date> ·
  target <value>", and a chart with dots, a dotted "no entry · N wk" line across gaps and a dashed
  target line. Empty, failed and demo states have their own words.
- Steady weeks card: "Habit" tag, weekly target or "Weekly target not set", "Steady weeks N of 7"
  over the last eight weeks with the current week shown as "now" and never counted; one dot per
  session (Done, Shortened, Logged, not finished); Not yet known without a target or without data.
- Body lists one card per measurement and side (Weight, Height, Waist, Hips, Arm / biceps,
  Thigh, Other), latest value in your profile unit with "Entered as …" when it differs, a chart
  with more than one entry, and the entry's save word while it is still on this device.
- BMI card marked "derived", from your latest weight and height; "—" Not yet known until both exist.
- "Add a measurement" sheet: type chips, "What you're measuring" for Other, Left / Right for arm
  and thigh, a decimal value (comma accepted; "Enter a number, like 32.5." otherwise), unit chips,
  "Last: …" line, optional Method (Scale, Tape measure, Other) and Conditions (120 characters),
  Save once per tap; "Saved as you typed it. Units convert only on screen."
- Measurements go through the outbox: they work offline, show at once with their save word, and
  sync once; the storage banner adds "That entry wasn't saved." when the device could not store one.
- History: Reviews and Decisions are both "Coming later".
- Fix (Today): until this week's sessions load, the week strip shows a dashed "—" (Not yet known)
  for every other day instead of "nothing logged".
- Fix (Today): a session logged but not finished has its own pip ("logged, not finished"), apart
  from a shortened one.
- Fix (Today): the header no longer repeats the routine name; loading shows grey placeholders.
- Fix (Today): "Couldn't start on this device …" is a banner, not a footnote.
- Fix (Today): "Resume session · N min in" stays on one line at 320 px.
- Fix (Session): discard Undo puts the session back on this device first; if the discard is
  mid-send you see "Discard is being sent", if it is already stored "Already discarded on the
  server". The eight-second hold before a discard is sent now applies on every sync path, and an
  item taken back by Undo is never sent.

### 2026-10-16 — Today S01/S02/D01, with S11 fixes
Commits 3cb8dd5..61b7835 (Lovable build 9661014, merged at 61b7835).
Screens: S01/S02 Today (time choice, plan card, week strip, Resume card, Waiting on you and Your
goal cards), D01 plan purpose text, S07 Session complete ("Short plan" / "Priority only plan"
card), S11 Something feels off (fixes), S04 Set logging (fix), S16 Train (wording).
FRs/ATs: FR-06 partial (Full / Short / Priority only built from the routine with estimated minutes;
no custom time, no "Why this is here" per block, no check-in); AT-04 met (the time choice is
recorded in the session, the full plan is unchanged, "Why this trade" names kept and left-out
blocks). Verified on phone: no.

- Today shows your routine as blocks with Full / Short / Priority only and estimated minutes,
  labelled "est. times"; "Estimates include setup and rest. Your pace decides the real time."
- Short leaves out optional blocks; Priority only keeps the first main block, tagged "Priority".
  Left-out blocks are struck through with "—" instead of minutes.
- "Why this trade" reads "Keeps <blocks>, so the purpose stays: <purpose>. Leaves out <blocks>."
  (or "your main work" without a purpose; "Nothing to leave out — this plan has no optional blocks.").
- "Start N-min session" ("Start session" on Full) creates the session with the choice recorded;
  only kept blocks run. The Done screen adds a "Short plan" / "Priority only plan" card: "Kept ….
  Left out … today." and "Your full plan vN is unchanged."
- Plan purpose text at the top of Today, "From your plan · vN".
- Week strip Monday to Sunday: done, shortened, today, planned and nothing logged; "Couldn't load
  this week." / "This week loads when you're online." when the week cannot load.
- Resume card when a session is open: "In progress", "Resume session · N min in", Finish here.
- "Waiting on you" (nothing yet) and "Your goal" (first active goal, Progress Not yet known;
  "No goal yet. Add one in your profile."). Two columns at 1024 px and wider, with "Logging on a
  phone? Open Dillan there and tap Train. Your session follows your account."
- States: loading, "Couldn't load today's plan" with Try again, "No routine yet", and
  "Couldn't start on this device. Private mode or full storage can block it. Try again."
- Train: the "Today's session" row reads "Choose Full, Short or Priority only".
- Fix (S11): two fast taps on Stop this exercise or End the session make one note.
- Fix (S11): the note carries your local date and the session; the link line reads
  "Felt off on <local day> · you …".
- Fix (S11): during rest, Something feels off is about the exercise you just did.
- Fix (S11): Stop this exercise and End the session are option rows with a detail line
  ("Skip ahead. Sets you've done stay saved." / "Stops here and keeps everything you logged.").
- Fix (S07): Discard session shows "Session discarded" with Undo; the discard waits eight seconds
  on this device before it is sent so Undo can take it back.
- Fix (S04): a changed set's numbers become the starting point for the next set of that exercise.

### 2026-10-16 — S11 Something feels off, with carry-over fixes
Commits 0f55c7b..e0e1f52 (migration 0003 at 0f55c7b; Lovable build e0e1f52).
Screens: S11 Something feels off, S07 Session complete ("Noted today" card, Finish and save,
one-step Discard), S04 Set logging (stacked edit buttons, swap prefill, queued-set recovery),
S16 Train (account-wide save state in the header). FRs/ATs: FR-08 partial (stop or end from the
sheet; no gentler option yet); FR-09 partial (dated limitation note with area and side; origin
session); AT-05. Verified on phone: no.

- "Something feels off" is one tap away on every training screen: set, rest, superset round
  and while changing a set. The sheet reads "Stop or adjust. Your call." / "Your sets so far
  are saved."; every action takes effect at once, with no confirmation.
- Stop this exercise drops that exercise's remaining sets, keeps the done ones, cancels rest
  and moves to the next exercise; hidden once every set is done.
- End the session ends it as stopped ("Stopping was the right call. Your sets are saved.").
- Optional "Where?" area chips (Shoulder … Other) with Left / Right / Both, and a 140-character
  note ("What did you notice?"). Keep going closes the sheet and saves nothing.
- The note is saved through the outbox as a dated limitation linked to the exercise (origin:
  session), works offline, and two fast taps make one note.
- Done screen shows a "Noted today" card: exercise, area and side, each with its own save
  word and Retry; "A dated note, not a diagnosis."
- Storage banner adds "Your note wasn't saved." with Try again when the note could not be stored.
- The sheet's escalation sentence ("If pain is sharp, getting worse, or comes with numbness or
  swelling, stop and get it checked by a clinician.") is marked "Placeholder wording · to be
  reviewed before release".
- "Try a gentler option" is not shown; it appears only once reviewed alternatives exist.
- Done screen: Save session is now "Finish and save"; Discard session is one tap with no inline
  question and no Undo.
- Fix: Save change and Cancel are stacked one above the other while changing a set.
- Fix: a swapped exercise prefills from its own last values first, then the plan.
- Fix: a set queued before a failed draft save is recovered when the session is reopened and
  shows once; the Train header shows the account-wide save state (Saved on this device · N,
  Synced, Didn't sync · N with Retry) and the outbox keeps order across page loads.

### 2026-10-16 — S04 edits + S06 Superset, with carry-over fixes
Commits 885b071..03aefe0 (fix rounds 33edd78, 3475a13, 47e1751, d8840de, 5c8dc07; Lovable build 03aefe0).
Screens: S04 Set logging (change a done set, swap an exercise for this session), S06 Superset,
S07 Session complete (Save session or Discard session). FRs/ATs: FR-05; FR-07 (edit and undo of a
done set; still no pause/resume); AT-02, AT-03, AT-17. Verified on phone: no.

- Tap a done set pip to change its reps, load or reps left in the tank in place; Save change
  shows "Set N changed · saved on this device". A change corrects the same set; no Undo on a change.
- Swap an exercise for this session only, from a sheet, until its first set is logged; "Back to
  <planned exercise>" undoes the swap. Alternatives are not yet matched to equipment or
  limitations. The set screen and the Done screen note "Swapped for <planned> · this session only".
- Supersets run as rounds: Superset tag and "Round N of M", A then B, transition rest of 20 s by
  default, the round rest after the last exercise, pattern line "Go A → B · rest 20s between ·
  75s after the round.", a finished exercise in the round shows Done.
- Done screen offers Save session or Discard session; Discard asks once more inline ("This removes
  the session and its N sets from your history."), then "Session discarded" and the session and
  its sets are removed. Save session is greyed out while a discard is waiting.
- Fix: Save session queues the finish once, even after a reload or a double tap.
- Fix: Undo runs once; Log set is greyed out while an undo is waiting to be stored.
- Fix: Changes sync in the order you made them, so an edit or undo never arrives before its set.

### 2026-10-16 — Workout slice: S16 → S04 → S05 → S07 with real set storage
Commits a9fddd0..f0cac87 (Lovable build 0328455 plus fix rounds e018d34, 08e1b13, 5818581, f0cac87).
Screens: S16 Train, S04 Set logging, S05 Rest timer, S07 Session complete. S17 keyboard
handling partial (sticky actions follow the keyboard; the card does not collapse). S18
rest-ended state not built (the timer is correct after lock, with no message).
FRs/ATs: FR-05; FR-07 partial (no pause/resume, no edit of a done set); AT-01, AT-03, AT-05,
AT-31, AT-33, AT-34. Verified on phone: no.

- Train shows your routine (your own approved one, else the sample marked "Demo data") with
  Start session, and a Resume / Finish here card when a session is open.
- Train lists your last five finished sessions as Done, Partial or Stopped early.
- Log a set with reps and load steppers (tap the number to type), optional reps left in the
  tank, and "last time" values; a second tap within one second is ignored.
- Toast "Set N logged · saved on this device" with Undo; Undo removes the set and cancels rest.
- Rest timer with −15 s / +15 s / Skip, correct across screen lock; no sound while locked.
- End in one tap; "Something feels off" sheet with Stop the session here / Keep going, lighter.
- Done screen with headline by outcome, per-exercise result, time, sets logged, optional
  feeling and note, and Save session.
- Save words per session: Saved on this device · N, Synced, Didn't sync · N with Retry; Done
  screen footer says what is synced or waiting.
- Storage warning "This browser isn't keeping data between visits (private mode or storage
  full)." with Try again when a set, undo or draft could not be stored.
- Sessions and sets go through the outbox; starting and saving a session works offline once
  the routine has loaded on the device.
- Sign-out clears this device's open sessions, cached routine and onboarding draft, and asks
  first when changes have not synced.

## Tooling
- 2026-10-15 — Added `.claude/` (agents, commands) and `CLAUDE.md` lead instructions; docs
  scaffolding (changelog, user manual, decision log, test-plans). No user-visible change.
- 2026-10-16 — Lovable's note at a4e8574 (migration 0005, Profile and Settings shells) is folded
  into the slice entry above.
