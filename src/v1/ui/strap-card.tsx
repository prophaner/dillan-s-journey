// S14 card 1 "Heart-rate strap" (h10-design 6 S14): what the relay sends, never Bluetooth here.
// Not paired: setup steps + "Open relay on this device" in a capable browser, otherwise the
// specific unsupported line with a QR/link to /relay (never a dead Connect button, acceptance 41).
// Paired: strap, battery, relaying now (H chip), last reading; Open relay and Forget strap.
// Then the relay devices list (Remove = revoked_at), troubleshooting, and the dev-only demo path.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HrSourceRow } from "@/v1/core/hr";
import {
  batteryPctOf,
  isBatteryLow,
  PREFLIGHT_HR_COPY,
  S14_COPY,
  strapName,
} from "@/v1/core/hr-views";
import { useApi } from "@/v1/data/client";
import { useLiveHeartRate } from "@/v1/session/live-hr";
import { detectEnv, isInAppUa, quickSupport } from "@/v1/relay/support";
import { DButton, dButton } from "@/components/dillan/button";
import { ConfirmDialog } from "@/components/dillan/confirm-dialog";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { useToast } from "@/components/dillan/overlays";
import { Card } from "@/components/dillan/surfaces";
import { cn } from "@/lib/utils";
import { QrCode, relayUrl } from "./qr-code";
import { HealthChip, toneOf } from "./zone-pieces";

type Browser = "ok" | "no_api" | "policy_blocked" | "in_app_browser";

function browserSupport(): Browser {
  const env = detectEnv();
  if (isInAppUa(env.userAgent)) return "in_app_browser";
  const q = quickSupport(env);
  if (q && !q.ok && q.reason !== "in_app_browser") return "no_api";
  if (env.inIframe) return "policy_blocked";
  return "ok";
}

export const relaySourcesKey = (uid: string) => ["v1", uid, "hr-sources"] as const;

