import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOCK_FLAG_KEY, mockRequested } from "@/v1/data/client";
import { createMockApi } from "@/v1/data/mock-api";
import { MOCK_LUIS, MOCK_MAYA, seedMockDb } from "@/v1/data/mock-fixtures";
import { authErrorCode, ingestArgs, isAuthRejection } from "@/v1/data/supabase-api";
import type { HrIngestRequest } from "@/v1/core/hr";
import {
  maskContact,
  normalizeEmail,
  normalizePairingCode,
  normalizePhone,
  RevisionConflictError,
} from "@/v1/data/api";
import type { TemplateBody } from "@/v1/core/types";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("mock backend guard", () => {
  it("is never chosen outside a dev build, even with ?mock=1 or a stored flag", () => {
    const s = memStore();
    s.setItem(MOCK_FLAG_KEY, "1");
    expect(mockRequested(false, "?mock=1", s)).toBe(false);
    expect(mockRequested(false, "", s)).toBe(false);
  });

  it("dev: ?mock=1 turns it on for the tab, ?mock=0 turns it off", () => {
    const s = memStore();
    expect(mockRequested(true, "", s)).toBe(false);
    expect(mockRequested(true, "?mock=1", s)).toBe(true);
    expect(mockRequested(true, "?other=x", s)).toBe(true); // remembered in sessionStorage
    expect(mockRequested(true, "?mock=0", s)).toBe(false);
    expect(mockRequested(true, "", s)).toBe(false);
  });

  it("imports the mock module only inside the import.meta.env.DEV branch", () => {
    const src = readFileSync(path.resolve(__dirname, "../../v1/data/client.ts"), "utf8");
    expect(src).not.toMatch(/^import .*mock-api/m);
    const devBranch = src.indexOf("if (import.meta.env.DEV)");
    const dynImport = src.indexOf('import("./mock-api")');
    expect(devBranch).toBeGreaterThan(-1);
    expect(dynImport).toBeGreaterThan(devBranch);
    // no other module may import the mock directly
    const shell = readFileSync(
      path.resolve(__dirname, "../../components/dillan/mock-badge.tsx"),
      "utf8",
    );
    expect(shell).not.toMatch(/mock-api/);
  });
});

describe("contact and code normalization", () => {
  it("normalizes phones to E.164", () => {
    expect(normalizePhone("+1 (561) 555-0100")).toBe("+15615550100");
    expect(normalizePhone("561 555 0100")).toBe("+15615550100");
    expect(normalizePhone("0044 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+0123456789")).toBeNull();
  });
  it("validates email RFC-lite", () => {
    expect(normalizeEmail(" Ana@Example.com ")).toBe("ana@example.com");
    expect(normalizeEmail("ana@example")).toBeNull();
  });
  it("normalizes pairing codes like the SQL hash input", () => {
    expect(normalizePairingCode("dln-7rgz")).toBe("DLN-7RGZ");
    expect(normalizePairingCode("7RGZ")).toBe("DLN-7RGZ");
    expect(normalizePairingCode("DLN-7RG0")).toBeNull(); // 0 is not in the alphabet
  });
  it("masks contacts", () => {
    expect(maskContact("luis@example.com")).toBe("lu•••@e•••.com");
    expect(maskContact("+15615550100")).toBe("•••00");
  });
});

describe("Supabase auth error mapping never reveals account existence", () => {
  it("maps a missing SMS provider", () => {
    expect(authErrorCode({ message: "Unsupported phone provider", status: 400 }, "sms")).toBe(
      "sms_not_configured",
    );
    expect(authErrorCode({ code: "phone_provider_disabled" }, "sms")).toBe("sms_not_configured");
  });
  it("maps rate limits, bad codes and network", () => {
    expect(authErrorCode({ code: "over_email_send_rate_limit", status: 429 }, "email")).toBe(
      "rate_limited",
    );
    expect(
      authErrorCode({ code: "otp_expired", message: "Token has expired or is invalid" }, "email"),
    ).toBe("invalid_code");
    expect(
      authErrorCode({ name: "AuthRetryableFetchError", message: "Failed to fetch" }, "email"),
    ).toBe("network");
  });
  it("server-rejected contacts are contact errors, not 'code didn't match'", () => {
    expect(
      authErrorCode(
        {
          code: "email_address_invalid",
          message: 'Email address "a@b.co" is invalid',
          status: 400,
        },
        "email",
      ),
    ).toBe("invalid_contact");
    expect(
      authErrorCode({ message: "Unable to validate email address: invalid format" }, "email"),
    ).toBe("invalid_contact");
    expect(
      authErrorCode(
        { code: "validation_failed", message: "Invalid phone number format (E.164 required)" },
        "sms",
      ),
    ).toBe("invalid_contact");
    // the provider refusing a number is not "SMS isn't set up"
    expect(authErrorCode({ code: "sms_send_failed", message: "Error sending sms" }, "sms")).toBe(
      "invalid_contact",
    );
    // a wrong code is still a wrong code
    expect(authErrorCode({ message: "Token has expired or is invalid" }, "email")).toBe(
      "invalid_code",
    );
  });
});

