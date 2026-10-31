// Slice E: the /relay state machine with a fake BluetoothDevice/GATT and fake timers, the ingest
// publisher (batching, rate, retry, clock offset) and feature detection (acceptance 41).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HrIngestRequest, HrIngestResponse, HrSensorRow } from "@/v1/core/hr";
import { HrAuthError, type AuthUser } from "@/v1/data/api";
import { RelayController } from "@/v1/relay/controller";
import { WebBleHrsDriver, type BtApi } from "@/v1/relay/driver";
import { IngestPublisher, type PublishState } from "@/v1/relay/publisher";
import {
  checkSupport,
  relayCapable,
  SUPPORT_COPY,
  unsupportedLines,
  type RelayEnv,
} from "@/v1/relay/support";
import { defaultRelayName, platformOf } from "@/v1/relay/source-id";

const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SILK =
  "Mozilla/5.0 (Linux; Android 9; AFTKA) AppleWebKit/537.36 (KHTML, like Gecko) Silk/112.3.1 like Chrome/112.0 Safari/537.36";
const OFFSET = 5_000; // server clock ahead of the relay

// ------------------------------------------------------------------ fake Web Bluetooth
class FakeChar extends EventTarget {
  value: DataView | null = null;
  notifying = false;
  async startNotifications() {
    this.notifying = true;
    return this;
  }
  async readValue() {
    return new DataView(Uint8Array.from([64]).buffer);
  }
  emit(bytes: number[]) {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

class FakeDevice extends EventTarget {
  id = "dev-1";
  forgotten = false;
  hr = new FakeChar();
  battery = new FakeChar();
  connectMode: "ok" | "fail" | "hang" = "ok";
  connects = 0;
  gatt = {
    connected: false,
    connect: async () => {
      this.connects++;
      if (this.connectMode === "hang") return new Promise<never>(() => {});
      if (this.connectMode === "fail") throw new Error("NetworkError");
      this.gatt.connected = true;
      return this.gatt;
    },
    disconnect: () => {
      if (!this.gatt.connected) return;
      this.gatt.connected = false;
      this.dispatchEvent(new Event("gattserverdisconnected"));
    },
    getPrimaryService: async (name: string) => ({
      getCharacteristic: async () => (name === "heart_rate" ? this.hr : this.battery),
    }),
  };
  constructor(public name = "Polar H10 1A2B3C4D") {
    super();
  }
  /** the strap walks out of range */
  drop() {
    this.gatt.connected = false;
    this.dispatchEvent(new Event("gattserverdisconnected"));
  }
  async forget() {
    this.forgotten = true;
  }
}

function fakeBt(device: FakeDevice) {
  const bt = {
    requestDevice: vi.fn((_opts?: unknown) => Promise.resolve(device)),
    getDevices: vi.fn(async () => [device]),
  };
  return bt;
}

// ------------------------------------------------------------------ fake backend
const ok = (o: Partial<HrIngestResponse> = {}): HrIngestResponse => ({
  server_now: new Date(Date.now() + OFFSET).toISOString(),
  accepted: 0,
  duplicates: 0,
  rejected: [],
  superseded: false,
  holder_name: "Gym tablet",
  rate_limited: false,
  revoked: false,
  identity_mismatch: false,
  stop_requested: false,
  sensor_forgotten: false,
  ...o,
});

function fakeApi(user: AuthUser | null = { id: "u1", email: null, phone: null }) {
  const calls: HrIngestRequest[] = [];
  const state = {
    user,
    fail: false,
    respond: (req: HrIngestRequest): Partial<HrIngestResponse> => ({
      accepted: req.p_samples.length,
    }),
    sensor: null as HrSensorRow | null,
    authCb: null as ((u: AuthUser | null) => void) | null,
    sensorCb: null as ((r: HrSensorRow | null) => void) | null,
  };
  const api = {
    auth: {
      getUser: async () => state.user,
      onChange: (cb: (u: AuthUser | null) => void) => {
        state.authCb = cb;
        return () => {};
      },
    },
    hr: {
      serverTime: async () => Date.now() + OFFSET,
      ingest: vi.fn(async (req: HrIngestRequest) => {
        calls.push(req);
        if (!state.user) throw new HrAuthError();
        if (state.fail) throw new Error("network");
        return ok(state.respond(req));
      }),
      sensorRow: async () => state.sensor,
      renameSource: vi.fn(async () => {}),
    },
    realtime: {
      onHrSensor: (_u: string, cb: (r: HrSensorRow | null) => void) => {
        state.sensorCb = cb;
        return () => {};
      },
    },
  };
  return { api, calls, state };
}

const env = (o: Partial<RelayEnv> = {}): RelayEnv => ({
  secureContext: true,
  hasBluetooth: true,
  inIframe: false,
  userAgent: CHROME_ANDROID,
  ...o,
});

async function setup(
  o: { user?: AuthUser | null; device?: FakeDevice; env?: Partial<RelayEnv> } = {},
) {
  const device = o.device ?? new FakeDevice();
  const bt = fakeBt(device);
  const f = fakeApi(o.user === undefined ? { id: "u1", email: null, phone: null } : o.user);
  const driver = new WebBleHrsDriver(bt as unknown as BtApi);
  const c = new RelayController({
    api: f.api as never,
    driver,
    env: env(o.env),
    storage: null,
    wakeApi: null,
  });
  await c.start();
  await vi.advanceTimersByTimeAsync(10);
  return { c, device, bt, ...f };
}

const lastCall = (calls: HrIngestRequest[]) => calls[calls.length - 1] as HrIngestRequest;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-31T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function connected(o: Parameters<typeof setup>[0] = {}) {
  const s = await setup(o);
  s.c.connectTap();
  await vi.advanceTimersByTimeAsync(10);
  return s;
}

describe("relay connect, notifications and contact", () => {
  it("syncs the server clock before Connect strap does anything", async () => {
    const { c } = await setup();
    expect(c.getSnapshot().clockReady).toBe(true);
    expect(Math.round(c.serverNow() - Date.now())).toBe(OFFSET);
    expect(c.getSnapshot().mode).toBe("idle");
  });

  it("opens the chooser synchronously inside the tap (transient activation)", async () => {
    const { c, bt } = await setup();
    c.connectTap();
    expect(bt.requestDevice).toHaveBeenCalledTimes(1);
    expect(bt.requestDevice).toHaveBeenCalledWith({
      filters: [{ services: ["heart_rate"] }],
      optionalServices: ["battery_service"],
    });
    expect(c.getSnapshot().mode).toBe("choosing");
  });

  it("show all devices uses acceptAllDevices", async () => {
    const { c, bt } = await setup();
    c.connectTap({ showAll: true });
    expect(bt.requestDevice.mock.calls[0]?.[0]).toMatchObject({ acceptAllDevices: true });
  });

  it("connect -> waiting_first (claim, connected_at) -> live with server-stamped samples", async () => {
    const { c, device, calls } = await connected();
    expect(c.getSnapshot().mode).toBe("waiting_first");
    expect(c.getSnapshot().sensor).toMatchObject({ serial: "1A2B3C4D", batteryPct: 64 });
    await vi.advanceTimersByTimeAsync(400);
    const claim = calls.find((r) => r.p_claim)!;
    expect(claim.p_mode).toBe("waiting_first");
    expect(claim.p_connected_at).not.toBeNull();
    expect(claim.p_sensor).toEqual({
      name: "Polar H10 1A2B3C4D",
      serial: "1A2B3C4D",
      battery_pct: 64,
    });

    const before = Date.now();
    device.hr.emit([0x16, 72, 0x00, 0x04]); // uint8, contact supported+detected, one RR
    expect(c.getSnapshot().mode).toBe("live");
    expect(c.getSnapshot().bpm).toBe(72);
    await vi.advanceTimersByTimeAsync(1_000);
    const sent = calls.flatMap((r) => r.p_samples);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ seq: 1, bpm: 72, contact: true, rr_ms: null });
    expect(Date.parse(sent[0]!.measured_at)).toBe(before + OFFSET);
    expect(calls.every((r) => r.p_stream_id === c.streamId)).toBe(true);
  });

  it("contact lost -> no_contact; the sample is still sent with bpm null as evidence", async () => {
    const { c, device, calls } = await connected();
    device.hr.emit([0x16, 72]);
    device.hr.emit([0x04, 70]); // contact supported, not detected
    expect(c.getSnapshot().mode).toBe("no_contact");
    await vi.advanceTimersByTimeAsync(1_500);
    const sent = calls.flatMap((r) => r.p_samples);
    expect(sent.map((s) => [s.seq, s.bpm, s.contact])).toEqual([
      [1, 72, true],
      [2, null, false],
    ]);
    expect(calls.some((r) => r.p_mode === "no_contact")).toBe(true);
    device.hr.emit([0x16, 75]);
    expect(c.getSnapshot().mode).toBe("live");
  });

  it("notification listeners stay single after reconnects (no doubled samples)", async () => {
    const { c, device, calls } = await connected();
    device.drop();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(c.getSnapshot().mode).toBe("waiting_first");
    device.hr.emit([0x16, 80]);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(calls.flatMap((r) => r.p_samples)).toHaveLength(1);
  });
});

