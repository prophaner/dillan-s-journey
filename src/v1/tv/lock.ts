// Shared-device lock (handoff 4.2 lockDevice, dev-brief "switch/logout"): used by Switch user, Lock
// this TV, Remove my profile, auto-lock and a revoked grant. Order matters:
//  1. blank: the app renders an empty frame, which unmounts every private view (their Realtime
//     subscriptions end with them)
//  2. after one frame: drop the in-memory caches (react-query) and per-view state
//  3. revoke this TV's grant (server deletes its auth session), remove every Realtime channel,
//     end the local session and wipe the Supabase auth storage
//  4. keep the blank frame for at least BLANK_MIN_MS, then show the chooser (never stale data)

export const BLANK_MIN_MS = 150;

export interface LockSteps {
  blank(): void;
  clearCaches(): void;
  /** revoke + unsubscribe + sign out + wipe (api.tv.lock) */
  signOut(): Promise<void>;
  /** Remove my profile: also forget the remembered chooser tile */
  forget?: () => void;
  done(): void;
}

export interface LockTiming {
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  minBlankMs?: number;
}

const defaultWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runLock(steps: LockSteps, t: LockTiming = {}): Promise<void> {
  const now = t.now ?? (() => Date.now());
  const wait = t.wait ?? defaultWait;
  const start = now();
  steps.blank();
  await wait(0); // let the blank frame commit before anything else changes
  steps.clearCaches();
  try {
    await steps.signOut();
  } catch {
    /* local sign-out still happened (api.tv.lock never throws on the network) */
  }
  steps.forget?.();
  const left = (t.minBlankMs ?? BLANK_MIN_MS) - (now() - start);
  if (left > 0) await wait(left);
  steps.done();
}
