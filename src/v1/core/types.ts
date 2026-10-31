// Dillan V1 shared types. Mirrors drizzle/migrations/0006_v1_core.sql (snake_case on purpose:
// these are the shapes stored in jsonb and returned by the RPCs). Pure: no React, no Supabase.

export type Unit = "lb" | "kg";
export type RepMode = "total" | "per_side";
export type LoadBasis = "total_external" | "per_implement";

/** One exercise prescription. weight null = bodyweight (blank is not 0). */
export interface Exercise {
  id: string;
  name: string;
  reps: number; // 1..200
  rep_mode: RepMode;
  weight: number | null; // 0..1000
  unit: Unit;
  load_basis: LoadBasis | null; // required when weight is not null
  instructions: string; // <= 240 chars, "" when none
}

export interface StraightBlock {
  type: "straight";
  id: string;
  exercise: Exercise;
  sets: number; // 1..20
  rest_s: number; // 0..600, default 60
}

/** A superset: >= 2 consecutive members, one rounds count, one rest after the last member. */
export interface SupersetGroup {
  type: "superset";
  id: string;
  rounds: number; // 1..20
  rest_s: number; // 0..600
  exercises: Exercise[]; // 2..6
}

export type Block = StraightBlock | SupersetGroup;

export interface TemplateBody {
  name: string; // 1..60 after trim
  blocks: Block[]; // 1..30 exercises in total
}

/** public.workout_templates row */
export interface WorkoutTemplate extends TemplateBody {
  id: string;
  user_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ZoneCutoffs = [number, number, number, number];

/** public.zone_configs row */
export interface ZoneConfig {
  user_id: string;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  confirmed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

/** workout_sessions.zone_snapshot; null when zones were not confirmed at start */
export interface ZoneSnapshot {
  cutoffs: ZoneCutoffs;
  version: number;
  confirmed_at: string;
}

/** workout_sessions.snapshot: deep copy of the template at start */
export interface Snapshot {
  template_id: string;
  template_revision: number;
  name: string;
  blocks: Block[];
}

export interface Step {
  index: number;
  key: string; // `${block}.${exercise}.${set}`
  block: number;
  exercise: number; // member index (0 for straight sets)
  set: number; // 0-based set / round
  sets: number; // sets (straight) or rounds (superset)
  group: string | null; // 'A', 'B', ... for supersets
  label: string | null; // 'A1', 'A2', ...
  last_in_round: boolean;
  rest_s: number;
  reps: number; // prescribed
  weight: number | null; // prescribed
}

export type SetStatus = "done" | "skipped" | "not_reached";

export interface SetResult {
  status: SetStatus;
  reps: number | null;
  weight: number | null;
  at: number | null; // epoch ms
}

export interface PauseInterval {
  from: number; // epoch ms
  to: number | null;
}

export type SessionStateName = "preparing" | "active" | "paused" | "ending" | "ended";
export type Outcome = "completed" | "partial" | "discarded";
export type CommandSource = "phone" | "desktop" | "tv";

/** The engine's view of a session. All times are epoch ms. Mirrors v1_engine_state(). */
export interface EngineState {
  state: SessionStateName;
  outcome: Outcome | null;
  revision: number;
  cursor: number;
  steps: Step[];
  results: Record<string, SetResult>;
  started_at: number | null;
  ended_at: number | null;
  paused_at: number | null;
  paused_ms: number;
  pauses: PauseInterval[];
  rest_started_at: number | null;
  rest_ends_at: number | null;
}

export type CommandKind =
  | "start"
  | "pause"
  | "resume"
  | "complete_set"
  | "skip_set"
  | "undo"
  | "skip_rest"
  | "end"
  | "discard";

export const COMMAND_KINDS: readonly CommandKind[] = [
  "start",
  "pause",
  "resume",
  "complete_set",
  "skip_set",
  "undo",
  "skip_rest",
  "end",
  "discard",
];

export interface CommandPayload {
  step?: number;
  reps?: number;
  weight?: number | null;
}

export interface EngineCommand {
  kind: CommandKind | string;
  payload?: CommandPayload;
  expected_revision: number;
}

export type CommandError =
  | "unknown_kind"
  | "session_ended"
  | "stale_revision"
  | "invalid_state"
  | "no_step"
  | "step_mismatch"
  | "invalid_payload"
  | "nothing_to_undo"
  | "no_rest";

export type ApplyResult =
  { ok: true; state: EngineState } | { ok: false; error: CommandError; state: EngineState };

/** public.workout_sessions row as returned by the RPCs / PostgREST (timestamps ISO). */
export interface WorkoutSessionRow {
  id: string;
  user_id: string;
  template_id: string | null;
  snapshot: Snapshot;
  steps: Step[];
  zone_snapshot: ZoneSnapshot | null;
  start_timezone: string;
  state: SessionStateName;
  outcome: Outcome | null;
  revision: number;
  live_data: boolean;
  is_demo: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  paused_at: string | null;
  paused_ms: number;
  pauses: PauseInterval[];
  cursor: number;
  rest_started_at: string | null;
  rest_ends_at: string | null;
  results: Record<string, SetResult>;
  last_command_id: string | null;
  last_source: CommandSource | null;
  last_client_at: string | null;
  updated_at: string;
}

/** RPC errors besides the engine's CommandError */
export type RpcError =
  | CommandError
  | "session_running"
  | "template_not_found"
  | "invalid_timezone"
  | "not_found"
  | "command_id_reused";

export interface SessionRpcResult {
  ok: boolean;
  error?: RpcError;
  session: WorkoutSessionRow | null;
  session_id?: string; // with session_running
}

export interface SessionNoteRow {
  session_id: string;
  user_id: string;
  text: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export type HrStatus = "pending" | "final" | "no_live_data";

/** public.session_summaries row: the history record written at End. */
export interface SessionSummaryRow {
  session_id: string;
  user_id: string;
  outcome: "completed" | "partial";
  started_at: string;
  ended_at: string;
  start_timezone: string;
  local_date: string; // YYYY-MM-DD
  active_ms: number;
  elapsed_ms: number;
  paused_ms: number;
  zone_ms: [number, number, number, number, number];
  measured_ms: number;
  unmeasured_ms: number;
  coverage: number;
  algorithm_version: number;
  zone_snapshot: ZoneSnapshot | null;
  hr_status: HrStatus;
  hr_finalize_dirty: boolean;
  hr_sources_used: string[];
  finalized_at: string | null;
  created_at: string;
}

export type PairingStatus =
  "awaiting" | "approved" | "denied" | "expired" | "cancelled" | "consumed";

export interface DeviceGrantRow {
  id: string;
  user_id: string;
  device_id: string;
  label: string;
  session_id: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

/** Convert a row's timestamps into the engine's epoch-ms state. */
export function engineStateFromRow(row: WorkoutSessionRow): EngineState {
  const ms = (t: string | null) => (t == null ? null : Date.parse(t));
  return {
    state: row.state,
    outcome: row.outcome,
    revision: row.revision,
    cursor: row.cursor,
    steps: row.steps,
    results: row.results,
    started_at: ms(row.started_at),
    ended_at: ms(row.ended_at),
    paused_at: ms(row.paused_at),
    paused_ms: row.paused_ms,
    pauses: row.pauses,
    rest_started_at: ms(row.rest_started_at),
    rest_ends_at: ms(row.rest_ends_at),
  };
}
