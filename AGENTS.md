<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Sources of truth live in /docs/v1/ (dev-brief.md wins on conflict, then h10-design.md, build-plan.md decisions) and /design/v1/** (handoff, IA, flows, design system, mockups, prototype); start at docs/v1/README.md and read them before changing behavior or look. /docs/brief-v2.md and /design/docs/** describe the parked brief-v2 app.
- All colors/fonts/spacing come from src/styles/tokens.css (copy of /design/tokens/tokens.css), mapped to Tailwind in src/styles.css; components never hard-code values. Why: one theme layer, Night Gym for free.
- Brand components live in src/components/dillan/*; prefer them over shadcn ui. Why: matches design/v1/docs/04-design-system.md.
- Fonts are self-hosted in public/fonts (Satoshi, Newsreader) and @fontsource (M PLUS Rounded 1c). Why: no third-party font requests.
- Signed-in screens live under src/routes/_authenticated/_app (with nav shell); the session runner is _authenticated/session.$id without nav. Why: a session is a mode, not a tab.
- V1 data goes through the typed DillanApi (src/v1/data/api.ts); session changes are session_command RPCs with command id + expected revision, queued offline per user and session (src/v1/session/command-queue.ts, max 200; memory only on the TV). Pure logic lives in src/v1/core/* (no React, no Supabase). Why: server-authoritative state, build-plan D4/D12.
- (brief-v2, parked) User writes go through the IndexedDB outbox (src/lib/outbox.ts) with idempotency keys; "Synced" only after server ack. Why: offline set logging, brief §10.2.
- Timers derive from stored timestamps (V1: src/v1/core/timing.ts with the server_time() offset; parked: src/lib/timer.ts). Why: correct after a locked screen.
- public/sw.js caches app shell only, never signed-in data, skips /~oauth and server functions; registered only in production outside iframes. Why: brief §10.2.
- Schema changes must be shown to the owner and approved before applying; draft lives in docs/phase0-schema.sql (V1: drizzle/migrations/0006_v1_core.sql, copy docs/v1/v1-schema.sql, not applied until approved).
- (brief-v2, parked) Schema lives in docs/phase0-schema.sql (applied); every UPDATE must send the version it read, built via src/lib/updates.ts or outbox kind "update:<table>" with expectedVersion. Why: DB trigger enforces optimistic concurrency only when a version is sent.
- The service-role key is read from the sandbox environment at test time only (RUN_RLS_TESTS=1); never write it to .env or any repo file. Why: repo is public.
- (brief-v2, parked) Routine edits never update a version: "routine:save_version" inserts version N+1 (client-made id, blocks, then locked_at) via src/lib/plan.server.ts; an unsent save is what loadRoutine returns. Why: AT-03, past snapshots untouched, Train works offline after an edit.

- (brief-v2, parked) Profile/equipment/limitation edits go through outbox kinds update:profiles|equipment_items|limitations ({id, patch}) validated by src/lib/profile.ts; a second change to a row whose first is still unsent is merged into it (queueRowUpdate). Why: one version read per change, no self-conflict offline.
- (brief-v2, parked) Units live in profiles.preferences.units (old weight_unit/length_unit columns kept in step) and change display only. Why: entries keep the unit they were typed in (AT-22).