export function StrapCard({ userId, userName }: { userId: string; userName: string }) {
  const api = useApi();
  const toast = useToast();
  const hr = useLiveHeartRate(userId);
  const browser = useMemo(browserSupport, []);
  const [forgetting, setForgetting] = useState(false);
  const forget = useMutation({
    mutationFn: () => api.hr.forgetSensor(),
    onSuccess: () => {
      setForgetting(false);
      toast({ text: S14_COPY.forgotten });
    },
    onError: () => toast({ text: "Couldn't forget the strap. Try again." }),
  });
  const { url, host } = relayUrl();
  const paired = hr.sensorRow;
  const live = hr.live;
  const h = hr.health;
  const name = strapName(paired, live);
  const pct = batteryPctOf(live, paired);
  const ageS = h.ageMs != null ? Math.floor(h.ageMs / 1000) : null;

  const capable = browser === "ok";
  const openRelay = (label: string) => (
    <Link to="/relay" className={cn(dButton({ variant: "primary", size: "lg" }), "mt-3")}>
      {label}
    </Link>
  );

  return (
    <Card className="mt-2">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Heart-rate strap</Eyebrow>
        {hr.loaded && <HealthChip label={h.label} tone={toneOf(h)} />}
      </div>
      <p className="mt-2 text-subhead text-text-2">{S14_COPY.body}</p>

      {!hr.loaded ? (
        // Before the first successful read nothing is known: never the unpaired setup steps.
        <p className="mt-3 text-subhead" role="status">
          {hr.error ? PREFLIGHT_HR_COPY.readFailed : PREFLIGHT_HR_COPY.checking}
        </p>
      ) : !paired ? (
        browser === "no_api" ? (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-subhead">{S14_COPY.noApi}</p>
            <div className="flex flex-wrap items-center gap-4">
              <QrCode value={url} label={`QR code for ${host}/relay`} />
              <div className="flex min-w-0 flex-col gap-2">
                <p className="break-all text-headline font-bold">{host}/relay</p>
                <DButton
                  variant="outline"
                  size="md"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(url)
                      .then(() => toast({ text: S14_COPY.linkCopied }))
                      .catch(() => undefined)
                  }
                >
                  {S14_COPY.copyLink}
                </DButton>
              </div>
            </div>
          </div>
        ) : browser === "policy_blocked" ? (
          <p className="mt-3 text-subhead font-medium">{S14_COPY.policyBlocked}</p>
        ) : browser === "in_app_browser" ? (
          <p className="mt-3 text-subhead font-medium">{S14_COPY.inApp}</p>
        ) : (
          <>
            <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-subhead">
              {S14_COPY.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {openRelay(S14_COPY.openRelayHere)}
          </>
        )
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-subhead">
            <dt className="text-text-2">Strap</dt>
            <dd className="break-words font-bold">{name}</dd>
            <dt className="text-text-2">Battery</dt>
            <dd className={cn(isBatteryLow(pct) && "font-bold text-hold")}>
              {pct == null
                ? "—"
                : `${pct}%${
                    paired.battery_read_at
                      ? ` (read ${formatDistanceToNowStrict(new Date(paired.battery_read_at), { addSuffix: true })})`
                      : ""
                  }`}
            </dd>
            <dt className="text-text-2">Relaying now</dt>
            <dd className="break-words">
              {live ? `${live.holder_name}, for ${userName || "you"}` : "—"}
              {live?.is_demo && (
                <span className="ml-2 rounded-chip border border-text px-2 text-footnote font-bold">
                  DEMO
                </span>
              )}
            </dd>
            <dt className="text-text-2">Last reading</dt>
            <dd>
              {h.showBpm && h.bpm != null && ageS != null ? `${h.bpm} bpm, ${ageS}s ago` : "—"}
            </dd>
          </dl>
          {h.id !== "H3_live" && <p className="mt-2 text-footnote text-text-2">{h.detail}</p>}
          {isBatteryLow(pct) && (
            <p className="mt-2 text-subhead font-bold text-hold">
              Strap battery {pct}%. Replace the CR2025 soon.
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {capable && (
              <Link to="/relay" className={dButton({ variant: "secondary", size: "lg" })}>
                {S14_COPY.openRelay}
              </Link>
            )}
            <DButton variant="outline" onClick={() => setForgetting(true)}>
              {S14_COPY.forget}
            </DButton>
          </div>
        </>
      )}

      <RelayDevices userId={userId} />

      <details className="mt-4 rounded-btn border border-line px-4 py-3">
        <summary className="min-h-11 cursor-pointer content-center text-subhead font-bold">
          {S14_COPY.troubleTitle}
        </summary>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-subhead text-text-2">
          {S14_COPY.trouble.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>

      {import.meta.env.DEV && <DemoTools />}

      <ConfirmDialog
        open={forgetting}
        title={S14_COPY.forget}
        cancelLabel="Cancel"
        confirmLabel="Forget"
        busy={forget.isPending}
        onCancel={() => setForgetting(false)}
        onConfirm={() => forget.mutate()}
      >
        {S14_COPY.forgetConfirm(name ?? "this strap")}
      </ConfirmDialog>
    </Card>
  );
}

function RelayDevices({ userId }: { userId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: relaySourcesKey(userId),
    queryFn: () => api.hr.sources(),
    refetchInterval: 30_000,
  });
  const [removing, setRemoving] = useState<HrSourceRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.hr.revokeSource(id),
    onSuccess: () => {
      setRemoving(null);
      toast({ text: S14_COPY.removed });
      void qc.invalidateQueries({ queryKey: relaySourcesKey(userId) });
    },
    onError: () => toast({ text: "Couldn't remove the relay. Try again." }),
  });
  const list = (q.data ?? []).filter((s) => !s.revoked_at);
  return (
    <section className="mt-4" aria-labelledby="relays-h">
      <h3 id="relays-h" className="text-headline font-bold">
        {S14_COPY.relays}
      </h3>
      {q.isSuccess && list.length === 0 && (
        <p className="mt-1 text-subhead text-text-2">{S14_COPY.noRelays}</p>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {list.map((s) => (
          <li
            key={s.id}
            className="flex min-h-14 items-center gap-3 rounded-btn border border-line px-4 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="break-words font-bold">{s.display_name}</p>
              <p className="text-footnote text-text-2">
                {s.kind === "demo" ? "Demo relay" : "Web Bluetooth relay"}
                {s.last_seen_at
                  ? ` · last seen ${formatDistanceToNowStrict(new Date(s.last_seen_at), { addSuffix: true })}`
                  : ""}
              </p>
            </div>
            <DButton
              variant="quiet"
              size="md"
              className="shrink-0 px-3"
              onClick={() => setRemoving(s)}
            >
              {S14_COPY.remove}
            </DButton>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!removing}
        title={`${S14_COPY.remove} ${removing?.display_name ?? ""}?`}
        cancelLabel="Cancel"
        confirmLabel={S14_COPY.remove}
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      >
        That device stops relaying heart rate until it is added again there.
      </ConfirmDialog>
    </section>
  );
}

/** Dev only: the DEMO relay and the only path that creates an is_demo workout. */
function DemoTools() {
  return (
    <div className="mt-4 rounded-btn border border-dashed border-text-3 p-4">
      <div className="flex items-center gap-2">
        <p className="text-headline font-bold">{S14_COPY.demoTitle}</p>
        <span className="rounded-chip border border-text px-2 text-footnote font-bold">DEMO</span>
      </div>
      <p className="mt-1 text-subhead text-text-2">{S14_COPY.demoBody}</p>
      <div className="mt-3 flex flex-col gap-2">
        <Link
          to="/relay"
          search={{ demo: true }}
          className={dButton({ variant: "outline", size: "md" })}
        >
          {S14_COPY.demoRelay}
        </Link>
        <Link
          to="/workout"
          search={{ demo: true }}
          className={dButton({ variant: "outline", size: "md" })}
        >
          {S14_COPY.demoWorkout}
        </Link>
      </div>
    </div>
  );
}
