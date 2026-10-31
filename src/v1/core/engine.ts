// Pure session engine. Twin of public.v1_engine_apply() in 0006_v1_core.sql; both run
// src/test/v1/fixtures/engine-cases.json. The server is authoritative (D4): clients use this
// reducer for optimistic display and offline queues, then reconcile with the returned row.
//
// Rules
//  - ended is terminal: every command returns session_ended
//  - a stale expected_revision is rejected (stale_revision), except pause/resume/end which
//    still apply when valid in the current state
//  - pause excludes time from active duration, rest and zones; resume extends rest_ends_at
//  - skip is its own status (never reps 0); undo returns to the previous set and clears rest
//  - end: unreached sets become not_reached; outcome completed only if every set is done

import type {
  ApplyResult,
  CommandError,
  CommandPayload,
  EngineCommand,
  EngineState,
  SetResult,
  Step,
} from "./types";
import { COMMAND_KINDS } from "./types";
import { isInt, isNum } from "./validate";
import { buildSteps } from "./steps";
import type { Block } from "./types";

const LENIENT = new Set(["pause", "resume", "end"]);

export function initialState(blocks: Block[]): EngineState {
  return {
    state: "preparing",
    outcome: null,
    revision: 1,
    cursor: 0,
    steps: buildSteps(blocks),
    results: {},
    started_at: null,
    ended_at: null,
    paused_at: null,
    paused_ms: 0,
    pauses: [],
    rest_started_at: null,
    rest_ends_at: null,
  };
}

function check(s: EngineState, kind: string, pl: CommandPayload): CommandError | null {
  const st = s.state;
  const n = s.steps.length;
  switch (kind) {
    case "start":
      return st === "preparing" ? null : "invalid_state";
    case "pause":
      return st === "active" ? null : "invalid_state";
    case "resume":
      return st === "paused" ? null : "invalid_state";
    case "complete_set":
    case "skip_set":
      if (st !== "active") return "invalid_state";
      if (s.cursor >= n) return "no_step";
      if (!isInt(pl.step, s.cursor, s.cursor)) return "step_mismatch";
      if (kind === "complete_set" && pl.reps !== undefined && !isInt(pl.reps, 0, 200))
        return "invalid_payload";
      if (
        kind === "complete_set" &&
        pl.weight !== undefined &&
        pl.weight !== null &&
        !isNum(pl.weight, 0, 1000)
      )
        return "invalid_payload";
      return null;
    case "undo":
      if (st !== "active") return "invalid_state";
      return s.cursor === 0 ? "nothing_to_undo" : null;
    case "skip_rest":
      if (st !== "active") return "invalid_state";
      return s.rest_ends_at == null ? "no_rest" : null;
    case "end":
      return st === "active" || st === "paused" ? null : "invalid_state";
    case "discard":
      return st === "preparing" || st === "active" || st === "paused" ? null : "invalid_state";
    default:
      return "unknown_kind";
  }
}

function clone(s: EngineState): EngineState {
  return {
    ...s,
    results: { ...s.results },
    pauses: s.pauses.map((p) => ({ ...p })),
  };
}

/** Apply one command at server time `at` (epoch ms). Never mutates its input. */
export function applyCommand(input: EngineState, cmd: EngineCommand, at: number): ApplyResult {
  const kind = cmd.kind;
  const pl: CommandPayload = cmd.payload ?? {};
  if (!(COMMAND_KINDS as readonly string[]).includes(kind))
    return { ok: false, error: "unknown_kind", state: input };
  if (input.state === "ended") return { ok: false, error: "session_ended", state: input };
  const stale = cmd.expected_revision !== input.revision;
  if (stale && !LENIENT.has(kind)) return { ok: false, error: "stale_revision", state: input };
  const err = check(input, kind, pl);
  if (err) return { ok: false, error: stale ? "stale_revision" : err, state: input };

  const s = clone(input);
  const n = s.steps.length;
  const wasPaused = input.state === "paused";

  if (kind === "start") {
    s.state = "active";
    s.started_at = at;
  } else if (kind === "pause") {
    s.state = "paused";
    s.paused_at = at;
    s.pauses.push({ from: at, to: null });
  } else if (kind === "complete_set" || kind === "skip_set") {
    const step = s.steps[s.cursor] as Step;
    const res: SetResult =
      kind === "complete_set"
        ? {
            status: "done",
            reps: pl.reps !== undefined ? pl.reps : step.reps,
            weight: pl.weight !== undefined ? pl.weight : step.weight,
            at,
          }
        : { status: "skipped", reps: null, weight: null, at };
    s.results[step.key] = res;
    s.cursor += 1;
    if (step.last_in_round && s.cursor < n && step.rest_s > 0) {
      s.rest_started_at = at;
      s.rest_ends_at = at + step.rest_s * 1000;
    } else {
      s.rest_started_at = null;
      s.rest_ends_at = null;
    }
  } else if (kind === "undo") {
    s.cursor -= 1;
    const step = s.steps[s.cursor] as Step;
    delete s.results[step.key];
    s.rest_started_at = null;
    s.rest_ends_at = null;
  } else if (kind === "skip_rest") {
    s.rest_started_at = null;
    s.rest_ends_at = null;
  }

  if ((kind === "resume" || kind === "end" || kind === "discard") && wasPaused) {
    const pausedFor = Math.max(0, at - (s.paused_at ?? at));
    s.state = "active";
    s.paused_at = null;
    s.paused_ms += pausedFor;
    if (s.rest_ends_at != null) s.rest_ends_at += pausedFor;
    const last = s.pauses[s.pauses.length - 1];
    if (last) last.to = at;
  }

  if (kind === "end" || kind === "discard") {
    s.state = "ended";
    s.ended_at = at;
    s.rest_started_at = null;
    s.rest_ends_at = null;
    if (kind === "discard") {
      s.outcome = "discarded";
    } else {
      let allDone = true;
      for (const step of s.steps) {
        const r = s.results[step.key];
        if (!r) {
          s.results[step.key] = { status: "not_reached", reps: null, weight: null, at: null };
          allDone = false;
        } else if (r.status !== "done") {
          allDone = false;
        }
      }
      s.outcome = allDone ? "completed" : "partial";
    }
  }

  s.revision = input.revision + 1;
  return { ok: true, state: s };
}

export function currentStep(s: EngineState): Step | null {
  return s.steps[s.cursor] ?? null;
}

export function nextStep(s: EngineState): Step | null {
  return s.steps[s.cursor + 1] ?? null;
}

/** All prescribed sets have a result (the dashboard then offers End workout as primary). */
export function isAfterLastSet(s: EngineState): boolean {
  return s.cursor >= s.steps.length;
}
