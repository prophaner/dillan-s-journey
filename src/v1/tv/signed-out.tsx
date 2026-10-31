// S01 first run / "Who's training?" chooser and S03 pairing on the TV (handoff §3, 4.2; mockups
// tv-01..tv-04). Nothing here knows anything private: the chooser shows remembered first names
// only, and pairing shows the public code, a QR of the approve URL (no token) and a countdown.

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { AuthUser, DillanApi, TvChallenge, TvDeviceInfo } from "@/v1/data/api";
import { Wordmark } from "@/components/dillan/wordmark";
import { cn } from "@/lib/utils";
import type { RememberedProfile } from "./device";
import { LockedTag, TvAvatar, TvButton, TvEyebrow, TvHints, TvQr } from "./ui";

export const TV_COPY = {
  welcomeTitle: "Your workouts, on the big screen.",
  welcomeBody:
    "Your home-gym workouts, your heart rate on the big screen, your history in one place.",
  welcomeHow: "Set up this TV from your phone — no typing with the remote.",
  getStarted: "Get started",
  chooserTitle: "Who's training?",
  chooserNames:
    "Profiles on this device show names only. Workouts and health data stay private until you verify.",
  chooserVerify:
    "Selecting a name sends a verification to that person's phone. Nothing private shows until they approve.",
  addUser: "Add user",
  addUserSub: "Register or log in",
  pairEyebrow: "Authorize this TV",
  pairTitle: "Scan with your phone",
  pairBody:
    "Open the camera, scan the code, then register or log in on your phone. A scan alone never signs anything in — you confirm the TV by name on your phone.",
  thisTv: "This TV",
  thisTvSub: "Shown on your phone when you approve",
  waiting: "Waiting for approval on your phone…",
  codesLast: "Codes last 5 minutes.",
  declined: "Request declined",
  declinedBody: "The phone said this isn't their TV. Nothing was linked.",
  expired: "This code expired",
  approved: "Approved. Taking you Home…",
  orGoTo: "Or go to",
  andEnter: "and enter",
  cancel: "Cancel",
  newCode: "New code",
  tryAgain: "Try again",
  failed: "Couldn't get a code. Check the TV's connection, then try again.",
  rateLimited: "Too many codes were requested. Wait a few minutes, then try again.",
  signInFailed: "Approved, but this TV couldn't finish signing in. Get a new code and try again.",
  switching: "Switching user…",
} as const;

