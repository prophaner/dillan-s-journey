// Slice C screen acceptance (review follow-ups): preflight initial focus (AC18), dashboard pause
// freeze and focus (AC20), double tap, End after the last set without a second confirm (AC23),
// skipped vs done-with-0-reps in the detail view (AC19), zones not set (AC26), outcome titles,
// the H10 End dialog copy and the running banner not being a live region.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import type { MockHrMode } from "@/v1/data/mock-hr";
import { MOCK_LUIS, seedMockDb } from "@/v1/data/mock-fixtures";
import type { SessionSummaryRow, WorkoutSessionRow } from "@/v1/core/types";
import { UserProvider } from "@/v1/ui/user-context";
import { ToastProvider } from "@/components/dillan/overlays";
import { PreflightPage, PREFLIGHT_COPY } from "@/v1/ui/preflight-page";
import { PREFLIGHT_HR_COPY } from "@/v1/core/hr-views";
import { SessionPage } from "@/v1/ui/session-page";
import { SessionDetailPage } from "@/v1/ui/session-detail-page";
import { SUMMARY_COPY, ZonesCard } from "@/v1/ui/summary-view";
import { ZONE_COPY } from "@/v1/ui/zone-pieces";
import { RunningBanner } from "@/v1/ui/running-banner";
import { serverClockFor } from "@/v1/session/server-clock";

type Api = ReturnType<typeof createMockApi>;
let api: Api;
let hrMode: MockHrMode = "off";

