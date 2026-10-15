import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { drain, enqueue, interpretAck, listItems, onOutboxChange, retryAccount, sessionOf, type OutboxItem } from "./outbox";
import { syncOutboxItem } from "./sync.functions";

export type SaveState = "synced" | "local" | "failed";

export function useOutbox(accountId: string | undefined) {
  const send = useServerFn(syncOutboxItem);
  const [items, setItems] = useState<OutboxItem[] | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    setItems(await listItems(accountId));
  }, [accountId]);

  const sendItem = useCallback(async (item: OutboxItem) => {
    if (!navigator.onLine) return { ok: false, reason: "offline" };
    try {
      const res = await send({
        data: {
          idempotencyKey: item.idempotencyKey,
          kind: item.kind,
          payload: item.payload,
          expectedVersion: item.expectedVersion,
        },
      });
      return interpretAck(res, item.idempotencyKey);
    } catch (e) {
      const msg = String(e);
      if (/409|conflict/i.test(msg)) return { ok: false, reason: "conflict", message: msg };
      if (/40[0-4]/.test(msg)) return { ok: false, reason: "permanent", message: msg };
      return { ok: false, reason: navigator.onLine ? "retry" : "offline", message: msg };
    }
  }, [send]);

  const syncNow = useCallback(async () => {
    if (!accountId) return;
    await drain(accountId, sendItem);
  }, [accountId, sendItem]);

  /** Retry button: put failed/conflict items back in the queue, then send everything. */
  const retryNow = useCallback(async () => {
    if (!accountId) return;
    await retryAccount(accountId);
    await drain(accountId, sendItem);
  }, [accountId, sendItem]);

  useEffect(() => {
    if (!accountId) return;
    void refresh();
    const off = onOutboxChange(() => void refresh());
    const kick = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    kick();
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    const id = window.setInterval(kick, 15000);
    return () => {
      off();
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
      window.clearInterval(id);
    };
  }, [accountId, refresh, syncNow]);

  const add = useCallback(
    async (kind: string, payload: unknown, expectedVersion: number | null = null) => {
      if (!accountId) throw new Error("Not signed in");
      const item = await enqueue(accountId, kind, payload, expectedVersion);
      void syncNow();
      return item;
    },
    [accountId, syncNow],
  );

  const loaded = items !== undefined;
  const list = items ?? [];
  const pending = list.filter((i) => i.status === "local").length;
  const failed = list.filter((i) => i.status === "failed" || i.status === "conflict").length;
  const state: SaveState = failed > 0 ? "failed" : pending > 0 ? "local" : "synced";

  return { items: list, loaded, add, syncNow, retryNow, pending, failed, state };
}

/** A session is "synced" only when every logged set key has a synced outbox item and nothing else is waiting. */
export function sessionSaveState(items: OutboxItem[], sessionId: string, logKeys: string[]) {
  const mine = items.filter((i) => sessionOf(i) === sessionId);
  const unsynced = mine.filter((i) => i.status !== "synced");
  const synced = new Set(mine.filter((i) => i.status === "synced").map((i) => i.idempotencyKey));
  const state: SaveState = mine.some((i) => i.status === "failed" || i.status === "conflict")
    ? "failed"
    : unsynced.length === 0 && logKeys.every((k) => synced.has(k)) ? "synced" : "local";
  return { state, unsynced: unsynced.length };
}
