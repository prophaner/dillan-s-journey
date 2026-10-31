import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiForTests } from "@/v1/data/client";
import { createMockApi } from "@/v1/data/mock-api";
import { seedMockDb } from "@/v1/data/mock-fixtures";
import type { DillanApi } from "@/v1/data/api";
import { AUTH_COPY, AuthFlow } from "@/v1/ui/auth-flow";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setApiForTests(null);
});

function setup(patch?: (api: DillanApi) => void) {
  const api = createMockApi({ storage: null, db: seedMockDb() });
  patch?.(api);
  setApiForTests(api);
  const onDone = vi.fn();
  render(<AuthFlow initialStep="contact" onDone={onDone} />);
  return { api, onDone };
}

async function toCodeStep(email = "luis@example.com") {
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  return (await screen.findByLabelText("6-digit code")) as HTMLInputElement;
}

describe("S02 contact step", () => {
  it("shows an inline error (no native bubble) for an invalid email and stays on the step", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "ana@example" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("That doesn't look like an email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email address").closest("form")).toHaveAttribute("novalidate");
  });

  it('says "SMS isn\'t set up yet" when the SMS provider is missing', async () => {
    setup((api) => {
      api.auth.sendOtp = async () => ({ ok: false, error: "sms_not_configured" });
    });
    fireEvent.click(screen.getByRole("radio", { name: "Text message" }));
    fireEvent.change(screen.getByLabelText("Mobile number (with country code)"), {
      target: { value: "+1 561 555 0100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(AUTH_COPY.smsNotSetUp)).toBeInTheDocument();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("sends phone numbers in E.164", async () => {
    const sent: string[] = [];
    setup((api) => {
      api.auth.sendOtp = async (_c, contact) => {
        sent.push(contact);
        return { ok: true };
      };
    });
    fireEvent.click(screen.getByRole("radio", { name: "Text message" }));
    fireEvent.change(screen.getByLabelText("Mobile number (with country code)"), {
      target: { value: "(561) 555-0100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByLabelText("6-digit code");
    expect(sent).toEqual(["+15615550100"]);
  });
});

describe("S02 code step (handoff 4.1, acceptance 2-3)", () => {
  it("a wrong code clears all six boxes, refocuses and shows the mismatch; typing clears it", async () => {
    setup();
    const input = await toCodeStep();
    expect(screen.getByText(/Enter the 6-digit code we sent to/)).toHaveTextContent(
      "luis@example.com",
    );
    fireEvent.change(input, { target: { value: "000000" } }); // auto-submits at 6 digits
    expect(await screen.findByText(AUTH_COPY.mismatch)).toBeInTheDocument();
    expect(input.value).toBe("");
    expect(screen.getAllByTestId("code-box").every((b) => b.textContent === "")).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: "1" } });
    expect(screen.queryByText(AUTH_COPY.mismatch)).toBeNull();
  });

  it("strips non-digits and caps at six", async () => {
    setup((api) => {
      api.auth.verifyOtp = async () => ({ ok: false, error: "invalid_code" });
    });
    const input = await toCodeStep();
    fireEvent.change(input, { target: { value: "12a3" } });
    expect(input.value).toBe("123");
    expect(screen.getAllByTestId("code-box").map((b) => b.textContent)).toEqual([
      "1",
      "2",
      "3",
      "",
      "",
      "",
    ]);
  });

  it("resend is disabled for 30 s with a countdown", async () => {
    const { api } = setup();
    const send = vi.spyOn(api.auth, "sendOtp");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await toCodeStep();
    const btn = screen.getByRole("button", { name: AUTH_COPY.resendIn(30) });
    expect(btn).toBeDisabled();
    // Let the countdown effect register its interval before time moves (flaky under load).
    await act(async () => {});
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // shouldAdvanceTime also lets real time pass, so a loaded test run may already show 19.
    expect(screen.getByRole("button", { name: /^Resend code \((19|20)\)$/ })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(20_500);
    });
    const ready = screen.getByRole("button", { name: AUTH_COPY.resend });
    expect(ready).toBeEnabled();
    vi.useRealTimers();
    fireEvent.click(ready);
    await screen.findByRole("button", { name: AUTH_COPY.resendIn(30) });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("locks after five wrong codes until a new code is requested", async () => {
    setup();
    const input = await toCodeStep();
    for (let i = 0; i < 5; i++) {
      await waitFor(() => expect(input).toBeEnabled());
      fireEvent.change(input, { target: { value: "000000" } });
      await screen.findByText(i < 4 ? AUTH_COPY.mismatch : AUTH_COPY.tooMany);
    }
    expect(input).toBeDisabled();
  });

  it("network failures are not wrong tries: they never lock the code step", async () => {
    setup((api) => {
      api.auth.verifyOtp = async () => ({ ok: false, error: "network" });
    });
    const input = await toCodeStep();
    for (let i = 0; i < 6; i++) {
      await waitFor(() => expect(input).toBeEnabled());
      fireEvent.change(input, { target: { value: "123456" } });
      await screen.findByText("Couldn't reach Dillan. Check your connection and try again.");
    }
    await waitFor(() => expect(input).toBeEnabled());
    expect(input.value).toBe("123456"); // kept for another try
    expect(screen.queryByText(AUTH_COPY.tooMany)).toBeNull();
  });

  it("does not state a fixed code expiry", async () => {
    setup();
    await toCodeStep();
    expect(screen.getByText(AUTH_COPY.codeHelp)).toBeInTheDocument();
    expect(screen.queryByText(/expire after/)).toBeNull();
  });

  it("a known contact goes straight in; a new one gets the name step", async () => {
    const { onDone } = setup();
    const input = await toCodeStep();
    fireEvent.change(input, { target: { value: "123456" } });
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    cleanup();

    const second = setup();
    const input2 = await toCodeStep("new.person@example.com");
    fireEvent.change(input2, { target: { value: "123456" } });
    expect(await screen.findByLabelText("What should we call you?")).toBeInTheDocument();
    expect(screen.getByText("Shown on the shared TV. No surname needed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText("Enter a name to show on the TV.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What should we call you?"), {
      target: { value: "Ana" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(second.onDone).toHaveBeenCalled());
    expect((await second.api.profile.get()).display_name).toBe("Ana");
  });

  it("the name step never pre-fills the email-derived name, and has a way out", async () => {
    const { api } = setup((a) => {
      const get = a.profile.get.bind(a.profile);
      // what the signup trigger stores: display_name = email local-part
      a.profile.get = async () => ({ ...(await get()), display_name: "luis.ramos.work" });
    });
    const input = await toCodeStep("luis.ramos.work@example.com");
    fireEvent.change(input, { target: { value: "123456" } });
    const name = (await screen.findByLabelText("What should we call you?")) as HTMLInputElement;
    await act(async () => {});
    expect(name.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.useDifferent }));
    expect(await screen.findByLabelText("Email address")).toBeInTheDocument();
    expect(await api.auth.getUser()).toBeNull();
  });
});
