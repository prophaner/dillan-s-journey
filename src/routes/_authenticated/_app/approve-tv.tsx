import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleCheck, Tv } from "lucide-react";
import { useApi } from "@/v1/data/client";
import { normalizePairingCode, type PairingError } from "@/v1/data/api";
import { qk, useProfile } from "@/v1/data/queries";
import { useUser } from "@/v1/ui/user-context";
import { formatClock } from "@/v1/ui/timezones";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { DButton, dButton } from "@/components/dillan/button";
import { Banner, Card } from "@/components/dillan/surfaces";
import { Eyebrow, Field, TextInput } from "@/components/dillan/form-pieces";
import { cn } from "@/lib/utils";

// S03 phone side: approve a TV (handoff 4.2, flows F2a/F2b). Manual code entry, ?code= prefill
// from the QR deep link (/tv-approve?code=...), the "request was for {Name}" interstitial,
// Approve / "That's not my TV".
export const Route = createFileRoute("/_authenticated/_app/approve-tv")({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s["code"] === "string" ? s["code"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Approve a TV · Dillan" }] }),
  component: ApproveTvPage,
});

const ERRORS: Record<PairingError, string> = {
  invalid_code: "That code isn't active. Ask the TV for a new one.",
  already_resolved: "That code was already used. Ask the TV for a new one.",
  expired: "This code expired. Ask the TV for a new one.",
  rate_limited: "Too many tries. Wait a few minutes, then try again.",
  for_other_user: "This request was for someone else.",
  device_session_forbidden: "Approve TVs from your phone or computer, not from a TV.",
  network: "Couldn't reach Dillan. Check your connection and try again.",
};
const FALLBACK_ERROR = "That didn't work. Ask the TV for a new code.";
/** Unknown server codes still say something (never a silent Continue). */
const errorText = (e: string) => ERRORS[e as PairingError] ?? FALLBACK_ERROR;

type Step =
  | { kind: "code" }
  | {
      kind: "confirm";
      code: string;
      label: string;
      requestedAt: string;
      forName: string | null;
      otherUser: boolean;
    }
  | { kind: "approved"; label: string }
  | { kind: "denied" };

function ApproveTvPage() {
  const { code: initial } = Route.useSearch();
  return <ApproveTv initialCode={initial ?? ""} />;
}

function ApproveTv({ initialCode }: { initialCode: string }) {
  const api = useApi();
  const user = useUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useProfile(user.id);
  const me = profile?.display_name || "you";
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "code" });
  const [confirmedOther, setConfirmedOther] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const tried = useRef(false);

  // After a failed approve/deny the code step re-mounts: put focus (and the error, through
  // aria-describedby) back on the code field.
  useEffect(() => {
    if (step.kind === "code" && error) input.current?.focus();
  }, [step.kind, error]);

  const lookUp = async (raw: string) => {
    const c = normalizePairingCode(raw);
    if (!c) {
      setError("Codes look like DLN-7K4M. Check the TV and try again.");
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api.pairing
      .preview(c)
      .catch(() => ({ ok: false as const, error: "network" as const }));
    setBusy(false);
    if (!r.ok) {
      setError(errorText(r.error));
      input.current?.focus();
      return;
    }
    setConfirmedOther(false);
    setStep({
      kind: "confirm",
      code: c,
      label: r.device_label,
      requestedAt: r.created_at,
      forName: r.for_name,
      otherUser: r.for_other_user,
    });
  };

  // Prefilled from the QR: look the code up right away (nothing is approved without a tap).
  useEffect(() => {
    if (tried.current || !initialCode) return;
    tried.current = true;
    void lookUp(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const approve = async (c: string, other: boolean) => {
    setBusy(true);
    const r = await api.pairing
      .approve(c, other)
      .catch(() => ({ ok: false as const, error: "network" as const }));
    setBusy(false);
    if (!r.ok) {
      setError(errorText(r.error));
      setStep({ kind: "code" });
      return;
    }
    void qc.invalidateQueries({ queryKey: qk.devices(user.id) });
    setStep({
      kind: "approved",
      label: r.device_label ?? (step.kind === "confirm" ? step.label : "The TV"),
    });
  };

  const deny = async (c: string) => {
    setBusy(true);
    const r = await api.pairing
      .deny(c)
      .catch(() => ({ ok: false as const, error: "network" as const }));
    setBusy(false);
    if (!r.ok) {
      setError(errorText(r.error));
      setStep({ kind: "code" });
      return;
    }
    setStep({ kind: "denied" });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void lookUp(code);
  };

  return (
    <>
      <ScreenHeader title="Approve this TV" onBack={() => void navigate({ to: "/profile" })} />
      {step.kind === "code" && (
        <form noValidate onSubmit={submit} className="mt-2 flex flex-col gap-5">
          <p className="text-body text-text-2">
            Type the code shown on the TV screen. Scanning the QR fills it in for you.
          </p>
          <Field label="TV code" htmlFor="tv-code" error={error} help="Codes last 5 minutes.">
            <TextInput
              ref={input}
              id="tv-code"
              value={code}
              placeholder="DLN-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              invalid={!!error}
              className="font-num text-title3 uppercase tracking-widest"
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
            />
          </Field>
          <DButton type="submit" variant="primary" loading={busy} disabled={busy}>
            Continue
          </DButton>
        </form>
      )}

      {step.kind === "confirm" && step.otherUser && !confirmedOther && (
        <div className="mt-2 flex flex-col gap-4">
          <Banner icon={<Tv className="size-5 shrink-0" aria-hidden />}>
            <strong className="block">
              This request was for {step.forName ?? "someone else"}. You're signed in as {me}.
            </strong>
            Approving signs the TV in as you instead. {step.forName ?? "They"} can approve it from
            their own phone.
          </Banner>
          <DButton variant="primary" onClick={() => setConfirmedOther(true)}>
            Sign the TV in as me
          </DButton>
          <DButton variant="secondary" onClick={() => void navigate({ to: "/profile" })}>
            Cancel
          </DButton>
        </div>
      )}

      {step.kind === "confirm" && (!step.otherUser || confirmedOther) && (
        <div className="mt-2 flex flex-col gap-4">
          <Card>
            <Eyebrow>This TV</Eyebrow>
            <p className="mt-1 text-title2 font-bold">{step.label}</p>
            <p className="mt-1 text-footnote text-text-2">
              {step.requestedAt &&
                `Requested ${formatClock(step.requestedAt, profile?.timezone)} · `}
              Code {step.code}
            </p>
          </Card>
          <p className="text-body text-text-2">
            Approving signs this TV in as <strong className="text-text">{me}</strong> and lets it
            show your workouts and live heart rate until you lock it or it auto-locks.
          </p>
          <DButton
            variant="primary"
            loading={busy}
            disabled={busy}
            onClick={() => void approve(step.code, step.otherUser)}
          >
            Approve as {me}
          </DButton>
          <DButton variant="secondary" disabled={busy} onClick={() => void deny(step.code)}>
            That's not my TV
          </DButton>
        </div>
      )}

      {step.kind === "approved" && (
        <div className="mt-2 flex flex-col gap-4">
          <Banner icon={<CircleCheck className="size-5 shrink-0 text-steady" aria-hidden />}>
            <strong className="block">TV approved</strong>
            {step.label} is now signed in as {me}.
          </Banner>
          <Link to="/" className={cn(dButton({ variant: "primary", size: "lg" }))}>
            Go to Home
          </Link>
        </div>
      )}

      {step.kind === "denied" && (
        <div className="mt-2 flex flex-col gap-4">
          <Banner>
            <strong className="block">Request declined</strong>
            The TV was told this isn't your TV. Nothing was linked.
          </Banner>
          <Link to="/" className={cn(dButton({ variant: "secondary", size: "lg" }))}>
            Done
          </Link>
        </div>
      )}
    </>
  );
}
