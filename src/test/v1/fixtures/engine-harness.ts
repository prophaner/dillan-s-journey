// Runs src/test/v1/fixtures/engine-cases.json against any engine implementation
// (the TS reducer or the SQL function), so both are checked by the same expectations.
import { expect } from "vitest";
import cases from "./engine-cases.json";
import type { ApplyResult, Block, EngineCommand, EngineState, Step } from "@/v1/core/types";

export const T0: number = cases.T0;
export const BLOCKS = cases.blocks as unknown as Record<string, Block[]>;

export interface FixtureCommand {
  at: number;
  kind: string;
  payload?: Record<string, unknown>;
  rev?: number;
  expect: string;
  after?: Record<string, unknown>;
}
export interface FixtureCase {
  name: string;
  blocks: string;
  commands: FixtureCommand[];
  final?: Record<string, unknown>;
}
export const CASES = cases.cases as unknown as FixtureCase[];

const TIME_FIELDS = [
  "started_at",
  "ended_at",
  "paused_at",
  "rest_started_at",
  "rest_ends_at",
] as const;

/** State with times made relative to T0, for comparison with fixture values. */
export function relative(s: EngineState): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  for (const f of TIME_FIELDS) {
    const v = s[f];
    out[f] = v == null ? null : v - T0;
  }
  out["pauses"] = s.pauses.map((p) => ({ from: p.from - T0, to: p.to == null ? null : p.to - T0 }));
  out["results"] = Object.fromEntries(
    Object.entries(s.results).map(([k, r]) => [k, { ...r, at: r.at == null ? null : r.at - T0 }]),
  );
  return out;
}

export function initialFromSteps(steps: Step[]): EngineState {
  return {
    state: "preparing",
    outcome: null,
    revision: 1,
    cursor: 0,
    steps,
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

export type Apply = (
  s: EngineState,
  cmd: EngineCommand,
  at: number,
) => ApplyResult | Promise<ApplyResult>;

/** Runs one case; returns every intermediate result (for parity comparison). */
export async function runCase(c: FixtureCase, steps: Step[], apply: Apply): Promise<ApplyResult[]> {
  let s = initialFromSteps(steps);
  const trace: ApplyResult[] = [];
  for (const [i, cmd] of c.commands.entries()) {
    const ec: EngineCommand = {
      kind: cmd.kind,
      expected_revision: cmd.rev ?? s.revision,
      ...(cmd.payload ? { payload: cmd.payload as NonNullable<EngineCommand["payload"]> } : {}),
    };
    const r = await apply(s, ec, T0 + cmd.at);
    trace.push(r);
    const label = `${c.name} #${i} ${cmd.kind}`;
    expect(r.ok ? "ok" : r.error, label).toBe(cmd.expect);
    if (!r.ok) expect(r.state, `${label}: state unchanged on error`).toEqual(s);
    if (cmd.after) expect(relative(r.state), label).toMatchObject(cmd.after);
    s = r.state;
  }
  if (c.final) {
    const rel = relative(s);
    for (const [k, v] of Object.entries(c.final)) expect(rel[k], `${c.name} final.${k}`).toEqual(v);
  }
  return trace;
}
