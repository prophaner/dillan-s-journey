// S01 Welcome + S02 Register or log in (phone/desktop). One flow for new and returning people:
// the screens never say whether an account exists (brief: auth privacy). Email OTP and SMS OTP
// (6 digits); new accounts finish with the name step.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, Tv } from "lucide-react";
import { useApi } from "@/v1/data/client";
import {
  normalizeEmail,
  normalizePhone,
  type AuthErrorCode,
  type OtpChannel,
  type Profile,
} from "@/v1/data/api";
import type { Unit } from "@/v1/core/types";
import { DButton } from "@/components/dillan/button";
import { Banner } from "@/components/dillan/surfaces";
import { Wordmark } from "@/components/dillan/wordmark";
import { CodeInput } from "@/components/dillan/code-input";
import { Field, Segmented, TextInput, inputClass } from "@/components/dillan/form-pieces";
import { browserTimeZone, timeZoneOptions } from "./timezones";

export type AuthStep = "welcome" | "contact" | "code" | "name";

export const RESEND_COOLDOWN_S = 30;
export const MAX_CODE_ATTEMPTS = 5;

export const AUTH_COPY = {
  headline: "Your workouts, on the big screen.",
  body: "Your home-gym workouts, your heart rate on the big screen, your history in one place.",
  title: "Register or log in",
  codePrompt: (contact: string) => `Enter the 6-digit code we sent to ${contact}`,
  mismatch: "That code didn't match. Try again or resend.",
  resendIn: (s: number) => `Resend code (${s})`,
  resend: "Resend code",
  nameTitle: "What should we call you?",
  nameHelp: "Shown on the shared TV. No surname needed.",
  tvNeedsLogin: "Approving a TV links it to your account, so we need to know it's you.",
  smsNotSetUp:
    "SMS isn't set up yet. Use email for now — text-message codes arrive once SMS is switched on.",
  tooMany: "Too many tries for this code. Request a new code.",
  /** The expiry is set in Supabase Auth by the owner (docs/v1/owner-setup.md), so no fixed time. */
  codeHelp: "Use the newest code we sent. Check spam if it hasn't arrived.",
  /** V1 links one contact per account (build-plan D18); says nothing about whether one exists. */
  sameContact: "Use the one you registered with — a different one starts a new account.",
  useDifferent: "Use a different email or number",
} as const;

const SEND_ERRORS: Record<AuthErrorCode, string> = {
  invalid_contact: "Check the address or number and try again.",
  sms_not_configured: AUTH_COPY.smsNotSetUp,
  rate_limited: "Too many codes requested. Wait a minute, then try again.",
  invalid_code: AUTH_COPY.mismatch,
  network: "Couldn't reach Dillan. Check your connection and try again.",
  unknown: "That didn't send. Try again in a moment.",
};

