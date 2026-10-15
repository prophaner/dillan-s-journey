Run the standard review cycle on what Lovable pushed since $ARGUMENTS (a commit hash, or "last review" to use the `Reviewed through: <hash>` line at the top of docs/CHANGELOG.md; if that line has no hash, stop and ask the owner for one).

1. Require a clean working tree (`git status --porcelain` empty); otherwise stop and tell the owner. Then `git fetch origin && git switch --detach origin/main` and show `git log --oneline <since>..HEAD` with changed paths. Every agent below runs on this checkout.
2. Dispatch verifier.
3. Dispatch slice-reviewer with the commit range and the slice name from roadmap.md.
4. Dispatch design-auditor on changed files under src/components, src/routes and src/styles.
5. If src/lib/outbox.ts, use-outbox.ts, sync*.ts, timer.ts, sw.ts, any src/lib/*-store.ts, any src/lib/*.server.ts or public/sw.js changed, dispatch offline-auditor on those files.
6. If anything under drizzle/migrations or docs/*schema*.sql changed, dispatch schema-guardian. Its report goes verbatim into the owner's report; the verdict cannot be ACCEPT and nothing downstream runs until the owner decides the schema.
7. Produce the one-screen report in the format from CLAUDE.md. Do not edit any file in this command.
