// "Simulate strap (DEMO)" (h10-design 4.2 mode `demo`, S14 dev toggle): a fake strap that emits
// one reading per second. The relay publishes it with source_kind 'demo', so the backend stores it
// only in hr_demo_samples, only for demo sessions, and every screen shows the DEMO badge.

import type { SensorInfo, SourceKind, SupportResult } from "@/v1/core/hr";
import type { RelayDriver, SampleCb } from "./driver";

export const DEMO_SENSOR: SensorInfo = {
  sensorKind: "generic_hrs",
  name: "Simulated strap (DEMO)",
  serial: null,
  batteryPct: null,
};

/** 90–150 bpm wave, deterministic in time. */
export function demoBpm(t: number): number {
  return Math.round(
    120 + 24 * Math.sin((t / 120_000) * 2 * Math.PI) + 6 * Math.sin((t / 9_000) * 2 * Math.PI),
  );
}

export class DemoHrsDriver implements RelayDriver {
  readonly kind: SourceKind = "demo";
  private timer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private sampleCbs = new Set<SampleCb>();
  private linkCbs = new Set<(up: boolean) => void>();

  constructor(private now: () => number = () => Date.now()) {}

  async checkSupport(): Promise<SupportResult> {
    return { ok: true };
  }
  hasDevice() {
    return true;
  }
  deviceId() {
    return null;
  }
  async pick(): Promise<SensorInfo> {
    return DEMO_SENSOR;
  }
  async restore(): Promise<SensorInfo | null> {
    return null;
  }
  async reconnect(): Promise<SensorInfo> {
    this.stop();
    this.connected = true;
    this.timer = setInterval(() => {
      const t = this.now();
      const s = { bpm: demoBpm(t), contact: true, rrMs: [], receivedLocalMs: t };
      this.sampleCbs.forEach((cb) => cb(s));
    }, 1000);
    this.linkCbs.forEach((cb) => cb(true));
    return DEMO_SENSOR;
  }
  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  cancel() {
    this.stop();
  }
  async disconnect() {
    this.stop();
    this.connected = false;
  }
  async forget() {
    await this.disconnect();
  }
  async readBattery() {
    return null;
  }
  onSample(cb: SampleCb) {
    this.sampleCbs.add(cb);
    return () => this.sampleCbs.delete(cb);
  }
  onLinkChange(cb: (up: boolean) => void) {
    this.linkCbs.add(cb);
    return () => this.linkCbs.delete(cb);
  }
  isConnected() {
    return this.connected;
  }
}
