-- Dillan · Phase 0 schema — approved by the owner and applied 2026-10-15. Source: docs/phase0-schema.sql

create type public.record_source as enum ('user','coach','dillan','import','system');
create type public.grant_scope   as enum ('progress','goals_plan','limitations','measurements');
create type public.grant_status  as enum ('invited','accepted','revoked');

create or replace function public.bump_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.version is distinct from old.version then
    raise exception 'version conflict' using errcode = '40001';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

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
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles: owner all" on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create trigger profiles_version before update on public.profiles
  for each row execute function public.bump_version();

create table public.coach_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete cascade,
  invite_email text not null,
  scopes public.grant_scope[] not null default '{}',
  status public.grant_status not null default 'invited',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (coach_id is null or coach_id <> owner_id)
);
grant select, insert, update, delete on public.coach_access_grants to authenticated;
grant all on public.coach_access_grants to service_role;
alter table public.coach_access_grants enable row level security;
create policy "grants: owner all" on public.coach_access_grants for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "grants: coach read" on public.coach_access_grants for select to authenticated
  using (coach_id = auth.uid() or lower(invite_email) = lower(auth.jwt() ->> 'email'));
create trigger grants_version before update on public.coach_access_grants
  for each row execute function public.bump_version();

create or replace function public.accept_grant(_grant_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.coach_access_grants
     set coach_id = auth.uid(), status = 'accepted', accepted_at = now()
   where id = _grant_id
     and status = 'invited'
     and lower(invite_email) = lower(auth.jwt() ->> 'email')
     and owner_id <> auth.uid();
  if not found then raise exception 'invite not found'; end if;
end $$;

create or replace function public.grants_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.coach_id is not null or new.status <> 'invited' then
      raise exception 'new grants start as invited with no coach';
    end if;
    return new;
  end if;
  if current_user not in ('postgres','supabase_admin') and
     (new.coach_id is distinct from old.coach_id or
      (new.status = 'accepted' and old.status <> 'accepted')) then
    raise exception 'only the invited coach can accept, via accept_grant()';
  end if;
  if new.status = 'revoked' and old.status <> 'revoked' then
    new.revoked_at := now();
  end if;
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'revoked grants cannot be reopened; create a new invite';
  end if;
  return new;
end $$;
create trigger grants_guard before insert or update on public.coach_access_grants
  for each row execute function public.grants_guard();
revoke all on function public.accept_grant(uuid) from public, anon;
grant execute on function public.accept_grant(uuid) to authenticated;

create or replace function public.coach_can_read(_owner uuid, _scope public.grant_scope)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_access_grants g
     where g.owner_id = _owner and g.coach_id = auth.uid()
       and g.status = 'accepted' and g.revoked_at is null
       and _scope = any (g.scopes))
$$;

create or replace function public.coach_trainee_profiles()
returns table (id uuid, display_name text, timezone text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.display_name, p.timezone
    from public.profiles p
    join public.coach_access_grants g on g.owner_id = p.id
   where g.coach_id = auth.uid() and g.status = 'accepted' and g.revoked_at is null
$$;
revoke all on function public.coach_trainee_profiles() from public, anon;
grant execute on function public.coach_trainee_profiles() to authenticated;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid,
  action text not null,
  target_table text not null,
  target_id uuid not null,
  target_version int not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_target on public.audit_events (target_table, target_id, created_at desc);
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;
alter table public.audit_events enable row level security;
create policy "audit: owner read" on public.audit_events for select to authenticated
  using (owner_id = auth.uid());

create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old) - 'feedback' - 'preferences';
  n jsonb;
  k text;
  b jsonb := '{}';
  a jsonb := '{}';
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.profiles where id = old.owner_id) then return old; end if;
    insert into public.audit_events(owner_id, actor_id, action, target_table, target_id, target_version, before, after)
    values (old.owner_id, auth.uid(), 'delete', tg_table_name, old.id, old.version,
            o - 'updated_at' - 'created_at', null);
    return old;
  end if;
  n := to_jsonb(new) - 'feedback' - 'preferences';
  for k in select jsonb_object_keys(n) loop
    if k not in ('version','updated_at') and (n -> k) is distinct from (o -> k) then
      b := b || jsonb_build_object(k, o -> k);
      a := a || jsonb_build_object(k, n -> k);
    end if;
  end loop;
  insert into public.audit_events(owner_id, actor_id, action, target_table, target_id, target_version, before, after)
  values (old.owner_id, auth.uid(), 'update', tg_table_name, old.id, new.version, b, a);
  return new;
