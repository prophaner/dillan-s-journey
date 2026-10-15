import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 0 sync endpoint. It authenticates the caller and acknowledges the
 * idempotency key. It does NOT store anything yet: real tables wait for the
 * owner's approval of the schema (docs/phase0-schema.sql).
 */
export const syncOutboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { idempotencyKey: string; kind: string; payload: unknown }) => {
    if (typeof input?.idempotencyKey !== "string" || input.idempotencyKey.length < 8) {
      throw new Error("idempotencyKey required");
    }
    if (typeof input.kind !== "string") throw new Error("kind required");
    return input;
  })
  .handler(async ({ data, context }) => {
    return {
      ack: true as const,
      idempotencyKey: data.idempotencyKey,
      accountId: context.userId,
      receivedAt: new Date().toISOString(),
    };
  });
