// Screen wake lock for the relay (ported from spike/spike.js): re-acquired when the page becomes
// visible again; released after 10 min idle/standby. State is shown in the relay footer.

export type WakeState = "on" | "off" | "unsupported" | "failed";

type Sentinel = { release(): Promise<void>; addEventListener?(t: "release", cb: () => void): void };
type WakeApi = { request(type: "screen"): Promise<Sentinel> };

export class RelayWakeLock {
  private sentinel: Sentinel | null = null;
  private wanted = false;
  private pending = false;
  private state: WakeState = "off";

  constructor(
    private onChange: (s: WakeState) => void,
    private api: WakeApi | null = typeof navigator !== "undefined"
      ? ((navigator as Navigator & { wakeLock?: WakeApi }).wakeLock ?? null)
      : null,
  ) {}

  get current(): WakeState {
    return this.state;
  }

  private set(s: WakeState) {
    if (s === this.state) return;
    this.state = s;
    this.onChange(s);
  }

  setWanted(on: boolean) {
    this.wanted = on;
    if (on) void this.request();
    else if (this.sentinel) {
      const s = this.sentinel;
      this.sentinel = null;
      void s.release().catch(() => undefined);
      this.set("off");
    } else if (this.state !== "unsupported") this.set("off");
  }

  /** call on visibilitychange → visible */
  async request() {
    if (!this.wanted || this.sentinel || this.pending) return;
    if (!this.api) {
      this.set("unsupported");
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    this.pending = true;
    try {
      const s = await this.api.request("screen");
      this.pending = false;
      if (!this.wanted) {
        void s.release().catch(() => undefined);
        return;
      }
      this.sentinel = s;
      this.set("on");
      s.addEventListener?.("release", () => {
        if (this.sentinel === s) this.sentinel = null;
        this.set(this.wanted ? "failed" : "off");
      });
    } catch {
      this.pending = false;
      this.set("failed");
    }
  }
}
