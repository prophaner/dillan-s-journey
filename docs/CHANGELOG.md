# Changelog

Reviewed through: e0e1f52

One entry per accepted slice, newest first, written by the docs-writer agent after the owner
accepts. Tooling changes merged by the owner (agent config, docs scaffolding) get a short
entry under "Tooling" so the history stays complete; they are not slices.

## Unreleased

- 0002/0003: prescriptions reference exercises by id; backfill for existing routines
  (0003 landed at 0f55c7b, approved by the owner; see DECISIONS 2026-10-15)

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
