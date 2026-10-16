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

## 2026-10-16 — Lead runs the cycle standalone through Phase 3
Question: How much of the review–fix–accept loop does the owner want to approve by hand?
Options: (a) owner approves each verdict, merge and prompt; (b) lead decides and acts, stopping only for schema rejects, secrets, and decisions only the owner can make.
Decision: (b), decided by the owner on 2026-10-16: "focus on working standalone until phase 4".
Consequence: Faster cycles. Lovable credits are spent without per-prompt approval (2–4 per slice plus fix rounds); the owner reviews outcomes via CHANGELOG, test plans and pull requests.

## 2026-10-15 — Migration 0002 (exercise ids in prescriptions): approved with fixes
Question: Accept migration 0002 as pushed, or require the schema-guardian's fixes first?
Options: (a) accept as is and backfill later; (b) approve with fixes: null-owner guard, backfill of existing routine_blocks, two indexes, docs mirror.
Decision: (b), decided by the owner. Fixes go to Lovable as a separate migration 0003 prompt after the five workout-slice fixes.
Consequence: Accounts created before 0002 cannot log sets until 0003 lands. docs/phase0-schema.sql stops being the approved baseline on its own; a docs/s16-schema.sql mirrors 0002 and 0003.

---

# Proposed, not yet decided

Entries here are the lead's recommendations. They become decisions only when the owner says
so, and then move above this line with the date.

## Short / Priority-only rule and minute estimates
Question: How does Today shorten a session and estimate its time?
Options: (a) Lovable's rule: Short drops the optional blocks; Priority only keeps the first main block; estimates count 60 s setup per exercise + 45 s per set + the plan's rest, 20 s transition in a superset, 90 s rest by default. (b) A routine-level priority flag and a per-user pace.
Recommendation: (a) for Phase 1; add a priority flag with the routine editor.
Consequence: Estimates are labelled as estimates on screen. A real priority block needs a schema change.

## Goal level Improve / Maintain / Defer
Question: Where does the FR-02 level live?
Options: (a) a goals.level column (migration 0004), set in the Plan slice; (b) a periodic-review table later.
Recommendation: (a) goals.level as nullable text with a check constraint, set in the Plan slice; S08 shows Not yet known until then.
Consequence: schema-guardian review before it lands. S08 is accepted against FR-10 now, not FR-02.

## Lovable is the only product coder
Question: Should Claude Code subagents patch product code directly when Lovable fails a fix?
Options: (a) a "patcher" agent on a claude/ branch; (b) Lovable only, Claude adds tests that pin the behavior.
Recommendation: (b). Claude edits only tests, docs, roadmap and .claude/.
Consequence: Two writers on the same files would race through Lovable's two-way sync. Fixes may take an extra Lovable round; test-writer gives that round a red/green target.
