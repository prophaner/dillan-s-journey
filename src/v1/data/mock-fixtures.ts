// Synthetic fixtures for the mock backend (dev only, ?mock=1). Two household users, a few
// templates, history made by running the real engine, one TV grant and two pairing codes.
// Nothing here is a real person or a real contact.

import { applyCommand, initialState } from "@/v1/core/engine";
import { localDateKey } from "@/v1/core/week";
import type {
  Block,
  DeviceGrantRow,
  EngineState,
  Exercise,
  SessionNoteRow,
  SessionRpcResult,
  SessionSummaryRow,
  Unit,
  WorkoutSessionRow,
  WorkoutTemplate,
  ZoneConfig,
} from "@/v1/core/types";

export interface MockUser {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  timezone: string;
  weight_unit: Unit;
  weekly_goal: number;
  name_done: boolean;
  version: number;
}

export interface MockPairing {
  code: string;
  device_id: string;
  device_label: string;
  status: "awaiting" | "approved" | "denied" | "expired" | "cancelled" | "consumed";
  created_at: string;
  expires_at: string;
  for_user_id: string | null;
  approved_user_id: string | null;
}

export interface MockDb {
  v: 1;
  users: MockUser[];
  templates: WorkoutTemplate[];
  zones: ZoneConfig[];
  sessions: WorkoutSessionRow[];
  commands: Record<string, { session_id: string | null; result: SessionRpcResult }>;
  summaries: SessionSummaryRow[];
  notes: SessionNoteRow[];
  grants: DeviceGrantRow[];
  pairings: MockPairing[];
}

export const MOCK_LUIS = "00000000-0000-4000-8000-00000000a001";
export const MOCK_MAYA = "00000000-0000-4000-8000-00000000a002";
export const MOCK_TV = "mock-tv-living-room";

let seq = 0;
const sid = (p: string) => `${p}-${(++seq).toString(16).padStart(4, "0")}`;

function ex(name: string, reps: number, o: Partial<Exercise> = {}): Exercise {
  return {
    id: sid("ex"),
    name,
    reps,
    rep_mode: "total",
    weight: null,
    unit: "lb",
    load_basis: null,
    instructions: "",
    ...o,
  };
}

function straight(e: Exercise, sets: number, rest_s = 60): Block {
  return { type: "straight", id: sid("blk"), exercise: e, sets, rest_s };
}

