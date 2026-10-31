import { validCutoffs } from "@/v1/core/zones";
import type { ZoneCutoffs } from "@/v1/core/types";

export const SUGGESTED_ZONES: ZoneCutoffs = [114, 133, 152, 171];
export const ZONES_INCREASE = "Boundaries must increase from Zone 2 to Zone 5.";
export const ZONES_RANGE = "Enter whole beats per minute, 1 to 250.";

/** Per-field errors (index 0..3), or null when the four values are a valid cutoff set. */
export function zoneFieldErrors(values: string[]): Array<string | null> | null {
  const nums = values.map((v) => (v.trim() === "" ? NaN : Number(v)));
  const errs: Array<string | null> = nums.map((n) =>
    Number.isInteger(n) && n >= 1 && n <= 250 ? null : ZONES_RANGE,
  );
  for (let i = 1; i < 4; i++) {
    if (!errs[i] && !errs[i - 1] && (nums[i] as number) <= (nums[i - 1] as number))
      errs[i] = ZONES_INCREASE;
  }
  if (errs.some(Boolean)) return errs;
  return validCutoffs(nums) ? null : nums.map(() => ZONES_INCREASE);
}
