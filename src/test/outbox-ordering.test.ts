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
 *
 * jsdom has no IndexedDB and fake-indexeddb is not installed, so the `idb` module boundary is
 * replaced with an in-memory store below. Product code is exercised unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drain, enqueue, listItems, retryAccount, sessionOf, type OutboxItem, type SendResult } from "@/lib/outbox";
import { sessionSaveState } from "@/lib/use-outbox";
import { SESSION_FINISH, SESSION_START, SET_LOG, SET_LOG_DELETE } from "@/lib/workout";

vi.mock("idb", () => {
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