describe("relay link loss and reconnect", () => {
  it("disconnect -> reconnecting with 1, 2, 4… s backoff, then waiting_first without a gesture", async () => {
    const { c, device, bt } = await connected();
    device.hr.emit([0x16, 72]);
    device.connectMode = "fail";
    device.drop();
    expect(c.getSnapshot().mode).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(device.connects).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(device.connects).toBe(3);
    expect(c.getSnapshot().reconnectAttempt).toBe(2);
    device.connectMode = "ok";
    await vi.advanceTimersByTimeAsync(4_000);
    expect(c.getSnapshot().mode).toBe("waiting_first");
    expect(bt.requestDevice).toHaveBeenCalledTimes(1);
  });

  it("10 s with no notification while connected counts as a link loss", async () => {
    const { c, device } = await connected();
    device.hr.emit([0x16, 72]);
    device.connectMode = "fail";
    await vi.advanceTimersByTimeAsync(11_500);
    expect(c.getSnapshot().mode).toBe("reconnecting");
  });

  it("reconnecting for more than 2 minutes -> sensor_lost; Reconnect is a tap", async () => {
    const { c, device } = await connected();
    device.hr.emit([0x16, 72]);
    device.connectMode = "fail";
    device.drop();
    await vi.advanceTimersByTimeAsync(125_000);
    expect(c.getSnapshot().mode).toBe("sensor_lost");
    device.connectMode = "ok";
    c.reconnectTap();
    await vi.advanceTimersByTimeAsync(10);
    expect(c.getSnapshot().mode).toBe("waiting_first");
  });

  it("a hanging connect times out after 20 s with the pairing help", async () => {
    const device = new FakeDevice();
    device.connectMode = "hang";
    const { c } = await setup({ device });
    c.connectTap();
    await vi.advanceTimersByTimeAsync(10);
    expect(c.getSnapshot().mode).toBe("connecting");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(c.getSnapshot().mode).toBe("idle");
    expect(c.getSnapshot().notice).toBe("connect_timeout");
  });

  it("a cancelled or empty chooser returns to idle with the help line, not an error", async () => {
    const { c, bt } = await setup();
    bt.requestDevice.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("User cancelled"), { name: "NotFoundError" })),
    );
    c.connectTap();
    await vi.advanceTimersByTimeAsync(10);
    expect(c.getSnapshot().mode).toBe("idle");
    expect(c.getSnapshot().notice).toBe("chooser_empty");
  });

  it("Cancel while connecting stops the attempt", async () => {
    const device = new FakeDevice();
    device.connectMode = "hang";
    const { c } = await setup({ device });
    c.connectTap();
    await vi.advanceTimersByTimeAsync(10);
    c.cancel();
    expect(c.getSnapshot().mode).toBe("idle");
    await vi.advanceTimersByTimeAsync(25_000);
    expect(c.getSnapshot().notice).toBeNull();
  });
});

