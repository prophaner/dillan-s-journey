create or replace function public._resolve_exercise(_owner uuid, _name text, _demo boolean)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid; n text := btrim(_name);
begin
  if _owner is null then raise exception 'exercise owner required'; end if;
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

alter table public.routine_blocks disable trigger blocks_lock;
update public.routine_blocks b
   set prescriptions = (
     select jsonb_agg(
       case when p ? 'exercise_id' then p
            else p || jsonb_build_object('exercise_id',
                   public._resolve_exercise(b.owner_id, p->>'name', b.is_demo)) end
       order by ord)
     from jsonb_array_elements(b.prescriptions) with ordinality as e(p, ord))
 where exists (select 1 from jsonb_array_elements(b.prescriptions) p where not (p ? 'exercise_id'));
alter table public.routine_blocks enable trigger blocks_lock;

create index if not exists exercises_owner_lower_name on public.exercises (owner_id, lower(name)) where archived_at is null;
create index if not exists exercises_library_lower_name on public.exercises (lower(name)) where owner_id is null and archived_at is null;