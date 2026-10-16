# Next Lovable prompts (drafted by the lead, not yet sent)

Paused on 2026-10-16 at the owner's request so the Phase 1 build can be tested on a phone. Send in this order when resuming; put the known issues from docs/CHANGELOG.md at the head of the first one.

## 1. Swap alternatives + exercise preferences (migration 0006)

Fix first: <filled from the Profile/Settings review>

Migration 0006 (paste the SQL in your reply): table public.exercise_preferences (id uuid pk default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade, exercise_id uuid not null references public.exercises(id) on delete cascade, stance text not null check (stance in ('avoid','prefer')), reason text, source public.record_source not null default 'user', idempotency_key text, archived_at timestamptz, created_at/updated_at timestamptz not null default now(), version int not null default 1); enable row level security; owner policy using/with check (owner_id = auth.uid()); coach read via public.coach_can_read(owner_id, 'goals_plan'); unique (owner_id, exercise_id) where archived_at is null; unique (owner_id, idempotency_key); bump_version trigger; index on (owner_id, exercise_id). Mirror in docs/preferences-schema.sql; journal and snapshot.

Slice: Swap alternatives + exercise preferences — FR-01, FR-05, FR-08, AT-06. Read design/docs/03-screens.md S04 lines 74-79 (Swap sheet: alternatives, "keeps: <pattern>", session-only) and the Exercise detail row (line 356-358); docs/brief-v2.md FR-01 (preferences), FR-05 (alternatives), FR-08 (preferences as structured facts), AT-06; docs/phase0-schema.sql exercises (movement, emphasis, equipment), equipment_items, limitations, limitation_links; src/routes/_authenticated/session.$id.tsx (Swap sheet), src/routes/_authenticated/_app/plan.exercise.$id.tsx (Alternatives placeholder).

Build. Alternatives: for the current exercise, list exercises with the same movement pattern, filtered to the user's available equipment, excluding exercises linked to an active or avoided limitation and exercises the user marked avoid; each row shows "keeps: <pattern>" and why it fits (equipment, no limitation) or is hidden. Swap stays session-only (no "Use from now on", FR-15 is Phase 2). Preferences: on Exercise detail and in the Swap sheet, "Avoid this exercise" / "Prefer this exercise" with an optional reason, written as insert through the outbox with an idempotency key; change = update:exercise_preferences with expectedVersion; archive to remove. Profile shows a Preferences list with edit/remove (FR-08 see, correct, remove). Preferred exercises sort first in alternatives; avoided are hidden with a "Show avoided" toggle. Dillan never writes a preference.

Phone: mark an exercise avoid with a reason → it disappears from alternatives, appears on Profile; prefer another → it sorts first; swap during a session keeps the plan unchanged on Train; offline mark → Saved on this device → Synced once.

Rules: outbox + idempotency key; every UPDATE sends the version it read; "Synced" only after stored:true; all states; preferences are facts, never a diagnosis.

Out: "Use from now on" proposals, routine editor changes, Phase 2. Keep all tests green.

Stop when this slice is complete and tell me what to test on my phone.
