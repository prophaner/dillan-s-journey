// Session engine client (Slice C): offline queue + replay, user isolation, stale revisions,
// pending-not-done display, recovery after reload.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockApi } from "@/v1/data/mock-api";
import { MOCK_LUIS, MOCK_MAYA, seedMockDb } from "@/v1/data/mock-fixtures";
import type { DillanApi } from "@/v1/data/api";
import type { SessionRpcResult, WorkoutSessionRow } from "@/v1/core/types";
import { CommandQueue, QUEUE_MAX, queueKey, type QueuedCommand } from "@/v1/session/command-queue";
import { NOTICES, SessionController, isNetworkError } from "@/v1/session/controller";

type Api = ReturnType<typeof createMockApi>;
let api: Api;

beforeEach(async () => {
  localStorage.clear();
  api = createMockApi({ storage: null, db: seedMockDb(), hrMode: () => "off" });
  await api.auth.verifyOtp("email", "luis@example.com", "123456");
});
afterEach(() => localStorage.clear());

async function startedSession(a: DillanApi = api): Promise<WorkoutSessionRow> {
  const tpl = (await a.templates.list()).find((t) => t.name === "Upper Body A");
  const r = await a.sessions.start({ templateId: tpl!.id, liveData: false, timezone: "UTC" });
  const s = await a.sessions.command({
    sessionId: r.session!.id,
    kind: "start",
    expectedRevision: r.session!.revision,
    source: "phone",
  });
  return s.session!;
}

function controller(a: DillanApi, sessionId: string, userId = MOCK_LUIS) {
  return new SessionController({
    api: a,
    userId,
    sessionId,
    source: "phone",
    now: () => Date.now(),
    listenWindow: false,
  });
}

/** Wraps the api so session commands can be made to fail like a dropped connection. */
function flaky(base: DillanApi) {
  const state = { offline: false, sent: [] as string[] };
  const wrapped: DillanApi = {
    ...base,
    sessions: {
      ...base.sessions,
      command: async (c) => {
        if (state.offline) throw new TypeError("Failed to fetch");
        state.sent.push(c.commandId ?? "");
        return base.sessions.command(c);
      },
    },
  };
  return { api: wrapped, state };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("network error classification", () => {
  it("treats fetch failures as offline and server codes as answers", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(Object.assign(new Error("x"), { code: "22023" }))).toBe(false);
    expect(isNetworkError(new Error("not_authenticated"))).toBe(false);
  });
});

