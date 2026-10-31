// Slice D: the TV surface end to end on the mock backend — pairing states (S03), phone approve →
// TV signs in (acceptance 4), switch user renders a blank frame and no private DOM survives into
// the chooser (acceptance 9), Back on Home (exit toast, onBack() → false), the dashboard's Back =
// Pause and the paused overlay's Back no-op (acceptance 22), reload pause (acceptance 21) and a
// revoked grant locking the TV.

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DillanApi, TvChallenge, TvPairPoll } from "@/v1/data/api";
import { setApiForTests } from "@/v1/data/client";
import { createMockApi, MOCK_TV_SESSION_KEY } from "@/v1/data/mock-api";
import { MOCK_LUIS, seedMockDb, type MockDb } from "@/v1/data/mock-fixtures";
import { rememberProfile } from "@/v1/tv/device";
import { FocusEngine } from "@/v1/tv/focus";
import { EXIT_TOAST } from "@/v1/tv/screens";
import { Pairing, TV_COPY } from "@/v1/tv/signed-out";
import { GRANT_CHECK_MS, TV_SESSION_KEY, TvApp } from "@/v1/tv/tv-app";
import { TV_LOAD_COPY } from "@/v1/tv/ui";

type Api = ReturnType<typeof createMockApi>;
let db: MockDb;
let tv: Api;
let phone: Api;

beforeEach(async () => {
  localStorage.clear();
  db = seedMockDb();
  tv = createMockApi({ storage: null, db, sessionKey: MOCK_TV_SESSION_KEY });
  phone = createMockApi({ storage: null, db });
  await phone.auth.verifyOtp("email", "luis@example.com", "123456");
  setApiForTests(tv);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (document as { visibilityState?: unknown }).visibilityState;
  setApiForTests(null);
  localStorage.clear();
  delete (window as Window & { dillan?: unknown }).dillan;
});

function renderTv(api: DillanApi = tv) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TvApp api={api} />
    </QueryClientProvider>,
  );
  return qc;
}

const screenKey = () => document.querySelector("[data-screen]")?.getAttribute("data-screen");

async function pairAsLuis(api: DillanApi = tv) {
  renderTv(api);
  fireEvent.click(await screen.findByRole("button", { name: TV_COPY.getStarted }));
  await waitFor(() =>
    expect(screen.getByTestId("pair-code").textContent).toMatch(/^DLN-[A-Z2-9]{4}$/),
  );
  const c = screen.getByTestId("pair-code").textContent as string;
  expect(await phone.pairing.approve(c)).toMatchObject({ ok: true });
  await screen.findByText(/^Hi, Luis$/, undefined, { timeout: 5000 });
}

