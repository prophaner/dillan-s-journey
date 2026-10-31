// Template validation cases shared by validate.test.ts (TS) and sql.test.ts (v1_template_errors).
import type { Block, Exercise } from "@/v1/core/types";

export const ex = (o: Partial<Exercise> = {}): Exercise => ({
  id: "e1",
  name: "Goblet Squat",
  reps: 8,
  rep_mode: "total",
  weight: 40,
  unit: "lb",
  load_basis: "total_external",
  instructions: "",
  ...o,
});

export const straight = (o: Record<string, unknown> = {}, e: Record<string, unknown> = {}) =>
  ({
    type: "straight",
    id: "b1",
    sets: 3,
    rest_s: 60,
    exercise: { ...ex(), ...e },
    ...o,
  }) as unknown as Block;

export const superset = (o: Record<string, unknown> = {}) =>
  ({
    type: "superset",
    id: "b2",
    rounds: 3,
    rest_s: 90,
    exercises: [ex({ id: "m1" }), ex({ id: "m2", weight: null, load_basis: null })],
    ...o,
  }) as unknown as Block;

export interface TemplateCase {
  name: string;
  tname: unknown;
  blocks: unknown;
  errors: Array<[string, string]>; // [path, code] in order
}

const many = Array.from({ length: 31 }, (_, i) => straight({ id: `b${i}` }));

export const TEMPLATE_CASES: TemplateCase[] = [
  {
    name: "valid straight + superset",
    tname: "Upper A",
    blocks: [straight(), superset()],
    errors: [],
  },
  {
    name: "bodyweight (weight null) needs no load basis",
    tname: "BW",
    blocks: [straight({}, { weight: null, load_basis: null })],
    errors: [],
  },
  {
    name: "weight 0 is valid but needs a load basis",
    tname: "Zero",
    blocks: [straight({}, { weight: 0, load_basis: null })],
    errors: [["blocks.0.exercise.load_basis", "required"]],
  },
  { name: "decimal weight ok", tname: "Dec", blocks: [straight({}, { weight: 22.5 })], errors: [] },
  { name: "blank name", tname: "   ", blocks: [straight()], errors: [["name", "required"]] },
  {
    name: "name 61 chars",
    tname: "x".repeat(61),
    blocks: [straight()],
    errors: [["name", "too_long"]],
  },
  {
    name: "name 60 chars after trim",
    tname: `  ${"x".repeat(60)}  `,
    blocks: [straight()],
    errors: [],
  },
  { name: "no blocks", tname: "A", blocks: [], errors: [["blocks", "required"]] },
  {
    name: "sets 0 and 21",
    tname: "A",
    blocks: [straight({ sets: 0 }), straight({ id: "b2", sets: 21 })],
    errors: [
      ["blocks.0.sets", "range"],
      ["blocks.1.sets", "range"],
    ],
  },
  {
    name: "sets not an integer",
    tname: "A",
    blocks: [straight({ sets: 2.5 })],
    errors: [["blocks.0.sets", "range"]],
  },
  {
    name: "reps 0 and 201",
    tname: "A",
    blocks: [straight({}, { reps: 0 }), straight({ id: "b2" }, { reps: 201 })],
    errors: [
      ["blocks.0.exercise.reps", "range"],
      ["blocks.1.exercise.reps", "range"],
    ],
  },
  {
    name: "reps bounds 1 and 200 ok",
    tname: "A",
    blocks: [straight({}, { reps: 1 }), straight({ id: "b2" }, { reps: 200 })],
    errors: [],
  },
  {
    name: "negative weight",
    tname: "A",
    blocks: [straight({}, { weight: -1 })],
    errors: [["blocks.0.exercise.weight", "range"]],
  },
  {
    name: "rest 601 and -1",
    tname: "A",
    blocks: [straight({ rest_s: 601 }), straight({ id: "b2", rest_s: -1 })],
    errors: [
      ["blocks.0.rest_s", "range"],
      ["blocks.1.rest_s", "range"],
    ],
  },
  {
    name: "rest 0 and 600 ok",
    tname: "A",
    blocks: [straight({ rest_s: 0 }), straight({ id: "b2", rest_s: 600 })],
    errors: [],
  },
  {
    name: "bad enums",
    tname: "A",
    blocks: [straight({}, { rep_mode: "each", unit: "st", load_basis: "per_hand" })],
    errors: [
      ["blocks.0.exercise.rep_mode", "invalid"],
      ["blocks.0.exercise.unit", "invalid"],
      ["blocks.0.exercise.load_basis", "invalid"],
    ],
  },
  {
    name: "instructions 241",
    tname: "A",
    blocks: [straight({}, { instructions: "i".repeat(241) })],
    errors: [["blocks.0.exercise.instructions", "too_long"]],
  },
  {
    name: "instructions 240 ok",
    tname: "A",
    blocks: [straight({}, { instructions: "i".repeat(240) })],
    errors: [],
  },
  {
    name: "blank exercise name",
    tname: "A",
    blocks: [straight({}, { name: "" })],
    errors: [["blocks.0.exercise.name", "required"]],
  },
  {
    name: "superset of one",
    tname: "A",
    blocks: [superset({ exercises: [ex()] })],
    errors: [["blocks.0.exercises", "superset_too_small"]],
  },
  {
    name: "superset of seven",
    tname: "A",
    blocks: [superset({ exercises: Array.from({ length: 7 }, (_, i) => ex({ id: `m${i}` })) })],
    errors: [["blocks.0.exercises", "superset_too_large"]],
  },
  {
    name: "superset rounds 0 and member reps bad",
    tname: "A",
    blocks: [superset({ rounds: 0, exercises: [ex(), ex({ id: "m2", reps: 0 })] })],
    errors: [
      ["blocks.0.rounds", "range"],
      ["blocks.0.exercises.1.reps", "range"],
    ],
  },
  {
    name: "unknown block type",
    tname: "A",
    blocks: [{ type: "circuit", id: "x" }],
    errors: [["blocks.0.type", "invalid"]],
  },
  { name: "31 exercises", tname: "A", blocks: many, errors: [["blocks", "too_many"]] },
  {
    name: "missing ids",
    tname: "A",
    blocks: [straight({ id: "" }, { id: "" })],
    errors: [
      ["blocks.0.id", "invalid"],
      ["blocks.0.exercise.id", "invalid"],
    ],
  },
];
