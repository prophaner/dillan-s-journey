# Dillan V1 — build plan and decisions (branch `claude/v1-release`)

Owner request (2026-10-31): build the V1 release on a branch while the TV is unavailable.
Sources, in priority order:
1. `docs/v1/dev-brief.md` — functional semantics, privacy, acceptance.
2. `docs/v1/h10-design.md` — heart-rate source (Polar H10 via a web relay). Replaces every Apple Watch / iPhone companion part of the other docs.
3. `design/v1/docs/05-developer-handoff.md` — screens S01–S15, TV input model, copy, acceptance 1–38.
4. `design/v1/docs/02-information-architecture.md`, `03-user-flows.md`, `04-design-system.md`, mockups in `design/v1/mockups`, reference behavior in `design/v1/prototype/js/*.js`.
5. Existing brand: `src/styles/tokens.css`, `src/components/dillan/*`, fonts. Keep them.

## Decisions (reversible, recorded here)

| # | Decision | Why |
|---|---|---|
| D1 | Heart rate comes from a Polar H10 read by the `/relay` page (Web Bluetooth, Chrome on Android or Chrome/Edge on a laptop) and posted to `hr_ingest`. No iOS/watchOS code in V1. | Owner chose H10; web only. |
| D2 | Old brief-v2 features (Today, Train, Plan, Progress, Dillan chat, onboarding, profile/equipment/limitations, measurements, conflict cards) are **parked**: their routes are removed from the route tree; their tables are left untouched; their lib files stay until a later cleanup. | Narrow V1; no destructive DB change. |
| D3 | New V1 tables use new names (`workout_templates`, `workout_sessions`, ...) so they never collide with the parked `sessions`, `set_logs`, etc. One additive migration: `drizzle/migrations/0006_v1_core.sql`. **Not applied** until the owner approves it. | CLAUDE.md rule 3. |
| D4 | The server is authoritative for session state. Every session change goes through a `security definer` Postgres RPC that takes `command_id` (idempotency), `expected_revision`, `source` (`phone`/`desktop`/`tv`) and client time, and returns the new row. Ended is terminal. One unfinished session per user is a partial unique index. | Brief "Session state machine". |
| D5 | Shared pure TypeScript in `src/v1/core/*` (no React, no Supabase): step builder, engine reducer, timing, freshness, zone accounting, week metrics, validation. The same zone module computes live values and the saved summary (`algorithm_version` stored). | Brief "Zone model"; one spec for live and history. |
| D6 | Realtime: clients subscribe to `postgres_changes` on their own `workout_sessions` row and `hr_live` row (RLS-filtered, per user). Nothing is broadcast on device-wide or public channels. | Brief privacy rules. |
| D7 | Auth: Supabase Auth email OTP (6 digits) and phone OTP. SMS needs a provider (Twilio/MessageBird/Vonage) configured in Supabase Auth by the owner; until then the SMS option shows "SMS isn't set up yet" and email works. | Brief F01; no invented credentials. |
| D8 | TV sign-in uses device authorization: TV calls server fn `tvPairStart` → gets `code` (DLN-XXXX, 5 min, single use) + a `pairing_secret` kept only in TV memory. Phone (signed in) calls RPC `approve_pairing(code)`. TV polls `tvPairStatus(id, secret)`; on approval the server (service role, server-only) mints a one-time magic-link `token_hash` for that user and returns it **only** to the caller holding the secret; the TV exchanges it with `verifyOtp` for its own Supabase session. No token in QR/URL. Users with no email get a non-deliverable placeholder email on their auth record for this purpose only (documented). | Brief "device-authorization pattern". |
| D9 | TV grants are rows in `device_grants` holding the TV's auth `session_id`; lock/switch/remove/revoke call RPCs that delete that `auth.sessions` row (refresh token dies immediately; the access token can live ≤1 h, so the TV app also re-checks its grant on every load and every 60 s). | Server-side revocation. |
| D10 | Session tokens stay in supabase-js storage (localStorage) as today, not httpOnly cookies. On a TV, the app wipes Supabase storage on lock. Documented deviation from handoff 4.1. | Matches current working auth; cookie migration is a separate task. |
| D11 | The TV surface is `/tv/*` in the same bundle, dark theme, a 1920×1080 canvas scaled to the viewport, D-pad focus engine ported from `design/v1/prototype/js/dpad.js`. V1 runs in the Fire TV's Silk browser; an Android WebView wrapper is a later, device-specific step (needs the Fire TV OS line). | Brief: build the TV route now, don't claim an untested APK. |
| D12 | Offline: a bounded per-user, per-session command queue in localStorage (max 200). Never replayed under another user. Notes keep `pendingNotes` per handoff 4.7. The old IndexedDB outbox is not used by V1. | Simpler; brief "bounded queue tied to their original user/session". |
| D13 | Session outcome: `completed` only when every prescribed set is `done`; otherwise `partial` (UI label "Ended early"). Skipped sets therefore make a session partial. Discard is explicit and excluded from progress. | Brief wins over handoff 4.4. |
| D14 | Progress counts **completed** sessions toward the weekly goal and trend; partial sessions are shown separately with their active minutes ("+1 ended early"). | Brief over handoff 4.6. |
| D15 | Zone accounting from samples: each valid sample holds forward to the next sample or 10 s, intersected with active (unpaused) intervals inside the session; the rest is Unmeasured. Live freshness: ≤10 s Live, ≤30 s Delayed, else Unavailable. Demo samples (`is_demo`) are stored separately and never counted as real. | Brief zone rules. |
| D16 | Week = Monday–Sunday in the user's timezone; calendar day = local start date in the session's stored start timezone. Use `date-fns` + `Intl` (no new tz library unless needed: `@date-fns/tz` is acceptable). | Brief progress/calendar rules. |
| D17 | Remembered profiles on the TV: localStorage list `{userId, firstName}` only, opt-in. Not authorization. | Brief. |

