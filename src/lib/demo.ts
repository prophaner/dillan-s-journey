/** Synthetic demo data. Every screen that shows it carries a "Demo data" label. */
export type PipKind = "done" | "short" | "rest" | "planned" | "missed" | "today";
export type BlockKind = "required" | "priority" | "optional";
export type TimeChoice = "full" | "short" | "priority";

export interface DemoBlock {
  id: string;
  name: string;
  kind: BlockKind;
  exercises: string;
  minutes: number;
  tag?: string;
  inShort: boolean;
  inPriority: boolean;
}

export const demoWeek: { day: string; kind: PipKind }[] = [
  { day: "M", kind: "done" },
  { day: "T", kind: "rest" },
  { day: "W", kind: "short" },
  { day: "T", kind: "today" },
  { day: "F", kind: "rest" },
  { day: "S", kind: "planned" },
  { day: "S", kind: "rest" },
];

export const demoToday = {
  eyebrow: "Block 2, week 3",
  sentence: "Today is about your pull.",
  body: "Chin-up negatives and rows move you toward six strict chin-ups. Core work is optional.",
  planVersion: 13,
  routine: "Pull + Core",
  times: { full: 45, short: 25, priority: 15 } as Record<TimeChoice, number>,
  blocks: [
    { id: "w", name: "Warm-up", kind: "required", exercises: "Band pull-aparts, scap hangs", minutes: 6, inShort: true, inPriority: false },
    { id: "p", name: "Priority", kind: "priority", tag: "Main goal", exercises: "Chin-up negatives · DB rows", minutes: 18, inShort: true, inPriority: true },
    { id: "a", name: "Accessories", kind: "optional", exercises: "Face pulls · Hammer curls", minutes: 13, inShort: false, inPriority: false },
    { id: "c", name: "Core", kind: "optional", exercises: "Dead bug · Side plank", minutes: 8, inShort: false, inPriority: false },
  ] as DemoBlock[],
};

export const demoSet = {
  sessionId: "demo",
  block: "Priority",
  exercise: "One-arm dumbbell row",
  cue: "Knee and hand on the bench. Pull your elbow toward your hip.",
  index: 2,
  of: 4,
  sets: 3,
  reps: 10,
  load: 35,
  unit: "lb",
  lastReps: 10,
  lastLoad: 35,
  restSeconds: 90,
};
