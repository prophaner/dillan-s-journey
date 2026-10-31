// Slice E viewer side: useLiveHeartRate freshness transitions at 10 s / 30 s with fake timers,
// acceptance 24–28 on the dashboard (mock Demo relay stalled), the mock hr_ingest port, screen
// copy (S04/S08), the S09 TV focus route (acceptance 45), the unsupported relay page
// (acceptance 41) and the "no 'denied' in health copy" grep (acceptance 28).

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveHealthState, HEALTH_COPY } from "@/v1/core/health";
import type { HrIngestRequest, HrLiveRow, HrSensorRow } from "@/v1/core/hr";
import { homeHrCard, preflightChip, HOME_HR_COPY } from "@/v1/core/hr-views";
import { accountZones } from "@/v1/core/zones";
import type { WorkoutSessionRow } from "@/v1/core/types";
import type { DillanApi } from "@/v1/data/api";
import { setApiForTests } from "@/v1/data/client";
import { createMockApi } from "@/v1/data/mock-api";
import { MOCK_LUIS, seedMockDb } from "@/v1/data/mock-fixtures";
import { emptyHrDb, mockIngest, type MockHrMode } from "@/v1/data/mock-hr";
import { RelayPage } from "@/v1/relay/relay-page";
import { useLiveHeartRate } from "@/v1/session/live-hr";
import { serverClockFor } from "@/v1/session/server-clock";
import { FocusEngine, type Rect } from "@/v1/tv/focus";
import { TvZonePill } from "@/v1/tv/ui";
import { SessionPage } from "@/v1/ui/session-page";
import { UserProvider } from "@/v1/ui/user-context";
import { ZONE_COPY, ZonePill } from "@/v1/ui/zone-pieces";
import { ToastProvider } from "@/components/dillan/overlays";

afterEach(() => {
  cleanup();
  setApiForTests(null);
  vi.useRealTimers();
  localStorage.clear();
});

const T0 = Date.parse("2026-10-31T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function liveRow(o: Partial<HrLiveRow> = {}): HrLiveRow {
  return {
    user_id: "u1",
    rev: 1,
    active_session_id: null,
    holder_source_id: "src",
    holder_stream_id: "stream",
    holder_name: "Gym tablet",
    source_kind: "web_ble",
    relay_mode: "live",
    sensor_name: "Polar H10 1A2B3C4D",
    sensor_serial: "1A2B3C4D",
    battery_pct: 80,
    bpm: 131,
    contact: true,
    measured_at: iso(T0),
    connected_at: iso(T0 - 60_000),
    last_seen_at: iso(T0),
    is_demo: false,
    updated_at: iso(T0),
    ...o,
  };
}

const sensorRow: HrSensorRow = {
  user_id: "u1",
  sensor_kind: "polar_h10",
  sensor_name: "Polar H10 1A2B3C4D",
  sensor_serial: "1A2B3C4D",
  paired_at: iso(T0 - 86_400_000),
  forgotten_at: null,
  wanted_until: null,
  last_source_id: "src",
  last_battery_pct: 80,
  battery_read_at: iso(T0),
};

