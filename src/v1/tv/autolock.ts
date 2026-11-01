// Shared-TV auto-lock (handoff 4.2, flow F2d): any remote key or phone-controller event is
// activity; a tick every 5 s locks after 15 minutes without activity, with a warning toast one
// minute before. An active or paused workout is exempt (and idle time during it never counts).
// The server-side half is the grant check (device_grant_touch) every 60 s in tv-app.tsx: it
// reports whether there was activity, and the server revokes a grant idle for 15 minutes with no
// running workout. The last activity time is also kept in the TV session marker, so a reload or a
// Silk restart resumes the idle clock instead of starting a fresh 15 minutes (and a TV opened
// after the limit locks before it shows anything private).

export const AUTO_LOCK_MS = 15 * 60_000;
export const AUTO_LOCK_WARN_MS = 14 * 60_000;
export const AUTO_LOCK_TICK_MS = 5_000;
export const AUTO_LOCK_TOAST = "Locking in 1 minute — press any button to stay";

export interface AutoLockOptions {
  now?: () => number;
  /** true while a workout is active or paused */
  exempt: () => boolean;
  onWarn: () => void;
  onClearWarn: () => void;
  onLock: () => void;
  /** called with the activity time whenever activity is recorded (persisted by the TV) */
  onActivity?: (at: number) => void;
}

export class AutoLock {
  private last: number;
  private warned = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private now: () => number;

  constructor(private o: AutoLockOptions) {
    this.now = o.now ?? (() => Date.now());
    this.last = this.now();
  }

  /** `lastActiveAt`: the persisted last activity (a reload resumes the idle clock from it). */
  start(lastActiveAt?: number) {
    this.stop();
    const t = this.now();
    this.last = lastActiveAt != null && lastActiveAt <= t ? lastActiveAt : t;
    this.timer = setInterval(() => this.tick(), AUTO_LOCK_TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clearWarn();
  }

  activity() {
    this.last = this.now();
    this.clearWarn();
    this.o.onActivity?.(this.last);
  }

  /** ms since the last activity (0 while a workout is running) */
  idleMs(): number {
    return this.o.exempt() ? 0 : this.now() - this.last;
  }

  private clearWarn() {
    if (!this.warned) return;
    this.warned = false;
    this.o.onClearWarn();
  }

  tick() {
    const t = this.now();
    if (this.o.exempt()) {
      this.last = t;
      this.clearWarn();
      this.o.onActivity?.(t);
      return;
    }
    const idle = t - this.last;
    if (idle >= AUTO_LOCK_MS) {
      this.stop();
      this.o.onLock();
      return;
    }
    if (idle >= AUTO_LOCK_WARN_MS && !this.warned) {
      this.warned = true;
      this.o.onWarn();
    }
  }
}
