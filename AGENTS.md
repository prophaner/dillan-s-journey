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
- Sources of truth live in /docs/brief-v2.md and /design/**; read them before changing behavior or look.
- All colors/fonts/spacing come from src/styles/tokens.css (copy of /design/tokens/tokens.css), mapped to Tailwind in src/styles.css; components never hard-code values. Why: one theme layer, Night Gym for free.
- Brand components live in src/components/dillan/*; prefer them over shadcn ui. Why: matches 02-design-system.
- Fonts are self-hosted in public/fonts (Satoshi, Newsreader) and @fontsource (M PLUS Rounded 1c). Why: no third-party font requests.
- Signed-in screens live under src/routes/_authenticated/_app (with nav shell); the session runner is _authenticated/session.$id without nav. Why: a session is a mode, not a tab.
- User writes go through the IndexedDB outbox (src/lib/outbox.ts) with idempotency keys; "Synced" only after server ack. Why: offline set logging, brief §10.2.
- Timers derive from stored timestamps (src/lib/timer.ts). Why: correct after a locked screen.
- public/sw.js caches app shell only, never signed-in data, skips /~oauth and server functions; registered only in production outside iframes. Why: brief §10.2.
- Schema changes must be shown to the owner and approved before applying; draft lives in docs/phase0-schema.sql.
- Schema lives in docs/phase0-schema.sql (applied); every UPDATE must send the version it read, built via src/lib/updates.ts or outbox kind "update:<table>" with expectedVersion. Why: DB trigger enforces optimistic concurrency only when a version is sent.
- The service-role key is read from the sandbox environment at test time only (RUN_RLS_TESTS=1); never write it to .env or any repo file. Why: repo is public.
