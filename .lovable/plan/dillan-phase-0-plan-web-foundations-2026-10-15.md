# Dillan — Phase 0 plan (web foundations)

Sources read: brief v2 (§3, §4, §9, §10, §11, §15), design README, 02-design-system, 05-web-platform, mockups S01, S04, S16, D01. The docs are in your uploads, not yet in the repo; step 0 copies them to `/docs` and `/design` so they stay the source of truth.

## 1. Stack and why it fits

- **TanStack Start (React 19, TypeScript, Vite)** — Lovable's fixed stack. Each screen is its own web address, so a refresh or reopened tab inside `/session/:id` lands back in the session (AT-17).
- **Lovable Cloud** — database with row-level security, email magic-link sign-in, file storage. AI calls (Phase 2) run in server functions via Lovable AI; no keys in the browser.
- **Tailwind v4 mapped onto `tokens.css`** — tokens file is imported as-is; Tailwind names point to its variables. No hard-coded colors, fonts, radii or durations.
- **Offline set logging**
  - IndexedDB (via the small `idb` library) holds session drafts and an **outbox**: local id, account id, idempotency key, expected version.
  - "Saved on this device" shows as soon as the local write finishes (target under 300 ms). "Synced" only after the server answers. 409 → conflict card; permanent failure → "Didn't sync" + Retry.
  - The server write function treats a repeated idempotency key as "already done", so retries never duplicate sets.
  - Outbox is tied to the signed-in account and cleared (after a Sync-now offer) on sign-out.
- **Service worker** — hand-written (Workbox-style) worker that precaches the app shell, fonts, icons and the offline fallback page. It never caches signed-in data. A new version waits while you are on `/session/...` and only offers to update at a safe point.
- **Timers that survive a locked screen** — every timer is computed from stored start timestamps, not counted ticks; screen wake lock while the runner is open, re-requested when you come back.
- **Phase 0 spikes** (small proof pages, not real screens): outbox + idempotency, timer across lock, update hold, keyboard-open layout, push capability detection.

## 2. Tables and security (Phase 0 set)

Common to every table: `id`, `owner_id` (the trainee, references the account), `created_at`, `updated_at`, `version` (for conflict checks), `archived_at` (archive ≠ delete).

| Table | Key fields | Provenance / source |
|---|---|---|
| profiles | display name, timezone, units, preferences | — (owner = id) |
| coach_access_grants | trainee (owner), coach, scopes[] (e.g. progress, limitations, measurements, propose_program), status invited/accepted/revoked, accepted_at, revoked_at | — |
| equipment_items | type, quantity, capacity, increments, attachments, available | source (user / coach / dillan / import) |
| goals | parent goal, priority, metric, target, baseline ref, deadline, status | source |
| exercises | name, movement, muscles, cues, equipment needed; owner null = shared reviewed library | content_source + review status |
| routine_template_versions | routine id, version number, title, purpose text, status draft/approved, **locked once used** | source, approved_by |
| routine_blocks | template version, order, block type (warm-up / priority / accessory / core), rounds, rest, prescriptions (exercise, sets, reps, load), priority, goal links | — |
| scheduled_sessions | planned date, template version, status | source |
| sessions | started/ended UTC + local date/timezone, template version actually used, **frozen plan snapshot**, time choice (Full/Short/Priority), completion state, feedback | — |
| set_logs | session, prescription ref, exercise, side, reps, load + unit, entered value, effort (reps in tank), logged_at, **idempotency key (unique)** | source (device / import) |
| limitations | category, location/side, context, status, review date, coach-shareable flag | source |
| measurements | type/site/side, value, unit, original entered value, method, observed date | source / provenance |

Plus link tables for goals ↔ exercises/blocks and limitations ↔ exercises/blocks, each with a "why" note (brief §9.1).

**Security rules (enforced in the database):**
- Owner: full read/write on own rows.
- Coach: **read-only**, only when an accepted, non-revoked grant exists whose scope covers that table (via one checking function). Revoking takes effect on the next request. Coaches never see private notes or chats (later phases).
- Coaches cannot create or accept grants for themselves; only the trainee can invite and revoke.
- Coach proposal rights come in Phase 2 through a proposals table, never direct edits.
- Logged sessions and approved template versions can't be edited in place; edits create a new version.
- Shared exercise library: readable by all signed-in users, editable by nobody from the app.

I will show you the exact SQL and wait for your OK before creating anything.

## 3. App shell

- Routes: `/today`, `/train`, `/session/$id` (full screen, no nav), `/progress`, `/dillan`, `/plan`, `/profile`, `/settings`, `/auth`. `/` sends you to `/today` when signed in, else to sign-in.
- Phone/tablet: bottom nav (Today `sun`, Train `dumbbell`, Progress `trending-up`, Dillan = Spot mark), 64 px + safe area. At 1024 px+: 240 px sidebar with the same four plus "More" (Plan, Profile, Coaching & directives, Settings), save state and avatar at the bottom — as in D01.
- `tokens.css` wired in, Night Gym via `prefers-color-scheme`, `100dvh`, safe-area padding, 320 px check.
- Fonts self-hosted as files in the app: Newsreader, Satoshi, M PLUS Rounded 1c. Lucide icons.
- Sign-in: email magic link only; unknown email creates the account.
- Each screen gets placeholder empty / loading / offline / failed / unknown states only.

## 4. Shared components (from 02-design-system)

Primary, secondary and quiet buttons · chips · status tag (icon + word) · card · segmented time control · block row · the Course week strip · set card shell · rest timer (Spot ring) · sheet (`<dialog>`) · voice block (Newsreader) · option row · banner · save state (Synced / Saved on this device / Didn't sync) · toast with undo · sticky action row (keyboard-aware) · numeric input (text + inputmode, steppers 56 px) · install prompt and update banner (built, not shown yet) · Spot mark · "— Not yet known" tag. Shown together on a hidden `/dev/components` page for review. Charts wait for Phase 1.

## 5. What Lovable cannot do (plainly)

- **I can't create a new project or connect GitHub for you.** This project becomes "Dillan App"; you connect GitHub yourself (Connectors → GitHub). Lovable Cloud I can switch on when we build.
- **Real-device testing**: I test in a headless desktop browser at phone sizes. Locked-screen timers, iPhone Safari keyboard, wake lock and install must be checked by you on a real iPhone and Android phone (the Phase 0 gate).
- **Background sync / push on iPhone** is limited by Safari (push only after home-screen install). Designed for; not something I can make Safari do.
- **Auth emails** use Lovable's default sender until you set up your own email domain.
- **Offline first visit**: a brand-new device must load once online before offline works — browser limitation.
- **HealthKit**: out of scope, as the brief says.

## Questions are asked separately before building.
