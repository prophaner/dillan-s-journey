import { describe, expect, it } from "vitest";
import { buildUpdate, MissingVersionError } from "@/lib/updates";
import { enqueue } from "@/lib/outbox";

describe("every update carries the version the app read", () => {
  it("building an update without a version fails", () => {
    expect(() => buildUpdate("set_logs", "id-1", { reps: 9 }, undefined)).toThrow(MissingVersionError);
    expect(() => buildUpdate("set_logs", "id-1", { reps: 9 }, null)).toThrow(MissingVersionError);
    expect(() => buildUpdate("set_logs", "id-1", { reps: 9 }, 0)).toThrow(MissingVersionError);
  });
  it("an update with a version includes it in what is sent", () => {
    expect(buildUpdate("set_logs", "id-1", { reps: 9 }, 3).patch).toEqual({ reps: 9, version: 3 });
  });
  it("the outbox refuses an update with no version, before saving anything", async () => {
    await expect(enqueue("acct", "update:set_logs", { id: "id-1", reps: 9 })).rejects.toThrow(MissingVersionError);
  });
});
