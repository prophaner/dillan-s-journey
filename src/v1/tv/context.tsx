// What every signed-in TV screen can reach: navigation, modals, toasts, the user and the
// shared-device actions. Provided by tv-app.tsx; never holds user data itself.

import { createContext, useContext } from "react";
import type { AuthUser, DillanApi, TvDeviceInfo } from "@/v1/data/api";
import type { TvModal, TvScreen } from "./screens";

export interface SessionHandle {
  sessionId: string;
  state: "preparing" | "active" | "paused" | "ending" | "ended" | null;
  pause(): void;
  togglePause(): void;
}

export interface TvSignedIn {
  api: DillanApi;
  device: TvDeviceInfo;
  user: AuthUser;
  screen: TvScreen;
  go(s: TvScreen): void;
  modal: TvModal | null;
  openModal(m: TvModal | null): void;
  toast(msg: string): void;
  /** the user's unfinished (active/paused) session, if any */
  liveSessionId: string | null;
  /** set once after a reload paused the running workout (acceptance 21) */
  restoredPause: boolean;
  clearRestoredPause(): void;
  /** registered by the session screen: Back = Pause, Play/Pause */
  setSessionHandle(h: SessionHandle | null): void;
  /** Switch user / Lock / Remove (M4 first when a workout is running) */
  requestSwitch(): void;
  requestLock(): void;
  requestRemove(): void;
  /** M4 "End and save, then continue" */
  endRunningThen(then: "switch" | "lock" | "remove"): void;
  /** confirmed M5 / M6 */
  lockNow(opts?: { forget?: boolean }): void;
  remembered: boolean;
  setRemembered(on: boolean): void;
}

const Ctx = createContext<TvSignedIn | null>(null);
export const TvSignedInProvider = Ctx.Provider;

export function useTv(): TvSignedIn {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTv() outside the signed-in TV");
  return v;
}
