// Email sign-in by link (the default Lovable Cloud email has only a "Log In" link, no code).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => {
  const signInWithOtp = vi.fn(async (_args: unknown) => ({ data: {}, error: null }));
  const setSession = vi.fn(async (_args: unknown) => ({
    data: { user: { id: "u-link", email: "luis@example.com", phone: null }, session: {} },
    error: null,
  }));
  return { signInWithOtp, setSession, client: { auth: { signInWithOtp, setSession } } };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: sb.client }));

import { setApiForTests } from "@/v1/data/client";
import { createMockApi, MOCK_LINK_PREFIX } from "@/v1/data/mock-api";
import { seedMockDb } from "@/v1/data/mock-fixtures";
import {
  AUTH_CALLBACK_PATH,
  captureAuthCallback,
  confirmPendingLink,
  dropPendingLink,
  emailRedirectUrl,
  linkTokenIdentity,
  pendingLink,
  parseAuthCallback,
  readLinkRequest,
  rememberLinkRequest,
  resetAuthCallbackForTests,
  settleAuthCallback,
  stripAuthCallback,
  takeLinkOutcome,
} from "@/v1/data/auth-callback";
import { TV_SESSION_KEY } from "@/v1/tv/marker";
import {
  AUTH_COPY,
  AuthFlow,
  LINK_ERRORS,
  LINK_PENDING_COPY,
  LinkPending,
} from "@/v1/ui/auth-flow";

const TOKENS = "access_token=AT&refresh_token=RT&expires_in=3600&token_type=bearer&type=magiclink";

function land(path: string) {
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  resetAuthCallbackForTests();
  window.localStorage.clear();
  land("/");
});

afterEach(() => {
  cleanup();
  setApiForTests(null);
  sb.signInWithOtp.mockClear();
  sb.setSession.mockClear();
  window.localStorage.clear();
  land("/");
});

describe("sendOtp: where the email link returns", () => {
  it("emailRedirectTo is this origin's /auth plus a same-origin ?redirect= only", async () => {
    land("/auth?redirect=https://evil.example/x");
    const { createSupabaseApi } = await import("@/v1/data/supabase-api");
    const api = createSupabaseApi();
    await api.auth.sendOtp("email", "luis@example.com");
    expect(sb.signInWithOtp).toHaveBeenLastCalledWith({
      email: "luis@example.com",
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth` },
    });
    // The return target travels in the link (another browser context has no localStorage).
    await api.auth.sendOtp("email", "luis@example.com", { returnTo: "/approve-tv?code=ABCD" });
    expect(sb.signInWithOtp).toHaveBeenLastCalledWith({
      email: "luis@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth?redirect=%2Fapprove-tv%3Fcode%3DABCD`,
      },
    });
    // Never another host (no open redirect), never back to /auth.
    await api.auth.sendOtp("email", "luis@example.com", { returnTo: "https://evil.example/x" });
    expect(sb.signInWithOtp).toHaveBeenLastCalledWith({
      email: "luis@example.com",
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth` },
    });
    expect(emailRedirectUrl("https://preview--x.lovable.app")).toBe(
      "https://preview--x.lovable.app/auth",
    );
    expect(emailRedirectUrl("https://a.test", "//evil.example")).toBe("https://a.test/auth");
    expect(emailRedirectUrl("https://a.test", "/auth?redirect=/x")).toBe("https://a.test/auth");
    expect(AUTH_CALLBACK_PATH).toBe("/auth");
  });

  it("the SMS path is unchanged", async () => {
    const { createSupabaseApi } = await import("@/v1/data/supabase-api");
    await createSupabaseApi().auth.sendOtp("sms", "+15615550100");
    expect(sb.signInWithOtp).toHaveBeenCalledWith({
      phone: "+15615550100",
      options: { shouldCreateUser: true, channel: "sms" },
    });
  });

  it("signInWithLink adopts the link's session", async () => {
    const { createSupabaseApi } = await import("@/v1/data/supabase-api");
    const r = await createSupabaseApi().auth.signInWithLink({
      accessToken: "AT",
      refreshToken: "RT",
    });
    expect(sb.setSession).toHaveBeenCalledWith({ access_token: "AT", refresh_token: "RT" });
    expect(r).toEqual({
      ok: true,
      user: { id: "u-link", email: "luis@example.com", phone: null },
    });
  });
});

describe("link landing (parse / strip)", () => {
  it("reads tokens from the hash and errors from hash or query, never keeping raw text", () => {
    expect(parseAuthCallback(`https://a.test/auth#${TOKENS}`)).toEqual({
      kind: "tokens",
      accessToken: "AT",
      refreshToken: "RT",
    });
    const expired = parseAuthCallback(
      "https://a.test/auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(expired).toEqual({ kind: "error", error: "expired" });
    expect(JSON.stringify(expired)).not.toContain("invalid or has");
    expect(
      parseAuthCallback("https://a.test/auth?error=x&error_description=%3Cimg%20src%3Dx%3E"),
    ).toEqual({ kind: "error", error: "invalid" });
    expect(parseAuthCallback("https://a.test/approve-tv?code=ABCD")).toEqual({ kind: "none" });
  });

  it("strips only the auth params, keeping the rest of the URL", () => {
    expect(stripAuthCallback(`https://a.test/auth?mock=1#${TOKENS}`)).toBe(
      "https://a.test/auth?mock=1",
    );
    expect(
      stripAuthCallback(
        "https://a.test/auth?x=1&error=e&error_code=otp_expired&error_description=d",
      ),
    ).toBe("https://a.test/auth?x=1");
    expect(stripAuthCallback("https://a.test/approve-tv?code=ABCD#top")).toBe(
      "https://a.test/approve-tv?code=ABCD#top",
    );
  });
});