describe("relay demand, takeover and server answers", () => {
  it("stop_requested -> standby (strap off, device kept); HR wanted again -> reconnect, no tap", async () => {
    const { c, device, bt, state, calls } = await connected();
    device.hr.emit([0x16, 72]);
    state.respond = () => ({ stop_requested: true });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(c.getSnapshot().mode).toBe("standby");
    expect(device.gatt.connected).toBe(false);
    device.hr.emit([0x16, 99]); // nothing is sent in standby
    const n = calls.flatMap((r) => r.p_samples).length;
    // A preflight opens the demand window: the relay's hr_sensors subscription wakes it.
    state.respond = (r) => ({ accepted: r.p_samples.length });
    state.sensorCb?.({
      user_id: "u1",
      sensor_kind: "polar_h10",
      sensor_name: "Polar H10 1A2B3C4D",
      sensor_serial: "1A2B3C4D",
      paired_at: new Date().toISOString(),
      forgotten_at: null,
      wanted_until: new Date(Date.now() + OFFSET + 600_000).toISOString(),
      last_source_id: null,
      last_battery_pct: 64,
      battery_read_at: null,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(c.getSnapshot().mode).toBe("waiting_first");
    expect(bt.requestDevice).toHaveBeenCalledTimes(1);
    expect(calls.flatMap((r) => r.p_samples).length).toBe(n);
  });

  it("a heartbeat that finds HR wanted again also wakes standby", async () => {
    const { c, state } = await connected();
    state.respond = () => ({ stop_requested: true });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(c.getSnapshot().mode).toBe("standby");
    state.respond = () => ({ stop_requested: false });
    await vi.advanceTimersByTimeAsync(5_500);
    expect(c.getSnapshot().mode).toBe("waiting_first");
  });

  it("superseded: stops sending, frees the strap after 30 s, Use this device claims", async () => {
    const { c, device, state, calls } = await connected();
    device.hr.emit([0x16, 72]);
    await vi.advanceTimersByTimeAsync(1_000);
    state.respond = () => ({ superseded: true, holder_name: "Office laptop" });
    device.hr.emit([0x16, 73]);
    await vi.advanceTimersByTimeAsync(1_200);
    expect(c.getSnapshot().mode).toBe("superseded");
    expect(c.getSnapshot().holderName).toBe("Office laptop");
    expect(device.gatt.connected).toBe(true);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(device.gatt.connected).toBe(false);
    expect(calls.slice(-2).every((r) => r.p_mode === "superseded" && !r.p_claim)).toBe(true);
    state.respond = (r) => ({ accepted: r.p_samples.length });
    c.useThisDevice();
    await vi.advanceTimersByTimeAsync(500);
    expect(c.getSnapshot().mode).toBe("waiting_first");
    expect(calls.some((r) => r.p_claim && r.p_mode !== "superseded")).toBe(true);
  });

  it("sensor_forgotten: disconnects, forgets the device and goes idle", async () => {
    const { c, device, state } = await connected();
    device.hr.emit([0x16, 72]);
    await vi.advanceTimersByTimeAsync(1_100);
    state.respond = () => ({ sensor_forgotten: true });
    await vi.advanceTimersByTimeAsync(5_500); // next heartbeat
    expect(c.getSnapshot().mode).toBe("idle");
    expect(c.getSnapshot().notice).toBe("sensor_forgotten");
    expect(device.forgotten).toBe(true);
  });

  it("revoked: stops calling; Add it again mints a new source id", async () => {
    const { c, state, calls } = await connected();
    const before = c.sourceId;
    state.respond = () => ({ revoked: true, stop_requested: true });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(c.getSnapshot().notice).toBe("revoked");
    const n = calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls.length).toBe(n);
    c.addAgain();
    state.respond = () => ({});
    await vi.advanceTimersByTimeAsync(500);
    expect(c.sourceId).not.toBe(before);
    expect(lastCall(calls).p_source_id).toBe(c.sourceId);
  });

  it("asks before using a different strap than the saved one; nothing is sent until confirmed", async () => {
    const device = new FakeDevice("Polar H10 9F9F9F9F");
    const s = await setup({ device });
    s.state.sensor = {
      user_id: "u1",
      sensor_kind: "polar_h10",
      sensor_name: "Polar H10 1A2B3C4D",
      sensor_serial: "1A2B3C4D",
      paired_at: new Date().toISOString(),
      forgotten_at: null,
      wanted_until: null,
      last_source_id: null,
      last_battery_pct: null,
      battery_read_at: null,
    };
    s.c.connectTap();
    await vi.advanceTimersByTimeAsync(10);
    expect(s.c.getSnapshot().differentStrap).toMatchObject({
      old: "Polar H10 1A2B3C4D",
      next: { serial: "9F9F9F9F" },
    });
    expect(device.connects).toBe(0);
    s.c.useThisStrap();
    await vi.advanceTimersByTimeAsync(10);
    expect(s.c.getSnapshot().mode).toBe("waiting_first");
  });

  it("heartbeats every 5 s with no samples, 30 s after 10 min idle", async () => {
    const { calls } = await setup();
    const n0 = calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls.length - n0).toBe(4);
    expect(calls.every((r) => r.p_samples.length === 0 && r.p_mode === "idle")).toBe(true);
    await vi.advanceTimersByTimeAsync(600_000);
    const n1 = calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.length - n1).toBe(2);
  });
});

