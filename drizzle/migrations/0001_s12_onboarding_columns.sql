alter table public.profiles
  add column onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started','in_progress','done')),
  add column onboarding_step int not null default 1 check (onboarding_step between 1 and 7),
  add column days_per_week int check (days_per_week between 1 and 7),
  add column session_minutes int check (session_minutes between 10 and 180),
  add column limitations_answer text
    check (limitations_answer in ('listed','none_known','prefer_not'));

alter table public.goals
  add column user_words text,
  add column idempotency_key text,
  add constraint goals_owner_idem unique (owner_id, idempotency_key);

alter table public.equipment_items
  add column label text,
  add column detail text,
  add column idempotency_key text,
  add constraint equipment_owner_idem unique (owner_id, idempotency_key);

alter table public.limitations
  add column origin text check (origin in ('onboarding','session','settings','coach_note')),
  add column idempotency_key text,
  add constraint limitations_owner_idem unique (owner_id, idempotency_key);

alter table public.routine_template_versions
  add column idempotency_key text,
  add constraint rtv_owner_idem unique (owner_id, idempotency_key);