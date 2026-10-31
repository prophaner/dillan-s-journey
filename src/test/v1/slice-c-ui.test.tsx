// Slice C screens: Home metrics, Calendar dots / notes indicator / future days, recovery redirect
// after reload, choose empty state, and summary finalization.

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setApiForTests } from "@/v1/data/client";
import { createMockApi } from "@/v1/data/mock-api";
import { MOCK_LUIS, seedMockDb } from "@/v1/data/mock-fixtures";
import type { HistoryItem } from "@/v1/data/api";
import { finalizeTotals } from "@/v1/core/finalize";
import { UserProvider } from "@/v1/ui/user-context";
import { ToastProvider } from "@/components/dillan/overlays";
import { Progress, HOME_COPY } from "@/v1/ui/home-page";
import { CalendarPage, CALENDAR_COPY } from "@/v1/ui/calendar-page";
import { AppStart, resetRecoveryForTests } from "@/v1/ui/app-start";
import { ChoosePage, CHOOSE_COPY } from "@/v1/ui/choose-page";
import { serverClockFor } from "@/v1/session/server-clock";

type Api = ReturnType<typeof createMockApi>;
let api: Api;
// Wed 14 Oct 2026 12:00 in New York (16:00 UTC): seeded sessions land on Oct 11, Oct 5, Sep 28.
const NOW = Date.UTC(2026, 9, 14, 16, 0, 0);

beforeEach(async () => {
  localStorage.clear();
  resetRecoveryForTests();
  api = createMockApi({
    storage: null,
    db: seedMockDb(NOW),
    now: () => NOW,
    hrMode: () => "off",
  });
  await api.auth.verifyOtp("email", "luis@example.com", "123456");
  setApiForTests(api);
  await serverClockFor(api.hr).sample();
});

afterEach(() => {
  cleanup();
  setApiForTests(null);
  localStorage.clear();
});

function harness(paths: Record<string, () => ReactNode>, initial: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = { id: MOCK_LUIS, email: "luis@example.com", phone: null };
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <UserProvider user={user}>
            <Outlet />
          </UserProvider>
        </ToastProvider>
      </QueryClientProvider>
    ),
  });
  const routes = Object.entries(paths).map(([path, C]) =>
    createRoute({ getParentRoute: () => root, path, component: () => <>{C()}</> }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initial] }),
  }) as AnyRouter;
  render(<RouterProvider router={router} />);
  return router;
}

const base: HistoryItem = {
  session_id: "s",
  user_id: MOCK_LUIS,
  outcome: "completed",
  started_at: "",
  ended_at: "",
  start_timezone: "America/New_York",
  local_date: "",
  active_ms: 30 * 60_000,
  elapsed_ms: 30 * 60_000,
  paused_ms: 0,
  zone_ms: [0, 0, 0, 0, 0],
  measured_ms: 0,
  unmeasured_ms: 0,
  coverage: 0,
  algorithm_version: 1,
  zone_snapshot: null,
  hr_status: "no_live_data",
  hr_finalize_dirty: false,
  hr_sources_used: [],
  finalized_at: null,
  created_at: "",
  name: "Upper Body A",
  template_id: null,
  has_note: false,
};
const item = (id: string, iso: string, o: Partial<HistoryItem> = {}): HistoryItem => ({
  ...base,
  session_id: id,
  started_at: iso,
  ended_at: iso,
  ...o,
});

