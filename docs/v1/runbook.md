# Dillan V1 — runbook

Who does what: the **owner** merges, approves schema, applies SQL and publishes. Claude works on
`claude/<topic>` branches and never commits to `main`, pushes for the owner, force-pushes or
applies schema.

## 1. Deploy

1. **Checks green on the branch** (Claude reports the HEAD hash they ran on):
   `npx vitest run`, `npx tsc --noEmit`, `npx eslint src`, `npm run build`.
2. **Owner merges** the PR from `claude/v1-release` into `main` on GitHub.
3. **Lovable sync:** Lovable pulls `main` into the editor automatically. Check the editor's
   history shows the merge commit and the preview builds.
4. **Schema:** if this is the first V1 deploy, apply 0006 now (`setup-owner.md` §1) and run
   its verify queries. Later migrations follow the same rule: owner approves, then applies.
5. **Publish:** Lovable → **Publish → Update**. The published URL
   (`https://dillan-s-journey.lovable.app`) is what the TV, relay and phones use.
6. **Smoke test on the published URL** (10 min):
   - `/auth`: email code arrives and signs in.
   - Program: create and save a workout. Home and Calendar load (no "Couldn't load").
   - Start the workout on the phone, complete a set, pause, resume, end; summary shows.
   - `/tv` in a desktop browser: Get started → approve on the phone → TV Home.
   - `/relay` in desktop Chrome: page loads and shows Connect strap (or the unsupported message).
7. Note the deployed commit and date in `docs/CHANGELOG.md`.

## 2. Roll back the app (code)

Fast and safe; does not touch data.

1. On GitHub, open the merged PR → **Revert** → merge the revert PR (owner). Or ask Claude to
   prepare `git revert -m 1 <merge-commit>` on a `claude/revert-…` branch for review.
2. Lovable syncs `main`; **Publish → Update**.
3. Migration 0006 can stay applied: it is additive and the parked app does not use the V1
   tables. One behavior change remains for the parked app: `profiles` rows can no longer be
   deleted by clients (no parked code path does this).

Do **not** use Lovable's "restore to version" on the editor if it would rewrite git history
(AGENTS.md: never rewrite published history).

## 3. Roll back the schema (0006 down) — owner decision only

Only if 0006 itself is broken and a forward fix is not possible. **This permanently deletes all
V1 data** (workouts, sessions, notes, heart rate, paired TVs). Before running it:

1. Owner decides in writing (PR comment) that V1 data may be lost.
2. Export what must be kept: Supabase dashboard → Table editor → each V1 table → Export CSV, or
   ask for a `pg_dump` of the 14 tables.
3. Roll back the app code first (§2), so nothing calls the dropped RPCs.

Down script (review before running; not stored as a migration on purpose):

```sql
begin;
-- Realtime publication
alter publication supabase_realtime drop table public.workout_sessions, public.hr_live, public.hr_sensors;

-- RPCs and helpers
drop function if exists public.delete_my_v1_data(), public.revoke_device_grant(uuid),
  public.device_grant_touch(text, boolean), public.device_grant_register(text, text),
  public.deny_pairing(text), public.approve_pairing(text, boolean), public.pairing_preview(text),
  public.v1_first_name(uuid),
  public.v1_pairing_lookup(text, uuid), public.pairing_cancel(uuid, text),
  public.pairing_consume(uuid, text), public.pairing_status(uuid, text),
  public.v1_pairing_check_secret(public.pairing_challenges, text),
  public.pairing_create(text, text, text, uuid), public.v1_sha256_hex(text),
  public.v1_pairing_code_hash(text),
  public.hr_ingest(uuid, uuid, uuid, text, text, timestamptz, jsonb, boolean, jsonb, text, text),
  public.hr_forget_sensor(), public.hr_request(integer), public.server_time(),
  public.session_hr_finalize(uuid, bigint[], bigint, integer, text[]),
  public.session_note_save(uuid, text, integer),
  public.session_command(uuid, uuid, integer, text, text, jsonb, timestamptz),
  public.session_start(uuid, uuid, boolean, text, timestamptz, boolean);

-- profiles: restore the Phase-0 policy (needs v1_is_device_session gone from the policies first)
drop policy if exists "profiles: owner read" on public.profiles;
drop policy if exists "profiles: owner insert" on public.profiles;
drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner all" on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
grant delete on public.profiles to authenticated;

-- Tables (children first)
drop table if exists public.hr_samples, public.hr_demo_samples, public.hr_live, public.hr_sensors,
  public.hr_sources, public.session_summaries, public.session_notes, public.session_commands,
  public.workout_sessions, public.zone_configs, public.workout_templates, public.device_grants,
  public.pairing_approve_failures, public.pairing_challenges;

drop function if exists public.v1_is_device_session(), public.v1_engine_state(public.workout_sessions);
drop function if exists public.v1_sessions_immutable(), public.v1_templates_guard(),
  public.v1_engine_apply(jsonb, text, jsonb, integer, bigint), public.v1_build_steps(jsonb),
  public.v1_template_errors(text, jsonb), public.v1_exercise_errors(jsonb, text),
  public.v1_trim(text), public.v1_is_weight(jsonb), public.v1_is_num(jsonb, numeric, numeric),
  public.v1_is_int(jsonb, numeric, numeric), public.v1_ts(bigint), public.v1_ms(timestamptz);

-- Optional: profiles.weekly_goal is harmless to keep; drop only if you want a pure revert.
-- alter table public.profiles drop column if exists weekly_goal;
commit;
```

