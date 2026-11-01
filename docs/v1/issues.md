# Dillan V1 — issue list

Updated 2026-10-31 (Slice F). Blockers need something only the owner, hardware or external
credentials can provide; nothing in the code can close them. Optional items can ship later.

## Blockers (before V1 can be called released)

| # | Blocker | Needs | Where |
|---|---|---|---|
| B1 | Migration 0006 is not applied to the live database; the live app has no V1 tables | Owner approval + apply | `setup-owner.md` §1 |
| B2 | Email sign-in sends no 6-digit code until the templates contain `{{ .Token }}`; built-in email sender may not reach a second household member | Owner: Auth templates, OTP expiry 600 s, custom SMTP | `setup-owner.md` §2 |
| B3 | SMS sign-in (F01) is not configured; the app shows "SMS isn't set up yet" | Owner: SMS provider account and credentials | `setup-owner.md` §3 |
| B4 | Fire TV OS and browser unknown (Gate G0). If it runs Vega OS with no usable browser, `/tv` cannot run on it | Owner: TV model + OS line; Silk installed | `spike/CHECKLIST.md` §0, `physical-test-checklist.md` §1 |
| B5 | Polar H10 → Web Bluetooth → TV path never run on hardware (secure pairing on firmware 4.x unverified per relay OS; latency unmeasured) | Strap, relay device, TV | `spike/CHECKLIST.md`, `physical-test-checklist.md` §2, §4 |
| B6 | Silk behavior unverified: key codes, Back as popstate, wake lock, 1920×1080 scaling, Realtime reconnect (checked in desktop Chrome only) | Fire TV | `physical-test-checklist.md` §3 |
| B7 | Phone checks on real devices (sign-in, offline, lock screen, 320 px) not done | Owner's phones | `physical-test-checklist.md` §5 |
| B8 | Two-user demo (acceptance 38) not run | Two people, TV, strap | `setup-owner.md` §11 |
| B9 | Branch not merged; Lovable sync and Publish happen only after the owner merges | Owner | `runbook.md` §1 |
| B10 | Owner acknowledgement of the deviations marked **(ack)** below | Owner | this file |
| B11 | Drizzle journal entry + snapshot for 0006 must be added when it is applied (deliberately absent so `drizzle-kit migrate` skips it) | Owner approval first | `build-plan.md` "Slice A review follow-ups" |
| B12 | Security review of the full branch (build-plan Slice F) before merge | Reviewer run | — |

## Optional improvements (not blocking)

| # | Improvement | Notes |
|---|---|---|
| O1 | Register the TV grant inside `tvPairStatus` (server runs `verifyOtp`, reads `session_id`, registers) | Closes the gap where a client that never calls `device_grant_register` keeps an unlisted session. Needs the owner to amend D8. Today: "Log out everywhere" is the remedy |
| O2 | Make `pairing_consume` retryable | A transient Auth Admin failure uses up the code (TV asks for a new one). Needs a 0006/0007 change |
| O3 | Per-IP limit on the phone approve path | Only SQL limits apply there (10 wrong per user, 100 global per 10 min); needs a server-function wrapper |
| O4 | Shared store for the per-IP limiter | In memory per server instance today |
| O5 | httpOnly cookie sessions instead of localStorage tokens | D10; separate auth migration |
| O6 | Fire OS TV shell (WebView + native BLE, `firetv_native` source) | V1.1, only if G0 = Fire OS and G1 passes; removes the separate relay device |
| O7 | Muted looping video fallback to keep the TV awake | h10-design §8 mentions it; V1 relies on the Screen Wake Lock API only |
| O8 | Broadcast transport for heart rate | Only if measured `postgres_changes` p95 > 5 s (h10-design §5.5) |
| O9 | Scoped relay tokens | The relay holds a full user session (risk 12); Remove + sign-out is the remedy today |
| O10 | Second contact per account with verified linking | D18 defers it |
| O11 | Regenerate `src/integrations/supabase/types.ts` from the live schema after 0006 | V1 types are hand-written today |
| O12 | Remove parked brief-v2 lib files, components and (much later, with the owner) tables | D2 keeps them |
| O13 | Prune `session_commands` (idempotency log) after e.g. 90 days | Grows by one row per tap; small for a household |
| O14 | Delete-after-finalize for heart-rate samples | Brief keeps them; only with owner approval (Q8) |
| O15 | Silent strap reconnect across page loads | Waits for Chrome to ship `getDevices()` |
| O16 | Delete `docs/v1/owner-setup.md` once `setup-owner.md` is accepted | Marked superseded |
| O17 | `npx eslint src` reports prettier formatting errors (766, plus one `prefer-const`) in 50 pre-V1 files this branch never changed (parked `src/lib/*`, older `src/components/dillan/*`, `src/integrations/supabase/*` except `types.ts`, older `src/test/*.test.ts`); none in `src/v1`, `src/routes` or `src/test/v1` | Pre-existing on `origin/main`. `src/integrations/supabase/types.ts` is the one file this branch changed (it hand-added the V1 types, O11): its errors went from 922 on `origin/main` to 1651 with those additions, and the review fixes ran `prettier --write` on it, so it now has none. Fix the rest with one formatting-only commit (`npx prettier --write` on those files) when nobody else (Lovable) has edits in flight |
| O18 | A paired TV's token is still a full GoTrue session for its user. The phone routes refuse it (`/_authenticated` sends a browser holding the TV marker back to `/tv`) and the SQL refuses it for templates, zones, profile, notes, pairing, revoke and delete; but someone with devtools on the TV could still call GoTrue directly (`auth.updateUser`, global sign-out) | Owner: turn on Supabase Auth "Secure password change" (reauthentication) and keep "Secure email change" on. Full fix is scoped TV tokens (with O1) |

