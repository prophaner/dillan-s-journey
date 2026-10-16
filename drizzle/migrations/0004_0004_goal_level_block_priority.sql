alter table public.goals add column if not exists level text null;
alter table public.goals add constraint goals_level_check check (level in ('improve','maintain','defer'));
alter table public.routine_blocks drop constraint if exists routine_blocks_priority_check;
alter table public.routine_blocks add constraint routine_blocks_priority_check check (priority in ('main','optional','priority'));