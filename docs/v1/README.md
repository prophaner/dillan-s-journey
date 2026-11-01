# Dillan V1

Status (2026-10-31): built on branch `claude/v1-release` (Slices A–E plus this release-prep
slice). **Not released.** Migration 0006 is not applied to the live database, SMS is not
configured, and nothing has been checked on the Fire TV or with a real Polar H10 yet. Until
those are done this is a web prototype that runs against the dev-only mock, not a finished V1
(dev-brief: "Do not call the project complete when the UI runs against simulated metrics").

## What V1 is

A home-gym workout app for one household:

- **Phone or desktop browser (controller):** register or log in with a 6-digit email or SMS
  code, build workouts (straight sets and supersets) in **Program**, start one with
  **Workout Now**, log sets, pause / resume / end, write notes, see history in **Calendar** and
  weekly progress on **Home**.
- **Fire TV (display):** `/tv` in the Silk browser, remote-only (D-pad, Select, Back,
  Play/Pause). Each person signs the TV in by approving a code on their phone; one active
  person at a time, switch user blanks the screen first.
- **Live heart rate:** a Polar H10 strap read over Web Bluetooth by the `/relay` page running
  in Chrome on an Android device or Chrome/Edge on a laptop. Five heart-rate zones, time in
  zone, coverage and "Unmeasured" time; nothing is ever invented when readings stop.

Out of V1: AI coaching, plans, nutrition, Apple Watch / iPhone companion apps (replaced by the
H10 relay, `docs/v1/h10-design.md`), a packaged Fire TV app (Silk only for now).

Sources of truth, in priority order (`docs/v1/build-plan.md`):

1. `docs/v1/dev-brief.md` — behavior, privacy, acceptance (wins on conflict).
2. `docs/v1/h10-design.md` — heart-rate source; replaces every Apple Watch / iPhone part.
3. `design/v1/docs/05-developer-handoff.md` — screens S01–S15, TV input model, copy, acceptance 1–38
   (h10-design adds 39–47).
4. `design/v1/docs/02-…`, `03-…`, `04-design-system.md`, `design/v1/mockups/*.png`,
   `design/v1/prototype/js/*.js` (reference behavior).
5. `docs/v1/build-plan.md` — decisions D1–D26 (binding unless the owner changes them).

## Architecture

One TanStack Start (React 19) app, one Supabase project (Postgres + Auth + Realtime), hosted by
Lovable. No native code, no edge functions, no other providers.

```
Polar H10 ──BLE──▶ /relay (Chrome, Android or laptop)
                      │  hr_ingest RPC (~1/s, batched, idempotent)
                      ▼
               Supabase Postgres ── RLS, security-definer RPCs, server is authoritative
                      │  Realtime postgres_changes, per user, RLS-filtered
          ┌───────────┴────────────┐
          ▼                        ▼
   phone / desktop app        /tv (Silk on Fire TV)
   (controller + viewer)      (display + remote controller)
```

| Surface | Route(s) | Code |
|---|---|---|
| Phone / desktop app | `/`, `/program`, `/program/new`, `/program/$id`, `/workout`, `/workout/$templateId`, `/session/$id`, `/calendar`, `/calendar/$sessionId`, `/profile`, `/profile/zones`, `/profile/devices`, `/approve-tv`, `/auth` | `src/routes/**`, `src/v1/ui/*`, `src/v1/session/*` |
| TV | `/tv` (screens are app state, not URLs, D23); `/tv-approve?code=` is the QR deep link and redirects to `/approve-tv` | `src/routes/tv.tsx`, `src/v1/tv/*` |
| Relay | `/relay` (phone or computer only; on the TV it shows a QR handoff) | `src/routes/relay.tsx`, `src/v1/relay/*` |
| Pure logic (no React, no Supabase) | — | `src/v1/core/*` (engine, steps, validate, timing, zones, freshness, health, week, hr, finalize) |
| Data layer | — | `src/v1/data/api.ts` (typed `DillanApi`), `supabase-api.ts`, `mock-api.ts` (dev only), `*.functions.ts` (server functions) |
| Schema | — | `drizzle/migrations/0006_v1_core.sql` (copy: `docs/v1/v1-schema.sql`) |

Data path, in words:

1. **Session state.** Every change (start, complete/skip set, pause, resume, end) is a
   `session_command` RPC carrying a command id, the revision the user saw, the source
   (`phone`/`desktop`/`tv`) and the tap time. The server applies it at its own `now()` and
   returns the new row; ended is terminal (D4, D21). Clients interpolate timers from stored
   timestamps and the `server_time()` offset.
