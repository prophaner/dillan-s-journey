# Roadmap — Phase 0
- [x] Docs copied into /docs and /design
- [x] Tokens, three self-hosted fonts, Lucide, Night Gym
- [x] Shell: bottom nav / 1024px sidebar, all routes, magic-link sign-in
- [x] Shared components + /dev/components
- [x] Spikes: outbox, timer across lock, keyboard, push detection, SW update hold (/dev/spikes)
- [x] Phase 0 tables + RLS applied, isolation test passing
- [ ] Real-phone validation (owner, iPhone + Android)

# Phase 1
- [x] S12 Onboarding built (6 questions + summary, saves through the outbox)
- [ ] S12 end-to-end check signed in — blocked: needs the owner to sign in once in the preview

- [x] Prescriptions reference exercises by id
- [x] Workout slice S16 → S04 → S05 → S07 with real set storage
  - Verified on phone: no
- [x] Edit a done set, swap (this session only), discard session, supersets (S06)
  - Verified on phone: no
- [x] S11 Something feels off (sheet, stop/end, dated limitation note)
  - Verified on phone: no
- [ ] Swap alternatives filtered by equipment/intent/limitations; "Use from now on" proposals (FR-15)
- [x] S11 review fixes (one report per tap, local date + session in note, rest links last exercise, option rows, discard undo, edited set prefills next)
- [x] Today S01/S02/D01: Full/Short/Priority only from the routine, Course strip, plan purpose, resume card, time plan recorded in the session
  - Verified on phone: no
- [ ] "Why this is here" per block, Dillan's sentence, S03 check-in, missed-session card, custom time
- [ ] S08 Progress: objectives, Steady weeks, measurements + manual entry (FR-10)
- [ ] Plan + Routine editor (D02), exercise detail; transition rest editable (FR-05)
- [ ] S21 Your data, S20 first-visit offline, all states incl. conflict card (AT-29…36)
- [ ] Profile and Settings shells: equipment, goals, limitations, units; Your data section (FR-01, FR-17)
- [ ] Exercise preferences: avoid / prefer with reason; swap alternatives honor them (FR-01, FR-08) — from docs/product/fitbod-feature-map.md
- [ ] Log a past session from Train: date, time, exercises, sets; "Entered by you" (FR-07, FR-16)
- [ ] S12 asks experience; Profile: experience, specific training days, start of week (FR-01)
- [ ] Equipment locations and temporary availability; unavailable-gear note on Today (FR-04)
- [ ] S04: a changed set prefills the next set (FR-07)
- [ ] Duration-type sets and timed intervals in S04 and the routine editor (FR-05, FR-07)
- [ ] S08 History: sets done vs planned per movement pattern, per week; no target ring, no streaks (FR-10)
- [ ] S08 objective detail: estimated 1RM labeled with formula and version, same exercise and unit only (FR-10)
- [ ] S17 keyboard-open card layout; S18 rest-ended state; pause/resume (FR-07)

# Phase 2
- [ ] ai-reviewer agent added to .claude/agents before the first Phase 2 review
- [ ] S09 Dillan chat + proposal card lifecycle (FR-12, §7.3)
- [ ] S10 Override sheet (FR-15)
- [ ] S13 Directives, S14 Memory, periodic review (FR-13, FR-08, FR-11)
- [ ] Dillan's sentence on Today replaces the stored purpose text, with fallback
- [ ] Dillan proposes "avoid this exercise" after repeated swaps; proposal card, never self-applied (FR-15, §7.3)
- [ ] Starting loads and progression as proposals, or bounded adjustments under an approved rule (FR-03, §7.2)
- [ ] "Build a session for these muscles" as a proposal that schedules an ad-hoc session (FR-07, FR-12)

# Phase 3
- [ ] Release gate: review the S11 escalation placeholder copy before release
- [ ] S15 Coach workspace, coach invite, privacy & data (FR-14, FR-17)
- [ ] S19 Install, S22 Reminders with push detection and email fallback, S23 Health data (FR-11, FR-16)
- [ ] Offline / resume / update behavior tested against AT-29…36

# Phase 5
- [ ] Optional baseline assessments: reviewed protocols, versioned, skippable, no percentile or reminder dot (FR-01, FR-10)

- [x] S08 Progress (goals, steady weeks, body, measurement entry); Improve/Maintain/Defer level blocked: needs a goals column
