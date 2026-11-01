-- Dillan V1 core schema (Slice A). DRAFT: not applied. Needs owner approval (CLAUDE.md rule 3).
-- Copy kept at docs/v1/v1-schema.sql. Additive only: no parked table is changed except
-- one nullable/defaulted column on public.profiles (weekly_goal).
--
-- Re-runnable: tables/indexes use IF NOT EXISTS, triggers CREATE OR REPLACE, policies are dropped
-- and recreated, the publication is only extended for tables not yet in it. Nothing is dropped
-- or rewritten in any table from migrations 0000-0005; the one Phase-0 policy replaced is
-- "profiles: owner all" (split so a paired TV session cannot write the profile).
--
-- Conventions
--   * Every V1 table has RLS on. Clients read their own rows; every write that carries
--     business rules goes through a SECURITY DEFINER function with `set search_path = ''`
--     that takes the owner from auth.uid() and never from an argument.
--   * Engine timestamps inside jsonb (results[].at, pauses[].from/to) are epoch milliseconds,
--     the same numbers the pure TypeScript engine (src/v1/core/engine.ts) uses. Columns are timestamptz.
--   * The session engine is v1_engine_apply(); src/v1/core/engine.ts is its twin. Both are
--     run against src/test/v1/fixtures/engine-cases.json.
--   * Templates store their ordered blocks as one jsonb document validated by v1_template_errors()
--     (twin: src/v1/core/validate.ts). Reason: a template is always read, saved, revisioned and
--     snapshotted as a whole; one document makes the snapshot a plain copy and keeps the
--     superset structure (one rounds count, one rest, >=2 consecutive members) structural.

-- ---------------------------------------------------------------------------------------------
-- Profile defaults (display_name, timezone already exist; units = existing weight_unit lb|kg;
-- weeks are fixed Monday-Sunday in V1, the parked week_start column is not used).
alter table public.profiles
  add column if not exists weekly_goal smallint not null default 3
    check (weekly_goal between 1 and 14);

-- ---------------------------------------------------------------------------------------------
-- Small pure helpers
create or replace function public.v1_ms(t timestamptz)
returns bigint language sql immutable set search_path = '' as $$
  select floor(extract(epoch from t) * 1000)::bigint
$$;

create or replace function public.v1_ts(ms bigint)
returns timestamptz language sql immutable set search_path = '' as $$
  select case when ms is null then null
              else timestamptz 'epoch' + ms * interval '1 millisecond' end
$$;

