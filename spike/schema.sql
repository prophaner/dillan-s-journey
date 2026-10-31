-- Dillan H10 hardware spike: throwaway tables.
-- Run this in a SEPARATE, free Supabase project (Dashboard -> SQL Editor -> New query -> Run).
-- Do not run it in the Dillan app's database. Delete the project when the spike is done.
--
-- Security note: the policies below let anyone holding this project's anon key read and
-- write these two tables. That is acceptable only because the project is throwaway and
-- the data is a heart-rate test trace. Never reuse this pattern in the real app.

create table if not exists public.spike_hr (
  id           bigint generated always as identity primary key,
  run_id       text        not null,               -- one per spike session (set on the relay page)
  stream_id    text        not null,               -- one per relay page load
  seq          integer     not null,               -- monotonic within stream_id
  device_label text,                                -- e.g. 'Pixel 7 Chrome', 'Office laptop'
  measured_at  timestamptz not null,               -- relay clock + server offset at notification receipt
  received_at  timestamptz not null default now(), -- server clock at insert
  bpm          integer,                            -- null when contact is false
  contact      boolean,                            -- null = strap does not report contact
  rr_ms        integer[],
  is_demo      boolean     not null default false, -- true = simulated, never a real reading
  unique (stream_id, seq)
);

create table if not exists public.spike_events (
  id         bigint generated always as identity primary key,
  event_id   text        unique,                   -- client-made id; makes retried uploads idempotent
  run_id     text        not null,
  source     text        not null,                 -- 'relay' or 'tv'
  device     text,
  client_at  timestamptz,                          -- server-corrected client time of the event
  at         timestamptz not null default now(),
  kind       text        not null,                 -- e.g. 'connect', 'gatt_disconnected', 'key', 'suspended'
  detail     jsonb
);

-- If you ran an earlier version of this file, this adds the column it lacked.
alter table public.spike_events add column if not exists event_id text unique;

create index if not exists spike_hr_run_idx on public.spike_hr (run_id, measured_at);
create index if not exists spike_events_run_idx on public.spike_events (run_id, at);

alter table public.spike_hr enable row level security;
alter table public.spike_events enable row level security;

drop policy if exists spike_hr_rw on public.spike_hr;
create policy spike_hr_rw on public.spike_hr for all to anon using (true) with check (true);
drop policy if exists spike_events_rw on public.spike_events;
create policy spike_events_rw on public.spike_events for all to anon using (true) with check (true);

grant select, insert on public.spike_hr, public.spike_events to anon;

-- Realtime: the TV page listens for inserts on spike_hr (same mechanism as the real hr_live row).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'spike_hr'
  ) then
    alter publication supabase_realtime add table public.spike_hr;
  end if;
end $$;

-- Server clock, used by every page to correct its own clock before stamping or measuring latency.
create or replace function public.spike_server_time()
returns timestamptz
language sql
stable
as $$ select now() $$;

grant execute on function public.spike_server_time() to anon;

-- Handy query after the spike: per-run latency (measured -> server insert) and gaps.
-- select run_id, count(*) as samples,
--        percentile_cont(0.5)  within group (order by extract(epoch from received_at - measured_at)) as p50_upload_s,
--        percentile_cont(0.95) within group (order by extract(epoch from received_at - measured_at)) as p95_upload_s
-- from public.spike_hr where not is_demo group by run_id order by min(measured_at) desc;