describe("relay identity", () => {
  it("auth change: outbox discarded, new stream, seq restarts, never sent as the new user", async () => {
    const { c, device, state, calls } = await connected();
    const firstStream = c.streamId;
    device.hr.emit([0x16, 72]);
    device.hr.emit([0x16, 73]);
    state.fail = true; // offline: both readings stay queued for u1
    await vi.advanceTimersByTimeAsync(1_200);
    expect(c.getSnapshot().pending).toBe(2);
    state.fail = false;
    state.user = { id: "u2", email: null, phone: null };
    state.authCb?.(state.user);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(c.streamId).not.toBe(firstStream);
    expect(c.getSnapshot().pending).toBe(0);
    expect(c.getSnapshot().mode).toBe("idle");
    const asU2 = calls.filter((r) => r.p_expected_user_id === "u2");
    expect(asU2.length).toBeGreaterThan(0);
    expect(asU2.every((r) => r.p_samples.length === 0 && r.p_stream_id === c.streamId)).toBe(true);
  });

  it("signed out: shows the sign-in state, keeps BLE up, sends nothing", async () => {
    const { c, device, state, calls } = await connected();
    device.hr.emit([0x16, 72]);
    state.user = null;
    await vi.advanceTimersByTimeAsync(1_200);
    expect(c.getSnapshot().signedOut).toBe(true);
    expect(c.getSnapshot().notice).toBe("signed_out");
    expect(device.gatt.connected).toBe(true);
    const n = calls.length;
    device.hr.emit([0x16, 74]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.length).toBe(n);
  });
});

