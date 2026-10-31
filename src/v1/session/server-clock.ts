// Server-corrected time for timers and freshness (brief: clients interpolate from server
// timestamps). Offset = median of round-trip samples of server_time() (h10-design: median of 3 on
// load, then of the last 5). One clock per page; it never blocks rendering (offset 0 until measured).

import { medianOffset, offsetSample } from "@/v1/core/freshness";

export interface ClockSource {
  serverTime(): Promise<number>;
}

export class ServerClock {
  private samples: number[] = [];
  private offset = 0;
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private src: ClockSource,
    private local: () => number = () => Date.now(),
  ) {}

  now(): number {
    return this.local() + this.offset;
  }

  offsetMs(): number {
    return this.offset;
  }

  async sample(): Promise<void> {
    const sent = this.local();
    try {
      const server = await this.src.serverTime();
      const got = this.local();
      // A slow round trip says little about the offset.
      if (got - sent > 5_000) return;
      this.samples = [...this.samples, offsetSample(server, sent, got)].slice(-5);
      this.offset = medianOffset(this.samples);
    } catch {
      /* offline: keep the last offset */
    }
  }

  /** Three samples now, then one every 60 s (h10-design 3: viewers). Safe to call more than once. */
  start(): void {
    if (this.started) return;
    this.started = true;
    void (async () => {
      for (let i = 0; i < 3; i++) await this.sample();
    })();
    if (typeof window !== "undefined") this.timer = setInterval(() => void this.sample(), 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }
}

let shared: { src: ClockSource; clock: ServerClock } | null = null;

/** One clock per api instance. */
export function serverClockFor(src: ClockSource): ServerClock {
  if (!shared || shared.src !== src) {
    shared?.clock.stop();
    shared = { src, clock: new ServerClock(src) };
  }
  shared.clock.start();
  return shared.clock;
}
