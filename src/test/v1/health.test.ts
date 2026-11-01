import { describe, expect, it } from "vitest";
import {
  deriveHealthState,
  batteryLine,
  sourceLine,
  HEALTH_COPY,
  type HealthInput,
} from "@/v1/core/health";
import { freshnessOf, medianOffset, offsetSample } from "@/v1/core/freshness";
import { parseH10Serial, parseHeartRateMeasurement, type HrLiveRow } from "@/v1/core/hr";

const NOW = Date.parse("2026-10-31T12:00:00Z");
const at = (agoMs: number) => new Date(NOW - agoMs).toISOString();
const row = (o: Partial<HrLiveRow> = {}): HrLiveRow => ({
  user_id: "u",
  rev: 1,
  active_session_id: null,
  holder_source_id: "src",
  holder_stream_id: "stream",
  holder_name: "Gym tablet",
  source_kind: "web_ble",
  relay_mode: "live",
  sensor_name: "Polar H10 1A2B3C4D",
  sensor_serial: "1A2B3C4D",
  battery_pct: 80,
  bpm: 128,
  contact: true,
  measured_at: at(2_000),
  connected_at: at(60_000),
  last_seen_at: at(1_000),
  is_demo: false,
  updated_at: at(1_000),
  ...o,
});
const input = (
  o: Partial<HealthInput> = {},
  live: Partial<HrLiveRow> | null = {},
): HealthInput => ({
  live: live === null ? null : row(live),
  sensor: { paired: true },
  serverNowMs: NOW,
  session: { status: "active", liveData: true, isDemo: false },
  zonesConfirmed: true,
  ...o,
});

describe("freshness", () => {
  it("<=10 s live, <=30 s delayed, else unavailable, none without a reading", () => {
    expect(freshnessOf(NOW - 10_000, NOW)).toBe("live");
    expect(freshnessOf(NOW - 10_001, NOW)).toBe("delayed");
    expect(freshnessOf(NOW - 30_000, NOW)).toBe("delayed");
    expect(freshnessOf(NOW - 30_001, NOW)).toBe("unavailable");
    expect(freshnessOf(null, NOW)).toBe("none");
  });
  it("clock offset from round trips", () => {
    expect(offsetSample(1_000, 100, 300)).toBe(800);
    expect(medianOffset([5, 1, 3])).toBe(3);
    expect(medianOffset([1, 2, 3, 4])).toBe(2.5);
    expect(medianOffset([])).toBe(0);
  });
});

