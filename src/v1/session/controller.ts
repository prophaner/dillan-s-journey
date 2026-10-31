// Session engine client (Slice C). The server is authoritative (D4): every action becomes a
// session_command with a fresh command_id, the revision the user saw, the source and the tap
// time. Nothing is shown as done before the server says so:
//  - `row` is the last authoritative workout_sessions row (RPC result or Realtime update)
//  - `projected` is that row with the still-pending commands applied by the core engine, and every
//    result it adds is listed in `pendingKeys`, so the UI labels it "Pending", never "Done"
//  - commands go out one at a time, in tap order; each is written to the per-user, per-session
//    localStorage queue (D12, max 200) before it is sent, so reload/offline replays it and the
//    server dedupes by command_id
//  - a queued command is only sent while the same user is signed in
//  - stale_revision / invalid_state: adopt the server row, then re-evaluate. Pause, resume and end
//    are retried with a fresh command_id when still valid (dropped silently when the session is
//    already in the wanted state); set actions are dropped with a visible notice
//  - ended is terminal: anything still queued for an ended session is dropped
//  - timing: the server applies every command at its own now() when it arrives (0006
//    session_command), not at the tap time. So pending commands are projected at "now" too, and
//    the offline banner says pause/end take effect on reconnect; the UI never shows a pause or end
//    time the server will not save
//  - one controller per user+session pumps the queue: a background replay controller (app start)
//    gives way to the page controller, and replay skips a session the page already drives

import { applyCommand } from "@/v1/core/engine";
import {
  engineStateFromRow,
  type CommandKind,
  type CommandPayload,
  type CommandSource,
  type EngineState,
  type SessionRpcResult,
  type WorkoutSessionRow,
} from "@/v1/core/types";
import { newId, type DillanApi } from "@/v1/data/api";
import { CommandQueue, type QueuedCommand } from "./command-queue";

export type PendingStatus = "queued" | "sending";
export interface PendingCommand extends QueuedCommand {
  status: PendingStatus;
}

export type LoadState = "loading" | "ready" | "not_found" | "error";

export interface SessionView {
  loadState: LoadState;
  row: WorkoutSessionRow | null;
  /** row + pending commands (display only); null until loaded */
  projected: EngineState | null;
  pending: PendingCommand[];
  /** step keys whose shown result is not confirmed yet */
  pendingKeys: string[];
  offline: boolean;
  /** a visible message about a change that was not applied; null when none */
  notice: string | null;
  /** queued commands belong to a different signed-in user: they are held, never sent */
  heldForOtherUser: boolean;
  /** a pause/resume/end is waiting to sync: it takes effect when it reaches the server */
  timingPending: boolean;
}

export const NOTICES = {
  stale: "Another screen changed this workout first, so your last change wasn't applied.",
  staleMany: (n: number) =>
    `Another screen changed this workout first, so ${n} of your changes weren't applied.`,
  ended: "This workout was already ended on another screen.",
  failed: "That change couldn't be saved. Check the workout and try again.",
  full: "Too many changes are waiting to sync. Reconnect to keep logging.",
  otherUser:
    "Changes made while signed in as someone else stay on this device until they sign in again.",
  signedOut: "You're signed out. Sign in again to save the changes waiting on this device.",
} as const;

/** Ignore a second Complete/Skip tap within this window (a double tap logs one set, not two). */
export const SET_TAP_GUARD_MS = 600;

// Controllers currently driving a session's queue, by user+session.
const live = new Map<string, SessionController>();
const liveKey = (userId: string, sessionId: string) => `${userId}:${sessionId}`;

/** True when a page (foreground) controller is driving this session's queue. */
export function hasForegroundController(userId: string, sessionId: string): boolean {
  const c = live.get(liveKey(userId, sessionId));
  return !!c && c.foreground;
}

const LENIENT = new Set<CommandKind>(["pause", "resume", "end"]);
const SET_ACTIONS = new Set<CommandKind>(["complete_set", "skip_set", "undo", "skip_rest"]);
const MAX_RETRIES = 3;

