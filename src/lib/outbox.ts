import { openDB, type IDBPDatabase } from "idb";
import { assertVersion, isUpdateKind } from "./updates";

/**
 * Local-first outbox (brief §10.2, 05-web-platform §2).
 * Write locally → "Saved on this device". Only a server ack → "Synced".
 */
export type OutboxStatus = "local" | "synced" | "failed" | "conflict";

export interface OutboxItem {
  localId: string;
  accountId: string;
  idempotencyKey: string;
  kind: string;
  payload: unknown;
  expectedVersion: number | null;
  status: OutboxStatus;
  attempts: number;
  createdAt: number;
  /** Strictly increasing per device; keeps order when two writes share a millisecond. */
  seq?: number;
  syncedAt?: number;
  error?: string;
}

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      reason: "offline" | "retry" | "conflict" | "permanent" | "not_stored";
      message?: string;
    };

/**
 * "Synced" means the server durably stored the write — nothing less.
 * An ack without stored === true keeps the item "Saved on this device".
 */
export function interpretAck(
  res: { ack?: boolean; stored?: boolean; idempotencyKey?: string } | null | undefined,
  idempotencyKey: string,
): SendResult {
  if (!res?.ack || res.idempotencyKey !== idempotencyKey) return { ok: false, reason: "retry" };
  if (res.stored !== true) return { ok: false, reason: "not_stored" };
  return { ok: true };
}

const MAX_ATTEMPTS = 8;
const events = typeof EventTarget !== "undefined" ? new EventTarget() : null;
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB("dillan", 1, {
      upgrade(d) {
        const s = d.createObjectStore("outbox", { keyPath: "localId" });
        s.createIndex("account", "accountId");
        d.createObjectStore("drafts", { keyPath: "key" });
      },
    });
  }
  return dbp;
}

function emit() {
  events?.dispatchEvent(new Event("change"));
}

export function onOutboxChange(fn: () => void) {
  events?.addEventListener("change", fn);
  return () => events?.removeEventListener("change", fn);
}

let lastSeq = 0;
/** Monotonic: never repeats or goes backwards, even within one millisecond or after a reload. */
export function nextSeq(now = Date.now()) {
  lastSeq = Math.max(now * 1000, lastSeq + 1);
  return lastSeq;
}
const orderOf = (i: OutboxItem) => i.seq ?? i.createdAt * 1000;

export async function enqueue(
  accountId: string,
  kind: string,
  payload: unknown,
  expectedVersion: number | null = null,
): Promise<OutboxItem> {
  // Updates ("update:<table>") must carry the version the app read.
  if (isUpdateKind(kind)) assertVersion(kind.slice(7), expectedVersion);
  const item: OutboxItem = {
    localId: crypto.randomUUID(),
    accountId,
    idempotencyKey: crypto.randomUUID(),
    kind,
    payload,
    expectedVersion,
    status: "local",
    attempts: 0,
    createdAt: Date.now(),
    seq: nextSeq(),
  };
  await (await db()).put("outbox", item);
  emit();
  return item;
}

/** Session an item belongs to: "session:start" carries `id`, the rest carry `sessionId`.
 *  "update:sessions" edits the session row itself, so it carries `id` too. */
export function sessionOf(item: Pick<OutboxItem, "kind" | "payload">): string | undefined {
  const p = item.payload as { sessionId?: string; id?: string } | null;
  if (item.kind === "update:sessions") return p?.id;
  return p?.sessionId ?? (item.kind.startsWith("session:") ? p?.id : undefined);
}

export async function listItems(accountId: string): Promise<OutboxItem[]> {
  const all = (await (await db()).getAllFromIndex("outbox", "account", accountId)) as OutboxItem[];
  return all.sort((a, b) => orderOf(a) - orderOf(b));
}

export async function unsyncedCount(accountId: string) {
  return (await listItems(accountId)).filter((i) => i.status !== "synced").length;
}

let draining = false;

/** Send pending items in order. Safe to call repeatedly; one drain at a time. */
export async function drain(accountId: string, send: (item: OutboxItem) => Promise<SendResult>) {
  if (draining) return;
  draining = true;
  try {
    const d = await db();
    const blocked = new Set<string>();
    for (const item of await listItems(accountId)) {
      if (item.status === "synced" || item.accountId !== accountId) continue;
      const sid = sessionOf(item);
      // Keep per-session order: nothing later for a session syncs ahead of an earlier unsent item.
      if (item.status !== "local") {
        if (sid) blocked.add(sid);
        continue;
      }
      if (sid && blocked.has(sid)) continue;
      const res = await send(item).catch(
        (e: unknown): SendResult => ({ ok: false, reason: "retry", message: String(e) }),
      );
      if (!res.ok && sid) blocked.add(sid);
      if (res.ok) {
        await d.put("outbox", { ...item, status: "synced", syncedAt: Date.now(), error: undefined });
      } else if (res.reason === "offline") {
        break;
      } else if (res.reason === "not_stored") {
        // Server reachable but no durable storage yet: stay local, don't burn retries.
        continue;
      } else {
        const attempts = item.attempts + 1;
        const status: OutboxStatus =
          res.reason === "conflict"
            ? "conflict"
            : res.reason === "permanent" || attempts >= MAX_ATTEMPTS
              ? "failed"
              : "local";
        await d.put("outbox", { ...item, attempts, status, error: res.message });
      }
      emit();
    }
  } finally {
    draining = false;
  }
}

export async function retryItem(localId: string) {
  const d = await db();
  const item = (await d.get("outbox", localId)) as OutboxItem | undefined;
  if (item) {
    await d.put("outbox", { ...item, status: "local", attempts: 0 });
    emit();
  }
}

/** Put this account's failed/conflict items back in the queue. */
export async function retryAccount(accountId: string) {
  const d = await db();
  let changed = false;
  for (const item of await listItems(accountId)) {
    if (item.status === "failed" || item.status === "conflict") {
      await d.put("outbox", { ...item, status: "local", attempts: 0, error: undefined });
      changed = true;
    }
  }
  if (changed) emit();
}

/** Sign-out / account switch: never let another account replay this outbox. */
export async function clearAccount(accountId: string) {
  const d = await db();
  for (const item of await listItems(accountId)) await d.delete("outbox", item.localId);
  emit();
}

export async function saveDraft(key: string, value: unknown) {
  await (await db()).put("drafts", { key, value, savedAt: Date.now() });
}

export async function loadDraft<T>(key: string): Promise<T | undefined> {
  const row = (await (await db()).get("drafts", key)) as { value: T } | undefined;
  return row?.value;
}

export async function deleteDraft(key: string) {
  await (await db()).delete("drafts", key);
}

export async function listDraftKeys(): Promise<string[]> {
  return (await (await db()).getAllKeys("drafts")).map(String);
}
