# Claude Code setup for Dillan

This folder (`.claude/`) and the root `CLAUDE.md` are read automatically when you run
`claude` from the project folder. `CLAUDE.md` holds the lead's hard rules; `AGENTS.md`
(written by Lovable) holds the project rules every agent must follow.

## Who does what

Lovable writes the product code. Claude Code is the **orchestrator**: it reviews, verifies,
writes tests and docs, prepares the owner's phone checklist, and drafts the next Lovable
prompt. The owner merges, approves schema, and decides product tradeoffs.

## Agent configuration index

Each agent is one Markdown file in `.claude/agents/`. The YAML frontmatter is the
configuration: `name`, `description` (when the lead should use it), `tools` (what it may
call) and `model`. The body is the agent's instructions.

| Agent | Role | Tools | Model | May edit | Reads first |
|---|---|---|---|---|---|
| orchestrator | Lead (main session, never dispatched): dispatches, decides, reports | Read, Grep, Glob, Bash, Edit, Write (+ Agent in the main session) | inherit | roadmap.md, docs/**, .claude/** | CLAUDE.md, AGENTS.md, roadmap.md |
| verifier | Typecheck, lint, tests, build, secret scan | Bash, Read, Grep, Glob | haiku | nothing | package.json scripts (bun) |
| slice-reviewer | Did the slice meet the brief's FR/AT? | Read, Grep, Glob, Bash (read-only git) | inherit | nothing | docs/brief-v2.md FR/AT items, §9.1, §10.2 |
| design-auditor | Does the UI follow the design system? | Read, Grep, Glob | inherit | nothing | design/README.md, design/docs/02, 04, 05; src/styles/tokens.css |
| offline-auditor | Outbox, idempotency, version, timers, service worker, *.server.ts write handlers | Read, Grep, Glob, Bash | inherit | nothing | brief §10.2, AT-29…36; design/docs/05; AGENTS.md |
| schema-guardian | Is the migration / RLS safe? Owner approves | Read, Grep, Glob, Bash | inherit | nothing | brief §9, §9.1, §11, §12; docs/phase0-schema.sql |
| test-writer | Vitest tests that pin a brief invariant | Read, Grep, Glob, Bash, Edit, Write | inherit | src/test/** | existing src/test/*, vitest.config.ts |
| phone-tester | On-phone checklist for the owner per slice | Read, Grep, Glob, Write | inherit | docs/test-plans/** | design/docs/03-screens.md, brief §14, mockups |
| docs-writer | User manual, changelog, decision log, roadmap | Read, Grep, Glob, Edit, Write | inherit | docs/user-manual.md, docs/CHANGELOG.md, docs/DECISIONS.md, roadmap.md | design/docs/04-voice-and-copy.md |
| lovable-dispatcher | Drafts the next Lovable prompt or a fix prompt | Read, Grep, Glob | inherit | nothing | roadmap.md, design/README.md, design/docs/03-screens.md |

Only three agents can write, and each is fenced to one area: test-writer to `src/test/`,
phone-tester to `docs/test-plans/`, docs-writer to the three docs files and the roadmap.
No agent edits `src/lib`, `src/routes`, `src/components`, migrations or config. That is
Lovable's territory. Whether Claude may ever patch product code is a proposal awaiting the
owner in `docs/DECISIONS.md`; until decided, the answer is no.

The orchestrator file describes the main session's role. It is not dispatched as a subagent,
because subagents cannot spawn agents.

## Commands (`.claude/commands/`)
- `/review <commit>` — full review cycle on Lovable's latest push: verifier, slice-reviewer,
  design-auditor, offline-auditor if sync files changed, schema-guardian if migrations
  changed, then the one-screen report.
- `/next-slice` — docs PR on `claude/docs-<slice>` plus the next Lovable prompt.

## Docs the agents maintain
- `docs/CHANGELOG.md` — one entry per accepted slice; the "Reviewed through" hash is where
  `/review last review` starts.
- `docs/user-manual.md` — one section per screen, trainee voice.
- `docs/DECISIONS.md` — product decision log (brief §17.11).
- `docs/test-plans/<slice>.md` — the owner's on-phone checklist and result block.

## Adding or changing an agent
1. Copy an existing file in `agents/`; keep the frontmatter keys `name`, `description`,
   `tools`, `model`.
2. Give it the smallest tool set that works. Read-only agents get `Read, Grep, Glob`
   (+ `Bash` only if they need git or test commands).
3. State what it may edit in the first line of the body. Default is nothing.
4. Name the exact files it should read first, with paths.
5. Add it to the table above and to the dispatch table in `agents/orchestrator.md`.

## Planned, not yet created (do not build ahead)
- `ai-reviewer` for Phase 2: checks Dillan chat, proposal lifecycle and evaluation fixtures
  against brief §6, §7 and §10. Create it when the S09 slice becomes active.
- `coach-view-auditor` for Phase 3: coach workspace, grant scopes, privacy screens.

## Typical day
1. Lovable finishes a slice and pushes to `main`.
2. In the terminal: `claude`, then `/review abc1234` (the last commit you reviewed, or
   "last review" to take it from docs/CHANGELOG.md).
3. Read the one-screen report. Paste the "Paste to Lovable" text into Lovable if there are fixes.
4. Run the phone checklist from `docs/test-plans/` and fill in the result block.
5. When happy: `/next-slice`. Merge the docs PR on GitHub. Paste the new prompt into Lovable.

Rules the lead enforces: never commits to `main`, never approves schema, one slice at a time,
the service-role key never appears in any file.