end $$;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  movement text,
  muscles text[] not null default '{}',
  cues text[] not null default '{}',
  equipment text[] not null default '{}',
  content_source text,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','reviewed')),
  source public.record_source not null default 'user',
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
grant select, insert, update, delete on public.exercises to authenticated;
grant all on public.exercises to service_role;
alter table public.exercises enable row level security;
create policy "exercises: read library" on public.exercises for select to authenticated
  using (owner_id is null);
create policy "exercises: owner all" on public.exercises for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "exercises: coach read" on public.exercises for select to authenticated
  using (owner_id is not null and public.coach_can_read(owner_id, 'goals_plan'));
create trigger exercises_version before update on public.exercises
  for each row execute function public.bump_version();

create table public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  quantity int not null default 1 check (quantity >= 0),
  capacity numeric,
  capacity_unit text check (capacity_unit in ('lb','kg')),
  increments numeric[] not null default '{}',
  attachments jsonb not null default '[]',
  available boolean not null default true,
  source public.record_source not null default 'user',
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
grant select, insert, update, delete on public.equipment_items to authenticated;
grant all on public.equipment_items to service_role;
alter table public.equipment_items enable row level security;
create policy "equipment: owner all" on public.equipment_items for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "equipment: coach read" on public.equipment_items for select to authenticated
  using (public.coach_can_read(owner_id, 'goals_plan'));
create trigger equipment_version before update on public.equipment_items
  for each row execute function public.bump_version();

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.goals(id) on delete set null,
  title text not null,
  priority int not null default 1,
  metric text,
  target numeric,
  target_unit text,
  baseline_ref uuid,
  deadline date,
  status text not null default 'active' check (status in ('active','paused','done','archived')),
  source public.record_source not null default 'user',
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
grant select, insert, update, delete on public.goals to authenticated;
grant all on public.goals to service_role;
alter table public.goals enable row level security;
create policy "goals: owner all" on public.goals for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "goals: coach read" on public.goals for select to authenticated
  using (public.coach_can_read(owner_id, 'goals_plan'));
create trigger goals_version before update on public.goals
  for each row execute function public.bump_version();

create table public.routine_template_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  routine_id uuid not null,
  version_no int not null default 1,
  title text not null,
  purpose text,
  status text not null default 'draft' check (status in ('draft','approved')),
  approved_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  source public.record_source not null default 'user',
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (routine_id, version_no)
);
grant select, insert, update, delete on public.routine_template_versions to authenticated;
grant all on public.routine_template_versions to service_role;
alter table public.routine_template_versions enable row level security;
create policy "rtv: owner all" on public.routine_template_versions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "rtv: coach read" on public.routine_template_versions for select to authenticated
  using (public.coach_can_read(owner_id, 'goals_plan'));

create or replace function public.rtv_lock_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.locked_at is not null and
     (new.title, new.purpose, new.status, new.version_no, new.routine_id)
       is distinct from (old.title, old.purpose, old.status, old.version_no, old.routine_id) then
    raise exception 'this routine version was used in a session; save a new version instead';
  end if;
  if old.locked_at is not null and new.locked_at is null then
    raise exception 'locked versions stay locked';
  end if;
  return new;
end $$;
create trigger rtv_lock before update on public.routine_template_versions
  for each row execute function public.rtv_lock_guard();
create trigger rtv_version before update on public.routine_template_versions
  for each row execute function public.bump_version();

create table public.routine_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  template_version_id uuid not null references public.routine_template_versions(id) on delete cascade,
  position int not null,
  block_type text not null check (block_type in ('single','superset','circuit','warmup','cooldown')),
  rounds int not null default 1,
  rest_seconds int,
  priority text not null default 'main' check (priority in ('main','optional')),
  prescriptions jsonb not null default '[]',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (template_version_id, position)
);
grant select, insert, update, delete on public.routine_blocks to authenticated;
grant all on public.routine_blocks to service_role;
alter table public.routine_blocks enable row level security;
create policy "blocks: owner all" on public.routine_blocks for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "blocks: coach read" on public.routine_blocks for select to authenticated
  using (public.coach_can_read(owner_id, 'goals_plan'));

create or replace function public.blocks_lock_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_id uuid := coalesce(new.template_version_id, old.template_version_id);
begin
  if exists (select 1 from public.routine_template_versions
              where id = v_id and locked_at is not null) then
    raise exception 'this routine version was used in a session; save a new version instead';
  end if;
  return coalesce(new, old);
end $$;
create trigger blocks_lock before insert or update or delete on public.routine_blocks
  for each row execute function public.blocks_lock_guard();
create trigger blocks_version before update on public.routine_blocks
  for each row execute function public.bump_version();

