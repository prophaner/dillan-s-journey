import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rewriteUnsent, type OutboxItem } from "./outbox";
import { localUnits, mergePatch, unitsOf, type RowUpdatePayload, type Units } from "./profile";

export const profileKey = (uid: string) => ["profile", uid] as const;

export function useProfileRow(uid: string) {
  return useQuery({
    queryKey: profileKey(uid),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Units to show: this device's unsent choice, else the stored one, else lb/in. Display only. */
export function useUnits(uid: string, items: OutboxItem[]): Units {
  const p = useProfileRow(uid);
  return localUnits(items, unitsOf(p.data));
}

/**
 * Queue a versioned update. A second change to a row whose first change hasn't left this
 * device is merged into it, so both go with the version that was read (no self-conflict).
 */
export async function queueRowUpdate(
  uid: string,
  add: (kind: string, payload: unknown, v: number | null) => Promise<unknown>,
  kind: string,
  row: { id: string; version: number },
  patch: Record<string, unknown>,
  kick: () => void,
) {
  const n = await rewriteUnsent(uid, (i) =>
    i.kind === kind && i.status === "local" && (i.payload as RowUpdatePayload).id === row.id
      ? { ...i, payload: { id: row.id, patch: mergePatch((i.payload as RowUpdatePayload).patch, patch) } }
      : null);
  if (n) kick();
  else await add(kind, { id: row.id, patch } satisfies RowUpdatePayload, row.version);
}