/** True when the error looks like the request never reached the server. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const err = e as { code?: unknown; message?: unknown; name?: unknown } | null;
  const code = typeof err?.code === "string" ? err.code : "";
  // Postgres / PostgREST answered: SQLSTATE (5 chars) or PGRST codes.
  if (/^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST")) return false;
  const msg = String(err?.message ?? "").toLowerCase();
  if (msg.includes("not_authenticated")) return false;
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    err?.name === "TypeError" ||
    code === ""
  );
}

/** Does the session already have the state this lenient command asked for? */
function alreadyThere(kind: CommandKind, s: EngineState): boolean {
  if (kind === "pause") return s.state === "paused" || s.state === "ended";
  if (kind === "resume") return s.state === "active" || s.state === "ended";
  if (kind === "end") return s.state === "ended";
  return false;
}

export interface ControllerOptions {
  api: DillanApi;
  userId: string;
  sessionId: string;
  source: CommandSource;
  /** server-corrected now (ServerClock.now) */
  now: () => number;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** hooks for tests; default: window events and setTimeout */
  listenWindow?: boolean;
  /** called once after this client's End is acknowledged (summary finalization) */
  onEnded?: (row: WorkoutSessionRow) => void;
}

export class SessionController {
  private api: DillanApi;
  private queue: CommandQueue;
  private listeners = new Set<() => void>();
  private view: SessionView;
  private row: WorkoutSessionRow | null = null;
  private pending: PendingCommand[] = [];
  private retries = new Map<string, number>();
  private offline = false;
  private notice: string | null = null;
  private held = false;
  private loadState: LoadState = "loading";
  private pumping = false;
  private disposed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 2_000;
  private cleanups: Array<() => void> = [];
  private droppedSets = 0;
  private lastSetTapAt = -Infinity;

  constructor(private o: ControllerOptions) {
    this.api = o.api;
    this.queue =
      o.storage === undefined
        ? new CommandQueue(o.userId, o.sessionId)
        : new CommandQueue(o.userId, o.sessionId, o.storage);
    this.pending = this.queue.list().map((c) => ({ ...c, status: "queued" as const }));
    this.view = this.compute();
  }

  // ---- store for useSyncExternalStore ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.view;

  /** Page controllers listen to the window; background replay controllers do not. */
  get foreground(): boolean {
    return this.o.listenWindow !== false;
  }

  private emit() {
    this.view = this.compute();
    this.listeners.forEach((l) => l());
  }

  private compute(): SessionView {
    let projected: EngineState | null = null;
    const pendingKeys: string[] = [];
    if (this.row) {
      projected = engineStateFromRow(this.row);
      // Projected at now, not the tap time: the server applies each command when it arrives.
      const at = this.o.now();
      // Commands up to the one the row last applied are already in it (Realtime echo first).
      const seen = this.pending.findIndex((c) => c.commandId === this.row?.last_command_id);
      for (const c of this.pending.slice(seen + 1)) {
        const step = projected.steps[projected.cursor];
        const r = applyCommand(
          projected,
          {
            kind: c.kind,
            ...(c.payload ? { payload: c.payload } : {}),
            expected_revision: projected.revision,
          },
          at,
        );
        if (!r.ok) continue;
        if ((c.kind === "complete_set" || c.kind === "skip_set") && step)
          pendingKeys.push(step.key);
        if (c.kind === "end")
          for (const s of r.state.steps) if (!projected.results[s.key]) pendingKeys.push(s.key);
        projected = r.state;
      }
    }
    return {
      loadState: this.loadState,
      row: this.row,
      projected,
      pending: this.pending.map((p) => ({ ...p })),
      pendingKeys,
      offline: this.offline,
      notice: this.notice,
      heldForOtherUser: this.held,
      timingPending: this.pending.some((p) => LENIENT.has(p.kind)),
    };
  }

