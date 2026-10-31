// In-memory Storage for per-user client data on the TV (handoff §6: on a TV, user data is held
// only in memory and cleared on lock). The session controller's command queue uses it instead of
// localStorage, so queued set results never land in the shared TV's persistent storage. It
// survives leaving and re-entering the session screen within one sign-in, never a lock.

const mem = new Map<string, string>();

export const tvMemoryStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => {
    mem.delete(k);
  },
};

/** Drops everything (lock / switch / remove / auto-lock). */
export function clearTvMemory() {
  mem.clear();
}