2. **Sync.** Phone and TV subscribe to their own `workout_sessions` row via Realtime and
   reconcile with RPC responses. Offline commands wait in a bounded per-user, per-session
   queue (200, localStorage on phone, memory only on TV) (D12).
3. **Heart rate.** `/relay` posts samples to `hr_ingest`; the server stores real samples in
   `hr_samples` (demo in `hr_demo_samples`) and moves one `hr_live` row per user forward.
   Viewers subscribe to `hr_live` + `hr_sensors` and compute Live / Delayed / No recent from
   the reading time against the server clock (≤10 s Live, ≤30 s Delayed).
4. **Summary.** End writes `session_summaries`; the `finalizeSessionHr` server function computes
   zone totals from the stored samples with the same `src/v1/core/zones.ts` used live and saves
   them through `session_hr_finalize` (zones + Unmeasured = active time).
5. **TV sign-in.** Device authorization (D8): TV gets a `DLN-XXXX` code and an in-memory
   secret, the phone approves, the server mints a one-time magic-link hash for the secret
   holder only, the TV exchanges it and registers a `device_grants` row (D9, D25).

More detail: `docs/v1/api-data.md`.

## Run locally

Needs Node.js 22+ and npm (the repo also has `bun.lock`; do not hand-edit it).

```sh
npm install
cp .env.example .env   # only if you have no .env; fill in the publishable values
npm run dev            # open the local URL Vite prints
```

The committed `.env` is Lovable's and contains only the project URL and the **publishable**
key. Never put the service-role key in `.env` or any repo file.

### Mock mode (`?mock=1`, dev builds only)

Open any page with `?mock=1` (for example `http://localhost:<port>/?mock=1`). The tab then uses
an in-memory/localStorage backend (`src/v1/data/mock-api.ts`) that runs the same core engine,
with two synthetic household users, templates and history (`mock-fixtures.ts`), a simulated
strap (`mock-hr.ts`) and a "Mock data" badge on every screen. `?mock=0` turns it off. Production
builds drop the mock module entirely.

Useful mock flows:

- **TV + phone in one browser:** open `/tv?mock=1` in one tab, then
  `/approve-tv?mock=1&code=DLN-…` in another (the TV keeps its own mock sign-in).
- **Relay without a strap:** `/relay?mock=1` offers "Simulate strap (DEMO)"; DEMO readings
  count only in demo workouts.
- **Freshness checks:** the mock strap state is in localStorage `dillan.mock.hr`
  (`live`, `delayed`, `stale`, `waiting`, `off`).

Web Bluetooth needs a secure context: `localhost` works on a laptop; an Android relay needs the
published HTTPS URL. It never works inside the Lovable editor preview frame.

## Environment variables

`.env.example` (placeholders only):

| Name | Where used | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | browser client | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser client | Publishable (or legacy anon) key — public by design |
| `VITE_SUPABASE_PROJECT_ID` | Lovable tooling | Project ref |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` | server-side rendering / server functions | Same values as above |
| `SUPABASE_SERVICE_ROLE_KEY` | server functions only (`src/integrations/supabase/client.server.ts`): TV pairing, Delete account | **Hosting secret only.** Never in `.env`, the repo, logs or chat |

## Tests and checks

```sh
npx vitest run       # unit, component and SQL tests (SQL runs 0006 in-process on PGlite)
npx tsc --noEmit     # typecheck
npx eslint src       # lint (pre-V1 files have known prettier errors, docs/v1/issues.md O17;
                     #   V1 code: npx eslint src/v1 src/routes src/test/v1 is clean)
npm run build        # production build
```

V1 tests live in `src/test/v1/` (engine and validation fixtures are shared by the TS and SQL
twins). `src/test/rls-isolation.test.ts` runs only with `RUN_RLS_TESTS=1` and a service-role key
from the sandbox environment, against the Phase-0 tables. Automated tests do not replace the
physical checks in `docs/v1/physical-test-checklist.md`.

## Other V1 docs

| File | For |
|---|---|
| `docs/v1/setup-owner.md` | Owner steps: approve and apply 0006, Auth settings, SMS, Realtime, URLs, TV in Silk, relay, demo script |
| `docs/v1/api-data.md` | Tables, RPCs, server functions, Realtime, retention and deletion |
| `docs/v1/runbook.md` | Deploy, rollback, incident checks |
| `docs/v1/physical-test-checklist.md` | Fire TV + H10 + phones, with record tables |
| `docs/v1/issues.md` | Blockers, optional improvements, deviations from the design docs |
| `docs/v1/build-plan.md` | Decisions D1–D26 and per-slice notes |
| `docs/v1/owner-setup.md` | Superseded by `setup-owner.md` (kept for history) |