const body = (name: string): TemplateBody => ({
  name,
  blocks: [
    {
      type: "superset",
      id: "b1",
      rounds: 3,
      rest_s: 90,
      exercises: [
        {
          id: "e1",
          name: "A",
          reps: 8,
          rep_mode: "total",
          weight: null,
          unit: "lb",
          load_basis: null,
          instructions: "",
        },
        {
          id: "e2",
          name: "B",
          reps: 8,
          rep_mode: "total",
          weight: 20,
          unit: "lb",
          load_basis: "per_implement",
          instructions: "",
        },
      ],
    },
  ],
});

async function signedIn(as = "luis@example.com") {
  let t = Date.parse("2026-10-28T15:00:00Z");
  const api = createMockApi({ storage: null, db: seedMockDb(t), now: () => (t += 1000) });
  const r = await api.auth.verifyOtp("email", as, "123456");
  expect(r.ok).toBe(true);
  return api;
}

describe("TV grant check: auth rejections lock the TV", () => {
  it("reads the HTTP status of the response and the PostgREST JWT codes", () => {
    expect(isAuthRejection(401)).toBe(true);
    expect(isAuthRejection(403)).toBe(true);
    expect(isAuthRejection(400, "PGRST301")).toBe(true);
    expect(isAuthRejection(401, "PGRST303")).toBe(true);
    // anything else is "can't tell" (offline, 5xx), not a lock
    expect(isAuthRejection(0)).toBe(false);
    expect(isAuthRejection(500, "XX000")).toBe(false);
  });
});

describe("hr_ingest arguments", () => {
  const base: HrIngestRequest = {
    p_source_id: "11111111-1111-4111-8111-111111111111",
    p_stream_id: "22222222-2222-4222-8222-222222222222",
    p_expected_user_id: "33333333-3333-4333-8333-333333333333",
    p_source_kind: "web_ble",
    p_mode: "live",
    p_connected_at: null,
    p_sensor: null,
    p_claim: false,
    p_samples: [],
  };

  it("passes p_connected_at: null through as null (hr_ingest then keeps the stored value)", () => {
    const args = ingestArgs(base);
    expect(args.p_connected_at).toBeNull();
    // also over the keepalive fetch path, which serializes the same object
    expect(JSON.parse(JSON.stringify(args)).p_connected_at).toBeNull();
  });

  it("passes a known connection time through unchanged", () => {
    const at = "2026-11-01T12:00:00.000Z";
    expect(ingestArgs({ ...base, p_connected_at: at }).p_connected_at).toBe(at);
  });

  it("omits p_source_name / p_platform when absent (SQL defaults them to null)", () => {
    const args = ingestArgs(base);
    expect("p_source_name" in args).toBe(false);
    expect("p_platform" in args).toBe(false);
    const named = ingestArgs({ ...base, p_source_name: "Luis's phone", p_platform: "android" });
    expect(named).toMatchObject({ p_source_name: "Luis's phone", p_platform: "android" });
  });
});

