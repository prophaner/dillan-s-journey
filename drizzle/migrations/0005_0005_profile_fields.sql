alter table public.limitations drop constraint limitations_status_check;
alter table public.limitations add constraint limitations_status_check
  check (status in ('active','accommodated','avoided','pending','resolved','archived'));
alter table public.profiles
  add column experience text check (experience in ('new','returning','experienced')),
  add column training_days smallint[],
  add column week_start smallint check (week_start between 0 and 6);