import { DASH_COPY } from "@/v1/ui/session-page";

/**
 * Remote-key hints for the S09 dashboard. OK names the focused primary action, which differs
 * per state: Skip rest while resting (also once rest has finished), Complete set on a working
 * set, End workout once every set is done.
 */
export function dashboardHints(state: {
  resting: boolean;
  hasStep: boolean;
}): Array<[string, string]> {
  if (state.resting)
    return [
      ["OK", DASH_COPY.skipRest],
      ["◀ ▶", "Skip / Pause / End"],
      ["Back", "Pause (never ends the workout)"],
    ];
  if (state.hasStep)
    return [
      ["OK", DASH_COPY.complete],
      ["◀ ▶", "Skip / Pause / End"],
      ["Back", "Pause (never ends the workout)"],
    ];
  return [
    ["OK", DASH_COPY.endWorkout],
    ["◀ ▶", "Pause / Undo"],
    ["Back", "Pause (never ends the workout)"],
  ];
}
