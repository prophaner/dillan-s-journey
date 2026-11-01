// Offline session command queue (build-plan D12, brief "bounded queue tied to their original
// user/session"). localStorage, one key per user, one list per session, at most 200 commands per
// session. A command is written here BEFORE it is sent, so a reload mid-request replays it; the
// server dedupes by command_id. Commands are only ever read back for the user who queued them.

import type { CommandKind, CommandPayload, CommandSource } from "@/v1/core/types";

export const QUEUE_MAX = 200;
const PREFIX = "dillan.v1.cmdq.";

export interface QueuedCommand {
  commandId: string;
  userId: string;
  sessionId: string;
  kind: CommandKind;
  payload?: CommandPayload;
  /** the revision the user saw when acting */
  expectedRevision: number;
  source: CommandSource;
  /** ISO time of the tap */
  clientAt: string;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function queueKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

function safeStorage(): Store | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readAll(userId: string, store: Store | null): Record<string, QueuedCommand[]> {
  try {
    const raw = store?.getItem(queueKey(userId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, QueuedCommand[]>)
      : {};
  } catch {
    return {};
  }
}

function writeAll(userId: string, all: Record<string, QueuedCommand[]>, store: Store | null) {
  try {
    const live = Object.fromEntries(Object.entries(all).filter(([, l]) => l.length > 0));
    if (Object.keys(live).length === 0) store?.removeItem(queueKey(userId));
    else store?.setItem(queueKey(userId), JSON.stringify(live));
  } catch {
    /* quota or private mode: the in-memory copy in the controller still replays */
  }
}

export class CommandQueue {
  constructor(
    readonly userId: string,
    readonly sessionId: string,
    private store: Store | null = safeStorage(),
  ) {}

  /** Only this user's commands for this session; anything else in the list is ignored. */
  list(): QueuedCommand[] {
    const l = readAll(this.userId, this.store)[this.sessionId] ?? [];
    return l.filter((c) => c.userId === this.userId && c.sessionId === this.sessionId);
  }

  /** false when the queue is full (the command is not accepted). */
  push(cmd: QueuedCommand): boolean {
    if (cmd.userId !== this.userId || cmd.sessionId !== this.sessionId) return false;
    const all = readAll(this.userId, this.store);
    const l = all[this.sessionId] ?? [];
    if (l.length >= QUEUE_MAX) return false;
    all[this.sessionId] = [...l, cmd];
    writeAll(this.userId, all, this.store);
    return true;
  }

  /** Swap one command for another in place (a retry with a fresh id keeps its position). */
  replace(commandId: string, next: QueuedCommand) {
    const all = readAll(this.userId, this.store);
    all[this.sessionId] = (all[this.sessionId] ?? []).map((c) =>
      c.commandId === commandId ? next : c,
    );
    writeAll(this.userId, all, this.store);
  }

  remove(commandId: string) {
    const all = readAll(this.userId, this.store);
    all[this.sessionId] = (all[this.sessionId] ?? []).filter((c) => c.commandId !== commandId);
    writeAll(this.userId, all, this.store);
  }

  clear() {
    const all = readAll(this.userId, this.store);
    delete all[this.sessionId];
    writeAll(this.userId, all, this.store);
  }
}

/** Session ids with queued commands for this user (app start: recover them). */
export function queuedSessionIds(userId: string, store: Store | null = safeStorage()): string[] {
  return Object.entries(readAll(userId, store))
    .filter(([, l]) => l.some((c) => c.userId === userId))
    .map(([id]) => id);
}
