// Web Bluetooth Heart Rate Service driver (h10-design 3 HealthSensorDriver), ported from the
// reviewed spike (spike/spike.js): one attempt token per connect/reconnect so stale continuations
// stop, a timeout on every GATT chain, a "self disconnect" flag so cleaning up a failed attempt is
// never read as a link drop, and listeners that are removed before they are added (no doubled
// notifications). GATT handles are re-fetched on every (re)connect. Only /relay uses this module.

import {
  H10_REQUEST,
  parseH10Serial,
  parseHeartRateMeasurement,
  type HealthSensorDriver,
  type ParsedHr,
  type SensorInfo,
  type SourceKind,
  type SupportResult,
} from "@/v1/core/hr";

// Minimal Web Bluetooth shapes (the DOM lib has none).
export interface BtCharacteristic extends EventTarget {
  value?: DataView | null;
  startNotifications(): Promise<BtCharacteristic>;
  readValue(): Promise<DataView>;
}
export interface BtService {
  getCharacteristic(name: string): Promise<BtCharacteristic>;
}
export interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryService(name: string): Promise<BtService>;
}
export interface BtDevice extends EventTarget {
  id: string;
  name?: string | null;
  gatt?: BtServer;
  forget?(): Promise<void>;
}
export interface BtApi {
  requestDevice(opts: unknown): Promise<BtDevice>;
  getDevices?(): Promise<BtDevice[]>;
  getAvailability?(): Promise<boolean>;
}

export const CONNECT_TIMEOUT_MS = 20_000;

