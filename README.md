# Dillan's Journey

Create a new project: Dillan App, with Cloud enabled.  connect GitHub.

Read the project Knowledge, then /docs/brief-v2.md, /design/README.md, /design/docs/02-design-system.md and /design/docs/05-web-platform.md. Look at /design/mockups/s01-today.png, s04-set.png, s16-train.png and d01-today-desktop.png. Do not write code yet. Give me a plan for Phase 0 (web foundations) only: 1. The stack you will use inside Lovable and why it fits a mobile-first web app with offline set logging (service worker, IndexedDB outbox, timers that survive a locked screen). 2. The initial tables and row-level security for: profiles, coach access grants, equipment items, goals, exercises, routine template versions, routine blocks, scheduled sessions, sessions, set logs, limitations, measurements — following brief sections 9 and 11. Every table has an owner column and a provenance/source field where the brief asks for one. 3. The app shell: routes /today, /train, /session/:id, /progress, /dillan, /plan, /profile, /settings; bottom nav on phone, sidebar at 1024 px and up; tokens.css wired in; the three fonts self-hosted; Lucide icons; sign-in by email magic link. 4. The shared components listed in 02-design-system.md. 5. Anything in the brief you cannot do inside Lovable, stated plainly. Then ask me whatever you need to know before building. Keep the plan short.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f7624365-e089-4864-b101-fbaeb2176a82).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