// ------------------------------------------------------------------ hook freshness
describe("useLiveHeartRate freshness (fake timers)", () => {
  function stubApi() {
    let push: ((r: HrLiveRow | null) => void) | null = null;
    let row = liveRow();
    const api = {
      kind: "supabase",
      hr: {
        live: async () => row,
        sensorRow: async () => sensorRow,
        serverTime: async () => Date.now(),
      },
      realtime: {
        onHrLive: (_u: string, cb: (r: HrLiveRow | null) => void) => {
          push = cb;
          return () => {};
        },
        onHrSensor: () => () => {},
      },
    } as unknown as DillanApi;
    return {
      api,
      /** the relay keeps heartbeating (last_seen fresh) but sends no new reading */
      heartbeat() {
        row = { ...row, rev: row.rev + 1, last_seen_at: iso(Date.now()) };
        push?.(row);
      },
    };
  }

  function Probe() {
    const hr = useLiveHeartRate("u1", {
      session: { status: "active", liveData: true, isDemo: false },
      zonesConfirmed: true,
    });
    return (
      <div>
        <span data-testid="label">{hr.health.label}</span>
        <span data-testid="bpm">{hr.health.showBpm ? String(hr.health.bpm) : "--"}</span>
        <span data-testid="counts">{String(hr.health.countsTowardZone)}</span>
      </div>
    );
  }

  it("Live → Delayed after 10 s → No recent reading after 30 s, from server-corrected time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const s = stubApi();
    setApiForTests(s.api);
    render(<Probe />);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("label").textContent).toBe("Live");
    expect(screen.getByTestId("bpm").textContent).toBe("131");
    expect(screen.getByTestId("counts").textContent).toBe("true");
    for (let t = 2; t <= 10; t++) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      if (t % 5 === 0) s.heartbeat();
    }
    expect(screen.getByTestId("label").textContent).toBe("Live");
    await act(() => vi.advanceTimersByTimeAsync(1_000)); // 11 s
    expect(screen.getByTestId("label").textContent).toBe("Delayed");
    expect(screen.getByTestId("bpm").textContent).toBe("131"); // de-emphasized, still shown
    expect(screen.getByTestId("counts").textContent).toBe("false");
    for (let t = 12; t <= 30; t++) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      if (t % 5 === 0) s.heartbeat();
    }
    expect(screen.getByTestId("label").textContent).toBe("Delayed");
    await act(() => vi.advanceTimersByTimeAsync(1_000)); // 31 s
    expect(screen.getByTestId("label").textContent).toBe("No recent reading");
    expect(screen.getByTestId("bpm").textContent).toBe("--");
  });

  it("under StrictMode (double-invoked updaters) the first read still lands", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const s = stubApi();
    setApiForTests(s.api);
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("label").textContent).toBe("Live");
  });

  it("a relay that stops heartbeating shows Relay offline after 15 s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const s = stubApi();
    setApiForTests(s.api);
    render(<Probe />);
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByTestId("label").textContent).toBe("Delayed");
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    expect(screen.getByTestId("label").textContent).toBe("Relay offline");
  });
});

