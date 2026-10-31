// Shared-TV auto-lock (handoff 4.2, flow F2d): any remote key or phone-controller event is
// activity; a tick every 5 s locks after 15 minutes without activity, with a warning toast one
// minute before. An active or paused workout is exempt (and idle time during it never counts).
// The server-side half is the grant check (device_grant_touch) every 60 s in tv-app.tsx.

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

  start() {
    this.stop();
    this.last = this.now();
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
