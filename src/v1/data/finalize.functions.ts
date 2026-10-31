// Summary finalization (h10-design 5.4, Slice C): computes an ended session's zone totals from its
// stored heart-rate samples with src/v1/core/zones.ts (via core/finalize.ts, the same module the
// live dashboard uses) and saves them with session_hr_finalize. Runs as the caller: the user client
// from requireSupabaseAuth, so RLS limits every read to the caller's own rows and the RPC checks
// ownership again. No service-role access here.
//
// Called by the client that ended the session and by any viewer of the summary/detail while the
// summary is still pending or marked dirty (late samples within the grace window). Idempotent.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { finalizeTotals, needsFinalize } from "@/v1/core/finalize";
import type { StoredSample } from "@/v1/core/hr";
import type { SessionSummaryRow, WorkoutSessionRow } from "@/v1/core/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
/** ~27 h of 1 Hz samples; a session longer than that keeps the rest Unmeasured. */
const MAX_SAMPLES = 100_000;
/** compute + save rounds when samples keep arriving during finalize */
const FINALIZE_ATTEMPTS = 3;

export const finalizeSessionHr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { sessionId: string }) => {
    if (typeof input?.sessionId !== "string" || !UUID.test(input.sessionId))
      throw new Error("invalid_session_id");
    return { sessionId: input.sessionId };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const id = data.sessionId;

    const sum = await sb.from("session_summaries").select("*").eq("session_id", id).maybeSingle();
    if (sum.error) throw new Error("finalize_read_failed");
    const summary = sum.data as unknown as SessionSummaryRow | null;
    if (!summary || !needsFinalize(summary)) return { summary };

    const ses = await sb.from("workout_sessions").select("*").eq("id", id).maybeSingle();
    if (ses.error) throw new Error("finalize_read_failed");
    const row = ses.data as unknown as WorkoutSessionRow | null;
    if (!row) return { summary };

    const table = row.is_demo ? "hr_demo_samples" : "hr_samples";
    // session_hr_finalize clears hr_finalize_dirty unconditionally, so a late sample stored
    // between our read and the RPC would be lost (nothing marks it dirty again). After saving,
    // recount the samples; if more arrived than we read, compute and save again.
    let latest: SessionSummaryRow = summary;
    for (let attempt = 0; attempt < FINALIZE_ATTEMPTS; attempt++) {
      const samples: StoredSample[] = [];
      const sources = new Set<string>();
      for (let from = 0; from < MAX_SAMPLES; from += PAGE) {
        const page = await sb
          .from(table)
          .select("stream_id, seq, measured_at, bpm, contact, is_demo, source_id")
          .eq("session_id", id)
          .order("measured_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (page.error) throw new Error("finalize_read_failed");
        for (const r of page.data ?? []) {
          samples.push({
            stream_id: r.stream_id,
            seq: r.seq,
            measured_at: Date.parse(r.measured_at),
            bpm: r.bpm,
            contact: r.contact,
            is_demo: r.is_demo,
          });
          sources.add(r.source_id);
        }
        if ((page.data?.length ?? 0) < PAGE) break;
      }

      const totals = finalizeTotals(row, samples, summary.active_ms);
      if (!totals) return { summary: latest };

      let names: string[] = [];
      if (sources.size) {
        const src = await sb
          .from("hr_sources")
          .select("id, display_name")
          .in("id", [...sources]);
        names = (src.data ?? []).map((s) => s.display_name);
      }

      const res = await sb.rpc("session_hr_finalize", {
        p_session_id: id,
        p_zone_ms: totals.zone_ms,
        p_unmeasured_ms: totals.unmeasured_ms,
        p_algorithm_version: totals.algorithm_version,
        p_sources_used: names,
      });
      if (res.error) throw new Error("finalize_failed");
      const out = res.data as { ok?: boolean; error?: string; summary?: SessionSummaryRow } | null;
      if (!out?.ok) throw new Error(out?.error ?? "finalize_failed");
      latest = out.summary ?? latest;
      if (samples.length >= MAX_SAMPLES) break;
      const count = await sb
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("session_id", id);
      if (count.error || (count.count ?? 0) <= samples.length) break;
    }
    return { summary: latest };
  });