describe("S04 Home metrics", () => {
  it("counts completed toward the goal, shows ended-early separately, compares to last week", () => {
    const items = [
      // this week (Mon 12 Oct .. Sun 18 Oct, New York)
      item("a", "2026-10-12T14:00:00Z"),
      item("b", "2026-10-13T23:00:00Z", { outcome: "partial", active_ms: 12 * 60_000 }),
      item("c", "2026-10-14T13:00:00Z"),
      // last week: one before "this point" (Wed 12:00), one after
      item("d", "2026-10-06T14:00:00Z"),
      item("e", "2026-10-09T14:00:00Z"),
    ];
    harness(
      {
        "/": () => <Progress items={items} now={NOW} tz="America/New_York" goal={3} hasTemplates />,
      },
      "/",
    );
    return waitFor(() => {
      expect(screen.getByTestId("week-count")).toHaveTextContent(
        "2 of 3 sessions · +1 ended early",
      );
      expect(screen.getByText("1 more than this point last week")).toBeInTheDocument();
      // 30 + 12 + 30 minutes this week; the ended-early minutes are called out
      expect(screen.getByTestId("week-minutes")).toHaveTextContent("72");
      expect(screen.getByText("Includes 12 min from ended-early sessions")).toBeInTheDocument();
      expect(screen.getByText(HOME_COPY.vsLastWeek)).toBeInTheDocument();
      const trend = screen.getByRole("list", { name: HOME_COPY.trend });
      const bars = within(trend).getAllByRole("listitem");
      expect(bars).toHaveLength(4);
      expect(bars[3]).toHaveAccessibleName(/2 completed, 1 ended early \(this week\)/);
      expect(bars[2]).toHaveAccessibleName(/2 completed/);
    });
  });

  it("shows the empty state with zero sessions", async () => {
    harness(
      {
        "/": () => <Progress items={[]} now={NOW} tz="UTC" goal={3} hasTemplates={false} />,
      },
      "/",
    );
    expect(await screen.findByText(HOME_COPY.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(HOME_COPY.emptyBody)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: HOME_COPY.createFirst })).toBeInTheDocument();
  });
});

