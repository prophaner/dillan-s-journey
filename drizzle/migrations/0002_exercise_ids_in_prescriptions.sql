create or replace function public._resolve_exercise(_owner uuid, _name text, _demo boolean)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid; n text := btrim(_name);
begin
  if n is null or n = '' then raise exception 'exercise name required'; end if;
  select id into v from public.exercises
   where owner_id is null and archived_at is null and lower(name) = lower(n) limit 1;
  if v is not null then return v; end if;
  select id into v from public.exercises
   where owner_id = _owner and archived_at is null and lower(name) = lower(n)
     and is_demo = _demo limit 1;
  if v is not null then return v; end if;
  insert into public.exercises (owner_id, name, source, is_demo)
  values (_owner, n, case when _demo then 'system'::record_source else 'user'::record_source end, _demo)
  returning id into v;
  return v;
end $$;
revoke all on function public._resolve_exercise(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.resolve_exercise_id(_name text)
returns uuid language sql security definer set search_path to 'public' as $$
  select public._resolve_exercise(auth.uid(), _name, false)
$$;
revoke all on function public.resolve_exercise_id(text) from public, anon;
grant execute on function public.resolve_exercise_id(text) to authenticated;

create or replace function public.create_demo_routine(_owner uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_routine uuid := gen_random_uuid(); v_version uuid;
  e_sq uuid; e_row uuid; e_push uuid; e_bug uuid;
begin
  e_sq := public._resolve_exercise(_owner, 'Goblet squat', true);
  e_row := public._resolve_exercise(_owner, 'Dumbbell row', true);
  e_push := public._resolve_exercise(_owner, 'Push-up', true);
  e_bug := public._resolve_exercise(_owner, 'Dead bug', true);

  insert into public.routine_template_versions
    (owner_id, routine_id, version_no, title, purpose, status, source, is_demo)
  values (_owner, v_routine, 1, 'Demo · Full body A',
          'Synthetic demo routine. Delete it when you add your own.', 'approved', 'system', true)
  returning id into v_version;

  insert into public.routine_blocks
    (owner_id, template_version_id, position, block_type, rounds, rest_seconds, priority, prescriptions, is_demo)
  values
    (_owner, v_version, 1, 'single', 3, 120, 'main',
     jsonb_build_array(jsonb_build_object('exercise_id',e_sq,'name','Goblet squat','sets',3,'reps',8,'load',35,'unit','lb','rir',2)), true),
    (_owner, v_version, 2, 'superset', 3, 90, 'main',
     jsonb_build_array(
       jsonb_build_object('exercise_id',e_row,'name','Dumbbell row','sets',3,'reps',10,'load',30,'unit','lb','rir',2),
       jsonb_build_object('exercise_id',e_push,'name','Push-up','sets',3,'reps',10,'rir',2)), true),
    (_owner, v_version, 3, 'single', 2, 60, 'optional',
     jsonb_build_array(jsonb_build_object('exercise_id',e_bug,'name','Dead bug','sets',2,'reps',10)), true);

  insert into public.scheduled_sessions
    (owner_id, planned_date, template_version_id, status, source, is_demo)
  values (_owner, current_date, v_version, 'planned', 'system', true);
end $function$;
revoke all on function public.create_demo_routine(uuid) from public, anon, authenticated;