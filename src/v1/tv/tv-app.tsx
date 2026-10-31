// The TV surface (/tv): a 1920×1080 dark canvas scaled to the screen with a 64 px safe area, the
// D-pad focus engine, the remote key map, Back per screen, pairing and shared-device safety.
//
// Phases: boot → out (first run / chooser / pairing) → in (one signed-in user) → blank → out.
//  - A Supabase session counts on the TV only when this TV paired it (marker in localStorage) and
//    its device grant is still valid (device_grant_touch on load and every 60 s; revoked → lock).
//  - Lock / switch / remove / auto-lock / revoked: blank frame (private views unmount), react-query
//    cleared, grant revoked, Realtime channels removed, local sign-out, auth storage wiped, blank
//    for ≥ BLANK_MIN_MS, then the chooser (lock.ts).
//  - Auto-lock after 15 min without remote/controller activity outside an active/paused workout.
//  - After a reload with an active workout the TV pauses it and shows Paused (acceptance 21).
//  - Back arrives as a key or as history popstate (Silk); window.dillan.onBack() serves a future
//    wrapper and returns false when the app wants to exit.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthUser, DillanApi } from "@/v1/data/api";
import { useCurrentSession, useProfile } from "@/v1/data/queries";
import { UserProvider } from "@/v1/ui/user-context";
import { AUTO_LOCK_TOAST, AutoLock } from "./autolock";
import { TvSignedInProvider, type SessionHandle, type TvSignedIn } from "./context";
import {
  forgetProfile,
  isRemembered,
  rememberProfile,
  rememberedProfiles,
  touchProfile,
  tvDevice,
  type RememberedProfile,
} from "./device";
import { FocusEngine } from "./focus";
import { tvKeyOf } from "./keys";
import { runLock } from "./lock";
import { backFor, EXIT_TOAST, type TvModal, type TvScreen } from "./screens";
import { TvChoose, TvHome, TvPreflight, TvProgram } from "./screens-main";
import { TvCalendar, TvDetail, TvProfile, TvRunningDialog } from "./screens-history";
import { TvSession } from "./session-screen";
import { Chooser, FirstRun, Pairing, TV_COPY } from "./signed-out";

export const TV_W = 1920;
export const TV_H = 1080;
export const GRANT_CHECK_MS = 60_000;
export const TV_SESSION_KEY = "dillan.tv.session";
const TOAST_MS = 4_000;

type Phase =
  | { kind: "boot" }
  | { kind: "blank" }
  | { kind: "out" }
  | { kind: "in"; user: AuthUser; grantId: string | null; restore: boolean };

type OutScreen =
  | { name: "first_run" }
  | { name: "chooser" }
  | { name: "pairing"; forUser: RememberedProfile | null };