describe("relay demo source", () => {
  it("Simulate strap sends demo samples on their own stream, never a saved strap", async () => {
    const { c, calls } = await setup();
    const real = c.streamId;
    c.startDemo();
    await vi.advanceTimersByTimeAsync(3_500);
    expect(c.getSnapshot().demo).toBe(true);
    expect(c.getSnapshot().mode).toBe("demo");
    const demo = calls.filter((r) => r.p_source_kind === "demo");
    expect(demo.length).toBeGreaterThan(0);
    expect(demo.every((r) => r.p_sensor === null && r.p_stream_id !== real)).toBe(true);
    expect(demo.flatMap((r) => r.p_samples).length).toBeGreaterThan(0);
    c.stopDemo();
    expect(c.getSnapshot().mode).toBe("idle");
    expect(c.getSnapshot().demo).toBe(false);
  });
});

describe("unsupported browsers (acceptance 41)", () => {
  it("iPhone: unsupported, never calls hr_ingest, iPhone copy", async () => {
    const { c, calls } = await setup({ env: { hasBluetooth: false, userAgent: IPHONE } });
    expect(c.getSnapshot().mode).toBe("unsupported");
    expect(c.getSnapshot().support).toEqual({ ok: false, reason: "no_api" });
    c.connectTap();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toHaveLength(0);
    expect(unsupportedLines("no_api", IPHONE, "dillan.app")).toEqual([
      SUPPORT_COPY.iphone,
      "This browser can't connect to Bluetooth sensors. Open dillan.app/relay in Chrome on Android, or Chrome or Edge on a computer.",
    ]);
  });

  it("Silk on the TV: QR handoff copy, not a relay", async () => {
    expect(await checkSupport(env({ hasBluetooth: false, userAgent: SILK }))).toEqual({
      ok: false,
      reason: "no_api",
    });
    expect(unsupportedLines("no_api", SILK, "dillan.app")[0]).toMatch(/TV only shows heart rate/);
    expect(relayCapable(env({ userAgent: SILK }))).toBe(false);
  });

  it("policy blocked in a frame, adapter off, insecure, in-app browser", async () => {
    const off = () => Promise.resolve(false);
    expect(await checkSupport(env({ inIframe: true, getAvailability: off }))).toEqual({
      ok: false,
      reason: "policy_blocked",
    });
    expect(await checkSupport(env({ getAvailability: off }))).toEqual({
      ok: false,
      reason: "adapter_off",
    });
    expect(await checkSupport(env({ secureContext: false }))).toEqual({
      ok: false,
      reason: "insecure_context",
    });
    expect(
      await checkSupport(env({ userAgent: CHROME_ANDROID.replace("Pixel 7)", "Pixel 7; wv)") })),
    ).toEqual({ ok: false, reason: "in_app_browser" });
    expect(await checkSupport(env())).toEqual({ ok: true });
  });

  it("device names and platforms", () => {
    expect(defaultRelayName(CHROME_ANDROID)).toBe("Android phone");
    expect(platformOf(CHROME_ANDROID)).toBe("android");
    expect(
      defaultRelayName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Edg/130.0"),
    ).toBe("Edge on Windows");
  });
});

