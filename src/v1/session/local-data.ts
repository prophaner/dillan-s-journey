// Per-user data this device keeps for the session client: note text waiting to save
// (notes.ts) and queued session commands (command-queue.ts). Removed when the account is
// deleted, so the deleted user's note text and set data do not stay on a shared device
// (dev-brief: account deletion removes owned app data). Logout keeps them on purpose: they
// replay under the same user on the next sign-in.

import { queueKey } from "./command-queue";
import { pendingNotesKey } from "./notes";

type Store = Pick<Storage, "removeItem">;

export function clearLocalUserData(userId: string, store?: Store | null) {
  let s: Store | null | undefined = store;
  if (s === undefined) {
    try {
      s = typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      s = null;
    }
  }
  for (const key of [pendingNotesKey(userId), queueKey(userId)]) {
    try {
      s?.removeItem(key);
    } catch {
      /* storage blocked: nothing was stored either */
    }
  }
}
