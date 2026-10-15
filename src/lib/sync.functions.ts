import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ONBOARDING_KIND, validateOnboardingPayload } from "./onboarding";
import { SESSION_FINISH, SESSION_START, SET_LOG, SET_LOG_DELETE } from "./workout";

/**
 * Outbox sync endpoint. Returns stored:true only when the write is durably saved.
 * Kinds without real storage yet (e.g. set logs before the workout slice) return
 * stored:false, so the device keeps showing "Saved on this device".
 */
export const syncOutboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { idempotencyKey: string; kind: string; payload: unknown; expectedVersion?: number | null }) => {
      if (typeof input?.idempotencyKey !== "string" || input.idempotencyKey.length < 8) {
        throw new Error("idempotencyKey required");
      }
      if (typeof input.kind !== "string") throw new Error("kind required");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    let stored = false;
    const { supabase: sb, userId } = context;
    if (data.kind === ONBOARDING_KIND) {
      const payload = validateOnboardingPayload(data.payload);
      if (typeof data.expectedVersion !== "number") throw new Error("400 version required");
      const { storeOnboarding } = await import("./onboarding.server");
      await storeOnboarding(sb, userId, data.idempotencyKey, data.expectedVersion, payload);
      stored = true;
    } else if ([SESSION_START, SET_LOG, SET_LOG_DELETE, SESSION_FINISH].includes(data.kind)) {
      const w = await import("./workout.server");
      if (data.kind === SESSION_START) await w.storeSessionStart(sb, userId, data.idempotencyKey, data.payload);
      if (data.kind === SET_LOG) await w.storeSetLog(sb, userId, data.idempotencyKey, data.payload);
      if (data.kind === SET_LOG_DELETE) await w.deleteSetLog(sb, userId, data.payload);
      if (data.kind === SESSION_FINISH) {
        if (typeof data.expectedVersion !== "number") throw new Error("400 version required");
        await w.storeSessionFinish(sb, userId, data.idempotencyKey, data.expectedVersion, data.payload);
      }
      stored = true;
    }
    return {
      ack: true as const,
      stored,
      idempotencyKey: data.idempotencyKey,
      accountId: context.userId,
      receivedAt: new Date().toISOString(),
    };
  });