describe("S03 pairing states", () => {
  function stubApi(poll: () => TvPairPoll): DillanApi {
    const challenge: TvChallenge = {
      challengeId: "00000000-0000-4000-8000-0000000000c1",
      code: "DLN-7K4M",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      secret: "s".repeat(64),
    };
    return {
      ...tv,
      tv: {
        ...tv.tv,
        pairStart: async () => ({ ok: true, challenge }),
        pairPoll: async () => poll(),
        pairCancel: async () => undefined,
      },
    };
  }
  const renderPairing = (api: DillanApi) =>
    render(
      <div>
        <Pairing
          api={api}
          device={{ id: "tv-test-device", label: "Living Room Fire TV" }}
          forUser={null}
          origin="https://dillan.example"
          onSignedIn={() => undefined}
          onCancel={() => undefined}
        />
      </div>,
    );

  it("awaiting: code, QR of the approve URL (no token), countdown, Cancel is the focus", async () => {
    renderPairing(stubApi(() => ({ status: "awaiting" })));
    expect(await screen.findByText("DLN-7K4M")).toBeInTheDocument();
    expect(screen.getByText(TV_COPY.waiting)).toBeInTheDocument();
    expect(screen.getByTestId("pair-countdown").textContent).toMatch(/^Code expires in [45]:\d\d$/);
    const qr = document.querySelector("[data-qr-value]");
    expect(qr?.getAttribute("data-qr-value")).toBe(
      "https://dillan.example/approve-tv?code=DLN-7K4M",
    );
    expect(screen.getByRole("button", { name: TV_COPY.cancel })).toHaveAttribute("data-autofocus");
    expect(screen.getByText("Living Room Fire TV")).toBeInTheDocument();
  });

  it("denied: Request declined, Try again focused, nothing signed in", async () => {
    renderPairing(stubApi(() => ({ status: "denied" })));
    expect(await screen.findByText(TV_COPY.declined, undefined, { timeout: 4000 })).toBeVisible();
    expect(screen.getByText(TV_COPY.declinedBody)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TV_COPY.tryAgain })).toHaveAttribute(
      "data-autofocus",
    );
    expect(await tv.auth.getUser()).toBeNull();
  });

  it("expired: This code expired, New code focused", async () => {
    renderPairing(stubApi(() => ({ status: "expired" })));
    expect(await screen.findByText(TV_COPY.expired, undefined, { timeout: 4000 })).toBeVisible();
    expect(screen.getByRole("button", { name: TV_COPY.newCode })).toHaveAttribute("data-autofocus");
  });

  it("approved but the sign-in could not finish (code used up): says so, never 'expired'", async () => {
    renderPairing(stubApi(() => ({ status: "consumed" })));
    expect(
      await screen.findByText(TV_COPY.signInFailed, undefined, { timeout: 4000 }),
    ).toBeVisible();
    expect(screen.queryByText(TV_COPY.expired)).toBeNull();
    expect(screen.getByRole("button", { name: TV_COPY.newCode })).toHaveAttribute("data-autofocus");
  });

  it("a failed grant registration is a failed sign-in, not a signed-in TV", async () => {
    const signedIn = vi.fn();
    render(
      <Pairing
        api={stubApi(() => ({ status: "error", error: "grant_failed" }))}
        device={{ id: "tv-test-device", label: "Living Room Fire TV" }}
        forUser={null}
        origin="https://dillan.example"
        onSignedIn={signedIn}
        onCancel={() => undefined}
      />,
    );
    expect(
      await screen.findByText(TV_COPY.signInFailed, undefined, { timeout: 4000 }),
    ).toBeVisible();
    expect(signedIn).not.toHaveBeenCalled();
  });

  it("expiry is the server's call: a TV clock running 10 minutes fast does not expire the code", async () => {
    render(
      <Pairing
        api={stubApi(() => ({ status: "awaiting" }))}
        device={{ id: "tv-test-device", label: "Living Room Fire TV" }}
        forUser={null}
        origin="https://dillan.example"
        onSignedIn={() => undefined}
        onCancel={() => undefined}
        now={() => Date.now() + 10 * 60_000}
      />,
    );
    await screen.findByText("DLN-7K4M");
    await new Promise((r) => setTimeout(r, 1_800)); // one poll
    expect(screen.queryByText(TV_COPY.expired)).toBeNull();
    expect(screen.getByText(TV_COPY.waiting)).toBeInTheDocument();
  });

  it("Back while an approval is being exchanged locks that session again at once", async () => {
    let resolve: (p: TvPairPoll) => void = () => undefined;
    const api = stubApi(() => ({ status: "awaiting" }));
    const lock = vi.fn(async () => undefined);
    const inFlight = new Promise<TvPairPoll>((r) => (resolve = r));
    const polled = vi.fn();
    const slow: DillanApi = {
      ...api,
      tv: {
        ...api.tv,
        pairPoll: () => {
          polled();
          return inFlight;
        },
        lock,
      },
    };
    const view = render(
      <Pairing
        api={slow}
        device={{ id: "tv-test-device", label: "Living Room Fire TV" }}
        forUser={null}
        origin="https://dillan.example"
        onSignedIn={() => undefined}
        onCancel={() => undefined}
      />,
    );
    await waitFor(() => expect(polled).toHaveBeenCalled(), { timeout: 4000 });
    view.unmount(); // Back / Cancel
    resolve({
      status: "signed_in",
      user: { id: MOCK_LUIS, email: null, phone: null },
      grantId: "grant-1",
    });
    await waitFor(() => expect(lock).toHaveBeenCalledWith("grant-1"));
  });
});

