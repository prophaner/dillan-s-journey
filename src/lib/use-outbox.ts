import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { drain, enqueue, listItems, onOutboxChange, type OutboxItem } from "./outbox";
import { syncOutboxItem } from "./sync.functions";

export type SaveState = "synced" | "local" | "failed";

export function useOutbox(accountId: string | undefined) {
  const send = useServerFn(syncOutboxItem);
  const [items, setItems] = useState<OutboxItem[]>([]);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    setItems(await listItems(accountId));
  }, [accountId]);

  const syncNow = useCallback(async () => {
    if (!accountId) return;
    await drain(accountId, async (item) => {
      if (!navigator.onLine) return { ok: false, reason: "offline" };
      try {
        const res = await send({
          data: { idempotencyKey: item.idempotencyKey, kind: item.kind, payload: item.payload },
        });
        return res.ack && res.idempotencyKey === item.idempotencyKey
          ? { ok: true }
          : { ok: false, reason: "retry" };
      } catch (e) {
        const msg = String(e);
        if (/409|conflict/i.test(msg)) return { ok: false, reason: "conflict", message: msg };
        if (/40[0-4]/.test(msg)) return { ok: false, reason: "permanent", message: msg };
        return { ok: false, reason: navigator.onLine ? "retry" : "offline", message: msg };
      }
    });
  }, [accountId, send]);

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
    async (kind: string, payload: unknown) => {
      if (!accountId) throw new Error("Not signed in");
      const item = await enqueue(accountId, kind, payload);
      void syncNow();
      return item;
    },
    [accountId, syncNow],
  );

  const pending = items.filter((i) => i.status === "local").length;
  const failed = items.filter((i) => i.status === "failed" || i.status === "conflict").length;
  const state: SaveState = failed > 0 ? "failed" : pending > 0 ? "local" : "synced";

  return { items, add, syncNow, pending, failed, state };
}