## Slices (each ends with tests + typecheck + build green)

A. **Foundation**: migration 0006 (tables, RLS, RPCs, realtime publication), `src/v1/core/*` pure modules with unit tests, SQL tests run in-process with `@electric-sql/pglite` (auth stubbed), regenerated/extended Supabase types for the new tables.
B. **App shell, auth, profile, program**: nav Home/Program/Calendar; S01/S02 phone auth (email + phone OTP); S15 profile (name, units, timezone, weekly goal, devices, log out, delete account); S14 zones; S05 Program list; S06 editor with supersets, validation, draft autosave, Back guard.
C. **Training and history**: S07 choose, S08 preflight, S09 dashboard (phone controller), S10 paused, S11 summary, S12 calendar, S13 detail + notes autosave, S04 Home metrics; offline command queue; recovery after reload.
D. **TV**: `/tv` surface, focus engine, S01 first-run/chooser, S03 pairing, phone approve screen, TV Home/Program/Choose/Preflight/Dashboard/Paused/Summary/Calendar/Detail/Profile, auto-lock, switch user blanking, M3–M6.
E. **Heart rate**: `/relay` (S16) per h10-design §6, `hr_ingest`, `hr_live` realtime, health state machine, preflight/dashboard health copy, summary finalization from samples, demo source labeled.
F. **Release prep**: docs (setup, runbook, API/data, owner checklist, demo script, issue list), security review, full verification, PR.

## Out of scope for this branch (needs the owner or hardware)
Real SMS provider; applying the migration to the live database; Fire TV wrapper APK; physical H10 + TV verification; Lovable sync (only after the owner merges).

## Slice A review follow-ups (open items the schema fix could not close)
- **Applying 0006**: it is deliberately not in `drizzle/migrations/meta/_journal.json` (no snapshot either), so `drizzle-kit migrate` skips it until the owner approves. On approval, either paste it into the Supabase SQL editor (it is re-runnable) or add the journal entry + snapshot in the same change. `docs/product/next-prompts.md` plans a different "Migration 0006" (exercise_preferences) for Lovable; whichever lands second must be renumbered to 0007.
- **TV grant registration (D8/D9)**: the grant row is written by the TV after `verifyOtp`, so a client that never calls `device_grant_register` keeps an unlisted, unrevocable session. Closing it needs an owner decision to amend D8: the `tvPairStatus` server function runs `verifyOtp` itself, reads `session_id` from the minted access token and registers the grant before returning tokens to the TV. Until then the phone's "sign out everywhere" is the only remedy.
- **Pairing abuse limits**: 0006 caps live codes globally (500) and wrong guesses globally (100 per 10 min, which can pause approvals for everyone during a flood). `tvPairStart` and the phone approve path must add a per-IP limit on top (Slice D).
- **Paired TV scope**: `v1_is_device_session()` refuses approve/deny/preview pairing, revoking other devices, `delete_my_v1_data` and template/zone writes to a TV session that has a grant row. The TV UI must not offer those actions.
