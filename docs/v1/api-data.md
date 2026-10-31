# Dillan V1 — API and data

Schema: `drizzle/migrations/0006_v1_core.sql` (identical copy `docs/v1/v1-schema.sql`).
**Not applied to the live database until the owner approves it** (`setup-owner.md` §1).
Client contract: `src/v1/data/api.ts` (`DillanApi`); Supabase implementation `supabase-api.ts`;
dev-only twin `mock-api.ts`. Hand-written types for the V1 tables/RPCs are in
`src/integrations/supabase/types.ts` until Lovable regenerates it.

## Conventions

- Every V1 table has RLS on. Supabase's default grants are revoked; clients get `select` on their
  own rows and only the few direct writes listed below. Every write with business rules is a
  `security definer` function with `set search_path = ''` that takes the owner from `auth.uid()`,
  never from an argument.
- `v1_is_device_session()` is true for a paired TV's auth session. Account-level actions
  (approve/deny/preview pairing, revoke other devices, delete data, template/zone/profile writes)
  are refused to it server-side.
- Engine timestamps inside jsonb (`results[].at`, `pauses[].from/to`) are epoch milliseconds,
  matching `src/v1/core/engine.ts`. Columns are `timestamptz`.
- SQL/TS twins (same fixtures run against both in `src/test/v1/`): `v1_engine_apply` ↔
  `core/engine.ts`, `v1_template_errors` ↔ `core/validate.ts`, `v1_build_steps` ↔ `core/steps.ts`.
- RPCs return `jsonb` `{ok: true, …}` or `{ok: false, error: '<code>'}`. Error codes include
  `stale_revision`, `session_ended`, `session_running`, `command_id_reused`, `invalid_payload`,
  `template_not_found`, `zones_not_configured`, `rate_limited`, `expired`, `already_used`,
  `not_found`, `for_other_user`, `device_session_forbidden`, `invariant`.

## Tables

All `user_id` columns reference `auth.users(id) on delete cascade`.

| Table | Contents | Client access |
|---|---|---|
| `profiles` (Phase 0, changed) | + `weekly_goal smallint default 3` (1–14). Name, timezone, units (`weight_unit`) already exist. Policy "owner all" replaced by owner read / insert / update; insert/update refused to a TV session; no client delete | read/insert/update own |
| `workout_templates` | `name` (1–60), `blocks` jsonb (validated by `v1_template_errors`), `revision`, `deleted_at` (soft delete) | read own; insert/update own (trigger checks revision and validation; refused to a TV) |
| `zone_configs` | one row per user: `b1<b2<b3<b4` (≤250), `confirmed_at`, `version` | read/insert/update own (refused to a TV) |
| `workout_sessions` | `snapshot` (deep copy of the template at start), `steps`, `zone_snapshot`, `start_timezone`, `state` preparing/active/paused/ending/ended, `outcome` completed/partial/discarded, `revision`, `live_data`, `is_demo`, timing (`started_at`, `ended_at`, `paused_at`, `paused_ms`, `pauses`, `rest_started_at`, `rest_ends_at`), `cursor`, `results`, last command metadata. **One unfinished session per user** (partial unique index) | read own; writes only via RPCs; snapshot immutable (trigger) |
| `session_commands` | idempotency log: `(user_id, command_id)` unique, kind, source, expected revision, client/received time, result | read own |
| `session_notes` | one per session: `text` (≤4000), `revision` | read own; write via `session_note_save` |
| `session_summaries` | one per ended, non-discarded session: outcome, times, `local_date` (local start date in `start_timezone`), `active_ms`/`elapsed_ms`/`paused_ms`, `zone_ms[5]`, `measured_ms`, `unmeasured_ms`, `coverage`, `algorithm_version`, `zone_snapshot`, `hr_status` pending/final/no_live_data, `hr_finalize_dirty`, `hr_sources_used` | read own |
| `hr_sources` | relays: id minted by the relay, kind (`web_ble`, `demo`, reserved `firetv_native`, `watch_companion`), display name, platform, last seen, ingest rate window, `revoked_at` | read own; update own (rename / revoke only) |
| `hr_sensors` | one per user: paired strap name/serial, `forgotten_at`, `wanted_until` (HR demand window), last source, battery | read own |
| `hr_live` | one per user: `rev`, holder relay/stream, relay mode, sensor, battery, `bpm`, `contact`, `measured_at`, `last_seen_at`, `active_session_id`, `is_demo` | read own |
| `hr_samples` | real samples: `(user_id, stream_id, seq)` unique (event id), session, source, `measured_at`, `received_at`, `bpm` 25–250, `contact`; RR not stored | read own |
| `hr_demo_samples` | same shape, demo only, attach only to demo sessions | read own |
| `pairing_challenges` | TV codes: `code_hash`, `secret_hash` (sha256 only), device id/label, status awaiting/approved/denied/expired/cancelled/consumed, attempts, 5-min expiry | **none** (no grants, no policies) |
| `pairing_approve_failures` | wrong-code attempts for rate limits | **none** |
| `device_grants` | paired TVs: device id, label, the TV's `auth.sessions` id, last seen, `revoked_at` | read own |