describe("S12 Calendar", () => {
  it("solid dot for completed, hollow for ended early, pencil for a note; future days inert", async () => {
    harness({ "/calendar": () => <CalendarPage month="2026-10" /> }, "/calendar");
    const done = await screen.findByRole("button", {
      name: /Sunday, October 11, 1 session, has a note/,
    });
    expect(done.querySelector('[data-mark="completed"]')).not.toBeNull();
    expect(done.querySelector('[data-mark="note"]')).not.toBeNull();
    const early = screen.getByRole("button", { name: /Monday, October 5, 1 session$/ });
    expect(early.querySelector('[data-mark="ended-early"]')).not.toBeNull();
    expect(early.querySelector('[data-mark="note"]')).toBeNull();
    // Future days are rendered but not interactive; no next month beyond the current one.
    expect(screen.queryByRole("button", { name: /October 20/ })).toBeNull();
    expect(screen.getByText("20").closest('[aria-disabled="true"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: CALENDAR_COPY.next })).toBeDisabled();
    expect(screen.getByRole("button", { name: CALENDAR_COPY.prev })).toBeEnabled();
  });

  it("lists every session of the selected day", async () => {
    // A second session on Oct 11.
    const tpl = (await api.templates.list())[0]!;
    const r = await api.sessions.start({
      templateId: tpl.id,
      liveData: false,
      timezone: "America/New_York",
    });
    const db = api.db();
    const s = db.sessions.find((x) => x.id === r.session!.id)!;
    await api.sessions.command({
      sessionId: s.id,
      kind: "start",
      expectedRevision: 1,
      source: "phone",
    });
    await api.sessions.command({
      sessionId: s.id,
      kind: "end",
      expectedRevision: 2,
      source: "phone",
    });
    const sum = db.summaries.find((x) => x.session_id === s.id)!;
    sum.local_date = "2026-10-11";
    sum.started_at = "2026-10-11T22:00:00Z";
    harness({ "/calendar": () => <CalendarPage month="2026-10" day="2026-10-11" /> }, "/calendar");
    const day = await screen.findByRole("button", { name: /Sunday, October 11, 2 sessions/ });
    expect(day).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("link", { name: /Ended early|Completed/ })).toHaveLength(2);
  });
});

describe("recovery after reload", () => {
  it("routes back to an active workout once per page load", async () => {
    const tpl = (await api.templates.list())[0]!;
    const r = await api.sessions.start({ templateId: tpl.id, liveData: false, timezone: "UTC" });
    await api.sessions.command({
      sessionId: r.session!.id,
      kind: "start",
      expectedRevision: 1,
      source: "phone",
    });
    const router = harness(
      {
        "/": () => (
          <>
            <AppStart userId={MOCK_LUIS} />
            <p>Home</p>
          </>
        ),
        "/session/$id": () => <p>Dashboard</p>,
      },
      "/",
    );
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/session/${r.session!.id}`);
    // Back to Home in the same page load does not bounce again.
    await act(() => router.navigate({ to: "/" }));
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("does not redirect for a session that was never started", async () => {
    const tpl = (await api.templates.list())[0]!;
    await api.sessions.start({ templateId: tpl.id, liveData: false, timezone: "UTC" });
    const router = harness(
      {
        "/": () => (
          <>
            <AppStart userId={MOCK_LUIS} />
            <p>Home</p>
          </>
        ),
        "/session/$id": () => <p>Dashboard</p>,
      },
      "/",
    );
    expect(await screen.findByText("Home")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("S07 Choose", () => {
  it("with zero workouts offers Create your first workout and creates nothing", async () => {
    const db = api.db();
    db.templates = db.templates.filter((t) => t.user_id !== MOCK_LUIS);
    const before = db.sessions.length;
    harness({ "/workout": () => <ChoosePage /> }, "/workout");
    expect(await screen.findByText(CHOOSE_COPY.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: CHOOSE_COPY.emptyAction })).toBeInTheDocument();
    expect(api.db().sessions.length).toBe(before);
  });
});

describe("summary finalization", () => {
  it("computes zone totals from samples with the invariant sum + unmeasured = active", async () => {
    const live = createMockApi({ storage: null, db: seedMockDb(), hrMode: () => "live" });
    await live.auth.verifyOtp("email", "luis@example.com", "123456");
    await live.zones.confirm([114, 133, 152, 171]);
    const tpl = (await live.templates.list())[0]!;
    const r = await live.sessions.start({ templateId: tpl.id, liveData: true, timezone: "UTC" });
    const id = r.session!.id;
    await live.sessions.command({
      sessionId: id,
      kind: "start",
      expectedRevision: 1,
      source: "phone",
    });
    // Pretend the session ran for 5 minutes with a 1-minute pause.
    const row = live.db().sessions.find((s) => s.id === id)!;
    const t0 = Date.now() - 5 * 60_000;
    row.started_at = new Date(t0).toISOString();
    row.state = "paused";
    row.paused_at = new Date(t0 + 120_000).toISOString();
    row.pauses = [{ from: t0 + 120_000, to: null }];
    row.revision = 3;
    live.db().sessions.splice(live.db().sessions.indexOf(row), 1, row);
    const res = await live.sessions.command({
      sessionId: id,
      kind: "end",
      expectedRevision: 3,
      source: "phone",
    });
    expect(res.ok).toBe(true);
    const pending = await live.sessions.summary(id);
    expect(pending?.hr_status).toBe("pending");
    const fin = await live.sessions.finalize(id);
    expect(fin?.hr_status).toBe("final");
    const sum = fin!.zone_ms.reduce((n, x) => n + x, 0);
    expect(sum + fin!.unmeasured_ms).toBe(fin!.active_ms);
    expect(fin!.measured_ms).toBe(sum);
    expect(sum).toBeGreaterThan(0);
    // Idempotent: a second call returns the saved summary unchanged.
    expect(await live.sessions.finalize(id)).toEqual(fin);
  });

  it("finalizeTotals refuses a session that has not ended and keeps measured <= active", () => {
    const row = seedMockDb().sessions[0]!;
    expect(finalizeTotals({ ...row, state: "active" }, [], 1000)).toBeNull();
    const t = finalizeTotals({ ...row, live_data: true }, [], 60_000)!;
    expect(t.zone_ms).toEqual([0, 0, 0, 0, 0]);
    expect(t.unmeasured_ms).toBe(60_000);
    expect(t.coverage).toBe(0);
  });
});