export function AuthFlow({
  initialStep = "welcome",
  forTv = false,
  onDone,
  onProfileSaved,
}: {
  initialStep?: AuthStep;
  forTv?: boolean;
  onDone: () => void;
  onProfileSaved?: (p: Profile) => void;
}) {
  const api = useApi();
  const [step, setStep] = useState<AuthStep>(initialStep);
  const [channel, setChannel] = useState<OtpChannel>("email");
  const [contact, setContact] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (step !== "code" || wait <= 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [step, wait]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
    if (step === "contact") contactRef.current?.focus();
  }, [step]);

  const send = async (to: string) => {
    setBusy(true);
    const r = await api.auth
      .sendOtp(channel, to)
      .catch(() => ({ ok: false as const, error: "network" as const }));
    setBusy(false);
    if (!r.ok) {
      setError(SEND_ERRORS[r.error]);
      return false;
    }
    setSentTo(to);
    setResendAt(Date.now() + RESEND_COOLDOWN_S * 1000);
    setNow(Date.now());
    setCode("");
    setCodeError(null);
    setAttempts(0);
    return true;
  };

  const submitContact = async (e: FormEvent) => {
    e.preventDefault();
    const norm = channel === "email" ? normalizeEmail(contact) : normalizePhone(contact);
    if (!norm) {
      setError(
        channel === "email"
          ? "That doesn't look like an email address."
          : "Enter a mobile number with its country code, e.g. +1 561 555 0100.",
      );
      contactRef.current?.focus();
      return;
    }
    setError(null);
    if (await send(norm)) setStep("code");
  };

  const verify = async (value: string) => {
    if (busy || value.length !== 6 || attempts >= MAX_CODE_ATTEMPTS) return;
    setBusy(true);
    const r = await api.auth
      .verifyOtp(channel, sentTo, value)
      .catch(() => ({ ok: false as const, error: "network" as const }));
    if (!r.ok) {
      setBusy(false);
      if (r.error !== "invalid_code") {
        // The server never judged the code (network, rate limit...): not a wrong try, keep it.
        setCodeError(SEND_ERRORS[r.error]);
        window.setTimeout(() => codeRef.current?.focus(), 0);
        return;
      }
      const n = attempts + 1;
      setAttempts(n);
      setCode("");
      setCodeError(n >= MAX_CODE_ATTEMPTS ? AUTH_COPY.tooMany : AUTH_COPY.mismatch);
      // after React re-enables the input
      window.setTimeout(() => codeRef.current?.focus(), 0);
      return;
    }
    const profile = await api.profile.get().catch(() => null);
    setBusy(false);
    if (profile?.needs_name) setStep("name");
    else onDone();
  };

  const resend = async () => {
    if (wait > 0 || busy) return;
    await send(sentTo);
    codeRef.current?.focus();
  };

  if (step === "name")
    return (
      <NameStep
        onSaved={(p) => {
          onProfileSaved?.(p);
          onDone();
        }}
        onExit={async () => {
          await api.auth.signOut().catch(() => {});
          setCode("");
          setCodeError(null);
          setError(null);
          setContact("");
          setStep("contact");
        }}
      />
    );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-margin pb-10">
      {step === "welcome" ? (
        <div className="flex flex-1 flex-col justify-center py-10 text-center">
          <Wordmark height={52} className="mx-auto" />
          <h1 className="mt-8 text-title1 font-bold leading-tight">{AUTH_COPY.headline}</h1>
          <p className="mt-3 text-body text-text-2">{AUTH_COPY.body}</p>
          {forTv && (
            <Banner
              className="mt-8 text-left"
              icon={<Tv className="size-5 shrink-0" aria-hidden />}
            >
              {AUTH_COPY.tvNeedsLogin}
            </Banner>
          )}
          <DButton variant="primary" className="mt-10" onClick={() => setStep("contact")} autoFocus>
            {AUTH_COPY.title}
          </DButton>
          <p className="mt-4 text-footnote text-text-2">We send a 6-digit code. No passwords.</p>
        </div>
      ) : (
        <>
          <header className="flex min-h-[72px] items-center gap-2 pt-4">
            <button
              type="button"
              aria-label="Back"
              className="press -ml-2 grid size-11 place-items-center rounded-full"
              onClick={() => {
                setError(null);
                setCodeError(null);
                setStep(step === "code" ? "contact" : "welcome");
              }}
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
            <h1 className="min-w-0 flex-1 text-title2 font-bold leading-tight">
              {step === "code"
                ? channel === "email"
                  ? "Check your email"
                  : "Check your messages"
                : AUTH_COPY.title}
            </h1>
          </header>

          {step === "contact" && (
            <form noValidate onSubmit={submitContact} className="mt-4 flex flex-col gap-5">
              <Segmented
                label="Contact method"
                value={channel}
                options={[
                  { value: "email", label: "Email" },
                  { value: "sms", label: "Text message" },
                ]}
                onChange={(v) => {
                  setChannel(v);
                  setError(null);
                  setContact("");
                }}
              />
              <Field
                label={channel === "email" ? "Email address" : "Mobile number (with country code)"}
                htmlFor="contact"
                error={error}
                help={
                  channel === "email"
                    ? `We send a 6-digit code. No passwords. ${AUTH_COPY.sameContact}`
                    : `We only text a code — never marketing. ${AUTH_COPY.sameContact}`
                }
              >
                <TextInput
                  ref={contactRef}
                  id="contact"
                  name="contact"
                  type={channel === "email" ? "email" : "tel"}
                  inputMode={channel === "email" ? "email" : "tel"}
                  autoComplete={channel === "email" ? "email" : "tel"}
                  placeholder={channel === "email" ? "you@example.com" : "+1 561 555 0100"}
                  value={contact}
                  invalid={!!error}
                  onChange={(e) => setContact(e.target.value)}
                />
              </Field>
              <DButton type="submit" variant="primary" loading={busy} disabled={busy}>
                Send code
              </DButton>
            </form>
          )}

          {step === "code" && (
            <form
              noValidate
              className="mt-2 flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void verify(code);
              }}
            >
              <p className="text-body text-text-2">
                {AUTH_COPY.codePrompt("")}
                <strong className="text-text [overflow-wrap:anywhere]">{sentTo}</strong>.
              </p>
              <CodeInput
                ref={codeRef}
                value={code}
                invalid={!!codeError}
                disabled={busy || attempts >= MAX_CODE_ATTEMPTS}
                describedBy="otp-status"
                onChange={(v) => {
                  setCode(v);
                  if (codeError && attempts < MAX_CODE_ATTEMPTS) setCodeError(null);
                }}
                onComplete={(v) => void verify(v)}
              />
              <p
                id="otp-status"
                aria-live="polite"
                className={
                  codeError ? "text-subhead font-medium text-hold" : "text-subhead text-text-2"
                }
              >
                {codeError ?? AUTH_COPY.codeHelp}
              </p>
              <DButton
                type="submit"
                variant="primary"
                loading={busy}
                disabled={busy || code.length !== 6 || attempts >= MAX_CODE_ATTEMPTS}
              >
                Verify
              </DButton>
              <DButton
                variant={attempts >= MAX_CODE_ATTEMPTS ? "secondary" : "quiet"}
                disabled={wait > 0 || busy}
                onClick={() => void resend()}
              >
                {wait > 0 ? AUTH_COPY.resendIn(wait) : AUTH_COPY.resend}
              </DButton>
              <p className="flex flex-wrap items-center justify-center gap-x-2 text-subhead text-text-2">
                {channel === "email" ? "Wrong address?" : "Wrong number?"}
                <button
                  type="button"
                  className="min-h-11 px-2 font-bold text-text"
                  onClick={() => setStep("contact")}
                >
                  Change it
                </button>
              </p>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function NameStep({
  onSaved,
  onExit,
}: {
  onSaved: (p: Profile) => void;
  onExit: () => Promise<void>;
}) {
  const api = useApi();
  const [name, setName] = useState("");
  const [tz, setTz] = useState(browserTimeZone());
  const [unit, setUnit] = useState<Unit>("lb");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void api.profile
      .get()
      .then((p) => {
        if (!live) return;
        // Never pre-fill a name the person didn't choose: the signup trigger seeds display_name
        // with the email local-part, and this name is shown on the shared TV.
        if (!p.needs_name && p.display_name) setName((n) => n || p.display_name);
        setUnit(p.weight_unit);
      })
      .catch(() => {});
    ref.current?.focus();
    return () => {
      live = false;
    };
  }, [api]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Enter a name to show on the TV.");
      ref.current?.focus();
      return;
    }
    if (n.length > 40) {
      setError("Use 40 characters or fewer.");
      ref.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const p = await api.profile.update({
        display_name: n,
        timezone: tz,
        weight_unit: unit,
        complete_name_step: true,
      });
      onSaved(p);
    } catch {
      setError("That didn't save. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-margin pb-10">
      <header className="flex min-h-[72px] items-center pt-4">
        <h1 className="text-title2 font-bold leading-tight">About you</h1>
      </header>
      <form noValidate onSubmit={submit} className="mt-2 flex flex-col gap-5">
        <Field
          label={AUTH_COPY.nameTitle}
          htmlFor="display-name"
          error={error}
          help={AUTH_COPY.nameHelp}
        >
          <TextInput
            ref={ref}
            id="display-name"
            autoComplete="nickname"
            maxLength={40}
            value={name}
            invalid={!!error}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="Timezone" htmlFor="tz" help="Weeks run Monday–Sunday in this timezone.">
          <select
            id="tz"
            aria-describedby="tz-help"
            className={inputClass}
            value={tz}
            onChange={(e) => setTz(e.target.value)}
          >
            {timeZoneOptions(tz).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-subhead font-bold text-text-2">Units</span>
          <Segmented
            label="Units"
            value={unit}
            options={[
              { value: "lb", label: "Pounds (lb)" },
              { value: "kg", label: "Kilograms (kg)" },
            ]}
            onChange={setUnit}
          />
        </div>
        <DButton type="submit" variant="primary" loading={busy} disabled={busy}>
          Finish
        </DButton>
        <DButton
          variant="quiet"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onExit().finally(() => setBusy(false));
          }}
        >
          {AUTH_COPY.useDifferent}
        </DButton>
      </form>
    </div>
  );
}
