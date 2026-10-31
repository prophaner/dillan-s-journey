import { describe, expect, it } from "vitest";
import {
  ALGORITHM_VERSION,
  accountZones,
  validCutoffs,
  zoneOf,
  zoneRangeLabel,
} from "@/v1/core/zones";
import type { StoredSample } from "@/v1/core/hr";
import type { ZoneCutoffs } from "@/v1/core/types";

const C: ZoneCutoffs = [114, 133, 152, 171];
const S = 1_000_000;
let seq = 0;
const smp = (t: number, bpm: number | null, o: Partial<StoredSample> = {}): StoredSample => ({
  stream_id: "s1",
  seq: seq++,
  measured_at: S + t,
  bpm,
  contact: true,
  is_demo: false,
  ...o,
});
const base = { cutoffs: C, sessionStart: S, sessionIsDemo: false };
const check = (r: ReturnType<typeof accountZones>) =>
  expect(r.zone_ms.reduce((a, b) => a + b, 0) + r.unmeasured_ms).toBe(r.active_ms);

describe("zoneOf: exact boundaries", () => {
  it.each([
    [113, 1],
    [114, 2],
    [132, 2],
    [133, 3],
    [151, 3],
    [152, 4],
    [170, 4],
    [171, 5],
    [220, 5],
  ])("%i bpm -> Z%i", (bpm, z) => expect(zoneOf(bpm, C)).toBe(z));
  it("no cutoffs or no bpm -> null (never guessed)", () => {
    expect(zoneOf(120, null)).toBeNull();
    expect(zoneOf(null, C)).toBeNull();
  });
  it("validates cutoffs and labels ranges", () => {
    expect(validCutoffs([114, 133, 152, 171])).toBe(true);
    expect(validCutoffs([114, 114, 152, 171])).toBe(false);
    expect(validCutoffs([0, 1, 2, 3])).toBe(false);
    expect(zoneRangeLabel(1, C)).toBe("Under 114");
    expect(zoneRangeLabel(2, C)).toBe("114–132");
    expect(zoneRangeLabel(5, C)).toBe("171+");
    expect(ALGORITHM_VERSION).toBe(1);
  });
});

describe("accountZones", () => {
  it("holds each sample to the next sample, at most 10 s; gaps are unmeasured", () => {
    const r = accountZones({
      ...base,
      sessionEnd: S + 60_000,
      intervals: [{ from: S, to: S + 60_000 }],
      samples: [smp(0, 120), smp(4_000, 140), smp(30_000, 160)],
    });
    // 0-4 s Z2, 4-14 s Z3 (capped), 30-40 s Z4
    expect(r.zone_ms).toEqual([0, 4_000, 10_000, 10_000, 0]);
    expect(r.unmeasured_ms).toBe(36_000);
    expect(r.coverage).toBeCloseTo(0.4);
    check(r);
  });

  it("excludes paused time", () => {
    const r = accountZones({
      ...base,
      sessionEnd: S + 30_000,
      intervals: [
        { from: S, to: S + 5_000 },
        { from: S + 20_000, to: S + 30_000 },
      ],
      samples: [smp(0, 120), smp(8_000, 120), smp(16_000, 120), smp(24_000, 180)],
    });
    // active 15 s; holds 0-8, 8-16, 16-24, 24-30 -> active parts: 0-5 Z2, 20-24 Z2, 24-30 Z5
    expect(r.active_ms).toBe(15_000);
    expect(r.zone_ms).toEqual([0, 9_000, 0, 0, 6_000]);
    expect(r.unmeasured_ms).toBe(0);
    check(r);
  });

  it("dedupes by event id and accepts out-of-order backfill", () => {
    const a = smp(0, 120);
    const b = smp(5_000, 140);
    const r1 = accountZones({
      ...base,
      sessionEnd: S + 20_000,
      intervals: [{ from: S, to: S + 20_000 }],
      samples: [a, b],
    });
    const r2 = accountZones({
      ...base,
      sessionEnd: S + 20_000,
      intervals: [{ from: S, to: S + 20_000 }],
      samples: [b, a, { ...a }, { ...b, bpm: 200 }],
    });
    expect(r2).toEqual(r1);
    check(r2);
  });

  it("contact=false or null bpm is never zone-eligible and ends the previous hold", () => {
    const r = accountZones({
      ...base,
      sessionEnd: S + 30_000,
      intervals: [{ from: S, to: S + 30_000 }],
      samples: [smp(0, 120), smp(3_000, 120, { contact: false }), smp(6_000, null)],
    });
    expect(r.zone_ms).toEqual([0, 3_000, 0, 0, 0]);
    expect(r.unmeasured_ms).toBe(27_000);
    check(r);
  });

  it("ignores samples outside the session and demo samples in a real session", () => {
    const r = accountZones({
      ...base,
      sessionEnd: S + 20_000,
      intervals: [{ from: S, to: S + 20_000 }],
      samples: [smp(-5_000, 120), smp(25_000, 120), smp(2_000, 150, { is_demo: true })],
    });
    expect(r.zone_ms).toEqual([0, 0, 0, 0, 0]);
    expect(r.unmeasured_ms).toBe(20_000);
    const demo = accountZones({
      ...base,
      sessionIsDemo: true,
      sessionEnd: S + 20_000,
      intervals: [{ from: S, to: S + 20_000 }],
      samples: [smp(2_000, 150, { is_demo: true }), smp(3_000, 150)],
    });
    expect(demo.zone_ms).toEqual([0, 0, 10_000, 0, 0]);
  });

  it("the last hold stops at session end", () => {
    const r = accountZones({
      ...base,
      sessionEnd: S + 3_000,
      intervals: [{ from: S, to: S + 3_000 }],
      samples: [smp(0, 175)],
    });
    expect(r.zone_ms).toEqual([0, 0, 0, 0, 3_000]);
    check(r);
  });

  it("no zones configured: everything unmeasured", () => {
    const r = accountZones({
      ...base,
      cutoffs: null,
      sessionEnd: S + 10_000,
      intervals: [{ from: S, to: S + 10_000 }],
      samples: [smp(0, 150), smp(5_000, 150)],
    });
    expect(r.zone_ms).toEqual([0, 0, 0, 0, 0]);
    expect(r.unmeasured_ms).toBe(10_000);
    expect(r.coverage).toBe(0);
  });

  it("invariant holds on a random stream", () => {
    let t = 0;
    const samples: StoredSample[] = [];
    let x = 7;
    const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
    while (t < 600_000) {
      samples.push(
        smp(t, rnd() < 0.1 ? null : 90 + Math.floor(rnd() * 100), {
          contact: rnd() < 0.05 ? false : true,
        }),
      );
      t += Math.floor(rnd() * 15_000);
    }
    const r = accountZones({
      ...base,
      sessionEnd: S + 600_000,
      intervals: [
        { from: S, to: S + 200_000 },
        { from: S + 260_000, to: S + 600_000 },
      ],
      samples,
    });
    expect(r.active_ms).toBe(540_000);
    check(r);
  });
});