Notes:
- `v1_engine_state` takes the `workout_sessions` row type, so it goes after the table (or use
  `drop table … cascade`, which you should avoid: it hides what else was dropped).
- Placeholder emails (`tv+<id>@users.dillan.invalid`) added to phone-only accounts for TV
  sign-in (D22) stay on `auth.users`; they are never mailed and do no harm.
- Re-applying 0006 later is safe (it is re-runnable).

Prefer a **forward fix** (a new migration 0007 with the correction, owner-approved) whenever the
data should be kept.

## 4. Incident checks

Start from the symptom. "Logs" means Lovable → Cloud → Logs (or Supabase dashboard → Logs:
API, Postgres, Auth, Realtime).

| Symptom | Check | Likely fix |
|---|---|---|
| Every V1 screen shows "Couldn't load" | `setup-owner.md` §1 verify query 1 | 0006 not applied, or applied to the wrong project |
| No sign-in email / no code in it | Auth logs for the send; email template contains `{{ .Token }}`; SMTP rate limit | `setup-owner.md` §2; custom SMTP |
| "SMS isn't set up yet" | Auth → Providers → Phone enabled? | `setup-owner.md` §3 |
| Code always "doesn't match" | Code older than OTP expiry; second request replaced the first | Use the newest code; expiry 600 s |
| TV pairing fails to show a code, or says it couldn't finish signing in | Server logs for `tvPairStart`/`tvPairStatus`; `SUPABASE_SERVICE_ROLE_KEY` present in hosting (do not print it) | Restore the secret in Lovable Cloud; retry with New code |
| TV pairing refused as rate limited | Per-IP limit (20 codes / 10 min) or SQL limits (10 wrong per user, 100 global per 10 min) | Wait 10 min |
| Phone and TV disagree about the workout | Realtime enabled? `select * from pg_publication_tables where pubname='supabase_realtime'` lists `workout_sessions`; Realtime logs | Reload both; the server row wins. Re-add the table to the publication if missing |
| TV shows another person's data after switch | **Stop using the TV for private data**; record steps; revoke all grants (Profile → Log out everywhere on each phone) | Treat as a security bug (acceptance 9) |
| A revoked TV still shows data | Should end within 60 s (`device_grant_touch`); access tokens can live ≤1 h | If longer: reload the TV page; report |
| Heart rate "Relay offline" | Relay page open, in front, screen on, signed in as the wearer? `select mode, last_seen_at from hr_live where user_id = '<uid>'` | Bring relay to the front; Reconnect; see `h10-design.md` §8 |
| BPM shows "Delayed"/"No recent reading" with the relay sending | Clock skew: compare relay "Last sent" vs TV; Realtime latency | Reload the TV (re-syncs `server_time`); if persistent, measure (checklist §4) |
| Summary stays "pending" | `select hr_status, hr_finalize_dirty from session_summaries where session_id = '<id>'`; server logs for `finalizeSessionHr` | Opening the summary retries finalize |
| "A workout is running" but none visible | `select id, state, created_at from workout_sessions where user_id = '<uid>' and state <> 'ended'` | Open it from Home ("Back to workout") and End, or Cancel a preparing one |
| Delete account fails ("Nothing was deleted") | Server logs for `deleteMyAccount`; service-role secret present | Restore the secret; retry |

Never paste user notes, heart-rate samples, OTPs, contact details or any key into issues, chat
or prompts. Query by user id.
