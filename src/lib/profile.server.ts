import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { joinContext, splitContext, validateEquipmentAdd, validateRowUpdate, type ProfileTable, type Units } from "./profile";

type SB = SupabaseClient<Database>;
const isConflict = (e: { code?: string; message: string }) => e.code === "40001" || /version conflict/i.test(e.message);

/**
 * One versioned update to a profile, equipment or limitation row (as the user; RLS applies).
 * A version mismatch is a 409 unless the row already holds exactly this change (a replay).
 */
export async function storeRowUpdate(sb: SB, userId: string, table: ProfileTable, version: number, raw: unknown) {
  const { id, patch } = validateRowUpdate(table, raw);
  if (table === "profiles" && id !== userId) throw new Error("400 not your profile");
  const ownerCol = table === "profiles" ? "id" : "owner_id";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = () => (sb.from(table) as any);
  const { data: cur, error: rErr } = await q().select("*").eq("id", id).eq(ownerCol, userId).maybeSingle();
  if (rErr) throw new Error(`retry: read: ${rErr.message}`);
  if (!cur) throw new Error("400 row not found");

  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "units") {
      const u = v as Units;
      row["preferences"] = { ...((cur.preferences as Record<string, Json>) ?? {}), units: u as unknown as Json } as Json;
      row["weight_unit"] = u.weight;
      row["length_unit"] = u.length;
    } else if (k === "archived") {
      row["archived_at"] = v ? new Date().toISOString() : null;
      if (table === "limitations") row["status"] = v ? "archived" : (patch["status"] ?? "pending");
    } else if (k === "note") {
      row["context"] = joinContext(splitContext(cur.context as string | null).prefix, (v as string).trim());
    } else row[k] = v;
  }
  const already = Object.entries(row).every(([k, v]) =>
    k === "archived_at" ? (v === null) === (cur.archived_at === null) : JSON.stringify(cur[k]) === JSON.stringify(v));
  if (cur.version !== version) {
    if (already) return; // replay of a change that is already stored
    throw new Error(`409 conflict: ${table} changed elsewhere`);
  }
  const { data, error } = await q().update({ ...row, version }).eq("id", id).eq(ownerCol, userId).select("id");
  if (error) {
    if (isConflict(error)) throw new Error(`409 conflict: ${table} changed elsewhere`);
    throw new Error(`retry: ${error.message}`);
  }
  if (!data?.length) throw new Error("retry: not updated");
}

/** New equipment, idempotent on (owner, key). The id is made on the device so offline edits can follow. */
export async function storeEquipmentAdd(sb: SB, userId: string, key: string, raw: unknown) {
  const p = validateEquipmentAdd(raw);
  const { error } = await sb.from("equipment_items").upsert({
    id: p.id, owner_id: userId, type: p.type || "other", label: p.label, detail: p.detail, quantity: p.quantity,
    available: p.available, source: "user", idempotency_key: key,
  }, { onConflict: "owner_id,idempotency_key", ignoreDuplicates: true });
  if (error) throw new Error(`retry: ${error.message}`);
  const { data } = await sb.from("equipment_items").select("id").eq("owner_id", userId).eq("idempotency_key", key).maybeSingle();
  if (!data) throw new Error("retry: equipment not stored yet");
}