describe("offline queue and replay", () => {
  it("queues commands while offline, shows them as pending, and replays after reload", async () => {
    const row = await startedSession();
    const f = flaky(api);
    f.state.offline = true;
    const c = controller(f.api, row.id);
    await c.start();
    expect(c.send("complete_set")).toBe(true);
    await settle();
    let v = c.getSnapshot();
    expect(v.offline).toBe(true);
    expect(v.pending).toHaveLength(1);
    // Shown as the next state but labelled pending, never as a confirmed result.
    expect(v.projected?.cursor).toBe(1);
    expect(v.row?.cursor).toBe(0);
    expect(v.pendingKeys).toEqual([row.steps[0]!.key]);
    expect(v.row?.results[row.steps[0]!.key]).toBeUndefined();
    // A second tap builds on the pending one (chained revision).
    expect(c.send("skip_rest")).toBe(true);
    await settle();
    expect(new CommandQueue(MOCK_LUIS, row.id).list().map((q) => q.kind)).toEqual([
      "complete_set",
      "skip_rest",
    ]);
    c.dispose();

    // Reload: a new controller for the same user and session replays the stored queue.
    f.state.offline = false;
    const c2 = controller(f.api, row.id);
    await c2.start();
    v = c2.getSnapshot();
    expect(v.pending).toHaveLength(0);
    expect(v.offline).toBe(false);
    expect(v.row?.cursor).toBe(1);
    expect(v.row?.results[row.steps[0]!.key]?.status).toBe("done");
    expect(v.row?.rest_ends_at).toBeNull();
    expect(new CommandQueue(MOCK_LUIS, row.id).list()).toHaveLength(0);
    // Each command went out once, with its original command id.
    expect(new Set(f.state.sent).size).toBe(2);
    c2.dispose();
  });

  it("a retried command id is applied once (server dedupe)", async () => {
    const row = await startedSession();
    const cmd: QueuedCommand = {
      commandId: "11111111-1111-4111-8111-111111111111",
      userId: MOCK_LUIS,
      sessionId: row.id,
      kind: "complete_set",
      payload: { step: 0 },
      expectedRevision: row.revision,
      source: "phone",
      clientAt: new Date().toISOString(),
    };
    // The request reached the server but the response was lost: it is still in the queue.
    await api.sessions.command({ ...cmd, commandId: cmd.commandId });
    new CommandQueue(MOCK_LUIS, row.id).push(cmd);
    const c = controller(api, row.id);
    await c.start();
    const v = c.getSnapshot();
    expect(v.pending).toHaveLength(0);
    expect(v.row?.cursor).toBe(1);
    expect(v.notice).toBeNull();
    c.dispose();
  });

  it("is bounded to 200 commands per user and session", () => {
    const q = new CommandQueue(MOCK_LUIS, "s1");
    const base: QueuedCommand = {
      commandId: "",
      userId: MOCK_LUIS,
      sessionId: "s1",
      kind: "pause",
      expectedRevision: 1,
      source: "phone",
      clientAt: "",
    };
    for (let i = 0; i < QUEUE_MAX; i++) expect(q.push({ ...base, commandId: `c${i}` })).toBe(true);
    expect(q.push({ ...base, commandId: "overflow" })).toBe(false);
    expect(q.list()).toHaveLength(QUEUE_MAX);
    // Other sessions have their own budget.
    expect(
      new CommandQueue(MOCK_LUIS, "s2").push({ ...base, sessionId: "s2", commandId: "x" }),
    ).toBe(true);
  });
});

describe("user isolation", () => {
  it("never reads another user's queue and never replays under a different signed-in user", async () => {
    const row = await startedSession();
    const f = flaky(api);
    f.state.offline = true;
    const c = controller(f.api, row.id);
    await c.start();
    c.send("complete_set");
    await settle();
    c.dispose();

    // Maya's queue does not contain Luis's commands, even for the same session id.
    expect(new CommandQueue(MOCK_MAYA, row.id).list()).toHaveLength(0);
    // A tampered entry under Maya's key that claims to be Luis's is ignored.
    localStorage.setItem(queueKey(MOCK_MAYA), localStorage.getItem(queueKey(MOCK_LUIS)) as string);
    expect(new CommandQueue(MOCK_MAYA, row.id).list()).toHaveLength(0);

    // Maya signs in on this device: Luis's queued command is held, not sent.
    await api.auth.verifyOtp("email", "maya@example.com", "123456");
    f.state.offline = false;
    const c2 = controller(f.api, row.id, MOCK_LUIS);
    await c2.start();
    const v = c2.getSnapshot();
    expect(f.state.sent).toHaveLength(0);
    expect(v.heldForOtherUser).toBe(true);
    expect(v.notice).toBe(NOTICES.otherUser);
    expect(new CommandQueue(MOCK_LUIS, row.id).list()).toHaveLength(1);
    c2.dispose();

    // Back as Luis: it goes out under Luis.
    await api.auth.verifyOtp("email", "luis@example.com", "123456");
    const c3 = controller(f.api, row.id);
    await c3.start();
    expect(f.state.sent).toHaveLength(1);
    expect(c3.getSnapshot().row?.cursor).toBe(1);
    c3.dispose();
  });
});