describe("mock api", () => {
  it("auth: 000000 is a wrong code; a new contact needs the name step", async () => {
    const api = createMockApi({ storage: null, db: seedMockDb() });
    expect(await api.auth.verifyOtp("email", "new@example.com", "000000")).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect(await api.auth.getUser()).toBeNull();
    await api.auth.verifyOtp("email", "new@example.com", "111111");
    expect((await api.profile.get()).needs_name).toBe(true);
    const p = await api.profile.update({ display_name: "Ana", complete_name_step: true });
    expect(p.needs_name).toBe(false);
  });

  it("templates: create, update with revision, conflict on a stale revision, soft delete", async () => {
    const api = await signedIn();
    const t = await api.templates.create(body("Arms"));
    expect(t.revision).toBe(1);
    const t2 = await api.templates.update(t.id, body("Arms 2"), 1);
    expect(t2.revision).toBe(2);
    await expect(api.templates.update(t.id, body("Arms 3"), 1)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    await api.templates.remove(t.id, 2);
    expect((await api.templates.list()).some((x) => x.id === t.id)).toBe(false);
    expect((await api.templates.get(t.id))?.deleted_at).not.toBeNull();
  });

  it("templates are private to their owner", async () => {
    const api = await signedIn();
    const names = (await api.templates.list()).map((t) => t.name);
    expect(names).not.toContain("Full Body"); // Maya's
    const db = api.db();
    const mayas = db.templates.find((t) => t.user_id === MOCK_MAYA)!;
    expect(await api.templates.get(mayas.id)).toBeNull();
  });

  it("sessions run the core engine: one unfinished session, idempotent commands, summary at end", async () => {
    const api = await signedIn();
    const [t] = await api.templates.list();
    const s = await api.sessions.start({
      templateId: t!.id,
      liveData: false,
      timezone: "America/New_York",
      commandId: "c1",
    });
    expect(s.ok).toBe(true);
    const again = await api.sessions.start({
      templateId: t!.id,
      liveData: false,
      timezone: "America/New_York",
      commandId: "c2",
    });
    expect(again.error).toBe("session_running");
    const id = s.session!.id;
    const started = await api.sessions.command({
      sessionId: id,
      kind: "start",
      expectedRevision: 1,
      source: "phone",
      commandId: "c3",
    });
    expect(started.session?.state).toBe("active");
    const dup = await api.sessions.command({
      sessionId: id,
      kind: "start",
      expectedRevision: 1,
      source: "phone",
      commandId: "c3",
    });
    expect(dup).toEqual(started);
    const ended = await api.sessions.command({
      sessionId: id,
      kind: "end",
      expectedRevision: 2,
      source: "tv",
      commandId: "c4",
    });
    expect(ended.session?.outcome).toBe("partial");
    expect(await api.sessions.current()).toBeNull();
    const hist = await api.sessions.history();
    expect(hist[0]?.session_id).toBe(id);
    expect(hist[0]?.outcome).toBe("partial");
  });

  it("pairing: a request for another user needs explicit confirmation", async () => {
    const api = await signedIn();
    const p = await api.pairing.preview("dln-maya");
    expect(p).toMatchObject({ ok: true, for_other_user: true, for_name: "Maya" });
    expect(await api.pairing.approve("DLN-MAYA")).toMatchObject({
      ok: false,
      error: "for_other_user",
    });
    expect(await api.pairing.approve("DLN-MAYA", true)).toMatchObject({ ok: true });
    expect(await api.pairing.approve("DLN-MAYA", true)).toMatchObject({
      ok: false,
      error: "already_resolved",
    });
    expect(await api.pairing.preview("DLN-ZZZZ")).toMatchObject({
      ok: false,
      error: "invalid_code",
    });
    expect((await api.devices.list()).every((g) => g.user_id === MOCK_LUIS)).toBe(true);
  });

  it("templates: a create retried with the same client id returns the saved row", async () => {
    const api = await signedIn();
    const before = (await api.templates.list()).length;
    const id = "11111111-1111-4111-8111-111111111111";
    const a = await api.templates.create(body("Legs"), id);
    const b = await api.templates.create(body("Legs"), id);
    expect(a.id).toBe(id);
    expect(b).toEqual(a);
    expect(await api.templates.list()).toHaveLength(before + 1);
  });

  it("pairing preview carries the request time", async () => {
    const api = await signedIn();
    const p = await api.pairing.preview("DLN-7RGZ");
    expect(p.ok && Number.isFinite(Date.parse(p.created_at))).toBe(true);
  });

  it("delete account removes the user and every row they own, and signs out", async () => {
    const api = await signedIn();
    await api.account.deleteAccount();
    expect(await api.auth.getUser()).toBeNull();
    const db = api.db();
    expect(db.users.some((u) => u.id === MOCK_LUIS)).toBe(false);
    expect(db.templates.some((t) => t.user_id === MOCK_LUIS)).toBe(false);
    expect(db.templates.filter((t) => t.user_id === MOCK_MAYA)).toHaveLength(1);
  });

  it("delete my data removes only the caller's rows", async () => {
    const api = await signedIn();
    const r = await api.account.deleteMyData();
    expect(r.templates).toBe(3);
    expect(await api.templates.list()).toEqual([]);
    expect(api.db().templates.filter((t) => t.user_id === MOCK_MAYA)).toHaveLength(1);
  });
});
