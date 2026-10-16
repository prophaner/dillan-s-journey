import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MEASUREMENT_ADD } from "./measurements";
import { INSERT_EQUIPMENT, PROFILE_UPDATE_KINDS, tableOfUpdate } from "./profile";
import { GOAL_LEVEL, ROUTINE_SAVE } from "./plan";
import { ONBOARDING_KIND, validateOnboardingPayload } from "./onboarding";
import { SESSION_DISCARD, SESSION_FINISH, SESSION_START, SET_LOG, SET_LOG_DELETE, SET_LOG_EDIT, SESSION_OFF_REPORT } from "./workout";

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
    } else if (data.kind === GOAL_LEVEL) {
      if (typeof data.expectedVersion !== "number") throw new Error("400 version required");
      const { storeGoalLevel } = await import("./plan.server");
      await storeGoalLevel(sb, userId, data.expectedVersion, data.payload);
      stored = true;
    } else if (data.kind === ROUTINE_SAVE) {
      const { storeRoutineVersion } = await import("./plan.server");
      await storeRoutineVersion(sb, userId, data.idempotencyKey, data.payload);
      stored = true;
    } else if ((PROFILE_UPDATE_KINDS as readonly string[]).includes(data.kind)) {
      if (typeof data.expectedVersion !== "number") throw new Error("400 version required");
      const { storeRowUpdate } = await import("./profile.server");
      await storeRowUpdate(sb, userId, tableOfUpdate(data.kind), data.expectedVersion, data.payload);
      stored = true;
    } else if (data.kind === INSERT_EQUIPMENT) {
      const { storeEquipmentAdd } = await import("./profile.server");
      await storeEquipmentAdd(sb, userId, data.idempotencyKey, data.payload);
      stored = true;
    } else if (data.kind === MEASUREMENT_ADD) {
      const { storeMeasurement } = await import("./measurements.server");
      await storeMeasurement(sb, userId, data.idempotencyKey, data.payload);
      stored = true;
    } else if ([SESSION_START, SET_LOG, SET_LOG_DELETE, SESSION_FINISH, SET_LOG_EDIT, SESSION_DISCARD, SESSION_OFF_REPORT].includes(data.kind)) {
      const w = await import("./workout.server");
      if (data.kind === SESSION_START) await w.storeSessionStart(sb, userId, data.idempotencyKey, data.payload);
      if (data.kind === SET_LOG) await w.storeSetLog(sb, userId, data.idempotencyKey, data.payload);
      if (data.kind === SET_LOG_DELETE) await w.deleteSetLog(sb, userId, data.payload);
      if (data.kind === SESSION_OFF_REPORT) await w.storeOffReport(sb, userId, data.idempotencyKey, data.payload);
      if (data.kind === SESSION_DISCARD) await w.discardSession(sb, userId, data.payload);
      if (data.kind === SET_LOG_EDIT) {
        if (typeof data.expectedVersion !== "number") throw new Error("400 version required");
        await w.storeSetEdit(sb, userId, data.expectedVersion, data.payload);
      }
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