describe("deriveHealthState (h10-design 4.3, first match wins)", () => {
  it("H3 live counts toward zones with exact copy", () => {
    const s = deriveHealthState(input());
    expect(s).toMatchObject({
      id: "H3_live",
      label: "Live",
      detail: "Updated 2s ago · via Gym tablet",
      showBpm: true,
      bpm: 128,
      countsTowardZone: true,
    });
  });
  it("H10 when live data is off, before anything else", () => {
    const s = deriveHealthState(
      input({ session: { status: "active", liveData: false, isDemo: false }, sensor: null }),
    );
    expect(s).toMatchObject({ id: "H10_off", ...HEALTH_COPY.H10, countsTowardZone: false });
  });
  it("H0 without a sensor", () => {
    expect(deriveHealthState(input({ sensor: null })).id).toBe("H0_not_set_up");
    expect(deriveHealthState(input({ sensor: { paired: false } })).detail).toBe(
      HEALTH_COPY.H0.detail,
    );
  });
  it("H6 relay offline after 15 s (75 s when idle), BPM de-emphasized while <=30 s", () => {
    const s = deriveHealthState(input({}, { last_seen_at: at(16_000), measured_at: at(16_000) }));
    expect(s).toMatchObject({
      id: "H6_relay_offline",
      detail: "Lost Gym tablet. Keep the Dillan relay page open with the screen on.",
      showBpm: true,
      deemphasize: true,
      countsTowardZone: false,
    });
    expect(deriveHealthState(input({}, { relay_mode: "idle", last_seen_at: at(60_000) })).id).toBe(
      "H1_relay_idle",
    );
    expect(deriveHealthState(input({}, { relay_mode: "idle", last_seen_at: at(76_000) })).id).toBe(
      "H6_relay_offline",
    );
    expect(deriveHealthState(input({}, null)).id).toBe("H6_relay_offline");
    const hidden = deriveHealthState(
      input({}, { relay_mode: "hidden", last_seen_at: at(20_000), measured_at: at(40_000) }),
    );
    expect(hidden).toMatchObject({
      variant: "hidden",
      showBpm: false,
      detail: HEALTH_COPY.H6_hidden.detail.replace("{relay}", "Gym tablet"),
    });
  });
  it("H1 idle/standby, H6 takeover, H8, H7a, H7b, H2", () => {
    expect(deriveHealthState(input({}, { relay_mode: "choosing" })).detail).toBe(
      "Relay is open on Gym tablet. Tap Connect strap there.",
    );
    expect(deriveHealthState(input({}, { relay_mode: "standby" }))).toMatchObject({
      variant: "standby",
      label: "Strap resting",
    });
    expect(deriveHealthState(input({}, { relay_mode: "superseded" }))).toMatchObject({
      id: "H6_relay_offline",
      variant: "takeover",
    });
    expect(
      deriveHealthState(input({}, { relay_mode: "reconnecting", measured_at: at(20_000) })),
    ).toMatchObject({ id: "H8_reconnecting", showBpm: true, deemphasize: true });
    expect(deriveHealthState(input({}, { relay_mode: "sensor_lost" })).label).toBe(
      "Strap disconnected",
    );
    expect(deriveHealthState(input({}, { contact: false })).id).toBe("H7b_no_contact");
    expect(deriveHealthState(input({}, { relay_mode: "waiting_first" })).id).toBe("H2_waiting");
    expect(deriveHealthState(input({}, { measured_at: null })).id).toBe("H2_waiting");
    expect(
      deriveHealthState(input({}, { measured_at: at(70_000), connected_at: at(60_000) })).id,
    ).toBe("H2_waiting");
  });
  it("H4 delayed and H5 no recent by freshness, even if the relay claims live", () => {
    expect(deriveHealthState(input({}, { measured_at: at(14_000) }))).toMatchObject({
      id: "H4_delayed",
      detail: "Last reading 14s ago. Counting as unmeasured until it catches up.",
      countsTowardZone: false,
    });
    expect(
      deriveHealthState(input({}, { measured_at: at(65_000), connected_at: at(120_000) })),
    ).toMatchObject({
      id: "H5_no_recent",
      detail: "Last reading 1:05 ago. Time is being recorded as unmeasured.",
      showBpm: false,
    });
  });
  it("H9 paused overlay: nothing counts", () => {
    const s = deriveHealthState(
      input({ session: { status: "paused", liveData: true, isDemo: false } }),
    );
    expect(s).toMatchObject({
      id: "H3_live",
      paused: true,
      label: "Paused",
      detail: HEALTH_COPY.H9.detail,
      showBpm: true,
      countsTowardZone: false,
    });
  });
  it("zones unconfirmed or demo mismatch never count", () => {
    expect(deriveHealthState(input({ zonesConfirmed: false })).countsTowardZone).toBe(false);
    expect(deriveHealthState(input({}, { is_demo: true })).countsTowardZone).toBe(false);
    expect(
      deriveHealthState(
        input({ session: { status: "active", liveData: true, isDemo: true } }, { is_demo: true }),
      ),
    ).toMatchObject({ countsTowardZone: true, demo: true });
  });
  it("battery and source lines", () => {
    expect(deriveHealthState(input({}, { battery_pct: 20 })).batteryLow).toBe(true);
    expect(batteryLine(18)).toBe("Strap battery 18%. Replace the CR2025 soon.");
    expect(sourceLine("Gym tablet", "Luis")).toBe("Heart rate from Gym tablet for Luis.");
  });
});

describe("0x2A37 parser fixtures", () => {
  const dv = (...bytes: number[]) => new DataView(new Uint8Array(bytes).buffer);
  it("uint8 with contact detected", () => {
    expect(parseHeartRateMeasurement(dv(0b0110, 72))).toEqual({ bpm: 72, contact: true, rrMs: [] });
  });
  it("contact supported but not detected -> bpm null", () => {
    expect(parseHeartRateMeasurement(dv(0b0100, 72))).toEqual({
      bpm: null,
      contact: false,
      rrMs: [],
    });
  });
  it("uint16 format", () => {
    expect(parseHeartRateMeasurement(dv(0b0111, 0x2c, 0x01)).bpm).toBe(null); // 300 is out of range
    expect(parseHeartRateMeasurement(dv(0b0111, 0xb4, 0x00)).bpm).toBe(180);
  });
  it("energy expended then RR", () => {
    expect(parseHeartRateMeasurement(dv(0b11110, 80, 0x10, 0x00, 0x00, 0x04))).toEqual({
      bpm: 80,
      contact: true,
      rrMs: [1000],
    });
  });
  it("several RR values", () => {
    expect(
      parseHeartRateMeasurement(dv(0b10110, 90, 0x00, 0x04, 0x00, 0x02, 0x00, 0x03)).rrMs,
    ).toEqual([1000, 500, 750]);
  });
  it("RR flag with no RR bytes", () => {
    expect(parseHeartRateMeasurement(dv(0b10110, 90)).rrMs).toEqual([]);
  });
  it("contact not supported -> contact null", () => {
    expect(parseHeartRateMeasurement(dv(0, 64))).toEqual({ bpm: 64, contact: null, rrMs: [] });
  });
  it("H10 serial from the advertised name", () => {
    expect(parseH10Serial("Polar H10 1a2b3c4d")).toBe("1A2B3C4D");
    expect(parseH10Serial("HRM-Pro")).toBeNull();
  });
});
