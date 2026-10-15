# Product decision log

Brief §17.11. One entry per tradeoff the owner decided. Newest first. Entries are supplied by
the owner or the lead; the docs-writer formats them and never infers a decision from code.

Format:
```
## YYYY-MM-DD — <short title>
Question:
Options:
Decision:
Consequence:
```

## 2026-10-15 — Lovable is the only product coder
Question: Should Claude Code subagents patch product code directly when Lovable fails a fix?
Options: (a) a "patcher" agent on a claude/ branch; (b) Lovable only, Claude adds tests that pin the behavior.
Decision: (b), proposed by the lead, pending owner confirmation. Claude edits only tests, docs, roadmap and .claude/.
Consequence: Two writers on the same files would race through Lovable's two-way sync. Fixes may take an extra Lovable round; test-writer gives that round a red/green target.
