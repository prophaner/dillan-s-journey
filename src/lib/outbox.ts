import { openDB, type IDBPDatabase } from "idb";
import { assertVersion, isUpdateKind } from "./updates";
import { hasCard } from "./conflicts";

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
    }).then(async (d) => {
      // Seed from what is already stored so a fresh page never issues a seq below an older item's.
      for (const k of await d.getAllKeys("outbox")) {
        const row = (await d.get("outbox", k)) as OutboxItem | undefined;
        if (row) lastSeq = Math.max(lastSeq, orderOf(row));
      }
      return d;
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
  const store = await db(); // opening seeds lastSeq before the first nextSeq()
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
  await store.put("outbox", item);
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
let sendingId: string | null = null;
/** A discard waits this long before it is sent, so "Undo" can take it back while it's still local. */
export const DISCARD_HOLD_MS = 8000;

/** Send pending items in order. Safe to call repeatedly; one drain at a time. */
export async function drain(accountId: string, send: (item: OutboxItem) => Promise<SendResult>, opts: { discardHoldMs?: number } = {}) {
  const hold = opts.discardHoldMs ?? DISCARD_HOLD_MS;
  if (draining) return;
  draining = true;
  try {
    const d = await db();
    const blocked = new Set<string>();
    const items = await listItems(accountId);
    // A session started on a routine version that isn't stored yet waits behind that save.
    const unsentSaves = new Set(items.filter((i) => i.kind === "routine:save_version" && i.status !== "synced")
      .map((i) => (i.payload as { id?: string } | null)?.id).filter((x): x is string => !!x));
    for (const item of items) {
      if (item.status === "synced" || item.accountId !== accountId) continue;
      const sid = sessionOf(item);
      // Keep per-session order: nothing later for a session syncs ahead of an earlier unsent item.
      if (item.status !== "local") {
        if (sid) blocked.add(sid);
        continue;
      }
      if (sid && blocked.has(sid)) continue;
      if (item.kind === "session:start") {
        const tv = (item.payload as { snapshot?: { templateVersionId?: string } } | null)?.snapshot?.templateVersionId;
        if (tv && unsentSaves.has(tv)) { if (sid) blocked.add(sid); continue; }
      }
      if (item.kind === "delete:sessions" && Date.now() - item.createdAt < hold) {
        if (sid) blocked.add(sid);
        continue;
      }
      // Re-read right before sending: an Undo may have removed it, or another path changed it.
      const fresh = (await d.get("outbox", item.localId)) as OutboxItem | undefined;
      if (!fresh || fresh.status !== "local") continue;
      sendingId = item.localId;
      const res = await send(item).catch(
        (e: unknown): SendResult => ({ ok: false, reason: "retry", message: String(e) }),
      ).finally(() => { sendingId = null; });
      if (!res.ok && sid) blocked.add(sid);
      if (res.ok) {
        await d.put("outbox", { ...item, status: "synced", syncedAt: Date.now(), error: undefined });
        if (item.kind === "routine:save_version") unsentSaves.delete((item.payload as { id?: string } | null)?.id ?? "");
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

/** True while this item is mid-send (an Undo can no longer take it back). */
export const isSending = (localId: string) => sendingId === localId;

/** Take back an item that hasn't left this device. False if it is being sent or already sent. */
export async function removeIfLocal(localId: string): Promise<boolean> {
  if (sendingId === localId) return false;
  const d = await db();
  const item = (await d.get("outbox", localId)) as OutboxItem | undefined;
  // A drain may have started sending it while we were reading.
  if (!item || item.status === "synced" || sendingId === localId) return false;
  await d.delete("outbox", localId);
  emit();
  return true;
}

/** Put this account's failed items back in the queue. Conflicts with a card stay put (the card resolves them); conflicts without one are requeued. */
export async function retryAccount(accountId: string) {
  const d = await db();
  let changed = false;
  for (const item of await listItems(accountId)) {
    if (item.status === "failed" || (item.status === "conflict" && !hasCard(item.kind))) {
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
