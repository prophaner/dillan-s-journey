# Changelog

Reviewed through: cec1ef3

One entry per accepted slice, newest first, written by the docs-writer agent after the owner
accepts. Tooling changes merged by the owner (agent config, docs scaffolding) get a short
entry under "Tooling" so the history stays complete; they are not slices.

## Unreleased

- 0002/0003: prescriptions reference exercises by id; backfill for existing routines
  (0003 landed at 0f55c7b, approved by the owner; see DECISIONS 2026-10-15)

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