/** Which signed-in Supabase session belongs to this TV (set when the TV paired it). */
function readMarker(): { userId: string; grantId: string | null } | null {
  try {
    const raw = window.localStorage.getItem(TV_SESSION_KEY);
    const v = raw ? (JSON.parse(raw) as { userId?: unknown; grantId?: unknown }) : null;
    return v && typeof v.userId === "string"
      ? { userId: v.userId, grantId: typeof v.grantId === "string" ? v.grantId : null }
      : null;
  } catch {
    return null;
  }
}
function writeMarker(v: { userId: string; grantId: string | null } | null) {
  try {
    if (v) window.localStorage.setItem(TV_SESSION_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(TV_SESSION_KEY);
  } catch {
    /* storage blocked */
  }
}

/** Fixed 1920×1080 canvas, scaled to fit and letterboxed (handoff §2). */
export function TvStage({ children }: { children: ReactNode }) {
  const [box, setBox] = useState({ scale: 1, x: 0, y: 0 });
  useLayoutEffect(() => {
    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scale = Math.min(w / TV_W, h / TV_H) || 1;
      setBox({ scale, x: (w - TV_W * scale) / 2, y: (h - TV_H * scale) / 2 });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div data-theme="dark" className="fixed inset-0 overflow-hidden bg-bg">
      <div
        className="absolute left-0 top-0 origin-top-left overflow-hidden"
        style={{
          width: TV_W,
          height: TV_H,
          transform: `translate(${box.x}px, ${box.y}px) scale(${box.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface SignedInApi {
  back(): boolean;
  playPause(): void;
  menu(): void;
  activity(): void;
}

export function TvApp({ api }: { api: DillanApi }) {
  const qc = useQueryClient();
  const device = useMemo(() => tvDevice(), []);
  const [phase, setPhase] = useState<Phase>({ kind: "boot" });
  const [profiles, setProfiles] = useState<RememberedProfile[]>(() => rememberedProfiles());
  const [out, setOut] = useState<OutScreen>(() =>
    rememberedProfiles().length ? { name: "chooser" } : { name: "first_run" },
  );
  const [toast, setToast] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const engine = useRef<FocusEngine | null>(null);
  const signedIn = useRef<SignedInApi | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const outRef = useRef(out);
  outRef.current = out;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locking = useRef(false);

  const showToast = useCallback((msg: string | null, sticky = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    if (msg && !sticky) toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const chooserOrFirstRun = useCallback((): OutScreen => {
    const list = rememberedProfiles();
    setProfiles(list);
    return list.length ? { name: "chooser" } : { name: "first_run" };
  }, []);

  // ---- boot: is there a session this TV paired, with a valid grant? ----
  useEffect(() => {
    let live = true;
    void (async () => {
      const user = await api.auth.getUser().catch(() => null);
      const marker = readMarker();
      if (!user || !marker || marker.userId !== user.id) {
        // A session this TV did not pair (e.g. the phone app in the same browser) is never shown.
        if (live) setPhase({ kind: "out" });
        return;
      }
      const g = await api.tv.checkGrant(device.id).catch(() => null);
      if (!live) return;
      if (g && !g.valid) {
        await api.tv.lock(null).catch(() => undefined);
        writeMarker(null);
        if (live) {
          setOut(chooserOrFirstRun());
          setPhase({ kind: "out" });
        }
        return;
      }
      setPhase({ kind: "in", user, grantId: g?.grantId ?? marker.grantId, restore: true });
    })();
    return () => {
      live = false;
    };
  }, [api, device.id, chooserOrFirstRun]);

  // ---- lock / switch / remove ----
  const lock = useCallback(
    async (opts: { forget?: boolean } = {}) => {
      const p = phaseRef.current;
      if (locking.current || p.kind !== "in") return;
      locking.current = true;
      showToast(null);
      try {
        await runLock({
          blank: () => setPhase({ kind: "blank" }),
          clearCaches: () => qc.clear(),
          signOut: () => api.tv.lock(p.grantId),
          forget: () => {
            if (opts.forget) forgetProfile(p.user.id);
          },
          done: () => {
            writeMarker(null);
            setOut(chooserOrFirstRun());
            setPhase({ kind: "out" });
          },
        });
      } finally {
        locking.current = false;
      }
    },
    [api, qc, showToast, chooserOrFirstRun],
  );

  const onSignedIn = useCallback((user: AuthUser, grantId: string | null) => {
    writeMarker({ userId: user.id, grantId });
    setPhase({ kind: "in", user, grantId, restore: false });
  }, []);

  // ---- Back (keys, popstate, wrapper) ----
  const doBack = useCallback((): boolean => {
    const p = phaseRef.current;
    if (p.kind === "in") return signedIn.current?.back() ?? true;
    if (p.kind !== "out") return true;
    const o = outRef.current;
    if (o.name === "pairing") {
      setOut(chooserOrFirstRun()); // unmounting Pairing cancels the live code
      return true;
    }
    return false; // first run / chooser: the shell may exit
  }, [chooserOrFirstRun]);

  useEffect(() => {
    const w = window as Window & { dillan?: { onBack?: () => boolean } };
    w.dillan = { ...(w.dillan ?? {}), onBack: () => doBack() };
    return () => {
      if (w.dillan) delete w.dillan.onBack;
    };
  }, [doBack]);

  // History guard: Silk may deliver the remote's Back as popstate instead of a key. One guard
  // entry sits on top of /tv; every pop is a Back, and the guard is re-armed unless the app wants
  // to exit (then the next Back leaves the page). Never stacks guards (remounts, StrictMode).
  useEffect(() => {
    const onGuard = () =>
      !!(window.history.state as { dillanTvGuard?: number } | null)?.dillanTvGuard;
    const guard = () => {
      if (onGuard()) return;
      try {
        window.history.pushState({ ...(window.history.state ?? {}), dillanTvGuard: 1 }, "");
      } catch {
        /* sandboxed */
      }
    };
    guard();
    const onPop = () => {
      signedIn.current?.activity();
      const handled = doBack();
      if (handled) guard();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [doBack]);

  // ---- remote keys ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = tvKeyOf(e);
      if (!k) return;
      e.preventDefault();
      const p = phaseRef.current;
      if (p.kind === "blank" || p.kind === "boot") return;
      signedIn.current?.activity();
      if (toast === AUTO_LOCK_TOAST) showToast(null);
      const fe = engine.current;
      switch (k) {
        case "up":
        case "down":
        case "left":
        case "right":
          fe?.move(k);
          return;
        case "select":
          fe?.activate();
          return;
        case "back":
          doBack();
          return;
        case "playpause":
          signedIn.current?.playPause();
          return;
        case "menu":
          signedIn.current?.menu();
          return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [doBack, toast, showToast]);

  // ---- focus engine on the canvas ----
  useEffect(() => {
    if (!canvas.current) return;
    const fe = new FocusEngine(canvas.current);
    engine.current = fe;
    fe.attach();
    return () => {
      fe.detach();
      engine.current = null;
    };
  }, []);

  let body: ReactNode;
  if (phase.kind === "boot") body = <div data-screen="boot" className="h-full" />;
  else if (phase.kind === "blank")
    // Blank frame between users: background only (no private node survives into the chooser).
    body = (
      <div data-screen="blank" data-testid="tv-blank" className="grid h-full place-items-center">
        <p className="text-tv-sm text-text-3">{TV_COPY.switching}</p>
      </div>
    );
  else if (phase.kind === "out") {
    if (out.name === "first_run")
      body = (
        <FirstRun device={device} onStart={() => setOut({ name: "pairing", forUser: null })} />
      );
    else if (out.name === "chooser")
      body = (
        <Chooser
          profiles={profiles}
          onChoose={(p) => setOut({ name: "pairing", forUser: p })}
          onAdd={() => setOut({ name: "pairing", forUser: null })}
        />
      );
    else
      body = (
        <Pairing
          key={out.forUser?.userId ?? "new"}
          api={api}
          device={device}
          forUser={out.forUser}
          origin={window.location.origin}
          onSignedIn={onSignedIn}
          onCancel={() => setOut(chooserOrFirstRun())}
        />
      );
  } else
    body = (
      <UserProvider user={phase.user}>
        <SignedIn
          key={phase.user.id}
          api={api}
          user={phase.user}
          restore={phase.restore}
          handle={signedIn}
          toast={showToast}
          onLock={lock}
        />
      </UserProvider>
    );

  return (
    <TvStage>
      <div
        ref={canvas}
        data-theme="dark"
        className="tv-root relative flex h-full w-full flex-col overflow-hidden bg-bg p-tv-safe font-ui text-tv-base text-text"
      >
        {body}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="absolute bottom-tv-safe right-tv-safe z-50 max-w-[760px] rounded-tv-md bg-text px-8 py-5 text-tv-base font-bold text-bg"
          >
            {toast}
          </div>
        )}
      </div>
    </TvStage>
  );
}

function SignedIn({
  api,
  user,
  restore,
  handle,
  toast,
  onLock,
}: {
  api: DillanApi;
  user: AuthUser;
  restore: boolean;
  handle: React.MutableRefObject<SignedInApi | null>;
  toast: (msg: string | null, sticky?: boolean) => void;
  onLock: (opts?: { forget?: boolean }) => Promise<void>;
}) {
  const device = useMemo(() => tvDevice(), []);
  const current = useCurrentSession(user.id);
  const profile = useProfile(user.id);
  const [screen, setScreen] = useState<TvScreen>({ name: "home" });
  const [modal, setModal] = useState<TvModal | null>(null);
  const [restoredPause, setRestoredPause] = useState(false);
  const [remembered, setRememberedState] = useState(() => isRemembered(user.id));
  const [landed, setLanded] = useState(false);
  const sessionHandle = useRef<SessionHandle | null>(null);
  const setSessionHandle = useCallback((h: SessionHandle | null) => {
    sessionHandle.current = h;
  }, []);
  const row = current.data;
  const liveSessionId = row && (row.state === "active" || row.state === "paused") ? row.id : null;
  const liveRef = useRef(liveSessionId);
  liveRef.current = liveSessionId;

  // Landing: a running workout first. After a reload an active one is paused (acceptance 21).
  useEffect(() => {
    if (landed || !current.isFetched) return;
    setLanded(true);
    const r = current.data;
    if (!r || (r.state !== "active" && r.state !== "paused")) return;
    if (restore && r.state === "active") {
      setRestoredPause(true);
      void api.sessions
        .command({ sessionId: r.id, kind: "pause", expectedRevision: r.revision, source: "tv" })
        .catch(() => undefined);
    }
    setScreen({ name: "session", sessionId: r.id });
  }, [landed, current.isFetched, current.data, restore, api]);

  // Remembered tile: keep its name and last-active time fresh (never opts in by itself).
  const name = profile.data?.display_name ?? null;
  useEffect(() => {
    touchProfile(user.id, name);
  }, [user.id, name]);

  const setRemembered = useCallback(
    (on: boolean) => {
      if (on) rememberProfile(user.id, name ?? "");
      else forgetProfile(user.id);
      setRememberedState(isRemembered(user.id));
    },
    [user.id, name],
  );

  // ---- auto-lock ----
  const autolock = useMemo(
    () =>
      new AutoLock({
        exempt: () => liveRef.current != null,
        onWarn: () => toast(AUTO_LOCK_TOAST, true),
        onClearWarn: () => toast(null),
        onLock: () => void onLock(),
      }),
    [toast, onLock],
  );
  useEffect(() => {
    autolock.start();
    return () => autolock.stop();
  }, [autolock]);
  // Phone-controller events (Realtime session updates) count as activity too.
  useEffect(() => {
    if (row) autolock.activity();
  }, [row, autolock]);

  // ---- server-side half: the grant is re-checked every 60 s ----
  useEffect(() => {
    let live = true;
    const check = async () => {
      const g = await api.tv.checkGrant(device.id).catch(() => null);
      if (live && g && !g.valid) void onLock();
    };
    const t = setInterval(() => void check(), GRANT_CHECK_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [api, device.id, onLock]);

  const go = useCallback((s: TvScreen) => {
    setModal(null);
    setScreen(s);
  }, []);

  const requestSwitch = useCallback(() => {
    if (liveRef.current) setModal({ kind: "running", then: "switch" });
    else void onLock();
  }, [onLock]);
  const requestLock = useCallback(() => {
    setModal(liveRef.current ? { kind: "running", then: "lock" } : { kind: "lock" });
  }, []);
  const requestRemove = useCallback(() => {
    setModal(liveRef.current ? { kind: "running", then: "remove" } : { kind: "remove" });
  }, []);
  const endRunningThen = useCallback(
    (then: "switch" | "lock" | "remove") => {
      setModal(null);
      void (async () => {
        try {
          const r = await api.sessions.current();
          if (r && r.state !== "ended") {
            const res = await api.sessions.command({
              sessionId: r.id,
              kind: r.state === "preparing" ? "discard" : "end",
              expectedRevision: r.revision,
              source: "tv",
            });
            if (!res.ok && res.session?.state !== "ended") throw new Error(res.error);
            if (res.session?.live_data && res.session.outcome !== "discarded")
              await api.sessions.finalize(r.id).catch(() => null);
          }
        } catch {
          toast("Couldn't end the workout. Check the connection and try again.");
          return;
        }
        await onLock({ forget: then === "remove" });
      })();
    },
    [api, onLock, toast],
  );

  const ctx: TvSignedIn = {
    api,
    device,
    user,
    screen,
    go,
    modal,
    openModal: setModal,
    toast: (m) => toast(m),
    liveSessionId,
    restoredPause,
    clearRestoredPause: () => setRestoredPause(false),
    setSessionHandle,
    requestSwitch,
    requestLock,
    requestRemove,
    endRunningThen,
    lockNow: (o) => {
      setModal(null);
      void onLock(o);
    },
    remembered,
    setRemembered,
  };

  // What the app's key handler and Back can reach.
  handle.current = {
    activity: () => autolock.activity(),
    back: () => {
      const a = backFor(screen, {
        modal,
        sessionState: screen.name === "session" ? (sessionHandle.current?.state ?? null) : null,
        liveSessionId,
      });
      switch (a.kind) {
        case "close_modal":
          setModal(null);
          return true;
        case "go":
          go(a.screen);
          return true;
        case "pause":
          sessionHandle.current?.pause();
          return true;
        case "noop":
          return true;
        case "exit_toast":
          toast(EXIT_TOAST);
          return false;
        case "exit":
          return false;
        case "cancel_pairing":
          return true;
      }
    },
    playPause: () => {
      if (screen.name === "session" && !modal) sessionHandle.current?.togglePause();
    },
    menu: () => go({ name: "profile" }),
  };
  useEffect(
    () => () => {
      handle.current = null;
    },
    [handle],
  );

  let body: ReactNode;
  if (!landed) body = <div data-screen="landing" className="h-full" />;
  else
    switch (screen.name) {
      case "home":
        body = <TvHome />;
        break;
      case "program":
        body = <TvProgram />;
        break;
      case "choose":
        body = <TvChoose />;
        break;
      case "preflight":
        body = <TvPreflight key={screen.templateId} templateId={screen.templateId} />;
        break;
      case "session":
        body = <TvSession key={screen.sessionId} sessionId={screen.sessionId} />;
        break;
      case "calendar":
        body = <TvCalendar month={screen.month} day={screen.day} />;
        break;
      case "detail":
        body = <TvDetail key={screen.sessionId} sessionId={screen.sessionId} day={screen.day} />;
        break;
      case "profile":
        body = <TvProfile />;
        break;
      default:
        body = <TvHome />;
    }

  return (
    <TvSignedInProvider value={ctx}>
      {body}
      {modal?.kind === "running" && <TvRunningDialog then={modal.then} />}
    </TvSignedInProvider>
  );
}
