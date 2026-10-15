Run the standard review cycle on what Lovable pushed since $ARGUMENTS (a commit hash, or "last review" if the owner says so — find it in docs/CHANGELOG.md).

1. git fetch; show origin/main log since that point.
2. Dispatch verifier.
3. Dispatch slice-reviewer with the commit range and the slice name from roadmap.md.
4. Dispatch design-auditor on changed files under src/components and src/routes.
4b. If src/lib/outbox.ts, sync*.ts, timer.ts, sw.ts, use-outbox.ts, workout-store.ts or public/sw.js changed, dispatch offline-auditor on those files.
5. If anything under drizzle/migrations or docs/*schema*.sql changed, dispatch schema-guardian and STOP after its report — the owner approves schema, not you.
6. Produce the one-screen report in the format from CLAUDE.md. Do not edit any file in this command.
