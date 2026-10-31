// Slice D: the TV surface end to end on the mock backend — pairing states (S03), phone approve →
// TV signs in (acceptance 4), switch user renders a blank frame and no private DOM survives into
// the chooser (acceptance 9), Back on Home (exit toast, onBack() → false), the dashboard's Back =
// Pause and the paused overlay's Back no-op (acceptance 22), reload pause (acceptance 21) and a
// revoked grant locking the TV.

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DillanApi, TvChallenge, TvPairPoll } from "@/v1/data/api";
import { setApiForTests } from "@/v1/data/client";
import { createMockApi, MOCK_TV_SESSION_KEY } from "@/v1/data/mock-api";
import { MOCK_LUIS, seedMockDb, type MockDb } from "@/v1/data/mock-fixtures";
import { rememberProfile } from "@/v1/tv/device";
import { EXIT_TOAST } from "@/v1/tv/screens";
import { Pairing, TV_COPY } from "@/v1/tv/signed-out";
import { TV_SESSION_KEY, TvApp } from "@/v1/tv/tv-app";

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

async function pairAsLuis() {
  renderTv();
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

  it("a session this TV did not pair is never shown", async () => {
    // e.g. the phone app signed in in the same browser: no TV marker → signed-out TV
    await tv.auth.verifyOtp("email", "luis@example.com", "123456");
    renderTv();
    await screen.findByRole("button", { name: TV_COPY.getStarted });
    expect(document.body.textContent).not.toContain("Upper Body");
  });
});
