# Changelog

Reviewed through: f0cac87

One entry per accepted slice, newest first, written by the docs-writer agent after the owner
accepts. Tooling changes merged by the owner (agent config, docs scaffolding) get a short
entry under "Tooling" so the history stays complete; they are not slices.

## Unreleased

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