beforeEach(async () => {
  localStorage.clear();
  hrMode = "off";
  api = createMockApi({ storage: null, db: seedMockDb(), hrMode: () => hrMode });
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

async function started(liveData = false): Promise<WorkoutSessionRow> {
  const tpl = (await api.templates.list()).find((t) => t.name === "Upper Body A")!;
  const r = await api.sessions.start({ templateId: tpl.id, liveData, timezone: "UTC" });
  const s = await api.sessions.command({
    sessionId: r.session!.id,
    kind: "start",
    expectedRevision: r.session!.revision,
    source: "phone",
  });
  return s.session!;
}

async function cmd(
  row: WorkoutSessionRow,
  kind: "complete_set" | "skip_set" | "end" | "discard",
  payload = {},
) {
  const r = await api.sessions.command({
    sessionId: row.id,
    kind,
    payload,
    expectedRevision: row.revision,
    source: "phone",
  });
  expect(r.ok).toBe(true);
  return r.session!;
}

function dashboard(id: string) {
  return harness(
    {
      "/session/$id": () => <SessionPage sessionId={id} />,
      "/": () => <p>Home</p>,
      "/calendar": () => <p>Calendar</p>,
    },
    `/session/${id}`,
  );
}

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("S08 Preflight initial focus (AC18)", () => {
  it("focuses Continue without live data when heart rate is not live", async () => {
    const tpl = (await api.templates.list())[0]!;
    harness({ "/p": () => <PreflightPage templateId={tpl.id} /> }, "/p");
    const off = await screen.findByRole("button", { name: PREFLIGHT_COPY.withoutLive });
    await waitFor(() => expect(off).toHaveFocus());
    expect(screen.getByRole("button", { name: PREFLIGHT_COPY.start })).toBeDisabled();
  });

  it("focuses Start only when heart rate is Live", async () => {
    hrMode = "live"; // the mock relay is the DEMO relay: Live for a demo preflight
    const tpl = (await api.templates.list())[0]!;
    harness({ "/p": () => <PreflightPage templateId={tpl.id} demo /> }, "/p");
    const start = await screen.findByRole("button", { name: PREFLIGHT_COPY.start });
    await waitFor(() => expect(start).toHaveFocus());
  });

  it("DEMO readings never make a real preflight ready (they would be demo_mismatch)", async () => {
    hrMode = "live";
    const tpl = (await api.templates.list())[0]!;
    harness({ "/p": () => <PreflightPage templateId={tpl.id} /> }, "/p");
    await screen.findByText(PREFLIGHT_HR_COPY.demoOnly);
    expect(screen.getByRole("button", { name: PREFLIGHT_COPY.start })).toBeDisabled();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("a lost Start response is never replayed by the other button (review fix)", async () => {
    hrMode = "live";
    const tpl = (await api.templates.list())[0]!;
    const calls: Array<{ commandId: string | undefined; liveData: boolean; timezone: string }> = [];
    const realStart = api.sessions.start.bind(api.sessions);
    let lose = true;
    api.sessions.start = async (req) => {
      calls.push({ commandId: req.commandId, liveData: req.liveData, timezone: req.timezone });
      const r = await realStart(req);
      if (lose) {
        lose = false;
        throw new TypeError("Failed to fetch"); // committed, response lost
      }
      return r;
    };
    harness(
      { "/p": () => <PreflightPage templateId={tpl.id} demo />, "/session/$id": () => <p>Dash</p> },
      "/p",
    );
    const start = await screen.findByRole("button", { name: PREFLIGHT_COPY.start });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);
    await screen.findByText(PREFLIGHT_COPY.startFailed);
    fireEvent.click(screen.getByRole("button", { name: PREFLIGHT_COPY.withoutLive }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]!.liveData).toBe(false);
    expect(calls[1]!.commandId).not.toBe(calls[0]!.commandId);
    // The live session the lost request created is reported as running, not adopted silently.
    await screen.findByText(PREFLIGHT_COPY.endThenStart);
    expect(screen.queryByText("Dash")).not.toBeInTheDocument();
    // The session is stamped with this device's zone.
    expect(calls[0]!.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("the running-workout dialog uses the canonical M4 buttons", () => {
    expect(PREFLIGHT_COPY.goToIt).toBe("Cancel");
    expect(PREFLIGHT_COPY.endThenStart).toBe("End and save, then continue");
  });
});

describe("S09/S10 Dashboard", () => {
  it("pause freezes active time and rest; Resume returns focus to Pause (AC20)", async () => {
    const row = await started();
    dashboard(row.id);
    fireEvent.click(await screen.findByRole("button", { name: "Complete set" }));
    await screen.findByRole("timer");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    const overlay = await screen.findByRole("dialog");
    const resume = within(overlay).getByRole("button", { name: "Resume" });
    await waitFor(() => expect(resume).toHaveFocus());
    // The dashboard and header behind the overlay are out of reach.
    expect(document.querySelector("header")).toHaveAttribute("inert");
    const restBefore = screen.getByRole("timer", { hidden: true }).textContent;
    const activeBefore = overlay.textContent;
    await wait(1_200);
    expect(screen.getByRole("timer", { hidden: true }).textContent).toBe(restBefore);
    expect(overlay.textContent).toBe(activeBefore);

    fireEvent.click(resume);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toHaveFocus());
  });

  it("a double tap on Complete set logs one set", async () => {
    const row = await started();
    dashboard(row.id);
    const btn = await screen.findByRole("button", { name: "Complete set" });
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole("button", { name: "Complete set" }));
    const results = () => Object.keys(api.db().sessions.find((s) => s.id === row.id)!.results);
    // Wait for the first set to land (slow under load), then make sure no second one follows.
    await waitFor(() => expect(results()).toHaveLength(1));
    await wait(100);
    expect(results()).toHaveLength(1);
  });

  it("End after the last set saves without a second confirm (AC23)", async () => {
    let row = await started();
    for (let i = 0; i < row.steps.length; i++) row = await cmd(row, "complete_set", { step: i });
    dashboard(row.id);
    fireEvent.click(await screen.findByRole("button", { name: "End" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(await screen.findByRole("heading", { name: SUMMARY_COPY.title })).toBeInTheDocument();
  });

  it("uses the H10 End dialog copy when live data is on", async () => {
    hrMode = "live";
    const row = await started(true);
    dashboard(row.id);
    fireEvent.click(await screen.findByRole("button", { name: "End" }));
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByText("End workout?")).toBeInTheDocument();
    expect(dlg.textContent).toMatch(/relay will disconnect the strap/);
    expect(within(dlg).getByRole("button", { name: "End and save" })).toBeInTheDocument();
  });

  it("a discarded workout is titled Workout canceled, not Workout saved", async () => {
    const tpl = (await api.templates.list())[0]!;
    const r = await api.sessions.start({ templateId: tpl.id, liveData: false, timezone: "UTC" });
    await cmd(r.session!, "discard");
    dashboard(r.session!.id);
    expect(await screen.findByRole("heading", { name: "Workout canceled" })).toBeInTheDocument();
    expect(screen.getByText(SUMMARY_COPY.discarded)).toBeInTheDocument();
  });
});

describe("S13 Session detail (AC19)", () => {
  it("shows done with 0 reps apart from skipped, with the load basis", async () => {
    let row = await started();
    row = await cmd(row, "complete_set", { step: 0, reps: 0 });
    row = await cmd(row, "skip_set", { step: 1 });
    row = await cmd(row, "end");
    harness({ "/d": () => <SessionDetailPage sessionId={row.id} /> }, "/d");
    expect(await screen.findByText(/^0 reps · /)).toBeInTheDocument();
    expect(screen.getByText(/^0 reps · .*(per dumbbell|total|Bodyweight)$/)).toBeInTheDocument();
    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0);
    expect(screen.queryByText(/from a deleted workout/i)).toBeNull();
  });
});

describe("Zones card without confirmed zones (AC26)", () => {
  it("says zones were not set (not 'no data recorded') and shows no zone color", () => {
    const summary = {
      hr_status: "final",
      measured_ms: 0,
      unmeasured_ms: 600_000,
      zone_ms: [0, 0, 0, 0, 0],
      coverage: 0,
      hr_sources_used: ["Gym tablet"],
    } as unknown as SessionSummaryRow;
    harness(
      {
        "/z": () => (
          <ZonesCard
            row={{ live_data: true, zone_snapshot: null, is_demo: false }}
            summary={summary}
          />
        ),
      },
      "/z",
    );
    return waitFor(() => {
      expect(screen.getByText(SUMMARY_COPY.zonesNotSet)).toBeInTheDocument();
      expect(screen.queryByText(ZONE_COPY.noSamples)).toBeNull();
      expect(document.querySelector("[class*='text-z']")).toBeNull();
    });
  });

  it("offers a retry instead of 'Adding up' forever when the summary fails", async () => {
    let retried = 0;
    harness(
      {
        "/z": () => (
          <ZonesCard
            row={{ live_data: true, zone_snapshot: null, is_demo: false }}
            summary={undefined}
            error
            onRetry={() => (retried += 1)}
          />
        ),
      },
      "/z",
    );
    fireEvent.click(await screen.findByRole("button", { name: SUMMARY_COPY.tryAgain }));
    expect(retried).toBe(1);
    expect(screen.queryByText(SUMMARY_COPY.finalizing)).toBeNull();
  });
});

describe("Running banner", () => {
  it("is not a live region (the ticking timer is not re-announced)", async () => {
    await started();
    harness({ "/": () => <RunningBanner /> }, "/");
    const link = await screen.findByRole("link", { name: /Back to workout/ });
    expect(link.closest("[role='status']")).toBeNull();
    expect(link.closest("[aria-live='polite']")).toBeNull();
  });
});