// ------------------------------------------------------------------ publisher
describe("ingest publisher", () => {
  function pub(
    o: { fail?: () => boolean; respond?: (r: HrIngestRequest) => Partial<HrIngestResponse> } = {},
  ) {
    const calls: Array<{ at: number; req: HrIngestRequest }> = [];
    const st: PublishState = {
      mode: "live",
      kind: "web_ble",
      connectedAtLocal: Date.now(),
      sensor: null,
      restingSinceLocal: null,
      sourceName: "Gym tablet",
      platform: "android",
    };
    const p = new IngestPublisher(
      {
        serverTime: async () => Date.now() + OFFSET,
        ingest: async (req) => {
          calls.push({ at: Date.now(), req });
          if (o.fail?.()) throw new Error("network");
          return ok(o.respond?.(req) ?? { accepted: req.p_samples.length });
        },
      },
      "00000000-0000-4000-8000-000000000001",
      () => st,
      { onResponse: () => {}, onAuthError: () => {}, onNetwork: () => {} },
    );
    p.setUser("u1");
    return { p, calls, st };
  }
  const sample = (bpm = 100) => ({ bpm, contact: true, rrMs: [], receivedLocalMs: Date.now() });

  it("re-stamps readings taken before the clock was known with the first known offset", async () => {
    const { p, calls } = pub();
    const t = Date.now();
    p.push(sample());
    await p.syncClock();
    p.start();
    await vi.advanceTimersByTimeAsync(1_100);
    p.stop();
    const s = calls.flatMap((c) => c.req.p_samples)[0]!;
    expect(Date.parse(s.measured_at)).toBe(t + OFFSET);
  });

  it("flushes a backlog at most 30 per call and at most 3 calls per second", async () => {
    let offline = true;
    const { p, calls } = pub({ fail: () => offline });
    await p.syncClock();
    for (let i = 0; i < 100; i++) p.push(sample(60 + (i % 50)));
    p.start();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(p.pending).toBe(100); // failed call keeps every reading
    offline = false;
    await vi.advanceTimersByTimeAsync(20_000);
    p.stop();
    const ok = calls.filter((c) => c.req.p_samples.length > 0).slice(1);
    expect(ok.every((c) => c.req.p_samples.length <= 30)).toBe(true);
    const seqs = calls.slice(1).flatMap((c) => c.req.p_samples.map((s) => s.seq));
    expect(new Set(seqs).size).toBe(100);
    expect(p.pending).toBe(0);
    for (let i = 3; i < calls.length; i++)
      expect(
        (calls[i] as { at: number }).at - (calls[i - 3] as { at: number }).at,
      ).toBeGreaterThanOrEqual(1000);
  });

  it("keeps at most 120 readings (2 min) while offline", async () => {
    const { p } = pub({ fail: () => true });
    await p.syncClock();
    for (let i = 0; i < 200; i++) p.push(sample());
    expect(p.pending).toBe(120);
  });

  it("retries with backoff 1, 2, 4, 8, 15 s", async () => {
    const { p, calls } = pub({ fail: () => true });
    await p.syncClock();
    p.start();
    p.modeChanged();
    await vi.advanceTimersByTimeAsync(50_000);
    p.stop();
    const gaps = calls.slice(1, 7).map((c, i) => c.at - (calls[i] as { at: number }).at);
    expect(gaps.map((g) => Math.round(g / 1000))).toEqual([1, 2, 4, 8, 15, 15]);
  });

  it("refines the offset from responses (median of the last 5)", async () => {
    const { p } = pub();
    await p.syncClock();
    expect(Math.round(p.offsetMs)).toBe(OFFSET);
    p.start();
    await vi.advanceTimersByTimeAsync(6_000);
    p.stop();
    expect(Math.round(p.offsetMs)).toBe(OFFSET);
  });

  it("rate_limited keeps the samples and slows down", async () => {
    let limited = true;
    const { p } = pub({
      respond: (r) => (limited ? { rate_limited: true } : { accepted: r.p_samples.length }),
    });
    await p.syncClock();
    p.push(sample());
    p.start();
    await vi.advanceTimersByTimeAsync(1_200);
    expect(p.pending).toBe(1);
    limited = false;
    await vi.advanceTimersByTimeAsync(1_200);
    p.stop();
    expect(p.pending).toBe(0);
  });
});