export class StaleAttemptError extends Error {
  constructor() {
    super("stale attempt");
    this.name = "StaleAttemptError";
  }
}

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timeout (${ms / 1000} s)`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const to = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([p, to]).finally(() => clearTimeout(timer));
}

export type SampleCb = (p: ParsedHr & { receivedLocalMs: number }) => void;

/** HealthSensorDriver plus what the relay controller needs around it. */
export interface RelayDriver extends HealthSensorDriver {
  /** a BluetoothDevice (or simulated strap) is held, so reconnect() needs no gesture */
  hasDevice(): boolean;
  /** pick() with the "show all devices" fallback */
  pick(opts?: { showAll?: boolean }): Promise<SensorInfo>;
  /** navigator.bluetooth.getDevices(): reuse a strap granted earlier, without a gesture */
  restore(savedId: string | null): Promise<SensorInfo | null>;
  /** the picked device's id (kept so restore() can find it next load) */
  deviceId(): string | null;
  /** aborts a pending connect/reconnect */
  cancel(): void;
}

function infoOf(device: BtDevice, batteryPct: number | null): SensorInfo {
  const name = device.name?.trim() || "Heart-rate strap";
  const serial = parseH10Serial(name);
  return { sensorKind: serial ? "polar_h10" : "generic_hrs", name, serial, batteryPct };
}

export class WebBleHrsDriver implements RelayDriver {
  readonly kind: SourceKind = "web_ble";
  private device: BtDevice | null = null;
  private char: BtCharacteristic | null = null;
  private attempt = 0;
  /** the reconnect() attempt still running, if any */
  private connecting: number | null = null;
  private selfDisconnecting = false;
  private manual = false;
  private battery: number | null = null;
  private sampleCbs = new Set<SampleCb>();
  private linkCbs = new Set<(up: boolean) => void>();

  constructor(
    private bt: BtApi | null,
    private opts: { now?: () => number; timeoutMs?: number } = {},
  ) {}

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  async checkSupport(): Promise<SupportResult> {
    if (!this.bt) return { ok: false, reason: "no_api" };
    return { ok: true };
  }

  hasDevice() {
    return !!this.device;
  }

  deviceId() {
    return this.device?.id ?? null;
  }

  // Stable handler references: removing them before adding keeps listeners idempotent.
  private onValue = (e: Event) => {
    const t = e.target as BtCharacteristic | null;
    const v = t?.value;
    if (!v || v.byteLength < 2) return;
    let parsed: ParsedHr;
    try {
      parsed = parseHeartRateMeasurement(v);
    } catch {
      return; // malformed packet: ignore, never invent a reading
    }
    const s = { ...parsed, receivedLocalMs: this.now() };
    this.sampleCbs.forEach((cb) => cb(s));
  };

  private onDisconnected = () => {
    this.char = null;
    if (this.selfDisconnecting) {
      this.selfDisconnecting = false;
      return;
    }
    if (this.manual) return;
    this.linkCbs.forEach((cb) => cb(false));
  };

  private adopt(device: BtDevice) {
    if (this.device && this.device !== device)
      this.device.removeEventListener("gattserverdisconnected", this.onDisconnected);
    this.device = device;
    device.removeEventListener("gattserverdisconnected", this.onDisconnected);
    device.addEventListener("gattserverdisconnected", this.onDisconnected);
  }

  /** Must be called synchronously inside a click handler: requestDevice runs before any await. */
  pick(opts: { showAll?: boolean } = {}): Promise<SensorInfo> {
    if (!this.bt)
      return Promise.reject(Object.assign(new Error("no_api"), { name: "NotSupportedError" }));
    this.attempt++;
    const req = opts.showAll
      ? { acceptAllDevices: true, optionalServices: ["heart_rate", "battery_service"] }
      : H10_REQUEST;
    let p: Promise<BtDevice>;
    try {
      p = this.bt.requestDevice(req);
    } catch (e) {
      p = Promise.reject(e);
    }
    return p.then((device) => {
      this.adopt(device);
      this.battery = null;
      return infoOf(device, null);
    });
  }

  async restore(savedId: string | null): Promise<SensorInfo | null> {
    if (!this.bt?.getDevices) return null;
    try {
      const list = await this.bt.getDevices();
      const d =
        (savedId ? list.find((x) => x.id === savedId) : undefined) ??
        (list.length === 1 ? list[0] : undefined);
      if (!d) return null;
      this.adopt(d);
      return infoOf(d, this.battery);
    } catch {
      return null;
    }
  }

  private selfDisconnect() {
    const d = this.device;
    if (!d?.gatt) return;
    if (!d.gatt.connected) return;
    this.selfDisconnecting = true;
    try {
      d.gatt.disconnect();
    } catch {
      /* ignore */
    }
    // A browser that never fires the event must not swallow a later real drop.
    setTimeout(() => (this.selfDisconnecting = false), 1000);
  }

  /**
   * A stale attempt whose gatt.connect() resolved anyway (cancel, timeout, standby, pick again
   * while it was pending) must not leave the strap connected: that holds one of the H10's two BLE
   * slots while the relay says it is idle or resting. Only skipped when a newer reconnect() on the
   * same device is running, because it shares this connection.
   */
  private dropStale(device: BtDevice, my: number) {
    const newer = this.connecting != null && this.connecting !== my && this.device === device;
    if (newer || !device.gatt?.connected) return;
    if (device === this.device) this.selfDisconnecting = true;
    try {
      device.gatt.disconnect();
    } catch {
      /* ignore */
    }
    if (device === this.device) setTimeout(() => (this.selfDisconnecting = false), 1000);
  }

  private async setupGatt(device: BtDevice, my: number): Promise<SensorInfo> {
    const live = () => {
      if (my === this.attempt) return;
      this.dropStale(device, my);
      throw new StaleAttemptError();
    };
    if (!device.gatt) throw new Error("no_gatt");
    const server = await device.gatt.connect();
    live();
    const svc = await server.getPrimaryService("heart_rate");
    live();
    const ch = await svc.getCharacteristic("heart_rate_measurement");
    live();
    if (this.char && this.char !== ch)
      this.char.removeEventListener("characteristicvaluechanged", this.onValue);
    ch.removeEventListener("characteristicvaluechanged", this.onValue);
    ch.addEventListener("characteristicvaluechanged", this.onValue);
    this.char = ch;
    await ch.startNotifications();
    live();
    // Battery is optional and never fatal (read after notifications are already flowing).
    this.battery = await withTimeout(this.readBatteryFrom(server), 3_000, "battery").catch(
      () => this.battery,
    );
    live();
    return infoOf(device, this.battery);
  }

  private async readBatteryFrom(server: BtServer): Promise<number | null> {
    const s = await server.getPrimaryService("battery_service");
    const c = await s.getCharacteristic("battery_level");
    const v = await c.readValue();
    const pct = v.getUint8(0);
    return pct >= 0 && pct <= 100 ? pct : null;
  }

  /** connect -> service -> characteristic -> startNotifications -> battery, on the SAME device. */
  async reconnect(): Promise<SensorInfo> {
    const device = this.device;
    if (!device) throw new Error("no_device");
    this.manual = false;
    const my = ++this.attempt;
    this.connecting = my;
    try {
      const info = await withTimeout(
        this.setupGatt(device, my),
        this.opts.timeoutMs ?? CONNECT_TIMEOUT_MS,
        "connect",
      );
      this.linkCbs.forEach((cb) => cb(true));
      return info;
    } catch (e) {
      if (e instanceof StaleAttemptError) throw e;
      if (my === this.attempt) {
        this.attempt++; // anything still pending from this attempt is now stale
        this.selfDisconnect();
      }
      throw e;
    } finally {
      if (this.connecting === my) this.connecting = null;
    }
  }

  cancel() {
    this.attempt++;
    this.selfDisconnect();
  }

  async disconnect(): Promise<void> {
    this.attempt++;
    this.manual = true;
    this.char = null;
    try {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    } catch {
      /* ignore */
    }
  }

  async forget(): Promise<void> {
    const d = this.device;
    await this.disconnect();
    if (d) d.removeEventListener("gattserverdisconnected", this.onDisconnected);
    this.device = null;
    this.battery = null;
    try {
      // Shipped un-flagged since Chrome 101; feature-detected.
      if (d && typeof d.forget === "function") await d.forget();
    } catch {
      /* best effort */
    }
  }

  async readBattery(): Promise<number | null> {
    const server = this.device?.gatt;
    if (!server?.connected) return this.battery;
    try {
      this.battery = await withTimeout(this.readBatteryFrom(server), 3_000, "battery");
    } catch {
      /* keep the last value */
    }
    return this.battery;
  }

  onSample(cb: SampleCb): () => void {
    this.sampleCbs.add(cb);
    return () => this.sampleCbs.delete(cb);
  }

  onLinkChange(cb: (up: boolean) => void): () => void {
    this.linkCbs.add(cb);
    return () => this.linkCbs.delete(cb);
  }
}

/** navigator.bluetooth when present (never touched outside /relay). */
export function browserBluetooth(): BtApi | null {
  if (typeof navigator === "undefined") return null;
  return ((navigator as Navigator & { bluetooth?: BtApi }).bluetooth ?? null) as BtApi | null;
}
