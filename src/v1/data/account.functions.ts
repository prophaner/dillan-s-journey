// S15 "Delete account" (dev-brief: account deletion removes owned app data). Runs on the server:
// first delete_my_v1_data() as the caller (it refuses a paired TV session), then the auth user via
// the service-role admin API. Every V1 table and the Phase-0 profile reference auth.users with
// on delete cascade, so the profile, parked brief-v2 rows and contacts go with it.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase: sb, userId } = context;
    const { data, error } = await sb.rpc("delete_my_v1_data");
    if (error) throw new Error("delete_failed");
    const r = data as { ok?: boolean; error?: string } | null;
    if (r?.ok === false) throw new Error(r.error ?? "delete_failed");
    // Load inside the handler so the service-role client never reaches the client bundle.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) throw new Error("delete_failed");
    return { ok: true as const };
  });
