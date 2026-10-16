import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateMeasurement } from "./measurements";

/**
 * Store one measurement. The client-made id is the idempotency key for this row:
 * a replay hits the same primary key and is ignored, so retries never duplicate.
 */
export async function storeMeasurement(sb: SupabaseClient<Database>, userId: string, key: string, raw: unknown) {
  const m = validateMeasurement(raw);
  const { error } = await sb.from("measurements").upsert({
    id: m.id, owner_id: userId, type: m.type, site: m.site, side: m.side,
    value: m.value, unit: m.unit, entered_value: m.enteredValue, method: m.method,
    observed_at: m.observedAt, source: "user",
    provenance: { idempotency_key: key, conditions: m.conditions, entered_in: "app" },
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`retry: measurement insert: ${error.message}`);
  const { data, error: rErr } = await sb.from("measurements").select("id").eq("id", m.id).eq("owner_id", userId).maybeSingle();
  if (rErr || !data) throw new Error("retry: measurement not stored yet");
}