export function expiresText(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  return `Code expires in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function FirstRun({ device, onStart }: { device: TvDeviceInfo; onStart: () => void }) {
  return (
    <div data-screen="first_run" className="flex h-full flex-col">
      <div className="m-auto flex max-w-[1080px] flex-col items-center gap-8 text-center">
        <Wordmark height={88} />
        <h1 className="text-tv-2xl font-bold leading-tight">{TV_COPY.welcomeTitle}</h1>
        <p className="text-tv-md text-text-2">{TV_COPY.welcomeBody}</p>
        <p className="text-tv-base text-text-3">
          Dillan on {device.label}. {TV_COPY.welcomeHow}
        </p>
        <TvButton
          focusId="get-started"
          autoFocus
          variant="primary"
          size="xl"
          className="mt-6 min-w-[520px]"
          onPress={onStart}
        >
          {TV_COPY.getStarted}
        </TvButton>
      </div>
      <TvHints items={[["OK", "Select"]]} />
    </div>
  );
}

export function Chooser({
  profiles,
  onChoose,
  onAdd,
}: {
  profiles: RememberedProfile[];
  onChoose: (p: RememberedProfile) => void;
  onAdd: () => void;
}) {
  const tile =
    "flex w-tv-tile flex-col items-center gap-5 rounded-tv-lg border-2 border-line bg-surface px-6 py-10 text-tv-md font-bold text-text data-[focused]:border-text data-[focused]:bg-surface-2";
  return (
    <div data-screen="chooser" className="flex h-full flex-col">
      <div className="m-auto flex flex-col items-center gap-6 text-center">
        <Wordmark height={56} />
        <h1 className="text-tv-2xl font-bold">{TV_COPY.chooserTitle}</h1>
        <p className="max-w-[1200px] text-tv-base text-text-2">{TV_COPY.chooserVerify}</p>
        <div
          className="mt-8 flex flex-wrap items-start justify-center gap-10"
          data-focus-list="chooser"
        >
          {profiles.map((p, i) => (
            <button
              key={p.userId}
              type="button"
              data-focus=""
              data-focus-id={`profile-${p.userId}`}
              {...(i === 0 ? { "data-autofocus": "" } : {})}
              className={tile}
              aria-label={`${p.firstName}, locked. Approve on their phone to continue.`}
              onClick={() => onChoose(p)}
            >
              <TvAvatar name={p.firstName} size={160} />
              <span className="max-w-full truncate">{p.firstName}</span>
              <LockedTag />
            </button>
          ))}
          <button
            type="button"
            data-focus=""
            data-focus-id="add-user"
            {...(profiles.length === 0 ? { "data-autofocus": "" } : {})}
            className={tile}
            onClick={onAdd}
          >
            <span
              aria-hidden
              className="grid size-[160px] place-items-center rounded-full bg-surface-2 text-text-2"
            >
              <Plus className="size-16" />
            </span>
            <span>{TV_COPY.addUser}</span>
            <span className="text-tv-sm font-medium text-text-3">{TV_COPY.addUserSub}</span>
          </button>
        </div>
        <p className="mt-6 max-w-[1100px] text-tv-sm text-text-3">{TV_COPY.chooserNames}</p>
      </div>
      <TvHints
        items={[
          ["◀ ▶", "Move"],
          ["OK", "Select"],
        ]}
      />
    </div>
  );
}

export type PairPhase =
  | { kind: "starting" }
  | { kind: "awaiting"; challenge: TvChallenge }
  | { kind: "approved" }
  | { kind: "denied" }
  | { kind: "expired" }
  | { kind: "failed"; reason: "rate_limited" | "sign_in" | "other" };

export const PAIR_POLL_MS = 1_500;

/** Poll errors after which this code can never sign in (it is used up); others are transient. */
const FINAL_POLL_ERRORS = new Set(["sign_in_failed", "grant_failed"]);

/**
 * S03: requests a challenge, polls it, counts down, and hands the signed-in user up. Leaving the
 * screen cancels a code that is still awaiting; a sign-in that lands after leaving is locked again
 * at once, so no session stays on the shared TV.
 *
 * `now` is the server-corrected clock and drives only the countdown; expiry is the server's call
 * (a TV clock that runs fast must not expire codes early).
 */
export function Pairing({
  api,
  device,
  forUser,
  origin,
  onSignedIn,
  onCancel,
  now = () => Date.now(),
}: {
  api: DillanApi;
  device: TvDeviceInfo;
  forUser: { userId: string; firstName: string } | null;
  origin: string;
  onSignedIn: (user: AuthUser, grantId: string) => void;
  onCancel: () => void;
  now?: () => number;
}) {
  const [phase, setPhase] = useState<PairPhase>({ kind: "starting" });
  const [, setTick] = useState(0);
  const live = useRef(true);
  const current = useRef<TvChallenge | null>(null);
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  const start = useCallback(async () => {
    setPhase({ kind: "starting" });
    const r = await api.tv.pairStart(device, forUser?.userId ?? null);
    if (!live.current) {
      if (r.ok) void api.tv.pairCancel(r.challenge);
      return;
    }
    if (!r.ok) {
      setPhase({ kind: "failed", reason: r.error === "rate_limited" ? "rate_limited" : "other" });
      return;
    }
    current.current = r.challenge;
    setPhase({ kind: "awaiting", challenge: r.challenge });
  }, [api, device, forUser?.userId]);

  useEffect(() => {
    live.current = true;
    void start();
    return () => {
      live.current = false;
      const ch = current.current;
      current.current = null;
      if (ch) void api.tv.pairCancel(ch);
    };
  }, [api, start]);

  // Poll while awaiting; one request in flight at a time.
  const challenge = phase.kind === "awaiting" ? phase.challenge : null;
  useEffect(() => {
    if (!challenge) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (stop) return;
      const r = await api.tv.pairPoll(device, challenge).catch(() => null);
      if (stop) {
        // Back/Cancel while the approval was being exchanged: nobody takes this session up, so
        // revoke its grant and sign out right away.
        if (r?.status === "signed_in") void api.tv.lock(r.grantId).catch(() => undefined);
        return;
      }
      if (r?.status === "signed_in") {
        current.current = null;
        setPhase({ kind: "approved" });
        signedIn.current(r.user, r.grantId);
        return;
      }
      if (r?.status === "denied") {
        current.current = null;
        setPhase({ kind: "denied" });
        return;
      }
      if (r?.status === "expired" || r?.status === "cancelled") {
        current.current = null;
        setPhase({ kind: "expired" });
        return;
      }
      if (r?.status === "consumed" || (r?.status === "error" && FINAL_POLL_ERRORS.has(r.error))) {
        current.current = null;
        setPhase({ kind: "failed", reason: "sign_in" });
        return;
      }
      timer = setTimeout(() => void poll(), PAIR_POLL_MS);
    };
    timer = setTimeout(() => void poll(), PAIR_POLL_MS);
    const tick = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      clearInterval(tick);
    };
  }, [api, device, challenge]);

  const cancel = () => {
    const ch = current.current;
    current.current = null;
    if (ch) void api.tv.pairCancel(ch);
    onCancel();
  };

  const code = challenge?.code ?? null;
  const host = origin.replace(/^https?:\/\//, "");
  const approveUrl = code ? `${origin}/approve-tv?code=${code}` : null;
  const name = forUser?.firstName ?? null;

  let status: React.ReactNode = null;
  let actions: React.ReactNode = null;
  if (phase.kind === "starting") {
    status = <p className="text-tv-base text-text-2">Getting a code…</p>;
    actions = (
      <TvButton focusId="pair-cancel" autoFocus onPress={cancel}>
        {TV_COPY.cancel}
      </TvButton>
    );
  } else if (phase.kind === "awaiting") {
    status = (
      <>
        <p className="text-tv-md font-bold">{TV_COPY.waiting}</p>
        <p className="text-tv-base text-text-2">
          <span className="font-num tabular" data-testid="pair-countdown">
            {expiresText(Date.parse(phase.challenge.expiresAt) - now())}
          </span>
          . {TV_COPY.codesLast}
        </p>
      </>
    );
    actions = (
      <TvButton focusId="pair-cancel" autoFocus onPress={cancel} className="w-full">
        {TV_COPY.cancel}
      </TvButton>
    );
  } else if (phase.kind === "approved") {
    status = <p className="text-tv-md font-bold text-steady">{TV_COPY.approved}</p>;
  } else {
    const msg =
      phase.kind === "denied"
        ? { title: TV_COPY.declined, body: TV_COPY.declinedBody, again: TV_COPY.tryAgain }
        : phase.kind === "expired"
          ? { title: TV_COPY.expired, body: TV_COPY.codesLast, again: TV_COPY.newCode }
          : {
              title: TV_COPY.tryAgain,
              body:
                phase.reason === "rate_limited"
                  ? TV_COPY.rateLimited
                  : phase.reason === "sign_in"
                    ? TV_COPY.signInFailed
                    : TV_COPY.failed,
              again: phase.reason === "sign_in" ? TV_COPY.newCode : TV_COPY.tryAgain,
            };
    status = (
      <>
        <p className="self-start rounded-chip bg-hold-tint px-6 py-2 text-tv-base font-bold text-hold">
          {msg.title}
        </p>
        <p className="text-tv-base text-text-2">{msg.body}</p>
      </>
    );
    actions = (
      <div className="flex gap-4">
        <TvButton focusId="pair-again" autoFocus variant="primary" onPress={() => void start()}>
          {msg.again}
        </TvButton>
        <TvButton focusId="pair-cancel" onPress={cancel}>
          {TV_COPY.cancel}
        </TvButton>
      </div>
    );
  }

  return (
    <div
      data-screen={`pairing:${phase.kind === "awaiting" || phase.kind === "starting" ? "wait" : phase.kind}`}
      className="flex h-full flex-col"
    >
      <div className="m-auto grid w-full max-w-[1560px] grid-cols-2 items-center gap-16">
        <div className="flex flex-col gap-6">
          <TvEyebrow>{name ? `Unlock ${name}` : TV_COPY.pairEyebrow}</TvEyebrow>
          <h1 className="text-tv-2xl font-bold leading-tight">
            {name ? `Approve on ${name}'s phone` : TV_COPY.pairTitle}
          </h1>
          <p className="text-tv-md text-text-2">
            {name
              ? `Scan with ${name}'s phone or type the code there. Approve, and this TV unlocks as ${name}.`
              : TV_COPY.pairBody}
          </p>
          <div className="flex flex-col gap-1 rounded-tv-lg border border-line bg-surface p-8">
            <TvEyebrow>{TV_COPY.thisTv}</TvEyebrow>
            <p className="text-tv-md font-bold">{device.label}</p>
            <p className="text-tv-sm text-text-2">{TV_COPY.thisTvSub}</p>
          </div>
          <div className="flex min-h-[120px] flex-col gap-2" aria-live="polite">
            {status}
          </div>
          {actions}
        </div>
        <div
          className={cn(
            "flex flex-col items-center gap-8 rounded-tv-lg border border-line bg-surface p-14",
            !approveUrl && "opacity-40",
          )}
        >
          {approveUrl ? (
            <TvQr value={approveUrl} label={`QR code for ${code}`} />
          ) : (
            <div className="size-tv-qr rounded-tv-lg bg-surface-2" aria-hidden />
          )}
          <div className="text-center">
            <TvEyebrow>{TV_COPY.orGoTo}</TvEyebrow>
            <p className="mt-1 text-tv-md font-bold">{host}/approve-tv</p>
            <TvEyebrow className="mt-4">{TV_COPY.andEnter}</TvEyebrow>
            <p
              className="mt-2 font-num text-tv-3xl font-bold tracking-[0.12em] tabular"
              data-testid="pair-code"
            >
              {code ?? "DLN-····"}
            </p>
          </div>
        </div>
      </div>
      <TvHints items={[["Back", "Cancel pairing"]]} />
    </div>
  );
}
