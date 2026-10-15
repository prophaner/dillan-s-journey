-- Dillan · S12 Onboarding — schema additions. DRAFT FOR OWNER REVIEW, NOT APPLIED.
-- Adds only columns; no new tables, no new policies. Existing RLS already covers every row:
-- owners read/write their own; coaches never see profiles beyond name + time zone.
-- NULL always means "Not yet known" (shown as "—" + dashed tag), never 0.

-- 1. Profile answers from onboarding (owner-only; not shared with coaches by any scope)
alter table public.profiles
  add column onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started','in_progress','done')),
  add column onboarding_step int not null default 1 check (onboarding_step between 1 and 7),
  add column days_per_week int check (days_per_week between 1 and 7),          -- null = not yet known
  add column session_minutes int check (session_minutes between 10 and 180),   -- null = not yet known
  add column limitations_answer text
    check (limitations_answer in ('listed','none_known','prefer_not'));        -- null = not yet known

-- 2. Goals keep the user's own words next to the editable objective
alter table public.goals
  add column user_words text,
  add column idempotency_key text,
  add constraint goals_owner_idem unique (owner_id, idempotency_key);

-- 3. Equipment: a display name and a short detail ("Doorway", "5–52.5 lb · 2.5 steps")
alter table public.equipment_items
  add column label text,
  add column detail text,
  add column idempotency_key text,
  add constraint equipment_owner_idem unique (owner_id, idempotency_key);

-- 4. Limitations remember where they came from ("You, onboarding")
alter table public.limitations
  add column origin text check (origin in ('onboarding','session','settings','coach_note')),
  add column idempotency_key text,
  add constraint limitations_owner_idem unique (owner_id, idempotency_key);

-- 5. A routine typed in during onboarding is saved as-is (FR-01, AT-01)
alter table public.routine_template_versions
  add column idempotency_key text,
  add constraint rtv_owner_idem unique (owner_id, idempotency_key);