// ------------------------------------------------------------------ dashboard acceptance
describe("acceptance 24–26 on the dashboard (mock Demo relay)", () => {
  type Api = ReturnType<typeof createMockApi>;
  let api: Api;
  let mode: MockHrMode = "live";
  let since = 0;

  beforeEach(async () => {
    mode = "live";
    since = 0;
    api = createMockApi({
      storage: null,
      db: seedMockDb(),
      hrMode: () => mode,
      hrSince: () => since,
    });
    await api.auth.verifyOtp("email", "luis@example.com", "123456");
    setApiForTests(api);
    await serverClockFor(api.hr).sample();
  });

  function harness(node: () => ReactNode) {
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
    const r = createRoute({
      getParentRoute: () => root,
      path: "/s",
      component: () => <>{node()}</>,
    });
    const router = createRouter({
      routeTree: root.addChildren([r]),
      history: createMemoryHistory({ initialEntries: ["/s"] }),
    }) as AnyRouter;
    render(<RouterProvider router={router} />);
  }

  async function demoSession(zones = true): Promise<WorkoutSessionRow> {
    if (zones) await api.zones.confirm([114, 133, 152, 171]);
    const tpl = (await api.templates.list())[0]!;
    const r = await api.sessions.start({
      templateId: tpl.id,
      liveData: true,
      timezone: "UTC",
      isDemo: true,
    });
    const s = await api.sessions.command({
      sessionId: r.session!.id,
      kind: "start",
      expectedRevision: r.session!.revision,
      source: "phone",
    });
    return s.session!;
  }

  it("live demo readings show BPM, the DEMO badge and a zone pill with text", async () => {
    const row = await demoSession();
    harness(() => <SessionPage sessionId={row.id} />);
    await waitFor(() => expect(screen.getByText("Live")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getAllByText("DEMO").length).toBeGreaterThan(0);
    const pill = document.querySelector(".zone-pill");
    expect(pill?.textContent).toMatch(/^Zone [1-5] · /);
  });

  it("24: a reading 11 s old shows Delayed and Zone unknown", async () => {
    const row = await demoSession();
    mode = "stall";
    since = Date.now() - 10_000; // last reading ≈ 11 s ago
    harness(() => <SessionPage sessionId={row.id} />);
    await waitFor(() => expect(screen.getByText("Delayed")).toBeInTheDocument(), { timeout: 3000 });
    expect(document.querySelector(".zone-pill")?.textContent).toBe(ZONE_COPY.unknown);
  });

  it("25: a reading 31 s old shows no BPM and No recent reading", async () => {
    const row = await demoSession();
    mode = "stall";
    since = Date.now() - 30_000;
    harness(() => <SessionPage sessionId={row.id} />);
    await waitFor(() => expect(screen.getByText("No recent reading")).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.queryByText(/^1[0-9]{2}$/)).toBeNull();
    expect(document.querySelector(".zone-pill")?.textContent).toBe(ZONE_COPY.unknown);
  });

  it("26: without confirmed zones, BPM shows with Set up zones and no zone color", async () => {
    const row = await demoSession(false);
    harness(() => <SessionPage sessionId={row.id} />);
    await waitFor(() => expect(screen.getByText("Live")).toBeInTheDocument(), { timeout: 3000 });
    const pill = document.querySelector(".zone-pill") as HTMLElement;
    expect(pill.textContent).toBe(ZONE_COPY.setUp);
    expect(pill.className).not.toMatch(/bg-z[1-5]/);
  });

  it("real sessions never count demo readings (Zone unknown, BPM still labelled DEMO)", async () => {
    await api.zones.confirm([114, 133, 152, 171]);
    const tpl = (await api.templates.list())[0]!;
    const r = await api.sessions.start({ templateId: tpl.id, liveData: true, timezone: "UTC" });
    const s = await api.sessions.command({
      sessionId: r.session!.id,
      kind: "start",
      expectedRevision: r.session!.revision,
      source: "phone",
    });
    harness(() => <SessionPage sessionId={s.session!.id} />);
    await waitFor(() => expect(screen.getByText("Live")).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getAllByText("DEMO").length).toBeGreaterThan(0);
    expect(document.querySelector(".zone-pill")?.textContent).toBe(ZONE_COPY.unknown);
  });
});

describe("acceptance 24–26: accrual to Unmeasured (zones.ts)", () => {
  const samples = (from: number, to: number) => {
    const out = [];
    for (let t = from; t < to; t += 1000)
      out.push({
        stream_id: "s",
        seq: t / 1000,
        measured_at: t,
        bpm: 140,
        contact: true,
        is_demo: false,
      });
    return out;
  };
  const total = (now: number, cutoffs: [number, number, number, number] | null) =>
    accountZones({
      samples: samples(T0, T0 + 20_000),
      intervals: [{ from: T0, to: now }],
      cutoffs,
      sessionStart: T0,
      sessionEnd: now,
      sessionIsDemo: false,
    });

  it("zone time stops 10 s after the last reading; the rest accrues to Unmeasured", () => {
    const a = total(T0 + 31_000, [114, 133, 152, 171]);
    const b = total(T0 + 90_000, [114, 133, 152, 171]);
    expect(a.measured_ms).toBe(29_000); // 20 readings + 10 s hold of the last one, minus 1 s gap
    expect(b.measured_ms).toBe(a.measured_ms);
    expect(b.unmeasured_ms - a.unmeasured_ms).toBe(59_000);
    expect(b.zone_ms.reduce((n, x) => n + x, 0) + b.unmeasured_ms).toBe(b.active_ms);
  });

  it("without zones all time is Unmeasured (never guessed)", () => {
    const t = total(T0 + 20_000, null);
    expect(t.measured_ms).toBe(0);
    expect(t.unmeasured_ms).toBe(20_000);
  });

  it("Delayed and No recent never count toward a zone", () => {
    const base = {
      live: liveRow({ measured_at: iso(T0 - 11_000) }),
      sensor: { paired: true },
      serverNowMs: T0,
      session: { status: "active" as const, liveData: true, isDemo: false },
      zonesConfirmed: true,
    };
    expect(deriveHealthState(base)).toMatchObject({ id: "H4_delayed", countsTowardZone: false });
    expect(
      deriveHealthState({ ...base, live: liveRow({ measured_at: iso(T0 - 31_000) }) }),
    ).toMatchObject({ id: "H5_no_recent", showBpm: false, countsTowardZone: false });
  });
});

// ------------------------------------------------------------------ acceptance 27 / 28
describe("acceptance 27: zone pill always has text", () => {
  it("phone and TV pills: every .zone-pill has non-empty text, colored ones say Zone N · range", () => {
    const cut: [number, number, number, number] = [114, 133, 152, 171];
    render(
      <div>
        {[null, 1, 2, 3, 4, 5].map((z) => (
          <ZonePill key={`p${z}`} zone={z as never} cutoffs={cut} />
        ))}
        <ZonePill zone={3} cutoffs={null} />
        {[null, 1, 2, 3, 4, 5].map((z) => (
          <TvZonePill key={`t${z}`} zone={z as never} cutoffs={cut} />
        ))}
        <TvZonePill zone={null} cutoffs={null} />
      </div>,
    );
    const pills = [...document.querySelectorAll<HTMLElement>(".zone-pill")];
    expect(pills).toHaveLength(14);
    for (const p of pills) {
      expect(p.textContent?.trim().length).toBeGreaterThan(0);
      if (/bg-z[1-5]-tint/.test(p.className)) expect(p.textContent).toMatch(/^Zone [1-5] · .+/);
    }
  });
});

describe("acceptance 28: no 'denied' in health copy", () => {
  const files = [
    "src/v1/core/health.ts",
    "src/v1/core/hr-views.ts",
    "src/v1/relay",
    "src/v1/session/live-hr.ts",
    "src/v1/ui/zone-pieces.tsx",
    "src/v1/ui/strap-card.tsx",
    "src/v1/ui/home-hr-card.tsx",
    "src/v1/ui/preflight-page.tsx",
    "src/v1/ui/session-page.tsx",
    "src/v1/ui/summary-view.tsx",
    "src/v1/tv/hr-pieces.tsx",
    "src/v1/tv/session-screen.tsx",
    "src/routes/relay.tsx",
    "src/routes/_authenticated/_app/profile.zones.tsx",
  ];
  const walk = (p: string): string[] =>
    statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p];

  it("grep finds no 'denied' (any case) in heart-rate screens and copy", () => {
    const hits = files.flatMap(walk).filter((f) => /denied/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it("every H-state label and detail avoids 'denied'", () => {
    for (const c of Object.values(HEALTH_COPY))
      expect(`${c.label} ${c.detail}`).not.toMatch(/denied/i);
  });
});

// ------------------------------------------------------------------ copy mapping
describe("S04 home card and S08 chip", () => {
  const h = (live: HrLiveRow | null, paired = true) =>
    deriveHealthState({
      live,
      sensor: paired ? { paired: true } : null,
      serverNowMs: T0 + 1_000,
      session: { status: "none", liveData: true, isDemo: false },
      zonesConfirmed: true,
    });

  it("maps the S04 table", () => {
    expect(homeHrCard(h(null, false), null, null)).toMatchObject({
      chip: { label: "Not set up" },
      text: HOME_HR_COPY.notSetUp,
      notSetUp: true,
    });
    expect(homeHrCard(h(liveRow()), liveRow(), sensorRow)).toMatchObject({
      chip: { label: "Live", tone: "live" },
      text: "Polar H10 1A2B3C4D via Gym tablet · 80%",
    });
    const standby = liveRow({ relay_mode: "standby", bpm: null });
    expect(homeHrCard(h(standby), standby, sensorRow)).toMatchObject({
      chip: { label: "Ready" },
      text: "Strap rests between workouts. It reconnects on Gym tablet when you open a workout.",
    });
    const gone = liveRow({ last_seen_at: iso(T0 - 60_000) });
    expect(homeHrCard(h(gone), gone, sensorRow)).toMatchObject({
      chip: { label: "Relay offline" },
      relayOffline: true,
      showRelayQr: true,
    });
    const low = liveRow({ battery_pct: 15 });
    expect(homeHrCard(h(low), low, sensorRow).battery).toBe(
      "Strap battery low (15%). It takes a CR2025.",
    );
  });

  it("maps the S08 chip", () => {
    expect(preflightChip(h(liveRow()), true).label).toBe("Live · ready");
    expect(preflightChip(h(null, false), null).label).toBe("Not configured");
    expect(
      preflightChip(h(liveRow({ relay_mode: "waiting_first", measured_at: null })), null).label,
    ).toBe("Preparing");
    expect(preflightChip(h(liveRow({ relay_mode: "sensor_lost" })), null).label).toBe(
      "Unavailable",
    );
  });
});

// ------------------------------------------------------------------ TV focus (acceptance 45)
describe("S09 TV focus order (acceptance 45)", () => {
  it("Down from All zones focuses Heart rate, Down again focuses Pause", () => {
    const rectOf = (el: HTMLElement): Rect => {
      const [l, t, w, hh] = (el.getAttribute("data-rect") ?? "0,0,0,0").split(",").map(Number) as [
        number,
        number,
        number,
        number,
      ];
      return { left: l, top: t, right: l + w, bottom: t + hh };
    };
    const root = document.createElement("div");
    root.innerHTML = `
      <button data-focus data-focus-id="complete" data-rect="0,800,300,100">c</button>
      <button data-focus data-focus-id="pause" data-rect="320,800,300,100">p</button>
      <button data-focus data-focus-id="all-zones" data-focus-down="hr-panel" data-rect="1300,700,400,80">z</button>
      <button data-focus data-focus-id="hr-panel" data-focus-down="pause" data-rect="1300,800,400,80">h</button>`;
    document.body.appendChild(root);
    const e = new FocusEngine(root, { rectOf, isVisible: () => true, scroll: false });
    e.setFocus(root.querySelector('[data-focus-id="all-zones"]'));
    e.move("down");
    expect(e.focusedId()).toBe("hr-panel");
    e.move("down");
    expect(e.focusedId()).toBe("pause");
    root.remove();
  });
});

// ------------------------------------------------------------------ relay page (acceptance 41)
describe("relay page in a browser without Web Bluetooth (acceptance 41)", () => {
  it("shows the supported-browser message and no Connect strap button", async () => {
    const api = createMockApi({ storage: null, db: seedMockDb(), hrMode: () => "off" });
    await api.auth.verifyOtp("email", "luis@example.com", "123456");
    render(<RelayPage api={api} demo={false} />);
    await waitFor(() =>
      expect(screen.getByText(/can't connect to Bluetooth sensors/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Connect strap" })).toBeNull();
    expect(screen.getByRole("img", { name: /QR code for .*\/relay/ })).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------ mock hr_ingest
describe("mock hr_ingest (port of 0006 hr_ingest)", () => {
  const now = T0;
  const session = (o: Partial<WorkoutSessionRow>): WorkoutSessionRow =>
    ({
      id: "s1",
      user_id: "u1",
      state: "active",
      live_data: true,
      is_demo: false,
      started_at: iso(now - 600_000),
      ended_at: null,
      ...o,
    }) as WorkoutSessionRow;
  const req = (o: Partial<HrIngestRequest> = {}): HrIngestRequest => ({
    p_source_id: "11111111-1111-4111-8111-111111111111",
    p_stream_id: "22222222-2222-4222-8222-222222222222",
    p_expected_user_id: "u1",
    p_source_kind: "web_ble",
    p_mode: "live",
    p_connected_at: iso(now - 30_000),
    p_sensor: { name: "Polar H10 1A2B3C4D", serial: "1A2B3C4D", battery_pct: 80 },
    p_claim: false,
    p_samples: [{ seq: 1, measured_at: iso(now - 1_000), bpm: 120, contact: true, rr_ms: null }],
    ...o,
  });

  it("stores real samples in the active session, dedupes retries, and updates hr_live", () => {
    const hr = emptyHrDb();
    const data = { sessions: [session({})], summaries: [] };
    const a = mockIngest(hr, data, "u1", req(), now);
    expect(a).toMatchObject({ accepted: 1, stop_requested: false });
    const b = mockIngest(hr, data, "u1", req(), now + 400);
    expect(b).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(hr.live[0]).toMatchObject({ bpm: 120, relay_mode: "live", holder_name: "Relay" });
  });

  it("identity mismatch writes nothing", () => {
    const hr = emptyHrDb();
    expect(mockIngest(hr, { sessions: [], summaries: [] }, "u2", req(), now)).toMatchObject({
      identity_mismatch: true,
    });
    expect(hr.live).toHaveLength(0);
  });

  it("demo samples never enter a real session (demo_mismatch) and vice versa", () => {
    const hr = emptyHrDb();
    const data = { sessions: [session({})], summaries: [] };
    const r = mockIngest(hr, data, "u1", req({ p_source_kind: "demo", p_sensor: null }), now);
    expect(r.rejected).toEqual([{ seq: 1, reason: "demo_mismatch" }]);
    expect(hr.samples).toHaveLength(0);
  });

  it("no session and no demand window: stop_requested, bpm not published", () => {
    const hr = emptyHrDb();
    const r = mockIngest(hr, { sessions: [], summaries: [] }, "u1", req(), now);
    expect(r).toMatchObject({
      stop_requested: true,
      rejected: [{ seq: 1, reason: "outside_session" }],
    });
    expect(hr.live[0]?.bpm).toBeNull();
  });

  it("a fresh holder supersedes another relay unless it claims", () => {
    const hr = emptyHrDb();
    const data = { sessions: [session({})], summaries: [] };
    mockIngest(hr, data, "u1", req(), now);
    const other = {
      p_source_id: "33333333-3333-4333-8333-333333333333",
      p_stream_id: "44444444-4444-4444-8444-444444444444",
    };
    expect(mockIngest(hr, data, "u1", req({ ...other, p_samples: [] }), now + 1000)).toMatchObject({
      superseded: true,
      holder_name: "Relay",
    });
    expect(
      mockIngest(hr, data, "u1", req({ ...other, p_claim: true, p_samples: [] }), now + 2000),
    ).toMatchObject({ superseded: false });
    expect(hr.live[0]?.holder_source_id).toBe(other.p_source_id);
  });

  it("hr_live only moves forward in measured_at (outbox flush oldest first)", () => {
    const hr = emptyHrDb();
    const data = { sessions: [session({})], summaries: [] };
    mockIngest(hr, data, "u1", req(), now);
    mockIngest(
      hr,
      data,
      "u1",
      req({
        p_samples: [
          { seq: 2, measured_at: iso(now - 60_000), bpm: 90, contact: true, rr_ms: null },
        ],
      }),
      now + 500,
    );
    expect(hr.live[0]).toMatchObject({ bpm: 120, measured_at: iso(now - 1_000) });
  });

  it("late samples within 2 min of End mark the summary dirty", () => {
    const hr = emptyHrDb();
    const ended = session({ state: "ended", ended_at: iso(now - 30_000) });
    const summary = { session_id: "s1", hr_finalize_dirty: false } as never;
    const data = { sessions: [ended], summaries: [summary] };
    const r = mockIngest(
      hr,
      data,
      "u1",
      req({
        p_samples: [
          { seq: 9, measured_at: iso(now - 40_000), bpm: 110, contact: true, rr_ms: null },
        ],
      }),
      now,
    );
    expect(r.accepted).toBe(1);
    expect((summary as { hr_finalize_dirty: boolean }).hr_finalize_dirty).toBe(true);
  });

  it("a forgotten strap stores nothing and tells the relay", () => {
    const hr = emptyHrDb();
    hr.sensors.push({ ...sensorRow, forgotten_at: iso(now - 1000) });
    const r = mockIngest(hr, { sessions: [session({})], summaries: [] }, "u1", req(), now);
    expect(r).toMatchObject({ sensor_forgotten: true, stop_requested: true });
    expect(hr.samples).toHaveLength(0);
  });
});