create or replace function public.v1_is_int(v jsonb, lo numeric, hi numeric)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'number'
         and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
         and (v #>> '{}')::numeric between lo and hi, false)
$$;

create or replace function public.v1_is_num(v jsonb, lo numeric, hi numeric)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'number'
         and (v #>> '{}')::numeric between lo and hi, false)
$$;

-- weight: 0..1000 in steps of 0.5 (handoff 4.3); twin: isWeight in src/v1/core/validate.ts
create or replace function public.v1_is_weight(v jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(public.v1_is_num(v, 0, 1000)
         and ((v #>> '{}')::numeric * 2) = trunc((v #>> '{}')::numeric * 2), false)
$$;

-- trims the same characters as src/v1/core/validate.ts (space, tab, CR, LF)
create or replace function public.v1_trim(t text)
returns text language sql immutable set search_path = '' as $$
  select btrim(t, E' \t\r\n')
$$;

-- ---------------------------------------------------------------------------------------------
-- Template validation (bounds: handoff 4.3). Returns [] when valid, else [{path, code}].
create or replace function public.v1_exercise_errors(ex jsonb, p text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  errs jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(ex) is distinct from 'object' then
    return jsonb_build_array(jsonb_build_object('path', p, 'code', 'invalid'));
  end if;
  if jsonb_typeof(ex->'id') is distinct from 'string' or char_length(ex->>'id') not between 1 and 64 then
    errs := errs || jsonb_build_object('path', p || '.id', 'code', 'invalid');
  end if;
  if jsonb_typeof(ex->'name') is distinct from 'string' or char_length(public.v1_trim(ex->>'name')) = 0 then
    errs := errs || jsonb_build_object('path', p || '.name', 'code', 'required');
  elsif char_length(public.v1_trim(ex->>'name')) > 60 then
    errs := errs || jsonb_build_object('path', p || '.name', 'code', 'too_long');
  end if;
  if not public.v1_is_int(ex->'reps', 1, 200) then
    errs := errs || jsonb_build_object('path', p || '.reps', 'code', 'range');
  end if;
  if coalesce(ex->>'rep_mode', '') not in ('total', 'per_side') or jsonb_typeof(ex->'rep_mode') <> 'string' then
    errs := errs || jsonb_build_object('path', p || '.rep_mode', 'code', 'invalid');
  end if;
  if coalesce(ex->>'unit', '') not in ('lb', 'kg') or jsonb_typeof(ex->'unit') <> 'string' then
    errs := errs || jsonb_build_object('path', p || '.unit', 'code', 'invalid');
  end if;
  -- weight: null/absent = bodyweight (blank is not 0); else a number 0..1000 in steps of 0.5
  if ex ? 'weight' and jsonb_typeof(ex->'weight') <> 'null' and not public.v1_is_weight(ex->'weight') then
    errs := errs || jsonb_build_object('path', p || '.weight', 'code', 'range');
  end if;
  if ex ? 'load_basis' and jsonb_typeof(ex->'load_basis') <> 'null'
     and (jsonb_typeof(ex->'load_basis') <> 'string' or ex->>'load_basis' not in ('total_external', 'per_implement')) then
    errs := errs || jsonb_build_object('path', p || '.load_basis', 'code', 'invalid');
  elsif public.v1_is_num(ex->'weight', 0, 1000)
     and (not ex ? 'load_basis' or jsonb_typeof(ex->'load_basis') = 'null') then
    errs := errs || jsonb_build_object('path', p || '.load_basis', 'code', 'required');
  end if;
  if jsonb_typeof(ex->'instructions') is distinct from 'string' then
    errs := errs || jsonb_build_object('path', p || '.instructions', 'code', 'invalid');
  elsif char_length(ex->>'instructions') > 240 then
    errs := errs || jsonb_build_object('path', p || '.instructions', 'code', 'too_long');
  end if;
  return errs;
end $$;

create or replace function public.v1_template_errors(p_name text, p_blocks jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  errs jsonb := '[]'::jsonb;
  b jsonb;
  bi int;
  p text;
  m jsonb;
  mi int;
  total int := 0;
begin
  if p_name is null or char_length(public.v1_trim(p_name)) = 0 then
    errs := errs || jsonb_build_object('path', 'name', 'code', 'required');
  elsif char_length(public.v1_trim(p_name)) > 60 then
    errs := errs || jsonb_build_object('path', 'name', 'code', 'too_long');
  end if;
  if jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_array_length(p_blocks) = 0 then
    return errs || jsonb_build_object('path', 'blocks', 'code', 'required');
  end if;
  for b, bi in select e.value, (e.ordinality - 1)::int
                 from jsonb_array_elements(p_blocks) with ordinality e order by e.ordinality loop
    p := 'blocks.' || bi;
    if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'type') is distinct from 'string'
       or b->>'type' not in ('straight', 'superset') then
      errs := errs || jsonb_build_object('path', p || '.type', 'code', 'invalid');
      continue;
    end if;
    if jsonb_typeof(b->'id') is distinct from 'string' or char_length(b->>'id') not between 1 and 64 then
      errs := errs || jsonb_build_object('path', p || '.id', 'code', 'invalid');
    end if;
    if not public.v1_is_int(b->'rest_s', 0, 600) then
      errs := errs || jsonb_build_object('path', p || '.rest_s', 'code', 'range');
    end if;
    if b->>'type' = 'straight' then
      total := total + 1;
      if not public.v1_is_int(b->'sets', 1, 20) then
        errs := errs || jsonb_build_object('path', p || '.sets', 'code', 'range');
      end if;
      errs := errs || public.v1_exercise_errors(b->'exercise', p || '.exercise');
    else
      if not public.v1_is_int(b->'rounds', 1, 20) then
        errs := errs || jsonb_build_object('path', p || '.rounds', 'code', 'range');
      end if;
      if jsonb_typeof(b->'exercises') is distinct from 'array' or jsonb_array_length(b->'exercises') < 2 then
        errs := errs || jsonb_build_object('path', p || '.exercises', 'code', 'superset_too_small');
      elsif jsonb_array_length(b->'exercises') > 6 then
        errs := errs || jsonb_build_object('path', p || '.exercises', 'code', 'superset_too_large');
      end if;
      if jsonb_typeof(b->'exercises') = 'array' then
        total := total + jsonb_array_length(b->'exercises');
        for m, mi in select e.value, (e.ordinality - 1)::int
                       from jsonb_array_elements(b->'exercises') with ordinality e order by e.ordinality loop
          errs := errs || public.v1_exercise_errors(m, p || '.exercises.' || mi);
        end loop;
      end if;
    end if;
  end loop;
  if total > 30 then
    errs := errs || jsonb_build_object('path', 'blocks', 'code', 'too_many');
  end if;
  return errs;
end $$;

-- Steps (acceptance 14). Straight block: one step per set, each the end of its round.
-- Superset: round r = members in order; rest only after the last member.
-- The engine never starts a rest after the final step of the workout.
create or replace function public.v1_build_steps(p_blocks jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  steps jsonb := '[]'::jsonb;
  b jsonb;
  bi int;
  ex jsonb;
  n int;
  m int;
  r int;
  mi int;
  idx int := 0;
  ss int := 0;
  letter text;
begin
  for b, bi in select e.value, (e.ordinality - 1)::int
                 from jsonb_array_elements(p_blocks) with ordinality e order by e.ordinality loop
    if b->>'type' = 'straight' then
      ex := b->'exercise';
      n := (b->>'sets')::int;
      for r in 0 .. n - 1 loop
        steps := steps || jsonb_build_array(jsonb_build_object(
          'index', idx, 'key', bi || '.0.' || r, 'block', bi, 'exercise', 0, 'set', r, 'sets', n,
          'group', null, 'label', null, 'last_in_round', true, 'rest_s', (b->>'rest_s')::int,
          'reps', (ex->>'reps')::int, 'weight', coalesce(ex->'weight', 'null'::jsonb)));
        idx := idx + 1;
      end loop;
    else
      letter := chr(65 + ss);
      ss := ss + 1;
      n := (b->>'rounds')::int;
      m := jsonb_array_length(b->'exercises');
      for r in 0 .. n - 1 loop
        for mi in 0 .. m - 1 loop
          ex := b->'exercises'->mi;
          steps := steps || jsonb_build_array(jsonb_build_object(
            'index', idx, 'key', bi || '.' || mi || '.' || r, 'block', bi, 'exercise', mi, 'set', r, 'sets', n,
            'group', letter, 'label', letter || (mi + 1), 'last_in_round', mi = m - 1,
            'rest_s', (b->>'rest_s')::int,
            'reps', (ex->>'reps')::int, 'weight', coalesce(ex->'weight', 'null'::jsonb)));
          idx := idx + 1;
        end loop;
      end loop;
    end if;
  end loop;
  return steps;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Session engine (pure). s = engine state jsonb (see src/v1/core/types.ts EngineState).
-- Returns {ok:true, state} or {ok:false, error, state} (state unchanged on error).
-- Conflict rule: ended is terminal (session_ended). A stale expected_revision is rejected
-- (stale_revision) except pause/resume/end, which apply when still valid in the current state.
create or replace function public.v1_engine_apply(
  s jsonb, p_kind text, p_payload jsonb, p_expected_revision int, p_at bigint)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  st text := s->>'state';
  rev int := (s->>'revision')::int;
  stale boolean := p_expected_revision is distinct from (s->>'revision')::int;
  n int := jsonb_array_length(s->'steps');
  cur int := (s->>'cursor')::int;
  pl jsonb := coalesce(p_payload, '{}'::jsonb);
  err text;
  step jsonb;
  res jsonb;
  paused_for bigint;
  all_done boolean := true;
  k text;
  i int;
begin
  if p_kind is null or p_kind not in ('start', 'pause', 'resume', 'complete_set', 'skip_set', 'undo', 'skip_rest', 'end', 'discard') then
    return jsonb_build_object('ok', false, 'error', 'unknown_kind', 'state', s);
  end if;
  if st = 'ended' then
    return jsonb_build_object('ok', false, 'error', 'session_ended', 'state', s);
  end if;
  if stale and p_kind not in ('pause', 'resume', 'end') then
    return jsonb_build_object('ok', false, 'error', 'stale_revision', 'state', s);
  end if;

  if p_kind = 'start' then
    if st <> 'preparing' then err := 'invalid_state'; end if;
  elsif p_kind = 'pause' then
    if st <> 'active' then err := 'invalid_state'; end if;
  elsif p_kind = 'resume' then
    if st <> 'paused' then err := 'invalid_state'; end if;
  elsif p_kind in ('complete_set', 'skip_set') then
    if st <> 'active' then err := 'invalid_state';
    elsif cur >= n then err := 'no_step';
    elsif not public.v1_is_int(pl->'step', cur, cur) then err := 'step_mismatch';
    elsif p_kind = 'complete_set' and pl ? 'reps' and not public.v1_is_int(pl->'reps', 0, 200) then err := 'invalid_payload';
    elsif p_kind = 'complete_set' and pl ? 'weight' and jsonb_typeof(pl->'weight') <> 'null'
          and not public.v1_is_weight(pl->'weight') then err := 'invalid_payload';
    end if;
  elsif p_kind = 'undo' then
    if st <> 'active' then err := 'invalid_state';
    elsif cur = 0 then err := 'nothing_to_undo';
    end if;
  elsif p_kind = 'skip_rest' then
    if st <> 'active' then err := 'invalid_state';
    elsif jsonb_typeof(s->'rest_ends_at') is distinct from 'number' then err := 'no_rest';
    end if;
  elsif p_kind = 'end' then
    if st not in ('active', 'paused') then err := 'invalid_state'; end if;
  elsif p_kind = 'discard' then
    if st not in ('preparing', 'active', 'paused') then err := 'invalid_state'; end if;
  end if;
  if err is not null then
    return jsonb_build_object('ok', false, 'error', case when stale then 'stale_revision' else err end, 'state', s);
  end if;

  if p_kind = 'start' then
    s := s || jsonb_build_object('state', 'active', 'started_at', p_at);
  elsif p_kind = 'pause' then
    s := s || jsonb_build_object('state', 'paused', 'paused_at', p_at,
      'pauses', (s->'pauses') || jsonb_build_array(jsonb_build_object('from', p_at, 'to', null)));
  elsif p_kind in ('complete_set', 'skip_set') then
    step := s->'steps'->cur;
    if p_kind = 'complete_set' then
      res := jsonb_build_object('status', 'done',
        'reps', case when pl ? 'reps' then pl->'reps' else step->'reps' end,
        'weight', case when pl ? 'weight' then pl->'weight' else step->'weight' end,
        'at', p_at);
    else
      res := jsonb_build_object('status', 'skipped', 'reps', null, 'weight', null, 'at', p_at);
    end if;
    s := s || jsonb_build_object('results', (s->'results') || jsonb_build_object(step->>'key', res),
                                 'cursor', cur + 1);
    if (step->>'last_in_round')::boolean and cur + 1 < n and (step->>'rest_s')::int > 0 then
      s := s || jsonb_build_object('rest_started_at', p_at, 'rest_ends_at', p_at + (step->>'rest_s')::bigint * 1000);
    else
      s := s || jsonb_build_object('rest_started_at', null, 'rest_ends_at', null);
    end if;
  elsif p_kind = 'undo' then
    step := s->'steps'->(cur - 1);
    s := s || jsonb_build_object('cursor', cur - 1, 'results', (s->'results') - (step->>'key'),
                                 'rest_started_at', null, 'rest_ends_at', null);
  elsif p_kind = 'skip_rest' then
    s := s || jsonb_build_object('rest_started_at', null, 'rest_ends_at', null);
  end if;

  -- resume, end and discard close an open pause at the effective timestamp
  if p_kind in ('resume', 'end', 'discard') and st = 'paused' then
    paused_for := greatest(0, p_at - (s->>'paused_at')::bigint);
    s := s || jsonb_build_object(
      'state', 'active',
      'paused_at', null,
      'paused_ms', (s->>'paused_ms')::bigint + paused_for,
      'rest_ends_at', case when jsonb_typeof(s->'rest_ends_at') = 'number'
                           then to_jsonb((s->>'rest_ends_at')::bigint + paused_for) else 'null'::jsonb end,
      'pauses', jsonb_set(s->'pauses', array[(jsonb_array_length(s->'pauses') - 1)::text, 'to'], to_jsonb(p_at)));
  end if;

  if p_kind in ('end', 'discard') then
    s := s || jsonb_build_object('state', 'ended', 'ended_at', p_at, 'rest_started_at', null, 'rest_ends_at', null);
    if p_kind = 'discard' then
      s := s || jsonb_build_object('outcome', 'discarded');
    else
      for i in 0 .. n - 1 loop
        k := s->'steps'->i->>'key';
        if not (s->'results') ? k then
          s := jsonb_set(s, array['results', k],
                 jsonb_build_object('status', 'not_reached', 'reps', null, 'weight', null, 'at', null));
          all_done := false;
        elsif s->'results'->k->>'status' <> 'done' then
          all_done := false;
        end if;
      end loop;
      s := s || jsonb_build_object('outcome', case when all_done then 'completed' else 'partial' end);
    end if;
  end if;

  s := s || jsonb_build_object('revision', rev + 1);
  return jsonb_build_object('ok', true, 'state', s);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Templates
create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(public.v1_trim(name)) between 1 and 60),
  blocks jsonb not null,
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists workout_templates_user on public.workout_templates (user_id, updated_at desc) where deleted_at is null;

create or replace function public.v1_templates_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  errs jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.revision is distinct from old.revision then
      raise exception 'revision conflict' using errcode = '40001';
    end if;
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at then
      raise exception 'id, user_id and created_at are fixed' using errcode = '42501';
    end if;
    new.revision := old.revision + 1;
    new.updated_at := now();
  else
    new.revision := 1;
    new.created_at := now();
    new.updated_at := now();
  end if;
  errs := public.v1_template_errors(new.name, new.blocks);
  if errs <> '[]'::jsonb then
    raise exception 'invalid_template' using errcode = '22023', detail = errs::text;
  end if;
  return new;
end $$;
create or replace trigger workout_templates_guard before insert or update on public.workout_templates
  for each row execute function public.v1_templates_guard();

-- ---------------------------------------------------------------------------------------------
-- Zones: four strictly increasing positive cutoffs per user
create table if not exists public.zone_configs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  b1 smallint not null,
  b2 smallint not null,
  b3 smallint not null,
  b4 smallint not null,
  confirmed_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (b1 > 0 and b1 < b2 and b2 < b3 and b3 < b4 and b4 <= 250)
);
create or replace trigger zone_configs_version before update on public.zone_configs
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------------------------
-- Sessions
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.workout_templates(id) on delete set null,
  snapshot jsonb not null,                -- {template_id, template_revision, name, blocks}: deep copy at start
  steps jsonb not null,                   -- v1_build_steps(snapshot.blocks), fixed at start
  zone_snapshot jsonb,                    -- {cutoffs:[b1..b4], version, confirmed_at} or null (zones not confirmed)
  start_timezone text not null,           -- IANA zone of the starting device; calendar day uses it
  state text not null default 'preparing' check (state in ('preparing', 'active', 'paused', 'ending', 'ended')),
  outcome text check (outcome in ('completed', 'partial', 'discarded')),
  revision int not null default 1,
  live_data boolean not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,                 -- set by the start command (preparing -> active)
  ended_at timestamptz,
  paused_at timestamptz,                  -- open pause
  paused_ms bigint not null default 0,    -- closed pauses
  pauses jsonb not null default '[]',     -- [{from, to}] epoch ms
  cursor int not null default 0,
  rest_started_at timestamptz,
  rest_ends_at timestamptz,
  results jsonb not null default '{}',    -- {step key: {status, reps, weight, at}}
  last_command_id uuid,
  last_source text check (last_source in ('phone', 'desktop', 'tv')),
  last_client_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((state = 'ended') = (outcome is not null)),
  check ((state = 'ended') = (ended_at is not null))
);
create unique index if not exists workout_sessions_one_unfinished on public.workout_sessions (user_id) where state <> 'ended';
create index if not exists workout_sessions_user_started on public.workout_sessions (user_id, started_at desc);

create or replace function public.v1_sessions_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.snapshot is distinct from old.snapshot or new.steps is distinct from old.steps
     or new.zone_snapshot is distinct from old.zone_snapshot or new.user_id is distinct from old.user_id
     or new.start_timezone is distinct from old.start_timezone or new.live_data is distinct from old.live_data
     or new.is_demo is distinct from old.is_demo or new.created_at is distinct from old.created_at then
    raise exception 'session snapshot fields are immutable' using errcode = '42501';
  end if;
  if old.state = 'ended' and (new.state <> 'ended' or new.results is distinct from old.results
     or new.outcome is distinct from old.outcome or new.ended_at is distinct from old.ended_at) then
    raise exception 'ended sessions are terminal' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace trigger workout_sessions_immutable before update on public.workout_sessions
  for each row execute function public.v1_sessions_immutable();

create or replace function public.v1_engine_state(ws public.workout_sessions)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'state', ws.state, 'outcome', ws.outcome, 'revision', ws.revision, 'cursor', ws.cursor,
    'steps', ws.steps, 'results', ws.results,
    'started_at', public.v1_ms(ws.started_at), 'ended_at', public.v1_ms(ws.ended_at),
    'paused_at', public.v1_ms(ws.paused_at), 'paused_ms', ws.paused_ms, 'pauses', ws.pauses,
    'rest_started_at', public.v1_ms(ws.rest_started_at), 'rest_ends_at', public.v1_ms(ws.rest_ends_at))
$$;

create table if not exists public.session_commands (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  session_id uuid references public.workout_sessions(id) on delete cascade,
  kind text not null,
  source text,
  expected_revision int,
  client_at timestamptz,
  received_at timestamptz not null default now(),
  ok boolean not null,
  error text,
  result jsonb not null,
  unique (user_id, command_id)
);
create index if not exists session_commands_session on public.session_commands (session_id, id);

create table if not exists public.session_notes (
  session_id uuid primary key references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '' check (char_length(text) <= 4000),
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One history row per ended (non-discarded) session. Written by the end command; zone fields
-- are finalized from samples by session_hr_finalize (Slice E, same TS zone module as live).
create table if not exists public.session_summaries (
  session_id uuid primary key references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('completed', 'partial')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  start_timezone text not null,
  local_date date not null,               -- calendar day = local start date in start_timezone
  active_ms bigint not null check (active_ms >= 0),
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  paused_ms bigint not null check (paused_ms >= 0),
  zone_ms jsonb not null default '[0,0,0,0,0]' check (jsonb_array_length(zone_ms) = 5),
  measured_ms bigint not null default 0,
  unmeasured_ms bigint not null,
  coverage numeric(5, 4) not null default 0 check (coverage between 0 and 1),
  algorithm_version int not null default 1,
  zone_snapshot jsonb,
  hr_status text not null check (hr_status in ('pending', 'final', 'no_live_data')),
  hr_finalize_dirty boolean not null default false,
  hr_sources_used text[] not null default '{}',
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists session_summaries_user_date on public.session_summaries (user_id, local_date desc);

-- ---------------------------------------------------------------------------------------------
-- Heart rate (h10-design section 5)
create table if not exists public.hr_sources (
  id uuid primary key,                    -- generated by the relay
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('web_ble', 'firetv_native', 'watch_companion', 'demo')),
  display_name text not null check (char_length(display_name) between 1 and 60),
  platform text check (platform in ('android', 'windows', 'macos', 'chromeos', 'linux', 'other')),
  last_seen_at timestamptz,
  rate_window_at timestamptz,
  rate_count int not null default 0,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.hr_sensors (
  id uuid primary key default gen_random_uuid(),   -- surrogate: see the realtime note below
  user_id uuid not null unique references auth.users(id) on delete cascade,
  sensor_kind text not null default 'polar_h10' check (sensor_kind in ('polar_h10', 'generic_hrs')),
  sensor_name text not null,
  sensor_serial text,
  paired_at timestamptz not null default now(),
  forgotten_at timestamptz,
  wanted_until timestamptz,
  last_source_id uuid references public.hr_sources(id) on delete set null,
  last_battery_pct smallint check (last_battery_pct between 0 and 100),
  battery_read_at timestamptz
);

create table if not exists public.hr_live (
  id uuid primary key default gen_random_uuid(),   -- surrogate: see the realtime note below
  user_id uuid not null unique references auth.users(id) on delete cascade,
  rev bigint not null default 0,
  active_session_id uuid references public.workout_sessions(id) on delete set null,
  holder_source_id uuid not null references public.hr_sources(id) on delete cascade,
  holder_stream_id uuid not null,
  holder_name text not null,
  source_kind text not null,
  relay_mode text not null,
  sensor_name text,
  sensor_serial text,
  battery_pct smallint,
  bpm smallint,
  contact boolean,
  measured_at timestamptz,
  connected_at timestamptz,
  last_seen_at timestamptz not null default now(),
  is_demo boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_samples (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  source_id uuid not null references public.hr_sources(id) on delete cascade,
  stream_id uuid not null,
  seq int not null,                       -- (stream_id, seq) is the event id
  schema_version smallint not null default 1,
  metric text not null default 'heart_rate',
  unit text not null default 'bpm',
  measured_at timestamptz not null,
  received_at timestamptz not null default now(),
  bpm smallint check (bpm is null or bpm between 25 and 250),
  contact boolean,
  rr_ms smallint[],
  is_demo boolean not null default false check (not is_demo),
  unique (user_id, stream_id, seq)
);
create index if not exists hr_samples_session on public.hr_samples (session_id, measured_at);

-- Demo samples live in their own table (brief: separate storage) and only attach to demo sessions.
create table if not exists public.hr_demo_samples (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  source_id uuid not null references public.hr_sources(id) on delete cascade,
  stream_id uuid not null,
  seq int not null,
  schema_version smallint not null default 1,
  metric text not null default 'heart_rate',
  unit text not null default 'bpm',
  measured_at timestamptz not null,
  received_at timestamptz not null default now(),
  bpm smallint check (bpm is null or bpm between 25 and 250),
  contact boolean,
  rr_ms smallint[],
  is_demo boolean not null default true check (is_demo),
  unique (user_id, stream_id, seq)
);
create index if not exists hr_demo_samples_session on public.hr_demo_samples (session_id, measured_at);

-- ---------------------------------------------------------------------------------------------
-- TV pairing (build-plan D8/D9). Challenges are never readable by clients.
create table if not exists public.pairing_challenges (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,                -- sha256 hex of 'DLN-XXXX'
  device_id text not null check (char_length(device_id) between 8 and 128),
  device_label text not null default 'TV' check (char_length(device_label) between 1 and 60),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'awaiting'
    check (status in ('awaiting', 'approved', 'denied', 'expired', 'cancelled', 'consumed')),
  for_user_id uuid references auth.users(id) on delete cascade,
  approved_user_id uuid references auth.users(id) on delete cascade,
  attempts int not null default 0,        -- wrong-secret polls; 5 cancels the challenge
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  resolved_at timestamptz,
  consumed_at timestamptz,
  grant_id uuid
);
create unique index if not exists pairing_challenges_live_code on public.pairing_challenges (code_hash) where status = 'awaiting';
create index if not exists pairing_challenges_device on public.pairing_challenges (device_id, created_at desc);
create index if not exists pairing_challenges_awaiting on public.pairing_challenges (expires_at) where status = 'awaiting';
create index if not exists pairing_challenges_created on public.pairing_challenges (created_at);

create table if not exists public.pairing_approve_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists pairing_approve_failures_user on public.pairing_approve_failures (user_id, at desc);
create index if not exists pairing_approve_failures_at on public.pairing_approve_failures (at);

create table if not exists public.device_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label text not null default 'TV',
  session_id uuid,                        -- auth.sessions.id of the TV's own Supabase session
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- last remote/phone activity reported by the TV (or a running workout). device_grant_touch
  -- revokes the grant once this is 15 minutes old with no active/paused workout, so the TV
  -- auto-lock does not depend on the TV page staying open (dev-brief: enforced server-side).
  last_active_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists device_grants_user on public.device_grants (user_id) where revoked_at is null;
create index if not exists device_grants_session on public.device_grants (session_id);

-- True when the caller's auth session is a paired TV (a device_grants row holds its session id,
-- revoked or not: a revoked TV's access token lives up to 1 h). Brief: the device gets a scoped
-- session, so account-level actions (approve/deny pairing, revoke other devices, delete data,
-- edit templates and zones) are refused to it server-side.
create or replace function public.v1_is_device_session()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare sid uuid;
begin
  begin
    sid := (auth.jwt() ->> 'session_id')::uuid;
  exception when others then sid := null;
  end;
  return sid is not null and exists (select 1 from public.device_grants g where g.session_id = sid);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Privileges and RLS. Supabase grants ALL on new public tables to anon/authenticated by
-- default, so every table is revoked first and only what clients need is granted back.
do $$
declare t text;
begin
  foreach t in array array['workout_templates', 'zone_configs', 'workout_sessions', 'session_commands',
    'session_notes', 'session_summaries', 'hr_sources', 'hr_sensors', 'hr_live', 'hr_samples',
    'hr_demo_samples', 'pairing_challenges', 'pairing_approve_failures', 'device_grants'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant select, insert, update on public.workout_templates to authenticated;
drop policy if exists "workout_templates: owner read" on public.workout_templates;
create policy "workout_templates: owner read" on public.workout_templates for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "workout_templates: owner insert" on public.workout_templates;
create policy "workout_templates: owner insert" on public.workout_templates for insert to authenticated
  with check (user_id = auth.uid() and not public.v1_is_device_session());
drop policy if exists "workout_templates: owner update" on public.workout_templates;
create policy "workout_templates: owner update" on public.workout_templates for update to authenticated
  using (user_id = auth.uid() and not public.v1_is_device_session()) with check (user_id = auth.uid());

grant select, insert, update on public.zone_configs to authenticated;
drop policy if exists "zone_configs: owner read" on public.zone_configs;
create policy "zone_configs: owner read" on public.zone_configs for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "zone_configs: owner insert" on public.zone_configs;
create policy "zone_configs: owner insert" on public.zone_configs for insert to authenticated
  with check (user_id = auth.uid() and not public.v1_is_device_session());
drop policy if exists "zone_configs: owner update" on public.zone_configs;
create policy "zone_configs: owner update" on public.zone_configs for update to authenticated
  using (user_id = auth.uid() and not public.v1_is_device_session()) with check (user_id = auth.uid());

-- profiles (Phase 0 table): name, timezone, units and weekly goal are owner settings like templates
-- and zones, so a paired TV session may read them but not write them. Replaces the Phase-0
-- "profiles: owner all" policy; clients never delete a profile (account deletion removes the
-- auth user server-side, which cascades).
drop policy if exists "profiles: owner all" on public.profiles;
revoke delete on public.profiles from authenticated;
drop policy if exists "profiles: owner read" on public.profiles;
create policy "profiles: owner read" on public.profiles for select to authenticated
  using (id = auth.uid());
drop policy if exists "profiles: owner insert" on public.profiles;
create policy "profiles: owner insert" on public.profiles for insert to authenticated
  with check (id = auth.uid() and not public.v1_is_device_session());
drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner update" on public.profiles for update to authenticated
  using (id = auth.uid() and not public.v1_is_device_session()) with check (id = auth.uid());

-- read-only to clients; writes only through the RPCs below
grant select on public.workout_sessions, public.session_commands, public.session_notes,
  public.session_summaries, public.hr_sources, public.hr_sensors, public.hr_live,
  public.hr_samples, public.hr_demo_samples, public.device_grants to authenticated;
drop policy if exists "workout_sessions: owner read" on public.workout_sessions;
create policy "workout_sessions: owner read" on public.workout_sessions for select to authenticated using (user_id = auth.uid());
drop policy if exists "session_commands: owner read" on public.session_commands;
create policy "session_commands: owner read" on public.session_commands for select to authenticated using (user_id = auth.uid());
drop policy if exists "session_notes: owner read" on public.session_notes;
create policy "session_notes: owner read" on public.session_notes for select to authenticated using (user_id = auth.uid());
drop policy if exists "session_summaries: owner read" on public.session_summaries;
create policy "session_summaries: owner read" on public.session_summaries for select to authenticated using (user_id = auth.uid());
drop policy if exists "hr_sources: owner read" on public.hr_sources;
create policy "hr_sources: owner read" on public.hr_sources for select to authenticated using (user_id = auth.uid());
drop policy if exists "hr_sensors: owner read" on public.hr_sensors;
create policy "hr_sensors: owner read" on public.hr_sensors for select to authenticated using (user_id = auth.uid());
drop policy if exists "hr_live: owner read" on public.hr_live;
create policy "hr_live: owner read" on public.hr_live for select to authenticated using (user_id = auth.uid());
drop policy if exists "hr_samples: owner read" on public.hr_samples;
create policy "hr_samples: owner read" on public.hr_samples for select to authenticated using (user_id = auth.uid());
drop policy if exists "hr_demo_samples: owner read" on public.hr_demo_samples;
create policy "hr_demo_samples: owner read" on public.hr_demo_samples for select to authenticated using (user_id = auth.uid());
drop policy if exists "device_grants: owner read" on public.device_grants;
create policy "device_grants: owner read" on public.device_grants for select to authenticated using (user_id = auth.uid());
-- relays: the owner may rename or revoke (S14) and nothing else
grant update (display_name, revoked_at) on public.hr_sources to authenticated;
drop policy if exists "hr_sources: owner rename/revoke" on public.hr_sources;
create policy "hr_sources: owner rename/revoke" on public.hr_sources for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- pairing_challenges and pairing_approve_failures: RLS on, no policies, no grants => invisible to clients.

-- Realtime (D6): per-user rows, RLS-filtered. Postgres Changes does not apply RLS to DELETE
-- events (every subscriber gets the old row's primary key), so no published table uses user_id
-- as its primary key: hr_live and hr_sensors have a surrogate id and user_id is UNIQUE.
do $$
declare t text;
begin
  foreach t in array array['workout_sessions', 'hr_live', 'hr_sensors'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- RPC: start a session (preparing). Idempotent on command_id.
create or replace function public.session_start(
  p_command_id uuid, p_template_id uuid, p_live_data boolean, p_timezone text,
  p_client_at timestamptz default null, p_is_demo boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prior jsonb;
  t public.workout_templates;
  running uuid;
  z public.zone_configs;
  zs jsonb;
  ws public.workout_sessions;
  result jsonb;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_command_id is null then raise exception 'command_id required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('v1_session:' || uid::text));

  select c.result into prior from public.session_commands c where c.user_id = uid and c.command_id = p_command_id;
  if found then return prior; end if;

  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    result := jsonb_build_object('ok', false, 'error', 'invalid_timezone', 'session', null);
  else
    select * into t from public.workout_templates
     where id = p_template_id and user_id = uid and deleted_at is null;
    if not found then
      result := jsonb_build_object('ok', false, 'error', 'template_not_found', 'session', null);
    else
      -- A preflight row nobody started for 30 min is abandoned: discard it (it never becomes
      -- history) so it cannot block this Start. A started session still returns session_running.
      update public.workout_sessions
         set state = 'ended', outcome = 'discarded', ended_at = now(), revision = revision + 1, updated_at = now()
       where user_id = uid and state = 'preparing' and created_at < now() - interval '30 minutes';
      select id into running from public.workout_sessions where user_id = uid and state <> 'ended';
      if running is not null then
        result := jsonb_build_object('ok', false, 'error', 'session_running', 'session_id', running, 'session', null);
      else
        select * into z from public.zone_configs where user_id = uid and confirmed_at is not null;
        if found then
          zs := jsonb_build_object('cutoffs', jsonb_build_array(z.b1, z.b2, z.b3, z.b4),
                                   'version', z.version, 'confirmed_at', z.confirmed_at);
        end if;
        insert into public.workout_sessions
          (user_id, template_id, snapshot, steps, zone_snapshot, start_timezone, live_data, is_demo, last_client_at)
        values (uid, t.id,
          jsonb_build_object('template_id', t.id, 'template_revision', t.revision, 'name', t.name, 'blocks', t.blocks),
          public.v1_build_steps(t.blocks), zs, p_timezone, coalesce(p_live_data, false),
          coalesce(p_is_demo, false), p_client_at)
        returning * into ws;
        result := jsonb_build_object('ok', true, 'session', to_jsonb(ws));
      end if;
    end if;
  end if;

  insert into public.session_commands (user_id, command_id, session_id, kind, client_at, ok, error, result)
  values (uid, p_command_id, ws.id, 'session_start', p_client_at, (result->>'ok')::boolean, result->>'error', result);
  return result;
end $$;

-- RPC: apply a command to a session. Server now() is the effective timestamp.
create or replace function public.session_command(
  p_session_id uuid, p_command_id uuid, p_expected_revision int, p_source text,
  p_kind text, p_payload jsonb default '{}'::jsonb, p_client_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prior public.session_commands;
  ws public.workout_sessions;
  applied jsonb;
  ns jsonb;
  result jsonb;
  now_ms bigint := public.v1_ms(now());
  started timestamptz;
  ended timestamptz;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_command_id is null then raise exception 'command_id required' using errcode = '22023'; end if;
  if p_source is null or p_source not in ('phone', 'desktop', 'tv') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('v1_session:' || uid::text));

  select * into prior from public.session_commands c where c.user_id = uid and c.command_id = p_command_id;
  if found then
    if prior.session_id is distinct from p_session_id then
      return jsonb_build_object('ok', false, 'error', 'command_id_reused', 'session', null);
    end if;
    return prior.result;
  end if;

  select * into ws from public.workout_sessions where id = p_session_id and user_id = uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'session', null);
  end if;

  applied := public.v1_engine_apply(public.v1_engine_state(ws), p_kind, p_payload, p_expected_revision, now_ms);
  if (applied->>'ok')::boolean then
    ns := applied->'state';
    update public.workout_sessions set
      state = ns->>'state',
      outcome = ns->>'outcome',
      revision = (ns->>'revision')::int,
      cursor = (ns->>'cursor')::int,
      results = ns->'results',
      started_at = public.v1_ts((ns->>'started_at')::bigint),
      ended_at = public.v1_ts((ns->>'ended_at')::bigint),
      paused_at = public.v1_ts((ns->>'paused_at')::bigint),
      paused_ms = (ns->>'paused_ms')::bigint,
      pauses = ns->'pauses',
      rest_started_at = public.v1_ts((ns->>'rest_started_at')::bigint),
      rest_ends_at = public.v1_ts((ns->>'rest_ends_at')::bigint),
      last_command_id = p_command_id,
      last_source = p_source,
      last_client_at = p_client_at,
      updated_at = now()
    where id = ws.id
    returning * into ws;

    if ws.state = 'ended' then
      -- End stops HR demand (h10-design: End calls hr_request(0))
      update public.hr_sensors set wanted_until = null where user_id = uid;
      if ws.outcome <> 'discarded' then
        started := ws.started_at;
        ended := ws.ended_at;
        insert into public.session_summaries
          (session_id, user_id, outcome, started_at, ended_at, start_timezone, local_date,
           active_ms, elapsed_ms, paused_ms, unmeasured_ms, zone_snapshot, hr_status)
        values (ws.id, uid, ws.outcome, started, ended, ws.start_timezone,
          (started at time zone ws.start_timezone)::date,
          greatest(0, public.v1_ms(ended) - public.v1_ms(started) - ws.paused_ms),
          greatest(0, public.v1_ms(ended) - public.v1_ms(started)),
          ws.paused_ms,
          greatest(0, public.v1_ms(ended) - public.v1_ms(started) - ws.paused_ms),
          ws.zone_snapshot,
          case when ws.live_data then 'pending' else 'no_live_data' end)
        on conflict (session_id) do nothing;
      end if;
    end if;
    result := jsonb_build_object('ok', true, 'session', to_jsonb(ws));
  else
    result := jsonb_build_object('ok', false, 'error', applied->>'error', 'session', to_jsonb(ws));
  end if;

  insert into public.session_commands
    (user_id, command_id, session_id, kind, source, expected_revision, client_at, ok, error, result)
  values (uid, p_command_id, ws.id, coalesce(p_kind, ''), p_source, p_expected_revision, p_client_at,
          (result->>'ok')::boolean, result->>'error', result);
  return result;
end $$;

-- RPC: notes autosave with revision check. expected_revision 0 (or null) creates the note.
create or replace function public.session_note_save(p_session_id uuid, p_text text, p_expected_revision int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n public.session_notes;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- notes are edited on the phone only; a paired TV session is read-only here (handoff S11/S13)
  if public.v1_is_device_session() then
    return jsonb_build_object('ok', false, 'error', 'device_session_forbidden', 'note', null);
  end if;
  if p_text is null or char_length(p_text) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_text', 'note', null);
  end if;
  perform 1 from public.workout_sessions
   where id = p_session_id and user_id = uid and coalesce(outcome, '') <> 'discarded';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'note', null);
  end if;
  select * into n from public.session_notes where session_id = p_session_id for update;
  if not found then
    if coalesce(p_expected_revision, 0) <> 0 then
      return jsonb_build_object('ok', false, 'error', 'stale_revision', 'note', null);
    end if;
    insert into public.session_notes (session_id, user_id, text) values (p_session_id, uid, p_text)
    on conflict (session_id) do nothing
    returning * into n;
    if n.session_id is null then
      select * into n from public.session_notes where session_id = p_session_id;
      return jsonb_build_object('ok', false, 'error', 'stale_revision', 'note', to_jsonb(n));
    end if;
  elsif p_expected_revision is distinct from n.revision then
    return jsonb_build_object('ok', false, 'error', 'stale_revision', 'note', to_jsonb(n));
  else
    update public.session_notes set text = p_text, revision = n.revision + 1, updated_at = now()
     where session_id = p_session_id returning * into n;
  end if;
  return jsonb_build_object('ok', true, 'note', to_jsonb(n));
end $$;

-- RPC: write zone totals computed by src/v1/core/zones.ts (the single zone implementation).
-- Invariant enforced here: sum(zone_ms) + unmeasured_ms = active_ms (+-1 s).
create or replace function public.session_hr_finalize(
  p_session_id uuid, p_zone_ms bigint[], p_unmeasured_ms bigint, p_algorithm_version int,
  p_sources_used text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sm public.session_summaries;
  zsum bigint;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into sm from public.session_summaries where session_id = p_session_id and user_id = uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if sm.hr_status = 'no_live_data' then return jsonb_build_object('ok', false, 'error', 'no_live_data'); end if;
  -- A final summary is settled once the late-sample window is over (hr_ingest marks it dirty
  -- for 2 minutes after End): saved history is never rewritten afterwards.
  if sm.hr_status = 'final' and not sm.hr_finalize_dirty and sm.ended_at < now() - interval '5 minutes' then
    return jsonb_build_object('ok', false, 'error', 'already_final', 'summary', to_jsonb(sm));
  end if;
  if p_zone_ms is null or coalesce(array_length(p_zone_ms, 1), 0) <> 5 or array_ndims(p_zone_ms) <> 1
     or p_unmeasured_ms is null or p_unmeasured_ms < 0 or p_algorithm_version is null or p_algorithm_version < 1
     or exists (select 1 from unnest(p_zone_ms) z where z is null or z < 0) then
    return jsonb_build_object('ok', false, 'error', 'invalid_payload');
  end if;
  select sum(z) into zsum from unnest(p_zone_ms) z;
  if sm.zone_snapshot is null and zsum <> 0 then
    return jsonb_build_object('ok', false, 'error', 'zones_not_configured');
  end if;
  if abs(zsum + p_unmeasured_ms - sm.active_ms) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'invariant');
  end if;
  update public.session_summaries set
    zone_ms = to_jsonb(p_zone_ms), measured_ms = zsum, unmeasured_ms = p_unmeasured_ms,
    coverage = case when sm.active_ms > 0 then least(1, round(zsum::numeric / sm.active_ms, 4)) else 0 end,
    algorithm_version = p_algorithm_version, hr_sources_used = coalesce(p_sources_used, '{}'),
    hr_status = 'final', hr_finalize_dirty = false, finalized_at = now()
  where session_id = p_session_id returning * into sm;
  return jsonb_build_object('ok', true, 'summary', to_jsonb(sm));
end $$;

-- ---------------------------------------------------------------------------------------------
-- Heart-rate RPCs (h10-design 5.3 / 5.4)
create or replace function public.server_time()
returns timestamptz language sql stable set search_path = '' as $$ select now() $$;

create or replace function public.hr_request(p_minutes int default 10)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.hr_sensors
     set wanted_until = case when coalesce(p_minutes, 0) <= 0 then null
                             else now() + least(p_minutes, 30) * interval '1 minute' end
   where user_id = uid;
end $$;

create or replace function public.hr_forget_sensor()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.hr_sensors set forgotten_at = now(), wanted_until = null where user_id = uid;
  update public.hr_live set bpm = null, contact = null, rev = rev + 1, updated_at = now() where user_id = uid;
end $$;

create or replace function public.hr_ingest(
  p_source_id uuid, p_stream_id uuid, p_expected_user_id uuid, p_source_kind text, p_mode text,
  p_connected_at timestamptz, p_sensor jsonb, p_claim boolean, p_samples jsonb,
  p_source_name text default null, p_platform text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  is_demo_src boolean := p_source_kind = 'demo';
  src public.hr_sources;
  live public.hr_live;
  sensor public.hr_sensors;
  holder_fresh boolean;
  take boolean;
  wanted boolean;
  forgotten boolean := false;
  smp jsonb;
  v_m timestamptz;
  v_bpm int;
  v_contact boolean;
  v_seq int;
  sess uuid;
  sess_ended timestamptz;
  rejected jsonb := '[]'::jsonb;
  accepted int := 0;
  dups int := 0;
  ins int;
  latest_m timestamptz;
  latest_bpm int;
  latest_contact boolean;
  conn timestamptz;
  active_sess uuid;
  name_default text;
begin
  -- 1. identity
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_expected_user_id is distinct from uid then
    return jsonb_build_object('server_now', now(), 'accepted', 0, 'duplicates', 0, 'rejected', '[]'::jsonb,
      'superseded', false, 'holder_name', null, 'rate_limited', false, 'revoked', false,
      'identity_mismatch', true, 'stop_requested', false, 'sensor_forgotten', false);
  end if;
  if p_source_id is null or p_stream_id is null then raise exception 'source and stream required' using errcode = '22023'; end if;
  if p_source_kind is null or p_source_kind not in ('web_ble', 'firetv_native', 'watch_companion', 'demo') then
    raise exception 'invalid source kind' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('idle', 'choosing', 'connecting', 'waiting_first', 'live', 'no_contact',
      'reconnecting', 'sensor_lost', 'hidden', 'standby', 'superseded', 'demo') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  if p_samples is null then p_samples := '[]'::jsonb; end if;
  if jsonb_typeof(p_samples) <> 'array' or jsonb_array_length(p_samples) > 30 then
    raise exception 'too many samples' using errcode = '22023';
  end if;

  -- 2. serialize per user
  perform pg_advisory_xact_lock(hashtext('v1_hr:' || uid::text));

  -- 3. source registry
  select * into src from public.hr_sources where id = p_source_id for update;
  if found and src.user_id <> uid then
    raise exception 'source belongs to another user' using errcode = '42501';
  end if;
  name_default := coalesce(nullif(left(public.v1_trim(coalesce(p_source_name, '')), 60), ''),
                           case when is_demo_src then 'Demo relay' else 'Relay' end);
  if not found then
    insert into public.hr_sources (id, user_id, kind, display_name, platform, last_seen_at, rate_window_at, rate_count)
    values (p_source_id, uid, p_source_kind, name_default,
            case when p_platform in ('android', 'windows', 'macos', 'chromeos', 'linux', 'other') then p_platform end,
            now(), now(), 1)
    returning * into src;
  else
    if src.revoked_at is not null then
      return jsonb_build_object('server_now', now(), 'accepted', 0, 'duplicates', 0, 'rejected', '[]'::jsonb,
        'superseded', false, 'holder_name', null, 'rate_limited', false, 'revoked', true,
        'identity_mismatch', false, 'stop_requested', true, 'sensor_forgotten', false);
    end if;
    -- 4. rate: more than 3 calls in one second per source
    if src.rate_window_at is not null and now() - src.rate_window_at < interval '1 second' then
      update public.hr_sources set rate_count = rate_count + 1, last_seen_at = now() where id = src.id returning * into src;
    else
      update public.hr_sources set rate_window_at = now(), rate_count = 1, last_seen_at = now() where id = src.id returning * into src;
    end if;
    if src.rate_count > 3 then
      return jsonb_build_object('server_now', now(), 'accepted', 0, 'duplicates', 0, 'rejected', '[]'::jsonb,
        'superseded', false, 'holder_name', null, 'rate_limited', true, 'revoked', false,
        'identity_mismatch', false, 'stop_requested', false, 'sensor_forgotten', false);
    end if;
  end if;

  -- 5. one active relay (fence)
  select * into live from public.hr_live where user_id = uid for update;
  if not found then
    take := true;
  else
    holder_fresh := now() - live.last_seen_at <=
      case when live.relay_mode in ('idle', 'standby') then interval '75 seconds' else interval '15 seconds' end;
    if live.holder_stream_id = p_stream_id then take := true;
    elsif live.holder_source_id = p_source_id then take := true;
    elsif is_demo_src and live.source_kind <> 'demo' and holder_fresh then take := false;
    elsif live.source_kind = 'demo' and not is_demo_src then take := true;
    elsif not holder_fresh and p_mode <> 'superseded' then take := true;
    elsif holder_fresh and coalesce(p_claim, false) then take := true;
    else take := false;
    end if;
    if not take then
      return jsonb_build_object('server_now', now(), 'accepted', 0, 'duplicates', 0, 'rejected', '[]'::jsonb,
        'superseded', true, 'holder_name', live.holder_name, 'rate_limited', false, 'revoked', false,
        'identity_mismatch', false, 'stop_requested', false, 'sensor_forgotten', false);
    end if;
  end if;

  -- 10 (before 7, because a claim opens the demand window on the sensor row)
  select * into sensor from public.hr_sensors where user_id = uid for update;
  if not found then
    if p_sensor is not null and jsonb_typeof(p_sensor) = 'object' then
      insert into public.hr_sensors (user_id, sensor_name, sensor_serial, last_source_id, last_battery_pct, battery_read_at, wanted_until)
      values (uid, left(coalesce(p_sensor->>'name', 'Heart-rate strap'), 80), left(p_sensor->>'serial', 32), src.id,
              case when public.v1_is_int(p_sensor->'battery_pct', 0, 100) then (p_sensor->>'battery_pct')::smallint end,
              case when public.v1_is_int(p_sensor->'battery_pct', 0, 100) then now() end,
              case when coalesce(p_claim, false) then now() + interval '10 minutes' end)
      returning * into sensor;
    end if;
  elsif sensor.forgotten_at is not null then
    if coalesce(p_claim, false) and p_sensor is not null and jsonb_typeof(p_sensor) = 'object' then
      update public.hr_sensors set forgotten_at = null, paired_at = now(),
        sensor_name = left(coalesce(p_sensor->>'name', sensor_name), 80), sensor_serial = left(p_sensor->>'serial', 32),
        last_source_id = src.id, wanted_until = now() + interval '10 minutes'
      where user_id = uid returning * into sensor;
    else
      forgotten := true;
    end if;
  else
    update public.hr_sensors set
      last_source_id = src.id,
      last_battery_pct = case when public.v1_is_int(p_sensor->'battery_pct', 0, 100)
                              then (p_sensor->>'battery_pct')::smallint else last_battery_pct end,
      battery_read_at = case when public.v1_is_int(p_sensor->'battery_pct', 0, 100) then now() else battery_read_at end,
      wanted_until = case when coalesce(p_claim, false)
                          then greatest(coalesce(wanted_until, now()), now() + interval '10 minutes') else wanted_until end
    where user_id = uid returning * into sensor;
  end if;

  -- 7. is HR wanted? Only an attributable session (active/paused, started < 6 h ago, live data,
  -- same demo kind) or an open hr_request/claim window. A 'preparing' row never wants HR on its
  -- own: preflight opens its bounded window with hr_request. `wanted` drives stop_requested and
  -- the hr_live bpm/contact fields only; it does not decide whether a sample is stored.
  select id into active_sess from public.workout_sessions
   where user_id = uid and state in ('active', 'paused') and live_data and is_demo = is_demo_src
     and started_at is not null and started_at > now() - interval '6 hours'
   order by started_at desc limit 1;
  wanted := not forgotten and (active_sess is not null or coalesce(sensor.wanted_until > now(), false));

  -- 6 + 8. validate, attribute and store samples
  for smp in select value from jsonb_array_elements(p_samples) loop
    if not public.v1_is_int(smp->'seq', 0, 2147483647) or jsonb_typeof(smp->'measured_at') <> 'string' then
      rejected := rejected || jsonb_build_object('seq', smp->'seq', 'reason', 'out_of_range');
      continue;
    end if;
    v_seq := (smp->>'seq')::int;
    begin
      v_m := (smp->>'measured_at')::timestamptz;
    exception when others then
      rejected := rejected || jsonb_build_object('seq', v_seq, 'reason', 'out_of_range');
      continue;
    end;
    if v_m < now() - interval '150 seconds' then
      rejected := rejected || jsonb_build_object('seq', v_seq, 'reason', 'too_old'); continue;
    elsif v_m > now() + interval '5 seconds' then
      rejected := rejected || jsonb_build_object('seq', v_seq, 'reason', 'future'); continue;
    end if;
    v_contact := case jsonb_typeof(smp->'contact') when 'boolean' then (smp->>'contact')::boolean else null end;
    v_bpm := case when public.v1_is_int(smp->'bpm', 25, 250) and v_contact is distinct from false
                then (smp->>'bpm')::int else null end;

    if latest_m is null or v_m > latest_m then
      latest_m := v_m; latest_bpm := v_bpm; latest_contact := v_contact;
    end if;
    -- Samples measured inside a session are stored even when HR is no longer wanted (an outbox
    -- flush after End is historical backfill: dev-brief wins over h10-design 5.3 step 7).
    -- A forgotten strap stores nothing.
    if forgotten then
      rejected := rejected || jsonb_build_object('seq', v_seq, 'reason', 'sensor_forgotten');
      continue;
    end if;

    sess := null;
    select id, ended_at into sess, sess_ended from public.workout_sessions
     where user_id = uid and live_data and is_demo = is_demo_src
       and started_at is not null and started_at <= v_m and (ended_at is null or v_m < ended_at)
       and started_at > v_m - interval '6 hours'
     order by started_at desc limit 1;
    if sess is null then
      if exists (select 1 from public.workout_sessions
                  where user_id = uid and live_data and is_demo <> is_demo_src
                    and started_at is not null and started_at <= v_m and (ended_at is null or v_m < ended_at)
                    and started_at > v_m - interval '6 hours') then
        rejected := rejected || jsonb_build_object('seq', v_seq, 'reason', 'demo_mismatch');
      else
        rejected := rejected || jsonb_build_object('seq', v_seq, 'reason', 'outside_session');
      end if;
      continue;
    end if;

    if is_demo_src then
      insert into public.hr_demo_samples (user_id, session_id, source_id, stream_id, seq, measured_at, bpm, contact)
      values (uid, sess, src.id, p_stream_id, v_seq, v_m, v_bpm, v_contact)
      on conflict (user_id, stream_id, seq) do nothing;
    else
      insert into public.hr_samples (user_id, session_id, source_id, stream_id, seq, measured_at, bpm, contact)
      values (uid, sess, src.id, p_stream_id, v_seq, v_m, v_bpm, v_contact)
      on conflict (user_id, stream_id, seq) do nothing;
    end if;
    get diagnostics ins = row_count;
    if ins = 1 then
      accepted := accepted + 1;
      if sess_ended is not null and sess_ended > now() - interval '2 minutes' then
        update public.session_summaries set hr_finalize_dirty = true where session_id = sess;
      end if;
    else
      dups := dups + 1;
    end if;
  end loop;

  -- 9. hr_live
  conn := case when p_connected_at between now() - interval '150 seconds' and now() + interval '5 seconds'
               then p_connected_at end;
  if live.user_id is null then
    insert into public.hr_live (user_id, rev, active_session_id, holder_source_id, holder_stream_id, holder_name,
      source_kind, relay_mode, sensor_name, sensor_serial, battery_pct, bpm, contact, measured_at, connected_at,
      last_seen_at, is_demo, updated_at)
    values (uid, 1, active_sess, src.id, p_stream_id, src.display_name, p_source_kind, p_mode,
      p_sensor->>'name', p_sensor->>'serial',
      case when public.v1_is_int(p_sensor->'battery_pct', 0, 100) then (p_sensor->>'battery_pct')::smallint end,
      case when wanted and p_mode not in ('idle', 'standby', 'sensor_lost') then latest_bpm end,
      case when wanted and p_mode not in ('idle', 'standby', 'sensor_lost') then latest_contact end,
      latest_m, conn, now(), is_demo_src, now());
  else
    update public.hr_live set
      rev = rev + 1,
      active_session_id = active_sess,
      holder_source_id = src.id,
      holder_stream_id = p_stream_id,
      holder_name = src.display_name,
      source_kind = p_source_kind,
      relay_mode = p_mode,
      sensor_name = coalesce(p_sensor->>'name', sensor_name),
      sensor_serial = coalesce(p_sensor->>'serial', sensor_serial),
      battery_pct = case when public.v1_is_int(p_sensor->'battery_pct', 0, 100)
                         then (p_sensor->>'battery_pct')::smallint else battery_pct end,
      measured_at = case when latest_m is not null and (measured_at is null or latest_m > measured_at
                              or holder_stream_id <> p_stream_id) then latest_m else measured_at end,
      bpm = case when not wanted or p_mode in ('idle', 'standby', 'sensor_lost') then null
                 when latest_m is not null and (measured_at is null or latest_m > measured_at
                      or holder_stream_id <> p_stream_id) then latest_bpm else bpm end,
      contact = case when not wanted or p_mode in ('idle', 'standby', 'sensor_lost') then null
                     when latest_m is not null and (measured_at is null or latest_m > measured_at
                          or holder_stream_id <> p_stream_id) then latest_contact else contact end,
      connected_at = coalesce(conn, connected_at),
      last_seen_at = now(),
      is_demo = is_demo_src,
      updated_at = now()
    where user_id = uid;
  end if;

  -- 11
  return jsonb_build_object('server_now', now(), 'accepted', accepted, 'duplicates', dups, 'rejected', rejected,
    'superseded', false, 'holder_name', src.display_name, 'rate_limited', false, 'revoked', false,
    'identity_mismatch', false, 'stop_requested', not wanted, 'sensor_forgotten', forgotten);
end $$;

-- ---------------------------------------------------------------------------------------------
-- TV pairing. Code alphabet has no 0/O/1/I/L. Codes and secrets are stored only as sha256 hex.
create or replace function public.v1_pairing_code_hash(p_code text)
returns text language plpgsql immutable set search_path = '' as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if c like 'DLN%' then c := substr(c, 4); end if;
  if c !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$' then return null; end if;
  return encode(sha256(convert_to('DLN-' || c, 'UTF8')), 'hex');
end $$;

create or replace function public.v1_sha256_hex(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;

-- service_role only (TV server function tvPairStart). The TV keeps the secret in memory;
-- the server passes sha256(secret) here.
create or replace function public.pairing_create(
  p_device_id text, p_secret_hash text, p_device_label text default 'TV', p_for_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  b int;
  bytes bytea;
  i int;
  tries int := 0;
  ch public.pairing_challenges;
begin
  if p_device_id is null or char_length(p_device_id) not between 8 and 128 then
    return jsonb_build_object('ok', false, 'error', 'invalid_device');
  end if;
  -- one creator at a time, so the global cap below cannot be raced past
  perform pg_advisory_xact_lock(hashtext('v1_pair_create'));
  if (select count(*) from public.pairing_challenges
       where device_id = p_device_id and created_at > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  -- retention: challenges and approve failures are kept for one day
  delete from public.pairing_challenges where created_at < now() - interval '1 day';
  delete from public.pairing_approve_failures where at < now() - interval '1 day';
  update public.pairing_challenges set status = 'expired'
   where status = 'awaiting' and expires_at <= now();
  -- global cap on live codes: device_id is chosen by an unauthenticated caller, so the
  -- per-device limit alone cannot stop a flood that crowds the 31^4 code space (a mistyped
  -- code would then likely hit an attacker's challenge). 500 live codes = 0.05% of the space.
  if (select count(*) from public.pairing_challenges
       where status = 'awaiting' and device_id <> p_device_id) >= 500 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  update public.pairing_challenges set status = 'cancelled', resolved_at = now()
   where status = 'awaiting' and device_id = p_device_id;
  loop
    tries := tries + 1;
    code := '';
    bytes := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
    i := 0;
    while char_length(code) < 4 and i < 32 loop
      b := get_byte(bytes, i);
      i := i + 1;
      if b < 248 then code := code || substr(alphabet, (b % 31) + 1, 1); end if;  -- 248 = 31*8: unbiased
    end loop;
    if char_length(code) = 4 and not exists (select 1 from public.pairing_challenges
        where status = 'awaiting' and code_hash = public.v1_pairing_code_hash(code)) then
      exit;
    end if;
    if tries > 20 then raise exception 'could not allocate a pairing code'; end if;
  end loop;
  insert into public.pairing_challenges (code_hash, device_id, device_label, secret_hash, for_user_id)
  values (public.v1_pairing_code_hash(code), p_device_id,
          coalesce(nullif(left(public.v1_trim(coalesce(p_device_label, '')), 60), ''), 'TV'),
          lower(p_secret_hash), p_for_user_id)
  returning * into ch;
  return jsonb_build_object('ok', true, 'id', ch.id, 'code', 'DLN-' || code, 'expires_at', ch.expires_at);
end $$;

create or replace function public.v1_pairing_check_secret(ch public.pairing_challenges, p_secret text)
returns boolean language plpgsql set search_path = '' as $$
begin
  if ch.secret_hash = public.v1_sha256_hex(p_secret) then return true; end if;
  update public.pairing_challenges
     set attempts = attempts + 1,
         status = case when attempts + 1 >= 5 and status in ('awaiting', 'approved') then 'cancelled' else status end,
         resolved_at = case when attempts + 1 >= 5 and status in ('awaiting', 'approved') then now() else resolved_at end
   where id = ch.id;
  return false;
end $$;

-- service_role only: TV polls with its in-memory secret
create or replace function public.pairing_status(p_id uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ch public.pairing_challenges;
begin
  select * into ch from public.pairing_challenges where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.v1_pairing_check_secret(ch, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'bad_secret');
  end if;
  if ch.status = 'awaiting' and ch.expires_at <= now() then
    update public.pairing_challenges set status = 'expired' where id = ch.id returning * into ch;
  end if;
  return jsonb_build_object('ok', true, 'status', ch.status, 'expires_at', ch.expires_at);
end $$;

-- service_role only: approved -> consumed exactly once; returns the user to mint a session for
create or replace function public.pairing_consume(p_id uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ch public.pairing_challenges;
begin
  select * into ch from public.pairing_challenges where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.v1_pairing_check_secret(ch, p_secret) then
    return jsonb_build_object('ok', false, 'error', 'bad_secret');
  end if;
  if ch.status = 'consumed' then return jsonb_build_object('ok', false, 'error', 'already_used'); end if;
  if ch.status <> 'approved' then return jsonb_build_object('ok', false, 'error', 'not_approved', 'status', ch.status); end if;
  if ch.resolved_at < now() - interval '2 minutes' then
    update public.pairing_challenges set status = 'expired' where id = ch.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  update public.pairing_challenges set status = 'consumed', consumed_at = now() where id = ch.id;
  return jsonb_build_object('ok', true, 'user_id', ch.approved_user_id, 'device_id', ch.device_id);
end $$;

-- service_role only: TV pressed Cancel
create or replace function public.pairing_cancel(p_id uuid, p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ch public.pairing_challenges;
begin
  select * into ch from public.pairing_challenges where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.v1_pairing_check_secret(ch, p_secret) then return jsonb_build_object('ok', false, 'error', 'bad_secret'); end if;
  if ch.status = 'awaiting' then
    update public.pairing_challenges set status = 'cancelled', resolved_at = now() where id = ch.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- shared lookup for the phone-side RPCs; records failures for the per-user attempt limit
create or replace function public.v1_pairing_lookup(p_code text, p_uid uuid, out ch_id uuid, out err text)
language plpgsql set search_path = '' as $$
declare
  h text := public.v1_pairing_code_hash(p_code);
  c public.pairing_challenges;
begin
  if (select count(*) from public.pairing_approve_failures
       where user_id = p_uid and at > now() - interval '10 minutes') >= 10 then
    err := 'rate_limited'; return;
  end if;
  -- global budget: many accounts x 10 guesses must not add up to a brute force of the 4-letter
  -- code (D8 fixes DLN-XXXX). Trade-off: a flood of failures pauses phone approvals for everyone
  -- for up to 10 min; tvPairStart/approve server functions add a per-IP limit on top.
  if (select count(*) from public.pairing_approve_failures where at > now() - interval '10 minutes') >= 100 then
    err := 'rate_limited'; return;
  end if;
  if h is not null then
    select * into c from public.pairing_challenges where code_hash = h
     order by (status = 'awaiting') desc, created_at desc limit 1 for update;
  end if;
  ch_id := c.id;
  if c.id is null then
    err := 'invalid_code';
  elsif c.status = 'awaiting' and c.expires_at <= now() then
    update public.pairing_challenges set status = 'expired' where id = c.id;
    err := 'expired';
  elsif c.status = 'expired' then
    err := 'expired';
  elsif c.status <> 'awaiting' then
    err := 'already_resolved';
  end if;
  if err is not null then
    insert into public.pairing_approve_failures (user_id) values (p_uid);
  end if;
end $$;

-- The first word of a profile's display name: all a pairing for a remembered tile may reveal (the
-- TV tile shows no more). for_user_id comes from an unauthenticated TV, so it is untrusted.
create or replace function public.v1_first_name(p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), '')
    from public.profiles p where p.id = p_user_id
$$;

create or replace function public.pairing_preview(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ch public.pairing_challenges; cid uuid; err text; fname text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if public.v1_is_device_session() then
    return jsonb_build_object('ok', false, 'error', 'device_session_forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtext('v1_pair:' || uid::text));
  select l.ch_id, l.err into cid, err from public.v1_pairing_lookup(p_code, uid) l;
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  select * into ch from public.pairing_challenges where id = cid;
  if ch.for_user_id is not null then
    fname := public.v1_first_name(ch.for_user_id);
  end if;
  return jsonb_build_object('ok', true, 'device_label', ch.device_label, 'created_at', ch.created_at,
    'expires_at', ch.expires_at,
    'for_other_user', ch.for_user_id is not null and ch.for_user_id <> uid, 'for_name', fname);
end $$;

create or replace function public.approve_pairing(p_code text, p_confirm_other_user boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ch public.pairing_challenges; cid uuid; err text; fname text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if public.v1_is_device_session() then
    return jsonb_build_object('ok', false, 'error', 'device_session_forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtext('v1_pair:' || uid::text));
  select l.ch_id, l.err into cid, err from public.v1_pairing_lookup(p_code, uid) l;
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  select * into ch from public.pairing_challenges where id = cid;
  if ch.for_user_id is not null and ch.for_user_id <> uid and not coalesce(p_confirm_other_user, false) then
    fname := public.v1_first_name(ch.for_user_id);
    return jsonb_build_object('ok', false, 'error', 'for_other_user', 'for_name', fname);
  end if;
  update public.pairing_challenges set status = 'approved', approved_user_id = uid, resolved_at = now()
   where id = ch.id;
  return jsonb_build_object('ok', true, 'device_label', ch.device_label);
end $$;

create or replace function public.deny_pairing(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); ch public.pairing_challenges; cid uuid; err text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if public.v1_is_device_session() then
    return jsonb_build_object('ok', false, 'error', 'device_session_forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtext('v1_pair:' || uid::text));
  select l.ch_id, l.err into cid, err from public.v1_pairing_lookup(p_code, uid) l;
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  select * into ch from public.pairing_challenges where id = cid;
  update public.pairing_challenges set status = 'denied', resolved_at = now() where id = ch.id;
  return jsonb_build_object('ok', true);
end $$;

-- TV, after verifyOtp: records its own auth session as a device grant. Requires a pairing
-- for this user and device consumed in the last 10 minutes that has no grant yet.
create or replace function public.device_grant_register(p_device_id text, p_label text default 'TV')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  ch public.pairing_challenges;
  g public.device_grants;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  begin
    sid := (auth.jwt() ->> 'session_id')::uuid;
  exception when others then sid := null;
  end;
  if sid is null then return jsonb_build_object('ok', false, 'error', 'no_session'); end if;
  select * into ch from public.pairing_challenges
   where approved_user_id = uid and device_id = p_device_id and status = 'consumed'
     and consumed_at > now() - interval '10 minutes' and grant_id is null
   order by consumed_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_pairing'); end if;
  insert into public.device_grants (user_id, device_id, label, session_id)
  values (uid, p_device_id, coalesce(nullif(left(public.v1_trim(coalesce(p_label, '')), 60), ''), ch.device_label), sid)
  returning * into g;
  update public.pairing_challenges set grant_id = g.id where id = ch.id;
  return jsonb_build_object('ok', true, 'grant', to_jsonb(g));
end $$;

-- TV re-checks its grant on load and every 60 s; false once revoked or its auth session is gone.
-- p_active: someone used the TV (remote or phone controller) since the last check. With no
-- activity for 15 minutes and no active/paused workout the grant is revoked here and its auth
-- session deleted, so a TV that was closed or reloaded without locking cannot reopen signed in.
create or replace function public.device_grant_touch(p_device_id text, p_active boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sid uuid; g public.device_grants; running boolean;
begin
  if uid is null then return jsonb_build_object('valid', false); end if;
  begin
    sid := (auth.jwt() ->> 'session_id')::uuid;
  exception when others then sid := null;
  end;
  select * into g from public.device_grants
   where user_id = uid and device_id = p_device_id and session_id = sid and revoked_at is null;
  if not found or not exists (select 1 from auth.sessions s where s.id = sid and s.user_id = uid) then
    return jsonb_build_object('valid', false);
  end if;
  running := exists (select 1 from public.workout_sessions w
                      where w.user_id = uid and w.state in ('active', 'paused'));
  if not coalesce(p_active, false) and not running
     and g.last_active_at < now() - interval '15 minutes' then
    update public.device_grants set revoked_at = now() where id = g.id;
    delete from auth.sessions where id = sid and user_id = uid;
    return jsonb_build_object('valid', false, 'reason', 'idle');
  end if;
  update public.device_grants set last_seen_at = now(),
    last_active_at = case when coalesce(p_active, false) or running then now() else last_active_at end
   where id = g.id;
  return jsonb_build_object('valid', true, 'grant_id', g.id);
end $$;

-- Lock / remove / revoke: kills the TV's refresh token immediately (D9).
create or replace function public.revoke_device_grant(p_grant_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); g public.device_grants;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into g from public.device_grants where id = p_grant_id and user_id = uid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- a TV may lock/sign out itself, never another device
  if public.v1_is_device_session()
     and g.session_id is distinct from nullif(auth.jwt() ->> 'session_id', '')::uuid then
    return jsonb_build_object('ok', false, 'error', 'device_session_forbidden');
  end if;
  update public.device_grants set revoked_at = coalesce(revoked_at, now()) where id = g.id;
  if g.session_id is not null then
    delete from auth.sessions where id = g.session_id and user_id = uid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Delete every V1 row the caller owns: sessions (with notes, summaries, commands, samples),
-- templates, zones, heart-rate registry/live/sensor rows, pairing rows and device grants (their
-- TV auth sessions are deleted too). Profile and auth user are kept; account deletion removes
-- the auth user and everything cascades. No second analytics copy exists (brief retention rule).
create or replace function public.delete_my_v1_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n_sessions int;
  n_templates int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if public.v1_is_device_session() then
    return jsonb_build_object('ok', false, 'error', 'device_session_forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtext('v1_session:' || uid::text));
  perform pg_advisory_xact_lock(hashtext('v1_hr:' || uid::text));
  delete from auth.sessions s using public.device_grants g
   where g.user_id = uid and g.session_id = s.id and s.user_id = uid;
  delete from public.device_grants where user_id = uid;
  delete from public.pairing_challenges where approved_user_id = uid or for_user_id = uid;
  delete from public.pairing_approve_failures where user_id = uid;
  delete from public.hr_live where user_id = uid;
  delete from public.hr_samples where user_id = uid;
  delete from public.hr_demo_samples where user_id = uid;
  delete from public.hr_sensors where user_id = uid;
  delete from public.hr_sources where user_id = uid;
  delete from public.session_commands where user_id = uid;
  delete from public.workout_sessions where user_id = uid;
  get diagnostics n_sessions = row_count;
  delete from public.workout_templates where user_id = uid;
  get diagnostics n_templates = row_count;
  delete from public.zone_configs where user_id = uid;
  return jsonb_build_object('ok', true, 'sessions', n_sessions, 'templates', n_templates);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges. Supabase grants EXECUTE to public by default, so everything is revoked
-- first. Pure helpers (validators, step builder, engine) are granted to authenticated because
-- the template check constraint and trigger run as the caller. The pairing steps that see
-- secrets are service_role only.
do $$
declare f text;
begin
  foreach f in array array[
    'v1_ms(timestamptz)', 'v1_ts(bigint)', 'v1_is_int(jsonb,numeric,numeric)', 'v1_is_num(jsonb,numeric,numeric)', 'v1_is_weight(jsonb)',
    'v1_trim(text)', 'v1_exercise_errors(jsonb,text)', 'v1_template_errors(text,jsonb)', 'v1_build_steps(jsonb)',
    'v1_engine_apply(jsonb,text,jsonb,integer,bigint)', 'v1_templates_guard()', 'v1_sessions_immutable()',
    'v1_engine_state(public.workout_sessions)', 'v1_is_device_session()',
    'session_start(uuid,uuid,boolean,text,timestamptz,boolean)',
    'session_command(uuid,uuid,integer,text,text,jsonb,timestamptz)',
    'session_note_save(uuid,text,integer)', 'session_hr_finalize(uuid,bigint[],bigint,integer,text[])',
    'server_time()', 'hr_request(integer)', 'hr_forget_sensor()',
    'hr_ingest(uuid,uuid,uuid,text,text,timestamptz,jsonb,boolean,jsonb,text,text)',
    'v1_pairing_code_hash(text)', 'v1_sha256_hex(text)',
    'pairing_create(text,text,text,uuid)', 'v1_pairing_check_secret(public.pairing_challenges,text)',
    'pairing_status(uuid,text)', 'pairing_consume(uuid,text)', 'pairing_cancel(uuid,text)',
    'v1_pairing_lookup(text,uuid)', 'v1_first_name(uuid)', 'pairing_preview(text)', 'approve_pairing(text,boolean)',
    'deny_pairing(text)', 'device_grant_register(text,text)', 'device_grant_touch(text,boolean)',
    'revoke_device_grant(uuid)', 'delete_my_v1_data()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
    if f not in ('pairing_create(text,text,text,uuid)', 'v1_pairing_check_secret(public.pairing_challenges,text)',
                 'pairing_status(uuid,text)', 'pairing_consume(uuid,text)', 'pairing_cancel(uuid,text)',
                 'v1_pairing_lookup(text,uuid)') then
      execute format('grant execute on function public.%s to authenticated', f);
    end if;
  end loop;
end $$;
