-- Dillan · Phase 0 schema — FOR REVIEW, NOT YET APPLIED.
-- Brief §9 (data model), §9.1 (invariants), §11 (permission defaults).
-- Every table: owner_id, created_at, updated_at, version (conflict checks), archived_at (archive ≠ delete).

create type public.record_source as enum ('user','coach','dillan','import','system');
create type public.grant_scope   as enum ('progress','goals_plan','limitations','measurements');
create type public.grant_status  as enum ('invited','accepted','revoked');

-- Profiles -----------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  weight_unit text not null default 'lb' check (weight_unit in ('lb','kg')),
  length_unit text not null default 'in' check (length_unit in ('in','cm')),
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);

-- Coach access grants: only the trainee creates/revokes; coach may only accept.
create table public.coach_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,                -- the trainee
  coach_id uuid,                         -- set when the coach accepts
  invite_email text not null,
  scopes public.grant_scope[] not null default '{}',
  status public.grant_status not null default 'invited',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);

-- One checking function, used by every coach SELECT policy.
create or replace function public.coach_can_read(_owner uuid, _scope public.grant_scope)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_access_grants g
    where g.owner_id = _owner and g.coach_id = auth.uid()
      and g.status = 'accepted' and g.revoked_at is null
      and _scope = any (g.scopes)
  )
$$;

-- Owned tables (abbreviated column lists shown; full columns in the plan) ----
-- equipment_items(owner_id, type, quantity, capacity, increments, attachments jsonb, available bool, source)
-- goals(owner_id, parent_id, title, priority, metric, target, baseline_ref, deadline, status, source)
-- exercises(owner_id NULL = shared reviewed library, name, movement, muscles[], cues[], equipment[], content_source, review_status)
-- routine_template_versions(owner_id, routine_id, version_no, title, purpose, status draft|approved, locked_at, source, approved_by)
-- routine_blocks(owner_id, template_version_id, position, block_type, rounds, rest_seconds, priority, prescriptions jsonb)
-- goal_links / limitation_links(owner_id, goal_id|limitation_id, exercise_id|block_id, relationship_note)
-- scheduled_sessions(owner_id, planned_date, template_version_id, status, source)
-- sessions(owner_id, template_version_id, plan_snapshot jsonb, time_choice, started_at, ended_at, local_date, timezone, completion, feedback jsonb)
-- set_logs(owner_id, session_id, prescription_ref, exercise_id, set_no, side, reps, load, load_unit, entered_value text, rir, logged_at, idempotency_key UNIQUE, source)
-- limitations(owner_id, category, location, side, context, status, review_date, coach_shareable bool, source)
-- measurements(owner_id, type, site, side, value, unit, entered_value text, method, observed_at, source, provenance jsonb)

-- Grants + RLS pattern applied to EVERY owned table (example: set_logs) -----
--   grant select, insert, update, delete on public.set_logs to authenticated;
--   grant all on public.set_logs to service_role;
--   alter table public.set_logs enable row level security;
--   create policy "owner all"   on public.set_logs for all to authenticated
--     using (owner_id = auth.uid()) with check (owner_id = auth.uid());
--   create policy "coach read"  on public.set_logs for select to authenticated
--     using (public.coach_can_read(owner_id, 'progress'));
--
-- Scope per table:
--   progress      → sessions, set_logs, scheduled_sessions
--   goals_plan    → goals, routine_template_versions, routine_blocks, goal_links, equipment_items
--   limitations   → limitations (only rows with coach_shareable = true), limitation_links
--   measurements  → measurements
--
-- coach_access_grants policies:
--   owner: select/insert/update/delete own rows (owner_id = auth.uid()).
--   coach: select rows where coach_id = auth.uid() OR invite_email = auth email;
--          accept via a security-definer function accept_grant(id) that only sets coach_id/status/accepted_at.
--   coaches can never change scopes or create grants.
--
-- Immutability (triggers):
--   sessions/set_logs: plan_snapshot and template_version_id cannot change after insert.
--   routine_template_versions: once locked_at is set (first use) the row is read-only; edits create version_no + 1.
--   version column bumps on every update; client sends expected version, mismatch → 409 conflict.
--
-- exercises: everyone signed in reads owner_id IS NULL rows; owners read/write their own custom exercises.
--
-- Demo data: rows inserted by migration for a synthetic "demo" routine, flagged source = 'system' and labeled "Demo" in the UI.
