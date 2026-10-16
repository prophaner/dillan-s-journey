/**
 * S11 "Something feels off" report: pure rules only (no server, no store).
 *
 * brief §5 FR-08 (Notes, recovery, and longitudinal memory):
 *   "'My shoulder felt uncomfortable during this movement today' must not become a permanent
 *    diagnosis. Preserve date, affected movement/side, source, visibility, and review status."
 * brief §5 FR-09 (Limitations and areas for improvement):
 *   "New concerning symptoms can pause a planned exercise and request context or professional
 *    assessment according to a reviewed escalation policy."
 *   "Acceptance: a new limitation can flag a scheduled exercise without deleting historical
 *    results or silently changing the whole program."
 * brief §13 AT-05 (User stops due to discomfort):
 *   "Immediate stop/skip; dated report; no forced continuation"
 *
 * The route (src/routes/_authenticated/session.$id.tsx) computes the summary with
 * `completionOf(steps, d.logs, d.stopped)` and queues the report as an outbox item of kind
 * SESSION_OFF_REPORT whose payload carries `sessionId`; the outbox keys per-session ordering on
 * `sessionOf`, so that kind must resolve to the session.
 */
import { describe, expect, it } from "vitest";
import {
  activeTurns,
  completionOf,
  nextTurn,
  SESSION_OFF_REPORT,
  stepsOf,
  turnsOf,
  type LoggedSet,
  type PlanSnapshot,
  type Turn,
} from "@/lib/workout";
import { sessionOf } from "@/lib/outbox";

const snap: PlanSnapshot = {
  templateVersionId: "v", routineId: "r", versionNo: 1, title: "T", isDemo: true,
  blocks: [
    { position: 1, blockType: "single", priority: "main", rounds: 3, restSeconds: 90, prescriptions: [{ exercise_id: "a", name: "Overhead press", sets: 3, reps: 8 }] },
    { position: 2, blockType: "single", priority: "main", rounds: 2, restSeconds: 60, prescriptions: [{ exercise_id: "b", name: "Row", sets: 2, reps: 10 }] },
  ],
};
const steps = stepsOf(snap);
const turns = turnsOf(steps);
const logOf = (t: Turn): LoggedSet => ({ key: `${t.step.ref}#${t.setNo}`, ref: t.step.ref, setNo: t.setNo, reps: 8, load: null, unit: "lb", rir: null, loggedAt: "2026-10-15T10:00:00Z" });

/** The slice of the session draft the summary reads. */
type Draft = { logs: LoggedSet[]; stopped: boolean; skipped?: string[] };
const completion = (d: Draft) => completionOf(steps, d.logs, d.stopped);

describe("S11 completion after a 'Something feels off' action (FR-09, AT-05)", () => {
  it("'End session' marks the draft stopped and the summary says stopped, whatever was logged", () => {
    const oneSet: Draft = { logs: [logOf(turns[0]!)], stopped: true };
    expect(completion(oneSet)).toBe("stopped");
    const everything: Draft = { logs: turns.map(logOf), stopped: true };
    expect(completion(everything)).toBe("stopped");
    const nothing: Draft = { logs: [], stopped: true };
    expect(completion(nothing)).toBe("stopped");
  });

  it("'Stop this exercise' skips its remaining sets, leaves the rest of the session to do, and reads partial", () => {
    const d: Draft = { logs: [logOf(turns[0]!)], stopped: false, skipped: ["1:0"] };
    const remaining = activeTurns(turns, d.skipped);
    // The skipped exercise drops out; the set already done is kept (no deleted history).
    expect(remaining.every((t) => t.step.ref !== "1:0")).toBe(true);
    expect(d.logs).toHaveLength(1);
    // There is still work to do and the session is not forced to end.
    const next = nextTurn(remaining, d.logs);
    expect(next?.step.ref).toBe("2:0");
    expect(completion(d)).toBe("partial");
    // Even once the remaining turns are logged the skipped sets never happened: still partial.
    const finished: Draft = { ...d, logs: [...d.logs, ...remaining.map(logOf)] };
    expect(nextTurn(remaining, finished.logs)).toBeUndefined();
    expect(completion(finished)).toBe("partial");
  });

  it("every planned set logged and no stop reads complete", () => {
    const d: Draft = { logs: turns.map(logOf), stopped: false };
    expect(nextTurn(turns, d.logs)).toBeUndefined();
    expect(completion(d)).toBe("complete");
  });
});

describe("the off report belongs to its session in the outbox (sessionOf, FR-08 dated report)", () => {
  // Shape queued by the route's offAction(): sessionId, exerciseId, area, side, note, action, reportedAt.
  const payload = {
    sessionId: "sess-1",
    exerciseId: "a",
    area: "Shoulder",
    side: "left",
    note: "felt off on the way up",
    action: "stop_exercise",
    reportedAt: "2026-10-15T10:05:00Z",
  };

  it("SESSION_OFF_REPORT is resolved through payload.sessionId", () => {
    expect(SESSION_OFF_REPORT).toBe("limitation:session_report");
    // Not a session:* or update:sessions kind, so only the sessionId path can cover it.
    expect(SESSION_OFF_REPORT.startsWith("session:")).toBe(false);
    expect(SESSION_OFF_REPORT).not.toBe("update:sessions");
    expect(sessionOf({ kind: SESSION_OFF_REPORT, payload })).toBe("sess-1");
  });

  it("a report without a sessionId belongs to no session (it would not hold a session chain)", () => {
    const { sessionId: _omit, ...rest } = payload;
    expect(sessionOf({ kind: SESSION_OFF_REPORT, payload: rest })).toBeUndefined();
  });

  it("the report keeps the date, movement and side the brief requires (FR-08)", () => {
    expect(payload.reportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(payload.exerciseId).toBe(steps[0]!.exerciseId);
    expect(["left", "right", "both", null]).toContain(payload.side);
  });
});