  // ---- lifecycle ----
  async start(): Promise<void> {
    this.disposed = false;
    const key = liveKey(this.o.userId, this.o.sessionId);
    const other = live.get(key);
    if (other && other !== this) {
      if (other.foreground && !this.foreground) {
        // The page already drives this session: a background replay has nothing to do.
        this.disposed = true;
        return;
      }
      // The page takes over from a background replay; re-read the shared queue it was pumping.
      other.dispose();
      this.pending = this.queue.list().map((c) => ({ ...c, status: "queued" as const }));
      this.retries.clear();
    }
    live.set(key, this);
    if (this.o.listenWindow !== false && typeof window !== "undefined") {
      const online = () => {
        this.offline = false;
        this.backoff = 2_000;
        this.emit();
        void this.refetch().then(() => this.pump());
      };
      const offline = () => {
        this.offline = true;
        this.emit();
      };
      const visible = () => {
        if (document.visibilityState === "visible") void this.refetch().then(() => this.pump());
      };
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      document.addEventListener("visibilitychange", visible);
      this.cleanups.push(() => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
        document.removeEventListener("visibilitychange", visible);
      });
      if (navigator.onLine === false) this.offline = true;
    }
    this.cleanups.push(
      this.api.realtime.onSession(this.o.userId, (r) => {
        if (r.id === this.o.sessionId) this.adopt(r);
      }),
    );
    await this.refetch();
    await this.pump();
  }

  dispose() {
    this.disposed = true;
    const key = liveKey(this.o.userId, this.o.sessionId);
    if (live.get(key) === this) live.delete(key);
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Re-read the authoritative row (load, reconnect, tab visible again). */
  async refetch(): Promise<void> {
    try {
      const r = await this.api.sessions.recover(this.o.sessionId);
      if (this.disposed) return;
      if (!r || r.user_id !== this.o.userId) {
        this.loadState = this.row ? this.loadState : "not_found";
      } else {
        this.loadState = "ready";
        this.adopt(r, false);
        if (this.offline && this.pending.every((p) => p.status !== "sending")) this.offline = false;
      }
    } catch (e) {
      if (this.disposed) return;
      if (isNetworkError(e)) this.offline = true;
      if (!this.row) this.loadState = "error";
    }
    this.emit();
  }

  private adopt(r: WorkoutSessionRow, emit = true) {
    if (r.id !== this.o.sessionId) return;
    if (this.row && this.row.state === "ended" && r.state !== "ended") return;
    if (!this.row || r.revision >= this.row.revision) {
      this.row = r;
      this.loadState = "ready";
      // This row already reflects one of our commands (e.g. the Realtime echo beat the RPC
      // response, or a reload after a lost response): drop it so it is not projected twice.
      // Queued (not in-flight) ones are removed here; compute() skips an in-flight one.
      const echoed = this.pending.findIndex(
        (p) => p.commandId === r.last_command_id && p.status !== "sending",
      );
      if (echoed >= 0) {
        for (const p of this.pending.slice(0, echoed + 1)) {
          this.queue.remove(p.commandId);
          this.retries.delete(p.commandId);
        }
        this.pending = this.pending.slice(echoed + 1);
      }
    }
    if (this.row.state === "ended" && this.pending.some((p) => p.status === "queued")) {
      // Ended is terminal: nothing else can apply. Keep only an in-flight request.
      const dropped = this.pending.filter((p) => p.status === "queued");
      const lostSets = dropped.filter((p) => SET_ACTIONS.has(p.kind)).length;
      dropped.forEach((p) => this.queue.remove(p.commandId));
      this.pending = this.pending.filter((p) => p.status !== "queued");
      if (lostSets) this.notice = NOTICES.ended;
    }
    if (emit) this.emit();
  }

  // ---- actions ----
  /**
   * Queue a command. Returns false when it is not valid for the shown state (e.g. a double tap) or
   * the queue is full. complete_set/skip_set get the shown step index.
   */
  send(kind: CommandKind, payload: Omit<CommandPayload, "step"> = {}): boolean {
    const v = this.view;
    if (!v.projected || !this.row) return false;
    const p = v.projected;
    const at = this.o.now();
    const setTap = kind === "complete_set" || kind === "skip_set";
    if (setTap && at - this.lastSetTapAt < SET_TAP_GUARD_MS) return false;
    const full: CommandPayload =
      kind === "complete_set" || kind === "skip_set" ? { ...payload, step: p.cursor } : payload;
    const check = applyCommand(
      p,
      {
        kind,
        ...(Object.keys(full).length ? { payload: full } : {}),
        expected_revision: p.revision,
      },
      at,
    );
    if (!check.ok) return false;
    const cmd: QueuedCommand = {
      commandId: newId(),
      userId: this.o.userId,
      sessionId: this.o.sessionId,
      kind,
      ...(Object.keys(full).length ? { payload: full } : {}),
      expectedRevision: p.revision,
      source: this.o.source,
      clientAt: new Date(at).toISOString(),
    };
    if (!this.queue.push(cmd)) {
      this.notice = NOTICES.full;
      this.emit();
      return false;
    }
    this.pending.push({ ...cmd, status: "queued" });
    if (setTap) this.lastSetTapAt = at;
    if (SET_ACTIONS.has(kind)) this.notice = null;
    this.emit();
    void this.pump();
    return true;
  }

  dismissNotice() {
    this.notice = null;
    this.emit();
  }

  /** Send queued commands, oldest first, one at a time. */
  async pump(): Promise<void> {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    this.droppedSets = 0;
    try {
      if (this.pending.length) {
        // Never replay under a different signed-in user (brief: queued changes stay tied to
        // their original user).
        const who = await this.api.auth.getUser().catch(() => undefined);
        if (who === null) {
          // No one is signed in (session expired or revoked): keep the queue, ask to sign in.
          this.held = true;
          this.notice = NOTICES.signedOut;
          return;
        }
        if (who !== undefined && who.id !== this.o.userId) {
          this.held = true;
          this.notice = NOTICES.otherUser;
          return;
        }
        this.held = false;
      }
      while (this.pending.length && !this.disposed) {
        if (!this.row) {
          await this.refetch();
          if (!this.row) return;
        }
        const cmd = this.pending[0] as PendingCommand;
        cmd.status = "sending";
        this.emit();
        let res: SessionRpcResult;
        try {
          res = await this.api.sessions.command({
            sessionId: cmd.sessionId,
            kind: cmd.kind,
            ...(cmd.payload ? { payload: cmd.payload } : {}),
            expectedRevision: cmd.expectedRevision,
            source: cmd.source,
            commandId: cmd.commandId,
            clientAt: cmd.clientAt,
          });
        } catch (e) {
          if (this.disposed) return;
          if (isNetworkError(e)) {
            cmd.status = "queued";
            this.offline = true;
            this.scheduleRetry();
            return;
          }
          this.drop(cmd, NOTICES.failed);
          continue;
        }
        if (this.disposed) return;
        this.offline = false;
        this.backoff = 2_000;
        await this.settle(cmd, res);
      }
    } finally {
      this.pumping = false;
      if (this.droppedSets > 1) this.notice = NOTICES.staleMany(this.droppedSets);
      if (!this.disposed) this.emit();
    }
  }

  private scheduleRetry() {
    if (this.retryTimer || typeof setTimeout === "undefined") return;
    const wait = this.backoff;
    this.backoff = Math.min(30_000, this.backoff * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.pump();
    }, wait);
  }

  private drop(cmd: PendingCommand, notice: string | null) {
    this.queue.remove(cmd.commandId);
    this.pending = this.pending.filter((p) => p.commandId !== cmd.commandId);
    this.retries.delete(cmd.commandId);
    if (notice) this.notice = notice;
  }

  private async settle(cmd: PendingCommand, res: SessionRpcResult) {
    if (res.ok) {
      this.queue.remove(cmd.commandId);
      this.pending = this.pending.filter((p) => p.commandId !== cmd.commandId);
      if (res.session) this.adopt(res.session, false);
      if (cmd.kind === "end" && res.session?.state === "ended") this.o.onEnded?.(res.session);
      return;
    }
    // Not applied. Get the authoritative row first (the RPC returns it with most errors).
    if (res.session) this.adopt(res.session, false);
    else await this.refetch();
    const fresh = this.row ? engineStateFromRow(this.row) : null;

    if (!fresh || res.error === "not_found" || res.error === "command_id_reused") {
      this.drop(cmd, NOTICES.failed);
      return;
    }
    if (fresh.state === "ended") {
      this.drop(cmd, SET_ACTIONS.has(cmd.kind) ? NOTICES.ended : null);
      return;
    }
    if (LENIENT.has(cmd.kind)) {
      if (alreadyThere(cmd.kind, fresh)) {
        this.drop(cmd, null);
        return;
      }
      const tries = (this.retries.get(cmd.commandId) ?? 0) + 1;
      const ok = applyCommand(fresh, { kind: cmd.kind, expected_revision: fresh.revision }, 0).ok;
      if (ok && tries <= MAX_RETRIES) {
        // Retry with a fresh command id: the old one is recorded with its failed result.
        const next: PendingCommand = {
          ...cmd,
          commandId: newId(),
          expectedRevision: fresh.revision,
          status: "queued",
        };
        this.queue.replace(cmd.commandId, next);
        this.pending = this.pending.map((p) => (p.commandId === cmd.commandId ? next : p));
        this.retries.delete(cmd.commandId);
        this.retries.set(next.commandId, tries);
        return;
      }
      this.drop(cmd, NOTICES.failed);
      return;
    }
    // Set actions are never re-applied to a session that moved on.
    this.droppedSets += 1;
    this.drop(cmd, res.error === "stale_revision" ? NOTICES.stale : NOTICES.failed);
  }
}