create table public.goal_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete cascade,
  block_id uuid references public.routine_blocks(id) on delete cascade,
  relationship_note text,
  created_at timestamptz not null default now(),
  check (exercise_id is not null or block_id is not null)
);
grant select, insert, update, delete on public.goal_links to authenticated;
grant all on public.goal_links to service_role;
alter table public.goal_links enable row level security;
create policy "goal_links: owner all" on public.goal_links for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "goal_links: coach read" on public.goal_links for select to authenticated
  using (public.coach_can_read(owner_id, 'goals_plan'));

create table public.limitations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  location text,
  side text check (side in ('left','right','both','none')),
  context text,
  status text not null default 'active' check (status in ('active','resolved','archived')),
  review_date date,
  coach_shareable boolean not null default false,
  source public.record_source not null default 'user',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
grant select, insert, update, delete on public.limitations to authenticated;
grant all on public.limitations to service_role;
alter table public.limitations enable row level security;
create policy "limitations: owner all" on public.limitations for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "limitations: coach read shareable" on public.limitations for select to authenticated
  using (coach_shareable and public.coach_can_read(owner_id, 'limitations'));
create trigger limitations_version before update on public.limitations
  for each row execute function public.bump_version();

create table public.limitation_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  limitation_id uuid not null references public.limitations(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete cascade,
  block_id uuid references public.routine_blocks(id) on delete cascade,
  relationship_note text,
  created_at timestamptz not null default now(),
  check (exercise_id is not null or block_id is not null)
);
grant select, insert, update, delete on public.limitation_links to authenticated;
grant all on public.limitation_links to service_role;
alter table public.limitation_links enable row level security;
create policy "limitation_links: owner all" on public.limitation_links for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "limitation_links: coach read shareable" on public.limitation_links for select to authenticated
  using (public.coach_can_read(owner_id, 'limitations') and exists (
    select 1 from public.limitations l where l.id = limitation_id and l.coach_shareable));

create table public.scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  planned_date date not null,
  template_version_id uuid not null references public.routine_template_versions(id) on delete cascade,
  status text not null default 'planned' check (status in ('planned','done','skipped','moved')),
  source public.record_source not null default 'user',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
grant select, insert, update, delete on public.scheduled_sessions to authenticated;
grant all on public.scheduled_sessions to service_role;
alter table public.scheduled_sessions enable row level security;
create policy "scheduled: owner all" on public.scheduled_sessions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "scheduled: coach read" on public.scheduled_sessions for select to authenticated
  using (public.coach_can_read(owner_id, 'progress'));
create trigger scheduled_version before update on public.scheduled_sessions
  for each row execute function public.bump_version();

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  template_version_id uuid not null references public.routine_template_versions(id),
  scheduled_session_id uuid references public.scheduled_sessions(id) on delete set null,
  plan_snapshot jsonb not null,
  time_choice text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  local_date date not null,
  timezone text not null,
  completion text not null default 'in_progress'
    check (completion in ('in_progress','complete','partial','stopped')),
  feedback jsonb not null default '{}',
  idempotency_key text not null,
  source public.record_source not null default 'user',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (owner_id, idempotency_key)
);
grant select, insert, update, delete on public.sessions to authenticated;
grant all on public.sessions to service_role;
alter table public.sessions enable row level security;
create policy "sessions: owner all" on public.sessions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sessions: coach read" on public.sessions for select to authenticated
  using (public.coach_can_read(owner_id, 'progress'));

create or replace function public.sessions_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.plan_snapshot is distinct from old.plan_snapshot
     or new.template_version_id is distinct from old.template_version_id
     or new.owner_id is distinct from old.owner_id
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'the plan a session ran against cannot change';
  end if;
  return new;
end $$;
create trigger sessions_freeze before update on public.sessions
  for each row execute function public.sessions_freeze();
create trigger sessions_version before update on public.sessions
  for each row execute function public.bump_version();
create trigger sessions_audit after update or delete on public.sessions
  for each row execute function public.write_audit();

create or replace function public.lock_template_on_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.routine_template_versions
     set locked_at = now(), version = version
   where id = new.template_version_id and locked_at is null and owner_id = new.owner_id;
  return new;
end $$;
create trigger sessions_lock_template after insert on public.sessions
  for each row execute function public.lock_template_on_session();

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  prescription_ref text,
  exercise_id uuid references public.exercises(id) on delete set null,
  set_no int not null,
  side text check (side in ('left','right','both','none')),
  reps int check (reps >= 0),
  load numeric check (load >= 0),
  load_unit text not null default 'lb' check (load_unit in ('lb','kg')),
  entered_value text,
  rir numeric check (rir >= 0),
  logged_at timestamptz not null default now(),
  idempotency_key text not null,
  source public.record_source not null default 'user',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (owner_id, idempotency_key)
);
grant select, insert, update, delete on public.set_logs to authenticated;
grant all on public.set_logs to service_role;
alter table public.set_logs enable row level security;
create policy "set_logs: owner all" on public.set_logs for all to authenticated
  using (owner_id = auth.uid()) with check (
    owner_id = auth.uid() and exists (
      select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid()));