Parked brief-v2 tables (`sessions`, `set_logs`, `routine_*`, …) are untouched and unused by V1 (D2, D3).

## RPCs (callable by signed-in users)

| RPC | Purpose |
|---|---|
| `session_start(p_command_id, p_template_id, p_live_data, p_timezone, p_client_at?, p_is_demo?)` | Creates the `preparing` session with the template snapshot and zone snapshot. Idempotent on command id. `session_running` if another unfinished session exists (a preflight left unstarted 30 min is discarded instead). |
| `session_command(p_session_id, p_command_id, p_expected_revision, p_source, p_kind, p_payload?, p_client_at?)` | Kinds: `start`, `pause`, `resume`, `complete_set` (reps, weight), `skip_set`, `undo`, `skip_rest`, `end`, `discard`. Applied at server `now()`; stale revision rejected except pause/resume/end that are still valid; ended is terminal. `end` writes the summary. |
| `session_note_save(p_session_id, p_text, p_expected_revision)` | Autosave with revision check (0/null creates). |
| `session_hr_finalize(p_session_id, p_zone_ms[5], p_unmeasured_ms, p_algorithm_version, p_sources_used?)` | Saves zone totals; enforces Σzones + unmeasured = active ±1 s. Called by `finalizeSessionHr`. |
| `server_time()` | Server clock for offset estimation (relay and viewers). |
| `hr_request(p_minutes default 10)` | Opens/extends (or with 0 closes) the HR demand window; preflight calls it on open and every 2 min. |
| `hr_forget_sensor()` | Forgets the paired strap; the relay disconnects. |
| `hr_ingest(p_source_id, p_stream_id, p_expected_user_id, p_source_kind, p_mode, p_connected_at, p_sensor, p_claim, p_samples, p_source_name?, p_platform?)` | Relay heartbeat + samples (≤30 per call). Dedupes on `(stream_id, seq)`, clamps clock skew, attaches samples to the active session (started < 6 h ago) including late backfill after End (marks the summary dirty), keeps `hr_live` monotonic, returns `stop_requested`/`superseded`/`revoked` signals and per-sample rejections. Per-source rate limit. |
| `pairing_preview(p_code)` | Phone: who/what the TV request is (device label, created time, intended user). |
| `approve_pairing(p_code, p_confirm_other_user?)` / `deny_pairing(p_code)` | Phone approves/denies. Per-user (10 wrong codes / 10 min) and global (100 / 10 min) wrong-guess limits. |
| `device_grant_register(p_device_id, p_label?)` | TV, right after `verifyOtp`: records its own auth session as a grant (needs a pairing consumed in the last 10 min). |
| `device_grant_touch(p_device_id)` | TV on load and every 60 s; false once revoked or its auth session is gone. |
| `revoke_device_grant(p_grant_id)` | Lock / remove / revoke: deletes the TV's `auth.sessions` row (refresh token dies at once; an access token can live ≤1 h, hence the 60 s touch). |
| `delete_my_v1_data()` | Deletes every V1 row the caller owns (see Deletion). Refused to a TV. |

Service-role only (never callable by app users): `pairing_create`, `pairing_status`,
`pairing_consume`, `pairing_cancel`, `v1_pairing_lookup`, `v1_pairing_check_secret`.
Pure helpers (`v1_engine_apply`, `v1_template_errors`, `v1_build_steps`, …) are executable by
`authenticated` because constraints/triggers run as the caller; they read no tables.

## Server functions (TanStack Start, `src/v1/data/*.functions.ts`)

