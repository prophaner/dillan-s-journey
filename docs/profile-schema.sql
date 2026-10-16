-- Dillan · Profile & Settings — migration 0005 (applied). Mirrors drizzle/migrations/0005_0005_profile_fields.sql.
-- Limitation statuses for Profile; experience, training days and start of week. NULL = Not yet known.
alter table public.limitations drop constraint limitations_status_check;
alter table public.limitations add constraint limitations_status_check
  check (status in ('active','accommodated','avoided','pending','resolved','archived'));
alter table public.profiles
  add column experience text check (experience in ('new','returning','experienced')),
  add column training_days smallint[],
  add column week_start smallint check (week_start between 0 and 6);