## Known deviations from the design docs

Brief = `docs/v1/dev-brief.md`; handoff = `design/v1/docs/05-developer-handoff.md`.
D-numbers are in `docs/v1/build-plan.md`.

| # | Deviation | From | Why |
|---|---|---|---|
| X1 | Polar H10 via `/relay` (Web Bluetooth) replaces the Apple Watch / iPhone companion; no Swift code, no HealthKit (D1) | Brief F03, architecture, data path | Owner chose H10; web only. `docs/v1/h10-design.md` governs |
| X2 | **(ack)** Heart-rate Realtime is per user, not per session | Brief "session-scoped realtime channel" | HR is needed before a session exists; rows carry `rev`, `measured_at`, `active_session_id` (h10-design §5.5) |
| X3 | **(ack)** Session tokens in localStorage, not secure cookies; TV wipes them on lock (D10) | Brief "avoid long-lived bearer tokens in local storage", handoff 4.1 | Matches working auth; cookie migration is separate (O5) |
| X4 | TV runs in Silk, no packaged APK (D11) | Brief "thin TV wrapper" | No confirmed device OS yet; brief says don't claim an untested APK |
| X5 | Skipped sets make a session "partial" (UI "Ended early") (D13) | Handoff 4.4 | Brief: completed only when every prescribed set is done |
| X6 | Progress counts completed sessions only; partial shown separately as "+N ended early" (D14) | Handoff 4.6 | Brief progress rule |
| X7 | One contact per account; no add-email/phone or merge prompt (D18) | Prototype merge prompt, brief "adding a second contact" | Prompt would reveal account existence; deferred |
| X8 | Log out ends this device only; "Log out everywhere" is separate (D19) | — | Handoff §5 copy |
| X9 | Offline Pause/End take effect when they reach the server, and the banner says so (D21) | — | Server applies at `now()`; changing it needs a schema change |
| X10 | Phone-only accounts get a non-deliverable placeholder email for TV sign-in (D22) | — | Magic-link minting needs an email; never shown or mailed |
| X11 | TV screens are app state at `/tv`, no child URLs (D23) | Handoff route list | Deterministic Back and focus in Silk |
| X12 | Remembering a profile on the TV is opt-in, default Off (D24) | Prototype remembered everyone | Brief "remembering a profile is opt-in" |
| X13 | Heart-rate finalize is a TanStack server function (`finalizeSessionHr`), not a Supabase edge function `finalize-session-hr`; the shared zone module is `src/v1/core/zones.ts` (h10-design calls it `zoneAccounting.ts`) | h10-design §1, §5.4 | One codebase, no extra provider; same module live and saved |
| X14 | Acceptance 23 "status ended_early" is stored as `outcome = 'partial'` and labelled "Ended early" | Handoff acc. 23 | Brief outcome names |
| X15 | The code screen does not state a fixed expiry | Handoff copy "Codes expire after 10 minutes" | Expiry is a Supabase setting (D20); the app cannot guarantee it |
| X16 | Weeks are fixed Monday–Sunday; the parked `week_start` profile column is not used | — | Brief PM default |
| X17 | No Watch start-acknowledgement gate; Start with live data needs a fresh reading instead | Brief "wait for Watch start acknowledgement" | No Watch in V1 (h10-design §9) |
| X18 | A discarded session is titled "Workout canceled", gets no summary and is excluded from progress | — | Brief: discard does not count |
