// Step builder. Twin of public.v1_build_steps(). Acceptance 14:
//  superset 2 x 3 rounds -> A1, A2, rest, A1, A2, rest, A1, A2 (no trailing rest)
//  straight sets         -> set 1, rest, set 2, rest, ... (no rest after the final set of the workout)
// A step is one set of one exercise; "rest" is not a step: the engine starts a rest after a step
// whose last_in_round is true, when another step follows and rest_s > 0.

import type { Block, Exercise, Step } from "./types";

export function buildSteps(blocks: Block[]): Step[] {
  const steps: Step[] = [];
  let supersetIndex = 0;
  blocks.forEach((b, bi) => {
    if (b.type === "straight") {
      for (let r = 0; r < b.sets; r++) {
        steps.push({
          index: steps.length,
          key: `${bi}.0.${r}`,
          block: bi,
          exercise: 0,
          set: r,
          sets: b.sets,
          group: null,
          label: null,
          last_in_round: true,
          rest_s: b.rest_s,
          reps: b.exercise.reps,
          weight: b.exercise.weight ?? null,
        });
      }
    } else {
      const letter = String.fromCharCode(65 + supersetIndex);
      supersetIndex += 1;
      const m = b.exercises.length;
      for (let r = 0; r < b.rounds; r++) {
        b.exercises.forEach((ex, mi) => {
          steps.push({
            index: steps.length,
            key: `${bi}.${mi}.${r}`,
            block: bi,
            exercise: mi,
            set: r,
            sets: b.rounds,
            group: letter,
            label: `${letter}${mi + 1}`,
            last_in_round: mi === m - 1,
            rest_s: b.rest_s,
            reps: ex.reps,
            weight: ex.weight ?? null,
          });
        });
      }
    }
  });
  return steps;
}

/** The exercise a step points at. */
export function exerciseForStep(blocks: Block[], step: Step): Exercise | null {
  const b = blocks[step.block];
  if (!b) return null;
  return b.type === "straight" ? b.exercise : (b.exercises[step.exercise] ?? null);
}

export type TimelineItem =
  { kind: "set"; step: Step } | { kind: "rest"; seconds: number; after: number };

/** Sets with the rests the engine will insert between them (for previews and tests). */
export function timeline(steps: Step[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  steps.forEach((s, i) => {
    out.push({ kind: "set", step: s });
    if (s.last_in_round && i < steps.length - 1 && s.rest_s > 0)
      out.push({ kind: "rest", seconds: s.rest_s, after: i });
  });
  return out;
}
