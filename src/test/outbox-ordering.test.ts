/**
 * Outbox ordering and re-send invariants.
 *
 * brief §10.2 (Web application architecture requirements):
 *   "Use IndexedDB or an equivalent tested browser store for session drafts and an outbox.
 *    Save stable local IDs, expected server versions, and idempotency keys. Retry while the
 *    app is active ... Server acknowledgement is the only basis for a 'synced' label."
 * brief §9.1 (Essential invariants):
 *   "External imports and local actions use idempotency keys; reconnecting does not duplicate work."
 *   "Concurrent edits use explicit version checks."
 * brief §5 FR-07 (Day, session, exercise, and set logging):
 *   "planned and ad-hoc sessions; exercise-level results; and individual sets."
 * AGENTS.md: "User writes go through the IndexedDB outbox (src/lib/outbox.ts) with idempotency keys;
 *   'Synced' only after server ack."
 * AGENTS.md: "every UPDATE must send the version it read, built via src/lib/updates.ts or outbox
 *   kind "update:<table>" with expectedVersion."
 * brief §5 FR-10 (Body measurements, assessments, and progress):
 *   "Store unit, body site/side, method, timestamp, and optional conditions."
 * brief §13 AT-22 (Measurement units or protocol change):
 *   "Values convert correctly; comparability qualifications preserved"
 *   A measurement ("measurement:add") belongs to no session, so a stuck session chain must not hold it
 *   back, and a retry must replay the same idempotency key so reconnecting never duplicates it.
 *
 * jsdom has no IndexedDB and fake-indexeddb is not installed, so the `idb` module boundary is
 * replaced with an in-memory store below. Product code is exercised unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drain, enqueue, listItems, nextSeq, retryAccount, sessionOf, type OutboxItem, type SendResult } from "@/lib/outbox";
import { sessionSaveState } from "@/lib/use-outbox";
import { MEASUREMENT_ADD } from "@/lib/measurements";
import { SESSION_DISCARD, SESSION_FINISH, SESSION_START, SET_LOG, SET_LOG_DELETE, SET_LOG_EDIT } from "@/lib/workout";

// Hoisted so tests can reach the in-memory store (e.g. to insert rows out of order).
const mem = vi.hoisted(() => {
  type Row = Record<string, unknown> & { localId?: string; key?: string; accountId?: string };
  const stores = new Map<string, Map<string, Row>>();
  const store = (name: string) => {
    let s = stores.get(name);
    if (!s) {
      s = new Map();
      stores.set(name, s);
    }
    return s;
  };
  return { store };
});

vi.mock("idb", () => {
  type Row = Record<string, unknown> & { localId?: string; key?: string; accountId?: string };
  const store = mem.store;
  const keyOf = (name: string, row: Row) => String(name === "outbox" ? row.localId : row.key);
  return {
    openDB: async () => ({
      put: async (name: string, row: Row) => {
        store(name).set(keyOf(name, row), row);
      },
      get: async (name: string, key: string) => store(name).get(key),
      delete: async (name: string, key: string) => {
        store(name).delete(key);
      },
      getAllKeys: async (name: string) => [...store(name).keys()],
      getAllFromIndex: async (name: string, _index: string, value: string) =>
        [...store(name).values()].filter((r) => r.accountId === value),
    }),
  };
});
// use-outbox pulls in the server function and TanStack Start; neither is needed for the pure export.
vi.mock("@/lib/sync.functions", () => ({ syncOutboxItem: () => {} }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

// Strictly increasing createdAt so list order is deterministic regardless of clock resolution.
let clock = 1_000_000;
beforeEach(() => {
  vi.spyOn(Date, "now").mockImplementation(() => ++clock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const item = (kind: string, payload: unknown, status: OutboxItem["status"], idempotencyKey: string = crypto.randomUUID()): OutboxItem => ({
  localId: crypto.randomUUID(),
  accountId: "acct",
  idempotencyKey,
  kind,
  payload,
  expectedVersion: null,
  status,
  attempts: 0,
  createdAt: 0,
});

describe("sessionOf: which session an outbox item belongs to", () => {
  it("session:start and update:sessions carry the session as `id`", () => {
    expect(sessionOf({ kind: SESSION_START, payload: { id: "A" } })).toBe("A");
    expect(sessionOf({ kind: SESSION_FINISH, payload: { id: "A", version: 1 } })).toBe("A");
  });
  it("set_log and delete:set_logs carry the session as `sessionId`", () => {
    expect(sessionOf({ kind: SET_LOG, payload: { sessionId: "A", id: "A1" } })).toBe("A");
    expect(sessionOf({ kind: SET_LOG_DELETE, payload: { sessionId: "A", id: "A1" } })).toBe("A");
  });
  it("update:set_logs, delete:sessions and a set_log with a swapped exercise carry `sessionId` (FR-07)", () => {
    expect(sessionOf({ kind: SET_LOG_EDIT, payload: { sessionId: "A", id: "A1", reps: 10 } })).toBe("A");
    expect(sessionOf({ kind: SESSION_DISCARD, payload: { sessionId: "A" } })).toBe("A");
    expect(sessionOf({ kind: SET_LOG, payload: { sessionId: "A", id: "A1", exerciseId: "swapped-ex" } })).toBe("A");
  });
  it("an unrelated kind belongs to no session", () => {
    expect(sessionOf({ kind: "onboarding:complete", payload: { id: "profile-1" } })).toBeUndefined();
    expect(sessionOf({ kind: "note", payload: null })).toBeUndefined();
  });
});

describe("drain keeps per-session order (§10.2 outbox, §9.1 version checks)", () => {
  it("a failed set log blocks later items for its session only; the next pass sends them in order", async () => {
    const acct = "acct-order";
    const start = await enqueue(acct, SESSION_START, { id: "A" });
    const logA1 = await enqueue(acct, SET_LOG, { sessionId: "A", id: "A1", reps: 8 });
    const delA1 = await enqueue(acct, SET_LOG_DELETE, { sessionId: "A", id: "A1" });
    const finish = await enqueue(acct, SESSION_FINISH, { id: "A", completion: "complete" }, 1);
    const logB1 = await enqueue(acct, SET_LOG, { sessionId: "B", id: "B1", reps: 8 });

    let failA1 = true;
    const sent: string[] = [];
    const send = vi.fn(async (i: OutboxItem): Promise<SendResult> => {
      sent.push(i.localId);
      if (failA1 && i.localId === logA1.localId) return { ok: false, reason: "retry", message: "boom" };
      return { ok: true };
    });

    await drain(acct, send);
    expect(sent).toEqual([start.localId, logA1.localId, logB1.localId]);
    expect(sent).not.toContain(delA1.localId);
    expect(sent).not.toContain(finish.localId);
    const after1 = Object.fromEntries((await listItems(acct)).map((i) => [i.localId, i.status]));
    expect(after1[start.localId]).toBe("synced");
    expect(after1[logB1.localId]).toBe("synced");
    expect(after1[logA1.localId]).toBe("local");
    expect(after1[delA1.localId]).toBe("local");
    expect(after1[finish.localId]).toBe("local");

    failA1 = false;
    sent.length = 0;
    await drain(acct, send);
    expect(sent).toEqual([logA1.localId, delA1.localId, finish.localId]);
    expect((await listItems(acct)).every((i) => i.status === "synced")).toBe(true);
  });

  it("an edit replays with the same key and the version it read; the discard waits behind it (§9.1, AGENTS.md)", async () => {
    const acct = "acct-edit";
    const start = await enqueue(acct, SESSION_START, { id: "E" });
    const log = await enqueue(acct, SET_LOG, { sessionId: "E", id: "E1", reps: 8 });
    const edit = await enqueue(acct, SET_LOG_EDIT, { sessionId: "E", id: "E1", reps: 10 }, 1);
    const discard = await enqueue(acct, SESSION_DISCARD, { sessionId: "E" });

    let failEditOnce = true;
    const sent: OutboxItem[] = [];
    const send = vi.fn(async (i: OutboxItem): Promise<SendResult> => {
      sent.push(i);
      if (failEditOnce && i.localId === edit.localId) {
        failEditOnce = false;
        return { ok: false, reason: "retry", message: "503" };
      }
      return { ok: true };
    });

    await drain(acct, send, { discardHoldMs: 0 });
    expect(sent.map((i) => i.localId)).toEqual([start.localId, log.localId, edit.localId]);
    expect(sent.map((i) => i.localId)).not.toContain(discard.localId);
    const after1 = Object.fromEntries((await listItems(acct)).map((i) => [i.localId, i.status]));
    expect(after1[edit.localId]).toBe("local");
    expect(after1[discard.localId]).toBe("local");

    await drain(acct, send, { discardHoldMs: 0 });
    const editSends = sent.filter((i) => i.localId === edit.localId);
    expect(editSends).toHaveLength(2);
    expect(editSends.map((i) => i.idempotencyKey)).toEqual([edit.idempotencyKey, edit.idempotencyKey]);
    expect(editSends.map((i) => i.expectedVersion)).toEqual([1, 1]);

    const discardSends = sent.filter((i) => i.localId === discard.localId);
    expect(discardSends).toHaveLength(1);
    const lastEditIdx = sent.map((i) => i.localId).lastIndexOf(edit.localId);
    const discardIdx = sent.map((i) => i.localId).indexOf(discard.localId);
    expect(discardIdx).toBeGreaterThan(lastEditIdx);
    expect((await listItems(acct)).every((i) => i.status === "synced")).toBe(true);
  });

  it("a discard waits for its session chain; another session is not held up", async () => {
    const acct = "acct-discard";
    const startF = await enqueue(acct, SESSION_START, { id: "F" });
    const discardF = await enqueue(acct, SESSION_DISCARD, { sessionId: "F" });
    const logG = await enqueue(acct, SET_LOG, { sessionId: "G", id: "G1", reps: 5 });

    const sent: string[] = [];
    await drain(acct, async (i): Promise<SendResult> => {
      sent.push(i.localId);
      return i.localId === startF.localId ? { ok: false, reason: "retry", message: "503" } : { ok: true };
    });
    expect(sent).toEqual([startF.localId, logG.localId]);
    expect(sent).not.toContain(discardF.localId);
    const after = Object.fromEntries((await listItems(acct)).map((i) => [i.localId, i.status]));
    expect(after[startF.localId]).toBe("local");
    expect(after[discardF.localId]).toBe("local");
    expect(after[logG.localId]).toBe("synced");
  });
});

describe("listItems orders by seq, not by store insertion (§10.2 ordered replay)", () => {
  it("returns enqueue order even when rows sit in the store out of order; legacy rows without seq sort by createdAt", async () => {
    const acct = "acct-seq";
    const a = await enqueue(acct, SESSION_START, { id: "S" });
    const b = await enqueue(acct, SET_LOG, { sessionId: "S", id: "S1", reps: 8 });
    const c = await enqueue(acct, SET_LOG, { sessionId: "S", id: "S2", reps: 8 });
    expect(a.seq).toBeDefined();
    expect(a.seq!).toBeLessThan(b.seq!);
    expect(b.seq!).toBeLessThan(c.seq!);

    // Legacy rows written before `seq` existed: one older than everything, one newer.
    const legacyOld: OutboxItem = { ...item(SET_LOG, { sessionId: "S", id: "S0" }, "synced"), accountId: acct, createdAt: a.createdAt - 10 };
    const legacyNew: OutboxItem = { ...item(SET_LOG, { sessionId: "S", id: "S3" }, "local"), accountId: acct, createdAt: c.createdAt + 10 };
    expect(legacyOld.seq).toBeUndefined();
    expect(legacyNew.seq).toBeUndefined();

    // Re-insert out of order; the Map iterates in insertion order, so getAllFromIndex returns this order.
    const outbox = mem.store("outbox");
    for (const row of [a, b, c]) outbox.delete(row.localId);
    for (const row of [legacyNew, c, a, legacyOld, b]) outbox.set(row.localId, row as unknown as Record<string, unknown>);

    const ids = (await listItems(acct)).map((i) => i.localId);
    expect(ids).toEqual([legacyOld.localId, a.localId, b.localId, c.localId, legacyNew.localId]);
  });
});

describe("drain does not re-send failed or conflict items until Retry (§9.1 idempotency)", () => {
  it("skips them on repeated drains; after retryAccount each is sent once with the same key and version", async () => {
    const acct = "acct-retry";
    const conflicting = await enqueue(acct, SESSION_FINISH, { id: "C", completion: "complete" }, 3);
    const permanent = await enqueue(acct, SET_LOG, { sessionId: "D", id: "D1", reps: 8 });

    await drain(acct, async (i): Promise<SendResult> =>
      i.localId === conflicting.localId
        ? { ok: false, reason: "conflict", message: "409" }
        : { ok: false, reason: "permanent", message: "400" },
    );
    const before = Object.fromEntries((await listItems(acct)).map((i) => [i.localId, i]));
    expect(before[conflicting.localId]?.status).toBe("conflict");
    expect(before[permanent.localId]?.status).toBe("failed");

    const send = vi.fn(async (_i: OutboxItem): Promise<SendResult> => ({ ok: true }));
    await drain(acct, send);
    await drain(acct, send);
    await drain(acct, send);
    expect(send).toHaveBeenCalledTimes(0);

    await retryAccount(acct);
    await drain(acct, send);
    expect(send).toHaveBeenCalledTimes(2);
    const calls = send.mock.calls.map((c) => c[0]);
    const sentConflicting = calls.filter((i) => i.localId === conflicting.localId);
    const sentPermanent = calls.filter((i) => i.localId === permanent.localId);
    expect(sentConflicting).toHaveLength(1);
    expect(sentPermanent).toHaveLength(1);
    expect(sentConflicting[0]?.idempotencyKey).toBe(conflicting.idempotencyKey);
    expect(sentConflicting[0]?.expectedVersion).toBe(3);
    expect(sentPermanent[0]?.idempotencyKey).toBe(permanent.idempotencyKey);
    expect(sentPermanent[0]?.expectedVersion).toBeNull();
    expect((await listItems(acct)).every((i) => i.status === "synced")).toBe(true);
  });
});

describe("sessionSaveState: 'Synced' only after every write for the session is acked (§10.2)", () => {
  const k1 = "key-1";
  const k2 = "key-2";
  it("synced when every log key has a synced item and nothing else for the session waits", () => {
    const items = [
      item(SESSION_START, { id: "A" }, "synced"),
      item(SET_LOG, { sessionId: "A", id: "A1" }, "synced", k1),
      item(SET_LOG, { sessionId: "A", id: "A2" }, "synced", k2),
      item(SET_LOG, { sessionId: "B", id: "B1" }, "failed"), // another session must not leak in
    ];
    expect(sessionSaveState(items, "A", [k1, k2])).toEqual({ state: "synced", unsynced: 0 });
  });
  it("local when a log key has no outbox item at all", () => {
    const items = [item(SET_LOG, { sessionId: "A", id: "A1" }, "synced", k1)];
    expect(sessionSaveState(items, "A", [k1, k2]).state).toBe("local");
  });
  it("local when any item for the session is still local", () => {
    const logs = [
      item(SET_LOG, { sessionId: "A", id: "A1" }, "synced", k1),
      item(SET_LOG, { sessionId: "A", id: "A2" }, "local", k2),
    ];
    expect(sessionSaveState(logs, "A", [k1, k2])).toEqual({ state: "local", unsynced: 1 });
    const finishPending = [
      item(SET_LOG, { sessionId: "A", id: "A1" }, "synced", k1),
      item(SESSION_FINISH, { id: "A" }, "local"),
    ];
    expect(sessionSaveState(finishPending, "A", [k1])).toEqual({ state: "local", unsynced: 1 });
  });
  it("failed when any item for the session is failed or conflict", () => {
    const failed = [
      item(SET_LOG, { sessionId: "A", id: "A1" }, "synced", k1),
      item(SET_LOG_DELETE, { sessionId: "A", id: "A1" }, "failed"),
    ];
    expect(sessionSaveState(failed, "A", [k1]).state).toBe("failed");
    const conflict = [
      item(SET_LOG, { sessionId: "A", id: "A1" }, "synced", k1),
      item(SESSION_FINISH, { id: "A" }, "conflict"),
    ];
    expect(sessionSaveState(conflict, "A", [k1]).state).toBe("failed");
  });
});

describe("a measurement belongs to no session: it is not held behind a stuck session chain (FR-10, AT-22, §9.1 idempotency)", () => {
  const measurement = { id: "22222222-2222-4222-8222-222222222222", type: "weight", side: "none", enteredValue: "180", unit: "lb", observedAt: "2026-10-16T08:00:00Z" };

  it("is sent on the same drain pass even when an earlier set_log of some session is failed", async () => {
    const acct = "acct-measure";
    const start = await enqueue(acct, SESSION_START, { id: "M" });
    const logM1 = await enqueue(acct, SET_LOG, { sessionId: "M", id: "M1", reps: 8 });
    const measure = await enqueue(acct, MEASUREMENT_ADD, measurement);
    const logM2 = await enqueue(acct, SET_LOG, { sessionId: "M", id: "M2", reps: 8 });
    expect(sessionOf(measure)).toBeUndefined();

    // First pass: the set log fails permanently; its session chain is now blocked.
    await drain(acct, async (i): Promise<SendResult> =>
      i.localId === logM1.localId ? { ok: false, reason: "permanent", message: "400" } : { ok: true },
    );
    const after1 = Object.fromEntries((await listItems(acct)).map((i) => [i.localId, i.status]));
    expect(after1[start.localId]).toBe("synced");
    expect(after1[logM1.localId]).toBe("failed");
    expect(after1[measure.localId]).toBe("synced"); // same pass, not held back
    expect(after1[logM2.localId]).toBe("local"); // the session chain is held, as it should be

    // A later measurement is still sent while the session stays stuck.
    const later = await enqueue(acct, MEASUREMENT_ADD, { ...measurement, id: "33333333-3333-4333-8333-333333333333" });
    const sent: string[] = [];
    await drain(acct, async (i): Promise<SendResult> => { sent.push(i.localId); return { ok: true }; });
    expect(sent).toEqual([later.localId]);
    expect(sent).not.toContain(logM2.localId);
  });

  it("a 'retry' result re-sends it on the next pass with the identical idempotencyKey and no new key", async () => {
    const acct = "acct-measure-retry";
    const measure = await enqueue(acct, MEASUREMENT_ADD, measurement);
    const keyBefore = measure.idempotencyKey;

    let failOnce = true;
    const sent: OutboxItem[] = [];
    const send = vi.fn(async (i: OutboxItem): Promise<SendResult> => {
      sent.push(i);
      if (failOnce) {
        failOnce = false;
        return { ok: false, reason: "retry", message: "503" };
      }
      return { ok: true };
    });

    await drain(acct, send);
    const after1 = (await listItems(acct)).find((i) => i.localId === measure.localId)!;
    expect(after1.status).toBe("local"); // a retry keeps it "Saved on this device", never "failed"
    expect(after1.attempts).toBe(1);
    expect(after1.idempotencyKey).toBe(keyBefore);

    await drain(acct, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sent.map((i) => i.localId)).toEqual([measure.localId, measure.localId]);
    expect(sent.map((i) => i.idempotencyKey)).toEqual([keyBefore, keyBefore]);
    expect(sent.map((i) => i.payload)).toEqual([measurement, measurement]);
    // Exactly one outbox row for this measurement: a retry never creates a second key.
    const rows = (await listItems(acct)).filter((i) => i.kind === MEASUREMENT_ADD);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.idempotencyKey).toBe(keyBefore);
    expect(rows[0]!.status).toBe("synced");
  });
});

// Last on purpose: vi.resetModules gives later dynamic imports a fresh module instance (and a fresh
// in-memory idb store); the static imports above keep their original instance.
describe("nextSeq never goes backwards across a module reload (§10.2 ordered replay)", () => {
  it("a fresh module instance with a later clock issues seq values above the old ones", async () => {
    const oldSeqs = [nextSeq(), nextSeq(), nextSeq()];
    expect(oldSeqs[1]).toBeGreaterThan(oldSeqs[0]!);
    expect(oldSeqs[2]).toBeGreaterThan(oldSeqs[1]!);
    // Same millisecond: still strictly increasing.
    const now = Date.now();
    const same1 = nextSeq(now);
    const same2 = nextSeq(now);
    expect(same2).toBe(same1 + 1);

    vi.resetModules();
    clock += 1_000; // the device was closed for a second before the reload
    const fresh = await import("@/lib/outbox");
    expect(fresh.nextSeq).not.toBe(nextSeq);
    const newSeqs = [fresh.nextSeq(), fresh.nextSeq()];
    const maxOld = Math.max(...oldSeqs, same2);
    expect(newSeqs[0]).toBeGreaterThan(maxOld);
    expect(newSeqs[1]).toBeGreaterThan(newSeqs[0]!);
  });
});

import { removeIfLocal } from "@/lib/outbox";
describe("discard undo window (S07 'Session discarded · Undo')", () => {
  it("a discard is held while young, and Undo removes it before it is sent", async () => {
    const acct = "undo-acct";
    const item = await enqueue(acct, SESSION_DISCARD, { sessionId: "s-undo" });
    const sent: OutboxItem[] = [];
    await drain(acct, async (i) => { sent.push(i); return { ok: true }; }, { discardHoldMs: 60_000 });
    expect(sent.filter((i) => i.localId === item.localId)).toHaveLength(0);
    expect(await removeIfLocal(item.localId)).toBe(true);
    expect((await listItems(acct)).some((i) => i.localId === item.localId)).toBe(false);
  });

  it("the hold is the default: a plain drain does not send a fresh discard", async () => {
    const acct = "undo-default";
    const item = await enqueue(acct, SESSION_DISCARD, { sessionId: "s-def" });
    const sent: OutboxItem[] = [];
    await drain(acct, async (i) => { sent.push(i); return { ok: true }; });
    expect(sent.some((i) => i.localId === item.localId)).toBe(false);
  });

  it("an Undo during an in-flight drain stops the discard from being sent", async () => {
    const acct = "undo-inflight";
    const first = await enqueue(acct, SET_LOG, { sessionId: "other", id: "x" });
    const item = await enqueue(acct, SESSION_DISCARD, { sessionId: "s-fly" });
    const sent: OutboxItem[] = [];
    await drain(acct, async (i) => {
      sent.push(i);
      if (i.localId === first.localId) await removeIfLocal(item.localId); // Undo tapped mid-drain
      return { ok: true };
    }, { discardHoldMs: 0 });
    expect(sent.some((i) => i.localId === item.localId)).toBe(false);
  });
});

// Also after the reload above: this one needs the previous tests' rows to still sit in the shared
// in-memory store, which the hoisted `mem` keeps across vi.resetModules.
describe("db open seeds lastSeq from stored rows (§10.2 ordered replay)", () => {
  it("a fresh page whose clock runs 10 s behind still enqueues after the stored items", async () => {
    const acct = "acct-seed";
    const a = await enqueue(acct, SESSION_START, { id: "Z" });
    const b = await enqueue(acct, SET_LOG, { sessionId: "Z", id: "Z1", reps: 8 });
    const c = await enqueue(acct, SET_LOG, { sessionId: "Z", id: "Z2", reps: 8 });
    const maxOld = Math.max(a.seq!, b.seq!, c.seq!);

    // The device clock is set back (NTP correction, time-zone fix, manual change) before the page reopens.
    clock -= 10_000;
    vi.resetModules();
    const fresh = await import("@/lib/outbox");
    expect(fresh.enqueue).not.toBe(enqueue);

    const d = await fresh.enqueue(acct, SET_LOG, { sessionId: "Z", id: "Z3", reps: 8 });
    // The clock really did go backwards: a seq derived from it alone would sort first.
    expect(d.createdAt).toBeLessThan(a.createdAt);
    expect(d.createdAt * 1000).toBeLessThan(maxOld);
    // The open-time seed (outbox.ts db()) lifted lastSeq above every stored row.
    expect(d.seq!).toBeGreaterThan(maxOld);

    const ids = (await fresh.listItems(acct)).map((i) => i.localId);
    expect(ids).toEqual([a.localId, b.localId, c.localId, d.localId]);
  });
});
