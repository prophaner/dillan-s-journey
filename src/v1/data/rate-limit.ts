// Per-key sliding-window limiter (in memory, per server instance). Used by the TV pairing server
// functions as a per-IP limit on top of the global and per-device limits in 0006 (build-plan
// "Pairing abuse limits"). Best effort: a multi-instance deployment gets one window per instance.

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
    private maxKeys = 10_000,
  ) {}

  /** Records a hit; false when the key already used its budget in the window. */
  take(key: string, now = Date.now()): boolean {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > this.maxKeys) this.prune(now);
    return true;
  }

  private prune(now: number) {
    const since = now - this.windowMs;
    for (const [k, v] of this.hits) {
      const keep = v.filter((t) => t > since);
      if (keep.length) this.hits.set(k, keep);
      else this.hits.delete(k);
    }
    // Still too many keys (a flood of distinct addresses): drop the oldest half.
    if (this.hits.size > this.maxKeys) {
      const drop = Math.ceil(this.hits.size / 2);
      let i = 0;
      for (const k of this.hits.keys()) {
        if (i++ >= drop) break;
        this.hits.delete(k);
      }
    }
  }
}