describe("link landing (capture + settle)", () => {
  function mock() {
    return createMockApi({ storage: null, db: seedMockDb() });
  }

  it("signs in with the link and clears the tokens from the address bar", async () => {
    const api = mock();
    rememberLinkRequest({ email: "Luis@Example.com", returnTo: null });
    const spy = vi.spyOn(api.auth, "signInWithLink");
    land(
      `/auth#access_token=${encodeURIComponent(MOCK_LINK_PREFIX + "luis@example.com")}&refresh_token=mock&expires_in=3600&token_type=bearer&type=magiclink`,
    );
    captureAuthCallback();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("access_token");
    await settleAuthCallback(api);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(takeLinkOutcome()).toEqual({ kind: "signed_in" });
    expect(takeLinkOutcome()).toBeNull(); // once per page load
    expect((await api.auth.getUser())?.email).toBe("luis@example.com");
  });

  it("an expired link becomes a friendly error and the params are stripped", async () => {
    const api = mock();
    land(
      "/auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid",
    );
    captureAuthCallback();
    expect(window.location.href).toBe(`${window.location.origin}/auth`);
    await settleAuthCallback(api);
    expect(takeLinkOutcome()).toEqual({ kind: "error", error: "expired" });
  });

  it("a TV-marked browser is never turned into a phone session by a link", async () => {
    const api = mock();
    const spy = vi.spyOn(api.auth, "signInWithLink");
    window.localStorage.setItem(
      TV_SESSION_KEY,
      JSON.stringify({ userId: "tv-user", grantId: "g" }),
    );
    land(`/auth#${TOKENS}`);
    captureAuthCallback();
    expect(window.location.href).not.toContain("access_token");
    await settleAuthCallback(api);
    expect(spy).not.toHaveBeenCalled();
    expect(takeLinkOutcome()).toEqual({ kind: "error", error: "tv_device" });
    expect(await api.auth.getUser()).toBeNull();
  });

  it("tokens on the TV surface are never adopted", async () => {
    const api = mock();
    const spy = vi.spyOn(api.auth, "signInWithLink");
    land(`/tv#${TOKENS}`);
    await settleAuthCallback(api);
    expect(spy).not.toHaveBeenCalled();
    expect(takeLinkOutcome()).toEqual({ kind: "error", error: "tv_device" });
  });

  it("the mock email carries a working link (?mock=1 parity)", async () => {
    const api = mock();
    rememberLinkRequest({ email: "ana@example.com", returnTo: null });
    await api.auth.sendOtp("email", "Ana@Example.com");
    const link = api.lastEmailLink();
    expect(link).toMatch(/\/auth\?mock=1#access_token=/);
    land(link!.slice(window.location.origin.length));
    await settleAuthCallback(api);
    expect(takeLinkOutcome()).toEqual({ kind: "signed_in" });
    expect((await api.auth.getUser())?.email).toBe("ana@example.com");
    expect(window.location.search).toBe("?mock=1");
  });
});

describe("remembered link request", () => {
  it("expires with the link (about an hour)", () => {
    rememberLinkRequest({ email: "A@b.co", returnTo: "/approve-tv?code=X" }, 1_000);
    expect(readLinkRequest(1_000 + 30 * 60_000)).toEqual({
      email: "a@b.co",
      returnTo: "/approve-tv?code=X",
    });
    expect(readLinkRequest(1_000 + 2 * 3600_000)).toBeNull();
  });
});

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

function linkHash(email: string) {
  const at = encodeURIComponent(MOCK_LINK_PREFIX + email);
  return `access_token=${at}&refresh_token=mock&expires_in=3600&token_type=bearer&type=magiclink`;
}

function signedInMock() {
  return createMockApi({ storage: null, db: seedMockDb() });
}

describe("link landing: only links this browser asked for are adopted silently", () => {
  it("reads the email (and sub) from a GoTrue access token", () => {
    expect(linkTokenIdentity(jwt({ sub: "u1", email: "Luis@Example.com" }))).toEqual({
      email: "luis@example.com",
      sub: "u1",
    });
    expect(linkTokenIdentity(MOCK_LINK_PREFIX + "a@b.co")).toEqual({ email: "a@b.co", sub: null });
    expect(linkTokenIdentity("not-a-jwt")).toBeNull();
    expect(linkTokenIdentity(jwt({ sub: "u1" }))).toBeNull();
  });

  it("a link with no pending request here waits for confirmation (login CSRF)", async () => {
    const api = signedInMock();
    const spy = vi.spyOn(api.auth, "signInWithLink");
    land(`/auth#${linkHash("attacker@example.com")}`);
    await settleAuthCallback(api);
    expect(spy).not.toHaveBeenCalled();
    expect(await api.auth.getUser()).toBeNull();
    expect(takeLinkOutcome()).toBeNull();
    expect(pendingLink()).toEqual({
      reason: "confirm",
      email: "attacker@example.com",
      switching: false,
    });
    await confirmPendingLink(api);
    expect(pendingLink()).toBeNull();
    expect(takeLinkOutcome()).toEqual({ kind: "signed_in" });
    expect((await api.auth.getUser())?.email).toBe("attacker@example.com");
  });

  it("a link for another email than the one requested waits for confirmation", async () => {
    const api = signedInMock();
    rememberLinkRequest({ email: "luis@example.com", returnTo: null });
    land(`/auth#${linkHash("attacker@example.com")}`);
    await settleAuthCallback(api);
    expect(await api.auth.getUser()).toBeNull();
    expect(pendingLink()?.reason).toBe("confirm");
    dropPendingLink();
    expect(pendingLink()).toBeNull();
  });

  it("never silently replaces the account already signed in here", async () => {
    const api = signedInMock();
    await api.auth.verifyOtp("email", "luis@example.com", "123456");
    rememberLinkRequest({ email: "attacker@example.com", returnTo: null });
    land(`/auth#${linkHash("attacker@example.com")}`);
    await settleAuthCallback(api);
    expect((await api.auth.getUser())?.email).toBe("luis@example.com");
    expect(pendingLink()).toEqual({
      reason: "confirm",
      email: "attacker@example.com",
      switching: true,
    });
  });

  it("a network failure keeps the link for Try again instead of asking for a new one", async () => {
    const api = signedInMock();
    rememberLinkRequest({ email: "luis@example.com", returnTo: null });
    const real = api.auth.signInWithLink.bind(api.auth);
    const spy = vi
      .spyOn(api.auth, "signInWithLink")
      .mockResolvedValueOnce({ ok: false, error: "network" });
    land(`/auth#${linkHash("luis@example.com")}`);
    await settleAuthCallback(api);
    expect(takeLinkOutcome()).toBeNull();
    expect(pendingLink()).toEqual({ reason: "retry", email: "luis@example.com", switching: false });
    spy.mockImplementation(real);
    await confirmPendingLink(api);
    expect(takeLinkOutcome()).toEqual({ kind: "signed_in" });
    expect((await api.auth.getUser())?.email).toBe("luis@example.com");
  });

  it("a rejected link is a friendly error pre-filled only with the link's own email", async () => {
    const api = signedInMock();
    rememberLinkRequest({ email: "luis@example.com", returnTo: null });
    vi.spyOn(api.auth, "signInWithLink").mockResolvedValue({ ok: false, error: "invalid_code" });
    land(`/auth#${linkHash("luis@example.com")}`);
    await settleAuthCallback(api);
    expect(pendingLink()).toBeNull();
    expect(takeLinkOutcome()).toEqual({
      kind: "error",
      error: "invalid",
      email: "luis@example.com",
    });
  });

  it("the mock email link carries the return target", async () => {
    const api = signedInMock();
    await api.auth.sendOtp("email", "ana@example.com", { returnTo: "/approve-tv?code=X" });
    expect(api.lastEmailLink()).toMatch(
      /\/auth\?redirect=%2Fapprove-tv%3Fcode%3DX&mock=1#access_token=/,
    );
  });
});

describe("/auth route beforeLoad (link landing joined to the route)", () => {
  type Ctx = {
    target?: string;
    pending: unknown;
    linkError: string | null;
    linkEmail: string;
    needsName: boolean;
    profileFailed: boolean;
  };
  async function beforeLoad(search: { redirect?: string } = {}): Promise<Ctx> {
    const { Route } = await import("@/routes/auth");
    const fn = Route.options.beforeLoad as unknown as (a: { search: unknown }) => Promise<Ctx>;
    return fn({ search });
  }
  async function redirectHref(p: Promise<unknown>): Promise<string> {
    try {
      await p;
    } catch (e) {
      const r = e as { options?: { href?: string }; href?: string };
      return r.options?.href ?? r.href ?? "(no href)";
    }
    throw new Error("expected a redirect");
  }
  async function existingUser(api: ReturnType<typeof signedInMock>) {
    await api.auth.verifyOtp("email", "luis@example.com", "123456");
    await api.profile.update({
      display_name: "Luis",
      timezone: "UTC",
      weight_unit: "lb",
      complete_name_step: true,
    });
  }

  it("goes to the stored return target, and keeps it when the profile read is retried", async () => {
    const api = signedInMock();
    await existingUser(api);
    await api.auth.signOut();
    rememberLinkRequest({ email: "luis@example.com", returnTo: "/approve-tv?code=X" });
    land(`/auth#${linkHash("luis@example.com")}`);
    await settleAuthCallback(api);
    setApiForTests(api);

    // First run: the profile read fails (flaky network) -> profileFailed, target kept.
    const get = vi.spyOn(api.profile, "get").mockRejectedValueOnce(new Error("offline"));
    const first = await beforeLoad();
    expect(first.profileFailed).toBe(true);
    expect(first.target).toBe("/approve-tv?code=X");
    // "Try again" = router.invalidate(): beforeLoad runs again with no link outcome.
    get.mockRestore();
    expect(await redirectHref(beforeLoad())).toBe("/approve-tv?code=X");
    expect(readLinkRequest()).toBeNull(); // cleared once sign-in continued
  });

  it("the link's own ?redirect= works without any stored request", async () => {
    const api = signedInMock();
    await existingUser(api);
    setApiForTests(api);
    expect(await redirectHref(beforeLoad({ redirect: "/approve-tv?code=Y" }))).toBe(
      "/approve-tv?code=Y",
    );
  });

  it("an unexpected link shows the confirm screen, not a session", async () => {
    const api = signedInMock();
    land(`/auth#${linkHash("attacker@example.com")}`);
    await settleAuthCallback(api);
    setApiForTests(api);
    const ctx = await beforeLoad();
    expect(ctx.pending).toEqual({
      reason: "confirm",
      email: "attacker@example.com",
      switching: false,
    });
    expect(await api.auth.getUser()).toBeNull();
  });

  it("a bare error param never reveals the remembered email", async () => {
    const api = signedInMock();
    rememberLinkRequest({ email: "someone@example.com", returnTo: null });
    land("/auth#error_description=x");
    await settleAuthCallback(api);
    setApiForTests(api);
    const ctx = await beforeLoad();
    expect(ctx.linkError).toBe("invalid");
    expect(ctx.linkEmail).toBe("");
  });
});

describe("S02 check-email screen", () => {
  function setup(props: Partial<Parameters<typeof AuthFlow>[0]> = {}) {
    const api = createMockApi({ storage: null, db: seedMockDb() });
    setApiForTests(api);
    const onDone = vi.fn();
    render(<AuthFlow initialStep="contact" onDone={onDone} {...props} />);
    return { api, onDone };
  }

  async function sendLink(email = "luis@example.com") {
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.sendLink }));
    await screen.findByRole("heading", { name: AUTH_COPY.checkEmail });
  }

  it("is link-first: honest copy, no code boxes until asked, resend and change-email kept", async () => {
    setup({ returnTo: "/approve-tv?code=ABCD" });
    await sendLink();
    expect(screen.getByText(/We sent a sign-in link to/)).toHaveTextContent(
      "We sent a sign-in link to luis@example.com. Open it on this device to sign in.",
    );
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
    expect(screen.queryByText(/expire/i)).toBeNull();
    expect(screen.getByRole("button", { name: AUTH_COPY.resendLinkIn(30) })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change it" })).toBeInTheDocument();
    expect(readLinkRequest()).toEqual({
      email: "luis@example.com",
      returnTo: "/approve-tv?code=ABCD",
    });
  });

  it("a 6-digit code still verifies through the secondary path", async () => {
    const { onDone } = setup();
    await sendLink();
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.haveCode }));
    const input = await screen.findByLabelText("6-digit code");
    fireEvent.change(input, { target: { value: "123456" } });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("continues when the link signs in from another tab of this browser", async () => {
    const { api, onDone } = setup();
    await sendLink("new.person@example.com");
    // The other tab adopted the session; this tab hears the auth change.
    await api.auth.signInWithLink({
      accessToken: MOCK_LINK_PREFIX + "new.person@example.com",
      refreshToken: "mock",
    });
    expect(await screen.findByLabelText("What should we call you?")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a paired TV's session never counts as signing in here", async () => {
    const { api, onDone } = setup();
    api.tv.isTvSession = () => true;
    await sendLink();
    await api.auth.signInWithLink({
      accessToken: MOCK_LINK_PREFIX + "luis@example.com",
      refreshToken: "mock",
    });
    window.dispatchEvent(new Event("focus"));
    await new Promise((r) => setTimeout(r, 20));
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: AUTH_COPY.checkEmail })).toBeInTheDocument();
  });

  it("a failed link shows a friendly message on the email step and can send a new link", async () => {
    const { api } = setup({ linkError: "expired", initialEmail: "luis@example.com" });
    const send = vi.spyOn(api.auth, "sendOtp");
    expect(screen.getByText(LINK_ERRORS.expired)).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("luis@example.com");
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.sendLink }));
    await screen.findByRole("heading", { name: AUTH_COPY.checkEmail });
    expect(send).toHaveBeenCalledWith("email", "luis@example.com", { returnTo: undefined });
  });

  it("the confirm screen names the link's email and lets the person decline", async () => {
    const onContinue = vi.fn(async () => {});
    const onCancel = vi.fn();
    render(
      <LinkPending
        pending={{ reason: "confirm", email: "x@example.com", switching: true }}
        onContinue={onContinue}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(/This link signs in as/)).toHaveTextContent("x@example.com");
    expect(screen.getByText(LINK_PENDING_COPY.confirmSwitch)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: LINK_PENDING_COPY.notMe }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: LINK_PENDING_COPY.confirm }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  });

  it("the TV-browser message says to use the phone", () => {
    setup({ linkError: "tv_device" });
    expect(screen.getByText(LINK_ERRORS.tv_device)).toBeInTheDocument();
  });
});