describe("stale revisions", () => {
  /** A phone that misses Realtime, so its view goes stale while the TV acts. */
  function phoneApi(): DillanApi {
    return { ...api, realtime: { ...api.realtime, onSession: () => () => {} } };
  }

  it("drops a set action with a visible notice and adopts the server row", async () => {
    const row = await startedSession();
    const c = controller(phoneApi(), row.id);
    await c.start();
    // The TV completes set 1 first.
    await api.sessions.command({
      sessionId: row.id,
      kind: "complete_set",
      payload: { step: 0 },
      expectedRevision: row.revision,
      source: "tv",
    });
    c.send("complete_set");
    await settle();
    await settle();
    const v = c.getSnapshot();
    expect(v.pending).toHaveLength(0);
    expect(v.notice).toBe(NOTICES.stale);
    expect(v.row?.cursor).toBe(1); // the TV's set only, not two
    expect(v.row?.results[row.steps[1]!.key]).toBeUndefined();
    c.dispose();
  });

  it("drops a pause silently when the session is already paused", async () => {
    const row = await startedSession();
    const c = controller(phoneApi(), row.id);
    await c.start();
    await api.sessions.command({
      sessionId: row.id,
      kind: "pause",
      expectedRevision: row.revision,
      source: "tv",
    });
    c.send("pause");
    await settle();
    await settle();
    const v = c.getSnapshot();
    expect(v.row?.state).toBe("paused");
    expect(v.pending).toHaveLength(0);
    expect(v.notice).toBeNull();
    c.dispose();
  });

  it("retries end with a fresh command id after a stale_revision", async () => {
    const row = await startedSession();
    const calls: Array<{ id: string; rev: number }> = [];
    let first = true;
    const a: DillanApi = {
      ...phoneApi(),
      sessions: {
        ...api.sessions,
        command: async (cmd) => {
          calls.push({ id: cmd.commandId ?? "", rev: cmd.expectedRevision });
          if (first && cmd.kind === "end") {
            first = false;
            // Another screen moved the session on (a set), so this end is reported stale.
            const moved = await api.sessions.command({
              sessionId: row.id,
              kind: "complete_set",
              payload: { step: 0 },
              expectedRevision: row.revision,
              source: "tv",
            });
            return {
              ok: false,
              error: "stale_revision",
              session: moved.session,
            } as SessionRpcResult;
          }
          return api.sessions.command(cmd);
        },
      },
    };
    let ended: WorkoutSessionRow | null = null;
    const c = new SessionController({
      api: a,
      userId: MOCK_LUIS,
      sessionId: row.id,
      source: "phone",
      now: () => Date.now(),
      listenWindow: false,
      onEnded: (r) => (ended = r),
    });
    await c.start();
    c.send("end");
    await settle();
    await settle();
    await settle();
    const v = c.getSnapshot();
    expect(v.row?.state).toBe("ended");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.id).not.toBe(calls[0]!.id);
    expect(calls[1]!.rev).toBe(row.revision + 1);
    expect(ended).not.toBeNull();
    expect(v.notice).toBeNull();
    c.dispose();
  });
});

describe("recovery after reload", () => {
  it("a new controller restores the same step and timing from the server row", async () => {
    const row = await startedSession();
    const c = controller(api, row.id);
    await c.start();
    c.send("complete_set");
    await settle();
    c.send("skip_rest");
    await settle();
    c.send("pause");
    await settle();
    const before = c.getSnapshot().row!;
    c.dispose();

    const c2 = controller(api, row.id);
    expect(c2.getSnapshot().loadState).toBe("loading");
    await c2.start();
    const after = c2.getSnapshot();
    expect(after.loadState).toBe("ready");
    expect(after.row?.cursor).toBe(1);
    expect(after.row?.state).toBe("paused");
    expect(after.row?.paused_at).toBe(before.paused_at);
    expect(after.row?.started_at).toBe(before.started_at);
    c2.dispose();
  });

  it("reports not_found for a session of another user", async () => {
    const row = await startedSession();
    await api.auth.verifyOtp("email", "maya@example.com", "123456");
    const c = controller(api, row.id, MOCK_MAYA);
    await c.start();
    expect(c.getSnapshot().loadState).toBe("not_found");
    expect(c.getSnapshot().row).toBeNull();
    c.dispose();
  });
});