function template(user_id: string, name: string, blocks: Block[], at: string): WorkoutTemplate {
  return {
    id: sid("tpl"),
    user_id,
    name,
    blocks,
    revision: 1,
    created_at: at,
    updated_at: at,
    deleted_at: null,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

function rowFrom(
  id: string,
  user_id: string,
  t: WorkoutTemplate,
  s: EngineState,
  tz: string,
  created: number,
): WorkoutSessionRow {
  const ts = (v: number | null) => (v == null ? null : iso(v));
  return {
    id,
    user_id,
    template_id: t.id,
    snapshot: { template_id: t.id, template_revision: t.revision, name: t.name, blocks: t.blocks },
    steps: s.steps,
    zone_snapshot: null,
    start_timezone: tz,
    state: s.state,
    outcome: s.outcome,
    revision: s.revision,
    live_data: false,
    is_demo: false,
    created_at: iso(created),
    started_at: ts(s.started_at),
    ended_at: ts(s.ended_at),
    paused_at: ts(s.paused_at),
    paused_ms: s.paused_ms,
    pauses: s.pauses,
    cursor: s.cursor,
    rest_started_at: ts(s.rest_started_at),
    rest_ends_at: ts(s.rest_ends_at),
    results: s.results,
    last_command_id: null,
    last_source: "phone",
    last_client_at: null,
    updated_at: ts(s.ended_at ?? s.started_at ?? created) as string,
  };
}

/** The summary row the end command writes (mirrors session_command in 0006). */
export function summaryFor(row: WorkoutSessionRow): SessionSummaryRow | null {
  if (row.state !== "ended" || row.outcome === "discarded" || !row.started_at || !row.ended_at)
    return null;
  const started = Date.parse(row.started_at);
  const ended = Date.parse(row.ended_at);
  const active = Math.max(0, ended - started - row.paused_ms);
  return {
    session_id: row.id,
    user_id: row.user_id,
    outcome: row.outcome as "completed" | "partial",
    started_at: row.started_at,
    ended_at: row.ended_at,
    start_timezone: row.start_timezone,
    local_date: localDateKey(started, row.start_timezone),
    active_ms: active,
    elapsed_ms: Math.max(0, ended - started),
    paused_ms: row.paused_ms,
    zone_ms: [0, 0, 0, 0, 0],
    measured_ms: 0,
    unmeasured_ms: active,
    coverage: 0,
    algorithm_version: 1,
    zone_snapshot: row.zone_snapshot,
    hr_status: row.live_data ? "pending" : "no_live_data",
    hr_finalize_dirty: false,
    hr_sources_used: [],
    finalized_at: null,
    created_at: row.ended_at,
  };
}

/** Run the real engine: complete every set (or stop early), then end. */
function playedSession(
  user_id: string,
  t: WorkoutTemplate,
  startAt: number,
  tz: string,
  stopAfter?: number,
) {
  let s = initialState(t.blocks);
  let at = startAt;
  const step = (kind: string, payload?: { step: number }) => {
    const r = applyCommand(
      s,
      { kind, ...(payload ? { payload } : {}), expected_revision: s.revision },
      at,
    );
    if (r.ok) s = r.state;
  };
  step("start");
  const n = stopAfter ?? s.steps.length;
  for (let i = 0; i < n; i++) {
    at += 75_000;
    step("complete_set", { step: s.cursor });
  }
  at += 60_000;
  step("end");
  return rowFrom(sid("ses"), user_id, t, s, tz, startAt - 60_000);
}

export function seedMockDb(now = Date.now()): MockDb {
  seq = 0;
  const day = 86_400_000;
  const at = iso(now - 20 * day);
  const tz = "America/New_York";

  const users: MockUser[] = [
    {
      id: MOCK_LUIS,
      email: "luis@example.com",
      phone: "+15615550100",
      display_name: "Luis",
      timezone: tz,
      weight_unit: "lb",
      weekly_goal: 3,
      name_done: true,
      version: 1,
    },
    {
      id: MOCK_MAYA,
      email: "maya@example.com",
      phone: null,
      display_name: "Maya",
      timezone: tz,
      weight_unit: "kg",
      weekly_goal: 4,
      name_done: true,
      version: 1,
    },
  ];

  const upper = template(
    MOCK_LUIS,
    "Upper Body A",
    [
      straight(
        ex("Dumbbell Floor Press", 10, {
          weight: 30,
          load_basis: "per_implement",
          instructions: "Elbows at 45°. Pause briefly when the upper arm touches the floor.",
        }),
        3,
      ),
      straight(
        ex("One-arm Row", 10, { rep_mode: "per_side", weight: 35, load_basis: "per_implement" }),
        3,
      ),
      {
        type: "superset",
        id: sid("blk"),
        rounds: 3,
        rest_s: 90,
        exercises: [
          ex("Half-kneeling Press", 8, {
            rep_mode: "per_side",
            weight: 20,
            load_basis: "per_implement",
          }),
          ex("Band Pull-apart", 15),
        ],
      },
    ],
    at,
  );
  const lower = template(
    MOCK_LUIS,
    "Lower Body A",
    [
      straight(ex("Goblet Squat", 8, { weight: 50, load_basis: "total_external" }), 4, 90),
      straight(ex("Romanian Deadlift", 10, { weight: 40, load_basis: "per_implement" }), 3, 90),
      straight(ex("Reverse Lunge", 8, { rep_mode: "per_side" }), 3),
    ],
    at,
  );
  const pull = template(
    MOCK_LUIS,
    "Pull + Core",
    [
      straight(ex("Pull-up", 6), 4, 120),
      straight(ex("Dead Bug", 10, { rep_mode: "per_side" }), 3, 45),
    ],
    at,
  );
  const maya = template(
    MOCK_MAYA,
    "Full Body",
    [
      straight(
        ex("Kettlebell Swing", 15, { weight: 16, unit: "kg", load_basis: "total_external" }),
        4,
      ),
      straight(ex("Push-up", 12), 3),
    ],
    at,
  );

  const s1 = playedSession(MOCK_LUIS, upper, now - 3 * day, tz);
  const s2 = playedSession(MOCK_LUIS, lower, now - 9 * day, tz, 5);
  const s3 = playedSession(MOCK_LUIS, pull, now - 16 * day, tz);
  const sessions = [s1, s2, s3];
  const summaries = sessions.map(summaryFor).filter((x): x is SessionSummaryRow => !!x);

  const notes: SessionNoteRow[] = [
    {
      session_id: s1.id,
      user_id: MOCK_LUIS,
      text: "Felt strong. Try 35 lb on the floor press next time.",
      revision: 1,
      created_at: s1.ended_at as string,
      updated_at: s1.ended_at as string,
    },
  ];

  return {
    v: 1,
    users,
    templates: [upper, lower, pull, maya],
    zones: [],
    sessions,
    commands: {},
    summaries,
    notes,
    grants: [
      {
        id: "00000000-0000-4000-8000-00000000c001",
        user_id: MOCK_LUIS,
        device_id: MOCK_TV,
        label: "Living Room Fire TV",
        session_id: null,
        created_at: iso(now - 10 * day),
        last_seen_at: iso(now - 2 * day),
        revoked_at: null,
      },
    ],
    pairings: [
      {
        code: "DLN-7RGZ",
        device_id: MOCK_TV,
        device_label: "Living Room Fire TV",
        status: "awaiting",
        created_at: iso(now),
        expires_at: iso(now + 365 * day),
        for_user_id: null,
        approved_user_id: null,
      },
      {
        code: "DLN-MAYA",
        device_id: MOCK_TV,
        device_label: "Living Room Fire TV",
        status: "awaiting",
        created_at: iso(now),
        expires_at: iso(now + 365 * day),
        for_user_id: MOCK_MAYA,
        approved_user_id: null,
      },
    ],
  };
}
