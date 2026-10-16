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

## 2026-10-15 — Migration 0002 (exercise ids in prescriptions): approved with fixes
Question: Accept migration 0002 as pushed, or require the schema-guardian's fixes first?
Options: (a) accept as is and backfill later; (b) approve with fixes: null-owner guard, backfill of existing routine_blocks, two indexes, docs mirror.
Decision: (b), decided by the owner. Fixes go to Lovable as a separate migration 0003 prompt after the five workout-slice fixes.
Consequence: Accounts created before 0002 cannot log sets until 0003 lands. docs/phase0-schema.sql stops being the approved baseline on its own; a docs/s16-schema.sql mirrors 0002 and 0003.

---

# Proposed, not yet decided

Entries here are the lead's recommendations. They become decisions only when the owner says
so, and then move above this line with the date.

## Lovable is the only product coder
Question: Should Claude Code subagents patch product code directly when Lovable fails a fix?
Options: (a) a "patcher" agent on a claude/ branch; (b) Lovable only, Claude adds tests that pin the behavior.
Recommendation: (b). Claude edits only tests, docs, roadmap and .claude/.
Consequence: Two writers on the same files would race through Lovable's two-way sync. Fixes may take an extra Lovable round; test-writer gives that round a red/green target.
