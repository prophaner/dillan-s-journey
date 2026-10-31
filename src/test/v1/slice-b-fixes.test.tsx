// Regression tests for the Slice B review fixes that need a stubbed Supabase client or a
// React Query harness (log out scope, idempotent template create, optimistic profile saves,
// reduced-motion press, request time formatting).
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiForTests } from "@/v1/data/client";
import { createMockApi } from "@/v1/data/mock-api";
import { seedMockDb } from "@/v1/data/mock-fixtures";
import { qk, useUpdateProfile } from "@/v1/data/queries";
import type { Profile } from "@/v1/data/api";
import { formatClock } from "@/v1/ui/timezones";

const sb = vi.hoisted(() => {
  const results: Array<{ data: unknown; error: unknown }> = [];
  const inserts: unknown[] = [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    insert: (row: unknown) => {
      inserts.push(row);
      return builder;
    },
    select: chain,
    eq: chain,
    is: chain,
    single: async () => results.shift(),
    maybeSingle: async () => results.shift(),
  });
  return {
    results,
    inserts,
    signOut: vi.fn(async (_o?: unknown) => ({ error: null })),
    client: {
      auth: { signOut: (o?: unknown) => sb.signOut(o) },
      removeAllChannels: async () => [],
      from: () => builder,
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: sb.client }));

afterEach(() => {
  setApiForTests(null);
  sb.signOut.mockClear();
  sb.results.length = 0;
  sb.inserts.length = 0;
});

describe("Supabase api", () => {
  it("Log out ends only this device's session; 'everywhere' is explicit", async () => {
    const { createSupabaseApi } = await import("@/v1/data/supabase-api");
    const api = createSupabaseApi();
    await api.auth.signOut();
    expect(sb.signOut).toHaveBeenLastCalledWith({ scope: "local" });
    await api.auth.signOut({ everywhere: true });
    expect(sb.signOut).toHaveBeenLastCalledWith({ scope: "global" });
  });

  it("template create sends the client id; a duplicate-key retry returns the saved row", async () => {
    const { createSupabaseApi } = await import("@/v1/data/supabase-api");
    const api = createSupabaseApi();
    const saved = { id: "t1", name: "Legs", blocks: [], revision: 1, deleted_at: null };
    sb.results.push(
      { data: null, error: { code: "23505", message: "duplicate key value" } },
      { data: saved, error: null },
    );
    const t = await api.templates.create({ name: "Legs", blocks: [] }, "t1");
    expect(sb.inserts[0]).toMatchObject({ id: "t1", name: "Legs" });
    expect(t).toEqual(saved);
  });
});

describe("profile saves (weekly goal stepper)", () => {
  it("rapid taps build on each other and end at the last value", async () => {
    const api = createMockApi({ storage: null, db: seedMockDb() });
    await api.auth.verifyOtp("email", "luis@example.com", "123456");
    const real = api.profile.update.bind(api.profile);
    // a slow network: each save takes a while, and they would race without serialization
    api.profile.update = (patch) =>
      new Promise<Profile>((resolve, reject) =>
        setTimeout(() => real(patch).then(resolve, reject), 20),
      );
    setApiForTests(api);
    const qc = new QueryClient();
    const p0 = await api.profile.get();
    qc.setQueryData(qk.profile(p0.id), p0);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateProfile(p0.id), { wrapper });
    const goal = () => qc.getQueryData<Profile>(qk.profile(p0.id))!.weekly_goal;
    act(() => result.current.mutate({ weekly_goal: goal() + 1 }));
    act(() => result.current.mutate({ weekly_goal: goal() + 1 }));
    act(() => result.current.mutate({ weekly_goal: goal() + 1 }));
    expect(goal()).toBe(p0.weekly_goal + 3); // shown at once
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(goal()).toBe(p0.weekly_goal + 3);
    expect((await api.profile.get()).weekly_goal).toBe(p0.weekly_goal + 3);
  });
});

describe("reduced motion (acceptance 37)", () => {
  it("the press utility drops its transition under prefers-reduced-motion", () => {
    const css = readFileSync(path.resolve(__dirname, "../../styles.css"), "utf8");
    const press = css.slice(css.indexOf("@utility press"), css.indexOf("/* Spot drop"));
    expect(press).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*transition: none;/);
  });
});

describe("approve screen request time", () => {
  it("formats h:mm a in the user's timezone", () => {
    expect(formatClock("2026-10-31T01:29:00Z", "America/New_York")).toBe("9:29 PM");
    expect(formatClock("not a date")).toBe("");
  });
});