describe("TV surface on the mock backend", () => {
  it("first run shows only Get started; phone approval signs the TV in (acceptance 4)", async () => {
    await pairAsLuis();
    expect(screenKey()).toBe("home");
    expect(JSON.parse(localStorage.getItem(TV_SESSION_KEY) ?? "{}").userId).toBe(MOCK_LUIS);
    // the grant is registered for this TV, so the phone lists it
    expect((await phone.devices.list()).some((g) => g.device_id.startsWith("tv-"))).toBe(true);
    // the phone's own mock session is untouched (separate sign-in)
    expect((await phone.auth.getUser())?.id).toBe(MOCK_LUIS);
  }, 15_000);

  it("Switch user: blank frame ≥120 ms, then a chooser with no private DOM (acceptance 9)", async () => {
    await pairAsLuis();
    // opt in to the chooser tile so the chooser (not first run) follows
    rememberProfile(MOCK_LUIS, "Luis");
    const workoutNames = (await phone.templates.list()).map((t) => t.name);
    // private data on screen before the switch (most recent workout)
    await screen.findByText(/Upper Body/);

    let blankAt = 0;
    let chooserAt = 0;
    let chooserText = "";
    const seen = new MutationObserver(() => {
      const k = screenKey();
      if (k === "blank" && !blankAt) blankAt = performance.now();
      if (k === "chooser" && !chooserAt) {
        chooserAt = performance.now();
        chooserText = document.body.textContent ?? "";
      }
    });
    seen.observe(document.body, { childList: true, subtree: true });

    fireEvent.click(screen.getByRole("button", { name: "Switch user" }));
    await screen.findByText("Who's training?", undefined, { timeout: 3000 });
    seen.disconnect();

    expect(blankAt).toBeGreaterThan(0);
    expect(chooserAt - blankAt).toBeGreaterThanOrEqual(115); // timer granularity
    for (const n of workoutNames) expect(chooserText).not.toContain(n);
    expect(chooserText).not.toMatch(/BPM|Hi, Luis|This week/);
    // the only trace of Luis is the opted-in, locked tile
    expect(screen.getByRole("button", { name: /Luis, locked/ })).toBeInTheDocument();
    expect(localStorage.getItem(TV_SESSION_KEY)).toBeNull();
    expect(await tv.auth.getUser()).toBeNull();
    // the grant was revoked server-side
    expect((await phone.devices.list()).some((g) => g.device_id.startsWith("tv-"))).toBe(false);
  }, 15_000);

  it("without opting in, a lock forgets the name: first run, not a chooser tile", async () => {
    await pairAsLuis();
    fireEvent.click(screen.getByRole("button", { name: "Switch user" }));
    await screen.findByRole("button", { name: TV_COPY.getStarted }, { timeout: 3000 });
    expect(document.body.textContent).not.toContain("Luis");
  }, 15_000);

  it("Back on Home shows the exit toast and tells the shell it may exit", async () => {
    await pairAsLuis();
    const w = window as Window & { dillan?: { onBack?: () => boolean } };
    let r: boolean | undefined;
    act(() => {
      r = w.dillan?.onBack?.();
    });
    expect(r).toBe(false);
    expect(await screen.findByText(EXIT_TOAST)).toBeInTheDocument();
    // Program → Back → Home (handled, so the shell must not exit)
    fireEvent.click(screen.getByRole("button", { name: "Program" }));
    await waitFor(() => expect(screenKey()).toBe("program"));
    act(() => {
      r = w.dillan?.onBack?.();
    });
    expect(r).toBe(true);
    await waitFor(() => expect(screenKey()).toBe("home"));
  }, 15_000);

  it("dashboard: Back pauses, Back on Paused does nothing, Play/Pause resumes (acceptance 22)", async () => {
    await pairAsLuis();
    // (the two mock instances share the db but not listeners: start it where the TV listens)
    const tpl = (await tv.templates.list())[0]!;
    const s = await tv.sessions.start({ templateId: tpl.id, liveData: false, timezone: "UTC" });
    await tv.sessions.command({
      sessionId: s.session!.id,
      kind: "start",
      expectedRevision: s.session!.revision,
      source: "phone",
    });
    fireEvent.click(await screen.findByRole("button", { name: "Back to workout" }));
    await screen.findByRole("button", { name: "Complete set" });
    fireEvent.keyDown(window, { key: "Escape", keyCode: 27 });
    await screen.findByRole("button", { name: "Resume" });
    expect((await phone.sessions.current())?.state).toBe("paused");
    fireEvent.keyDown(window, { key: "Escape", keyCode: 27 });
    await new Promise((r) => setTimeout(r, 50));
    expect((await phone.sessions.current())?.state).toBe("paused");
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "MediaPlayPause", keyCode: 179 });
    await waitFor(async () => expect((await phone.sessions.current())?.state).toBe("active"));
    // commands from the TV are labelled as such
    expect((await phone.sessions.current())?.last_source).toBe("tv");
  }, 15_000);

  it("Switch user during a workout opens M4 with Cancel first; End and save, then continue (acceptance 10)", async () => {
    await pairAsLuis();
    const tpl = (await tv.templates.list())[0]!;
    const s = await tv.sessions.start({ templateId: tpl.id, liveData: false, timezone: "UTC" });
    await tv.sessions.command({
      sessionId: s.session!.id,
      kind: "start",
      expectedRevision: s.session!.revision,
      source: "phone",
    });
    fireEvent.click(await screen.findByRole("button", { name: "Back to workout" }));
    await screen.findByRole("button", { name: "Complete set" });
    fireEvent.keyDown(window, { key: "Escape", keyCode: 27 }); // pause
    await screen.findByRole("button", { name: "Resume" });
    fireEvent.click(screen.getByRole("button", { name: "Switch user" }));
    expect(await screen.findByText("A workout is running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("data-autofocus");
    // Back = Cancel: the workout is exactly as it was
    fireEvent.keyDown(window, { key: "Escape", keyCode: 27 });
    await waitFor(() => expect(screen.queryByText("A workout is running")).toBeNull());
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect((await tv.sessions.current())?.state).toBe("paused");
    // again, and end it this time
    fireEvent.click(screen.getByRole("button", { name: "Switch user" }));
    fireEvent.click(await screen.findByRole("button", { name: "End and save, then continue" }));
    await screen.findByRole("button", { name: TV_COPY.getStarted }, { timeout: 4000 });
    expect(await phone.sessions.current()).toBeNull();
    const hist = await phone.sessions.history({ limit: 1 });
    expect(hist[0]?.session_id).toBe(s.session!.id);
    expect(hist[0]?.outcome).toBe("partial");
  }, 15_000);

  it("a reload with an active workout pauses it and says why (acceptance 21)", async () => {
    await pairAsLuis();
    cleanup();
    const tpl = (await phone.templates.list())[0]!;
    const s = await phone.sessions.start({ templateId: tpl.id, liveData: false, timezone: "UTC" });
    await phone.sessions.command({
      sessionId: s.session!.id,
      kind: "start",
      expectedRevision: s.session!.revision,
      source: "phone",
    });
    renderTv(); // "reload": marker + grant are still valid
    expect(
      await screen.findByText("Paused while Dillan was in the background", undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toHaveAttribute("data-autofocus");
    expect((await phone.sessions.current())?.state).toBe("paused");
  }, 15_000);

  it("a grant revoked from the phone locks the TV on its next check", async () => {
    await pairAsLuis();
    cleanup();
    const g = (await phone.devices.list()).find((x) => x.device_id.startsWith("tv-"))!;
    await phone.devices.revoke(g.id);
    renderTv();
    await screen.findByRole("button", { name: TV_COPY.getStarted }, { timeout: 3000 });
    expect(await tv.auth.getUser()).toBeNull();
    expect(localStorage.getItem(TV_SESSION_KEY)).toBeNull();
  }, 15_000);

  it("a grant revoked while the TV is showing private data locks it on the 60 s check", async () => {
    const ticks: Array<() => void> = [];
    const real = globalThis.setInterval;
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      fn: () => void,
      ms?: number,
      ...rest: unknown[]
    ) => {
      if (ms === GRANT_CHECK_MS) ticks.push(fn);
      return real(fn, ms, ...rest);
    }) as typeof setInterval);
    await pairAsLuis();
    await screen.findByText(/Upper Body/);
    expect(ticks.length).toBeGreaterThan(0);
    const g = (await phone.devices.list()).find((x) => x.device_id.startsWith("tv-"))!;
    await phone.devices.revoke(g.id);
    act(() => ticks[ticks.length - 1]!());
    await screen.findByRole("button", { name: TV_COPY.getStarted }, { timeout: 3000 });
    expect(document.body.textContent).not.toMatch(/Upper Body|Hi, Luis/);
    expect(await tv.auth.getUser()).toBeNull();
    expect(localStorage.getItem(TV_SESSION_KEY)).toBeNull();
  }, 15_000);

  it("popstate Back: after the exit toast the guard is re-armed once the user stays", async () => {
    const guarded = () =>
      !!(window.history.state as { dillanTvGuard?: number } | null)?.dillanTvGuard;
    // what the browser does on a history Back from the guard entry
    const popBack = () =>
      act(() => {
        window.history.replaceState(null, "");
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      });
    await pairAsLuis();
    expect(guarded()).toBe(true);
    popBack();
    expect(await screen.findByText(EXIT_TOAST)).toBeInTheDocument();
    expect(guarded()).toBe(false); // an immediate second Back may leave
    fireEvent.keyDown(window, { key: "ArrowRight", keyCode: 39 }); // the user stays
    expect(guarded()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Program" }));
    await waitFor(() => expect(screenKey()).toBe("program"));
    popBack();
    await waitFor(() => expect(screenKey()).toBe("home"));
    expect(guarded()).toBe(true);
  }, 15_000);

  async function startActive(api: Api = tv) {
    const tpl = (await api.templates.list())[0]!;
    const s = await api.sessions.start({ templateId: tpl.id, liveData: false, timezone: "UTC" });
    await api.sessions.command({
      sessionId: s.session!.id,
      kind: "start",
      expectedRevision: s.session!.revision,
      source: "phone",
    });
    return s.session!.id;
  }
  const setVisibility = (v: "hidden" | "visible") =>
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
      document.dispatchEvent(new Event("visibilitychange"));
    });

  it("hidden without a reload (Fire TV Home): paused, and Paused with the reason on return (F6)", async () => {
    await pairAsLuis();
    await startActive();
    await screen.findByRole("button", { name: "Back to workout" });
    setVisibility("hidden");
    await waitFor(async () => expect((await phone.sessions.current())?.state).toBe("paused"));
    setVisibility("visible");
    expect(
      await screen.findByText("Paused while Dillan was in the background", undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toHaveAttribute("data-autofocus");
    // the reason belongs to that pause only: resume with Play/Pause, pause again with Back
    fireEvent.keyDown(window, { key: "MediaPlayPause", keyCode: 179 });
    await waitFor(async () => expect((await phone.sessions.current())?.state).toBe("active"));
    await screen.findByRole("button", { name: "Complete set" });
    fireEvent.keyDown(window, { key: "Escape", keyCode: 27 });
    await screen.findByRole("button", { name: "Resume" });
    expect(screen.queryByText("Paused while Dillan was in the background")).toBeNull();
  }, 15_000);

  it("a held OK (auto-repeat) acts once: no extra sets, no skipped rest", async () => {
    // jsdom has no layout; give every focusable a box so the focus engine can focus
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
      () => [{}] as unknown as DOMRectList,
    );
    await pairAsLuis();
    const id = await startActive();
    fireEvent.click(await screen.findByRole("button", { name: "Back to workout" }));
    const complete = await screen.findByRole("button", { name: "Complete set" });
    await waitFor(() => expect(complete).toHaveAttribute("data-focused"));
    const rev0 = (await phone.sessions.recover(id))!.revision;
    fireEvent.keyDown(window, { key: "Enter", keyCode: 13 });
    await waitFor(async () => expect((await phone.sessions.recover(id))!.revision).toBe(rev0 + 1));
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(window, { key: "Enter", keyCode: 13, repeat: true });
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 100));
    expect((await phone.sessions.recover(id))!.revision).toBe(rev0 + 1);
  }, 15_000);

  it("the TV never writes the session command queue to persistent storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    await pairAsLuis();
    await startActive();
    fireEvent.click(await screen.findByRole("button", { name: "Back to workout" }));
    await screen.findByRole("button", { name: "Complete set" });
    fireEvent.keyDown(window, { key: "Escape", keyCode: 27 }); // pause, through the queue
    await waitFor(async () => expect((await phone.sessions.current())?.state).toBe("paused"));
    expect(setItem.mock.calls.some(([k]) => String(k).startsWith("dillan.v1.cmdq"))).toBe(false);
  }, 15_000);

  it("a failed load is an error with Try again, never 'No workouts yet'", async () => {
    const failing: DillanApi = {
      ...tv,
      templates: {
        ...tv.templates,
        list: async () => {
          throw new Error("network");
        },
      },
    };
    setApiForTests(failing);
    await pairAsLuis(failing);
    fireEvent.click(screen.getByRole("button", { name: "Program" }));
    expect(await screen.findByText(TV_LOAD_COPY.failed)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TV_LOAD_COPY.retry })).toHaveAttribute(
      "data-autofocus",
    );
    expect(screen.queryByText("No workouts yet")).toBeNull();
  }, 15_000);

  it("a session this TV did not pair is never shown", async () => {
    // e.g. the phone app signed in in the same browser: no TV marker → signed-out TV
    await tv.auth.verifyOtp("email", "luis@example.com", "123456");
    renderTv();
    await screen.findByRole("button", { name: TV_COPY.getStarted });
    expect(document.body.textContent).not.toContain("Upper Body");
  });
});

