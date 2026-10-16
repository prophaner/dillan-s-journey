import { describe, expect, it } from "vitest";
import { compareRows, versionInUse } from "@/lib/conflicts";
import { storageVerdict, MIN_FREE_BYTES } from "@/lib/device";
import type { OutboxItem } from "@/lib/outbox";

const item = (p: Partial<OutboxItem>): OutboxItem => ({ localId: "l", accountId: "a", idempotencyKey: "k", kind: "x", payload: {}, expectedVersion: null, status: "local", attempts: 0, createdAt: 1, ...p });

describe("Discard this save is refused while a session uses that version", () => {
  it("unsent session:start on the version blocks the discard", () => {
    expect(versionInUse([item({ kind: "session:start", payload: { snapshot: { templateVersionId: "v2" } } })], "v2")).toBe(true);
  });
  it("a synced start or another version does not block", () => {
    expect(versionInUse([item({ kind: "session:start", status: "synced", payload: { snapshot: { templateVersionId: "v2" } } })], "v2")).toBe(false);
    expect(versionInUse([item({ kind: "session:start", payload: { snapshot: { templateVersionId: "v1" } } })], "v2")).toBe(false);
  });
});

describe("Compare shows yours and theirs", () => {
  it("goal level", () => {
    expect(compareRows("update:goals", { level: "improve" }, { level: "maintain" })).toEqual([{ label: "Goal level", yours: "Improve", theirs: "Maintain" }]);
  });
  it("unknown theirs shows a dash, never 0", () => {
    expect(compareRows("update:set_logs", { reps: 8, load: 50, rir: 2 }, null).map((r) => r.theirs)).toEqual(["—", "—", "—"]);
  });
});

describe("storage check", () => {
  it("under 1 MB free counts as unavailable", () => {
    expect(storageVerdict({ quota: MIN_FREE_BYTES, usage: 10 })).toBe("unavailable");
    expect(storageVerdict({ quota: 50_000_000, usage: 10 })).toBe("ok");
  });
});