| Function | Auth | What it does |
|---|---|---|
| `tvPairStart({deviceId, label?, forUserId?})` | none (TV is signed out); per-IP limit 20 / 10 min (D26) | Generates the secret, calls `pairing_create` with sha256(secret); returns code, challenge id, secret (kept only in TV memory), expiry. |
| `tvPairStatus({challengeId, secret})` | none; per-IP limit 600 polls / 10 min | `pairing_status`; on approval `pairing_consume` then `auth.admin.generateLink({type:"magiclink"})` for the approver and returns the one-time `token_hash` only to the secret holder. Phone-only accounts get the placeholder email first (D22). |
| `tvPairCancel({challengeId, secret})` | none | `pairing_cancel`. |
| `finalizeSessionHr({sessionId})` | caller's Supabase session (RLS client, no service role) | Reads the session's samples, computes zones with `core/zones.ts` (`core/finalize.ts`), calls `session_hr_finalize`; recomputes if late samples arrived meanwhile. Any viewer of a pending summary triggers it. |
| `deleteMyAccount()` | caller's session | `delete_my_v1_data()` as the caller, then `auth.admin.deleteUser` (cascades to the profile and every owned row), then local sign-out (D19). |

The service-role client is only `src/integrations/supabase/client.server.ts`, imported inside
handlers. The per-IP limiter (`rate-limit.ts`) is in memory per server instance.

## Realtime

Supabase Realtime `postgres_changes`, RLS-filtered, one subscription per signed-in user
(D6). Published tables: `workout_sessions`, `hr_live`, `hr_sensors` (added by 0006).

| Channel (client name) | Table / filter | Used by |
|---|---|---|
| `v1-sessions-<uid>-<rand>` | `workout_sessions`, `user_id=eq.<uid>` | phone, desktop, TV session views |
| `v1-hr-<uid>-<rand>` | `hr_live`, `user_id=eq.<uid>` | preflight, dashboard, Home, S14, TV |
| `v1-hrs-<uid>-<rand>` | `hr_sensors`, `user_id=eq.<uid>` | same |

- Nothing is broadcast on device-wide or public channels; there is no client Broadcast.
- `hr_live`/`hr_sensors` have a surrogate primary key so Realtime DELETE events (which skip
  RLS) never carry a user id; clients ignore `hr_live` DELETE events.
- Viewers re-select rows and `server_time()` on every (re)subscribe and on `visibilitychange`;
  rows with `rev` ≤ the cached one are ignored.
- Lock / switch user / revoke: `removeAllChannels()` before the blank frame.
- The channel is per user, not per session (deliberate, h10-design §5.5): heart rate is needed
  before a session exists. Every row still carries `rev`, `measured_at` and `active_session_id`.

## Client-side storage

| Key / place | Contents | Cleared |
|---|---|---|
| Supabase auth (`sb-*-auth-token`, localStorage) | session tokens (D10) | sign-out; TV lock wipes it |
| Session command queue (localStorage on phone; memory on TV) | ≤200 pending commands per user + session | on ack; account deletion; never replayed under another user |
| Pending notes | unsent note text per user | on save; account deletion |
| Workout editor draft | per user, per workout | save / discard / sign-out |
| TV remembered profiles | `{userId, firstName}`, opt-in (D17, D24) | Remove my profile |
| `dillan.tv.session` | TV marker: user id + grant id (D25) | lock |
| `dillan.relayId` | relay source id | revoke / wearer switch mints a new one |
| `dillan.mock*` (dev only) | mock backend state | `?mock=0`, clearing site data |

## Retention and deletion

- **Workout history** (sessions, snapshots, set results, summaries, notes, command log) is
  kept until the user deletes it (account deletion or `delete_my_v1_data`). Templates are
  soft-deleted (`deleted_at`) so old sessions stay readable.
- **Heart-rate samples** are kept with their session until the session/account is deleted, so
  zone totals can be recomputed after backfill (brief retention rule, h10-design §5.7).
  RR intervals are not stored. Delete-after-finalize would be a deviation and needs the owner (Q8).
- **Demo samples** live only in `hr_demo_samples` and only on demo sessions.
- **`hr_live`**: one row per user, overwritten in place; `bpm` cleared when no HR is wanted.
- **Pairing challenges and wrong-code records**: purged after 1 day (on the next `pairing_create`).
- **Device grants**: kept (with `revoked_at`) until account deletion.
- **No second analytics copy** of any of this exists. Logs exclude samples, notes, OTPs and contacts.

**Delete my data (`delete_my_v1_data`)** removes, for the caller: TV auth sessions and
`device_grants`, pairing rows, `hr_live`, `hr_samples`, `hr_demo_samples`, `hr_sensors`,
`hr_sources`, `session_commands`, `workout_sessions` (cascading to notes and summaries),
`workout_templates`, `zone_configs`. Profile and auth user stay.

**Delete account (`deleteMyAccount`)** does the above, then deletes the auth user; every owned
row in every schema cascades (V1 and parked Phase-0 tables). This device's queued commands and
pending notes are cleared too. Other devices are signed out when their tokens fail.