// ------------------------------------------------------------------ Slice E review fixes
describe("TV heart rate on the real screens (acceptance 43, 45)", () => {
  const SRC = "00000000-0000-4000-8000-0000000000aa";
  const STREAM = "00000000-0000-4000-8000-0000000000bb";
  let seq = 0;
  /** a real (web_ble) relay tab publishing for Luis through the phone's mock hr_ingest */
  async function relay(mode: "idle" | "live" | "no_contact", bpm: number | null = null) {
    const me = (await phone.auth.getUser())!;
    const at = new Date().toISOString();
    return phone.hr.ingest({
      p_source_id: SRC,
      p_stream_id: STREAM,
      p_expected_user_id: me.id,
      p_source_kind: "web_ble",
      p_mode: mode,
      p_connected_at: at,
      p_sensor: { name: "Polar H10 1A2B3C4D", serial: "1A2B3C4D", battery_pct: 80 },
      p_claim: true,
      p_samples:
        mode === "idle"
          ? []
          : [{ seq: ++seq, measured_at: at, bpm, contact: mode === "live", rr_ms: null }],
      p_source_name: "Gym tablet",
      p_platform: "android",
    });
  }
  /** jsdom has no layout: every focusable gets a box, left to right in DOM order */
  function layout() {
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
      () => [{}] as unknown as DOMRectList,
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const all = [...document.querySelectorAll("[data-focus]")];
      const i = Math.max(0, all.indexOf(this));
      return { left: i * 200, right: i * 200 + 150, top: 0, bottom: 80 } as DOMRect;
    });
  }
  const focused = () => document.querySelector("[data-focused]")?.getAttribute("data-focus-id");
  const start = () => document.querySelector('[data-focus-id="pre-start"]') as HTMLElement;

  async function openPreflight() {
    await pairAsLuis();
    fireEvent.click(await screen.findByRole("button", { name: "Workout Now" }));
    const tpl = (await tv.templates.list())[0]!;
    await waitFor(() =>
      expect(document.querySelector(`[data-focus-id="choose-${tpl.id}"]`)).not.toBeNull(),
    );
    fireEvent.click(document.querySelector(`[data-focus-id="choose-${tpl.id}"]`) as HTMLElement);
    await waitFor(() => expect(screenKey()).toBe(`preflight:${tpl.id}`));
    // heart rate read (the initial focus decision is made on it)
    await waitFor(() => expect(screen.queryByText("Checking heart rate…")).toBeNull());
  }

  it("43: HR turns Live while focus is on Continue: focus stays, Start enabled, announced, toast", async () => {
    layout();
    await relay("idle");
    await openPreflight();
    await waitFor(() => expect(focused()).toBe("pre-nolive"));
    expect(start()).toHaveAttribute("aria-disabled", "true");
    await relay("live", 120);
    await waitFor(() => expect(start()).not.toHaveAttribute("aria-disabled"), { timeout: 4000 });
    expect(focused()).toBe("pre-nolive");
    expect(await screen.findByText("Heart rate ready")).toBeInTheDocument();
    expect(await screen.findByText("Heart rate: Live")).toBeInTheDocument();
    expect(focused()).toBe("pre-nolive");
  }, 15_000);

  it("43: focus on Show relay QR (or its dialog) survives HR turning Live", async () => {
    layout();
    await relay("idle");
    await openPreflight();
    await waitFor(() => expect(focused()).toBe("pre-nolive"));
    fireEvent.keyDown(window, { key: "ArrowRight", keyCode: 39 });
    await waitFor(() => expect(focused()).toBe("pre-relay-qr"));
    fireEvent.keyDown(window, { key: "Enter", keyCode: 13 });
    await waitFor(() => expect(focused()).toBe("relay-qr-close"));
    await relay("live", 120);
    await screen.findByText("Heart rate ready", undefined, { timeout: 4000 });
    fireEvent.keyDown(window, { key: "Escape", keyCode: 27 }); // Back closes the QR
    await waitFor(() => expect(focused()).toBe("pre-relay-qr"));
  }, 15_000);

  it("opened Live, HR drops and comes back: focus stays on Start the whole time", async () => {
    layout();
    await relay("live", 120);
    await openPreflight();
    await waitFor(() => expect(focused()).toBe("pre-start"));
    await relay("no_contact");
    await waitFor(() => expect(start()).toHaveAttribute("aria-disabled", "true"), {
      timeout: 4000,
    });
    expect(focused()).toBe("pre-start");
    // OK on a soft-disabled Start does nothing
    fireEvent.keyDown(window, { key: "Enter", keyCode: 13 });
    await new Promise((r) => setTimeout(r, 100));
    expect(await phone.sessions.current()).toBeNull();
    await relay("live", 121);
    await waitFor(() => expect(start()).not.toHaveAttribute("aria-disabled"), { timeout: 4000 });
    expect(focused()).toBe("pre-start");
  }, 20_000);

  it("45: on the real S09 dashboard, Down from All zones is Heart rate, then Pause", async () => {
    await pairAsLuis();
    const tpl = (await tv.templates.list())[0]!;
    const s = await tv.sessions.start({ templateId: tpl.id, liveData: true, timezone: "UTC" });
    await tv.sessions.command({
      sessionId: s.session!.id,
      kind: "start",
      expectedRevision: s.session!.revision,
      source: "phone",
    });
    fireEvent.click(await screen.findByRole("button", { name: "Back to workout" }));
    await screen.findByRole("button", { name: "All zones" });
    const root = document.querySelector(".tv-root") as HTMLElement;
    const e = new FocusEngine(root, { isVisible: () => true, scroll: false });
    e.setFocus(root.querySelector('[data-focus-id="all-zones"]'));
    e.move("down");
    expect(e.focusedId()).toBe("hr-panel");
    e.move("down");
    expect(e.focusedId()).toBe("pause");
  }, 15_000);
});
