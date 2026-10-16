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
- [ ] Swap alternatives filtered by equipment/intent/limitations; "Use from now on" proposals (FR-15)
- [x] S11 review fixes (one report per tap, local date + session in note, rest links last exercise, option rows, discard undo, edited set prefills next)
- [x] Today S01/S02/D01: Full/Short/Priority only from the routine, Course strip, plan purpose, resume card, time plan recorded in the session
  - Verified on phone: no
- [ ] "Why this is here" per block, Dillan's sentence, S03 check-in, missed-session card, custom time
