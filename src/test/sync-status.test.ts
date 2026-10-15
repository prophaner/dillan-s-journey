import { describe, expect, it } from "vitest";
import { interpretAck } from "@/lib/outbox";

describe('"Synced" only after the server durably stored the write', () => {
  it("an ack without storage stays Saved on this device", () => {
    expect(interpretAck({ ack: true, stored: false, idempotencyKey: "k-123456" }, "k-123456")).toEqual({
      ok: false,
      reason: "not_stored",
    });
  });
  it("an ack missing the stored flag is not Synced", () => {
    expect(interpretAck({ ack: true, idempotencyKey: "k-123456" }, "k-123456").ok).toBe(false);
  });
  it("a durable ack for the same key is Synced", () => {
    expect(interpretAck({ ack: true, stored: true, idempotencyKey: "k-123456" }, "k-123456")).toEqual({ ok: true });
  });
  it("a durable ack for a different key is not Synced", () => {
    expect(interpretAck({ ack: true, stored: true, idempotencyKey: "other-key" }, "k-123456").ok).toBe(false);
  });
});