create policy "set_logs: coach read" on public.set_logs for select to authenticated
  using (public.coach_can_read(owner_id, 'progress'));

create or replace function public.set_logs_correction_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.exercise_id is distinct from old.exercise_id and new.exercise_id is not null then
    raise exception 'only reps, load, unit, effort and side can be corrected';
  end if;
  if (new.owner_id, new.session_id, new.set_no, new.prescription_ref,
      new.idempotency_key, new.logged_at, new.source)
     is distinct from
     (old.owner_id, old.session_id, old.set_no, old.prescription_ref,
      old.idempotency_key, old.logged_at, old.source) then
    raise exception 'only reps, load, unit, effort and side can be corrected';
  end if;
  return new;
end $$;
create trigger set_logs_guard before update on public.set_logs
  for each row execute function public.set_logs_correction_guard();
create trigger set_logs_version before update on public.set_logs
  for each row execute function public.bump_version();
create trigger set_logs_audit after update or delete on public.set_logs
  for each row execute function public.write_audit();

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  site text,
  side text check (side in ('left','right','both','none')),
  value numeric not null,
  unit text not null,
  entered_value text,
  method text,
  observed_at timestamptz not null,
  source public.record_source not null default 'user',
  provenance jsonb not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
grant select, insert, update, delete on public.measurements to authenticated;
grant all on public.measurements to service_role;
alter table public.measurements enable row level security;
create policy "measurements: owner all" on public.measurements for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "measurements: coach read" on public.measurements for select to authenticated
  using (public.coach_can_read(owner_id, 'measurements'));
create trigger measurements_version before update on public.measurements
  for each row execute function public.bump_version();

create index set_logs_session on public.set_logs (session_id);
create index sessions_owner_date on public.sessions (owner_id, local_date desc);
create index scheduled_owner_date on public.scheduled_sessions (owner_id, planned_date);
create index grants_coach on public.coach_access_grants (coach_id);
create index grants_owner on public.coach_access_grants (owner_id);

create or replace function public.create_demo_routine(_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_routine uuid := gen_random_uuid(); v_version uuid;
begin
  insert into public.routine_template_versions
    (owner_id, routine_id, version_no, title, purpose, status, source, is_demo)
  values (_owner, v_routine, 1, 'Demo · Full body A',
          'Synthetic demo routine. Delete it when you add your own.', 'approved', 'system', true)
  returning id into v_version;

  insert into public.routine_blocks
    (owner_id, template_version_id, position, block_type, rounds, rest_seconds, priority, prescriptions, is_demo)
  values
    (_owner, v_version, 1, 'single', 3, 120, 'main',
     '[{"name":"Goblet squat","sets":3,"reps":8,"load":35,"unit":"lb","rir":2}]', true),
    (_owner, v_version, 2, 'superset', 3, 90, 'main',
     '[{"name":"Dumbbell row","sets":3,"reps":10,"load":30,"unit":"lb","rir":2},
       {"name":"Push-up","sets":3,"reps":10,"rir":2}]', true),
    (_owner, v_version, 3, 'single', 2, 60, 'optional',
     '[{"name":"Dead bug","sets":2,"reps":10}]', true);

  insert into public.scheduled_sessions
    (owner_id, planned_date, template_version_id, status, source, is_demo)
  values (_owner, current_date, v_version, 'planned', 'system', true);
end $$;
revoke all on function public.create_demo_routine(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  perform public.create_demo_routine(new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.delete_my_demo_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.set_logs where owner_id = auth.uid() and is_demo;
  delete from public.sessions where owner_id = auth.uid() and is_demo;
  delete from public.scheduled_sessions where owner_id = auth.uid() and is_demo;
  delete from public.routine_template_versions
   where owner_id = auth.uid() and is_demo
     and not exists (select 1 from public.sessions s where s.template_version_id = routine_template_versions.id);
  delete from public.exercises where owner_id = auth.uid() and is_demo;
  delete from public.goals where owner_id = auth.uid() and is_demo;
  delete from public.equipment_items where owner_id = auth.uid() and is_demo;
end $$;
revoke all on function public.delete_my_demo_data() from public, anon;
grant execute on function public.delete_my_demo_data() to authenticated;