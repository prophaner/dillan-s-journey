// Picks the backend once per page load.
//  - Production builds: always Supabase. The mock module is imported only inside an
//    `import.meta.env.DEV` branch, which Vite replaces with `false` and drops (with the module).
//  - Dev builds: ?mock=1 turns the mock on and remembers it in sessionStorage for the tab;
//    ?mock=0 turns it off.

import { createSupabaseApi } from "./supabase-api";
import type { DillanApi } from "./api";

export const MOCK_FLAG_KEY = "dillan.mock";

/** Pure guard (tested): mock only in a dev build and only when asked for. */
export function mockRequested(
  isDev: boolean,
  search: string,
  session: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): boolean {
  if (!isDev) return false;
  const p = new URLSearchParams(search).get("mock");
  try {
    if (p === "1") {
      session?.setItem(MOCK_FLAG_KEY, "1");
      return true;
    }
    if (p === "0") {
      session?.removeItem(MOCK_FLAG_KEY);
      return false;
    }
    return session?.getItem(MOCK_FLAG_KEY) === "1";
  } catch {
    return p === "1";
  }
}

let current: DillanApi | null = null;
let loading: Promise<DillanApi> | null = null;

function sessionStore(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function getApi(): Promise<DillanApi> {
  if (current) return Promise.resolve(current);
  if (!loading) {
    loading = (async () => {
      let api: DillanApi | null = null;
      if (import.meta.env.DEV) {
        if (
          typeof window !== "undefined" &&
          mockRequested(true, window.location.search, sessionStore())
        ) {
          const m = await import("./mock-api");
          api = m.createMockApi();
        }
      }
      current = api ?? createSupabaseApi();
      return current;
    })();
  }
  return loading;
}

/** The api resolved by getApi(); every signed-in route awaits getApi() in beforeLoad first. */
export function useApi(): DillanApi {
  if (!current) throw new Error("getApi() has not resolved yet");
  return current;
}

export function currentApi(): DillanApi | null {
  return current;
}

/** Tests inject a backend. */
export function setApiForTests(api: DillanApi | null) {
  current = api;
  loading = api ? Promise.resolve(api) : null;
}
