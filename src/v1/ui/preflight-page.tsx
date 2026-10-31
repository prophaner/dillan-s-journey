// S08 Preflight (phone/desktop). Never auto-starts (acceptance 18): Start with live data is enabled
// and focused only in H3 (Live); otherwise Continue without live data is the primary, focused
// action. If heart rate turns Live later, focus stays put and a polite live region says so.
// Start = session_start (one snapshot, idempotent on command_id) + the start command.
// A second unfinished session is refused by the server (session_running): M4-like choice.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { HealthState } from "@/v1/core/health";
import type { WorkoutSessionRow } from "@/v1/core/types";
import { newId } from "@/v1/data/api";
import { useApi } from "@/v1/data/client";
import { useProfile, useTemplate, useZones } from "@/v1/data/queries";
import { workoutLine } from "@/v1/session/format";
import { healthFor, useLiveHr } from "@/v1/session/live-hr";
import { deviceSource, useNow } from "@/v1/session/use-session";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/v1/data/queries";
import { useUser } from "./user-context";
import { RunningBanner } from "./running-banner";
import { HealthChip, type ChipTone } from "./zone-pieces";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { DButton, dButton } from "@/components/dillan/button";
import { ConfirmDialog } from "@/components/dillan/confirm-dialog";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { Card, ScreenState } from "@/components/dillan/surfaces";
import { cn } from "@/lib/utils";

export const PREFLIGHT_COPY = {
  title: "Ready?",
  start: "Start with live data",
  withoutLive: "Continue without live data",
  withoutLiveHelp:
    "Continuing without live data records sets and time only; the session will say “No heart-rate data”.",
  nothingStarts: "Nothing starts until you press Start.",
  ready: "Heart rate ready",
  strap: "Heart-rate strap",
  setup: "Open live data setup",
  zones: "Heart-rate zones",
  zonesNotSet:
    "Zones are five BPM ranges you define. Until you confirm them, Dillan shows BPM only and never guesses a zone.",
  setUpZones: "Set up zones",
  runningTitle: "A workout is running",
  runningBody: "Ending saves everything so far. Cancel to go back to it.",
  goToIt: "Go to workout",
  endThenStart: "End and save, then start",
  startFailed: "Couldn't start the workout. Check your connection and try again.",
} as const;

function chipFor(h: HealthState): { label: string; tone: ChipTone } {
  switch (h.id) {
    case "H3_live":
      return { label: "Live · ready", tone: "live" };
    case "H0_not_set_up":
      return { label: "Not configured", tone: "off" };
    case "H5_no_recent":
    case "H6_relay_offline":
    case "H7a_strap_lost":
      return { label: "Unavailable", tone: "warn" };
    default:
      return { label: "Preparing", tone: "warn" };
  }
}

export function PreflightPage({ templateId }: { templateId: string }) {
  const user = useUser();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const profile = useProfile(user.id);
  const tpl = useTemplate(user.id, templateId);
  const zones = useZones(user.id);
  const hr = useLiveHr(user.id);
  const now = useNow();
  const zonesConfirmed = !!zones.data?.confirmed_at;
  const health = healthFor(
    hr,
    now,
    { status: "none", liveData: true, isDemo: false },
    zonesConfirmed,
  );
  const ready = health.id === "H3_live" && hr.live?.contact !== false;
  const chip = chipFor(health);

  const [busy, setBusy] = useState<"live" | "off" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<{ id: string; liveData: boolean } | null>(null);
  const [ending, setEnding] = useState(false);
  // One command id per Start attempt: a retried request returns the same session.
  const attempt = useRef<string>(newId());

  // h10-design 5.4: preflight asks for heart rate on open and every 2 minutes while open.
  useEffect(() => {
    void api.hr.request(10).catch(() => undefined);
    const t = setInterval(() => void api.hr.request(10).catch(() => undefined), 120_000);
    return () => clearInterval(t);
  }, [api]);

  // Initial focus: Start only when live (acceptance 18). Later changes never move focus.
  const startRef = useRef<HTMLButtonElement>(null);
  const offRef = useRef<HTMLButtonElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || !hr.loaded || tpl.isLoading) return;
    focused.current = true;
    (ready ? startRef.current : offRef.current)?.focus({ preventScroll: true });
  }, [hr.loaded, tpl.isLoading, ready]);
  const [announce, setAnnounce] = useState("");
  const wasReady = useRef<boolean | null>(null);
  useEffect(() => {
    if (!hr.loaded) return;
    if (wasReady.current === false && ready) setAnnounce(PREFLIGHT_COPY.ready);
    wasReady.current = ready;
  }, [ready, hr.loaded]);

  const tz = profile.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";

  async function begin(liveData: boolean) {
    setBusy(liveData ? "live" : "off");
    setError(null);
    try {
      const res = await api.sessions.start({
        templateId,
        liveData,
        timezone: tz,
        commandId: attempt.current,
      });
      if (!res.ok && res.error === "session_running" && res.session_id) {
        attempt.current = newId();
        setRunning({ id: res.session_id, liveData });
        return;
      }
      if (!res.ok || !res.session) {
        attempt.current = newId();
        setError(PREFLIGHT_COPY.startFailed);
        return;
      }
      const row = res.session;
      if (row.state === "preparing") {
        // The user pressed Start: begin timing now. If this fails, the session page offers Start.
        await api.sessions
          .command({
            sessionId: row.id,
            kind: "start",
            expectedRevision: row.revision,
            source: deviceSource(),
          })
          .catch(() => null);
      }
      void qc.invalidateQueries({ queryKey: qk.current(user.id) });
      void navigate({ to: "/session/$id", params: { id: row.id }, replace: true });
    } catch {
      setError(PREFLIGHT_COPY.startFailed);
    } finally {
      setBusy(null);
    }
  }

  async function endRunningThenStart() {
    if (!running) return;
    setEnding(true);
    try {
      const row: WorkoutSessionRow | null = await api.sessions.recover(running.id);
      if (row && row.state !== "ended") {
        const r = await api.sessions.command({
          sessionId: row.id,
          kind: row.state === "preparing" ? "discard" : "end",
          expectedRevision: row.revision,
          source: deviceSource(),
        });
        if (r.ok && r.session?.live_data && r.session.outcome !== "discarded")
          void api.sessions.finalize(row.id).catch(() => undefined);
        if (!r.ok && r.session?.state !== "ended") throw new Error(r.error ?? "end_failed");
      }
      const liveData = running.liveData;
      setRunning(null);
      void qc.invalidateQueries({ queryKey: ["v1", user.id] });
      await begin(liveData);
    } catch {
      setRunning(null);
      setError(PREFLIGHT_COPY.startFailed);
    } finally {
      setEnding(false);
    }
  }

  const host = useMemo(() => (typeof window !== "undefined" ? window.location.host : ""), []);

  if (tpl.isLoading || zones.isLoading) return <ScreenState kind="loading" />;
  const t = tpl.data;
  if (!t || t.deleted_at)
    return (
      <>
        <ScreenHeader title={PREFLIGHT_COPY.title} back="/workout" />
        <ScreenState
          kind="empty"
          title="This workout isn't available"
          body="It may have been deleted on another device."
        />
      </>
    );

  const name = profile.data?.display_name ?? "";
  const z = zones.data;
  const body = ready
    ? `Reading ${health.bpm} bpm, ${Math.floor((health.ageMs ?? 0) / 1000)}s ago · Heart rate from ${health.via ?? "the relay"} for ${name || "you"}`
    : health.detail;

  return (
    <>
      <ScreenHeader title={PREFLIGHT_COPY.title} back="/workout" />
      <RunningBanner className="mb-3" />
      <div className="flex flex-col gap-3">
        <Card>
          <Eyebrow>Workout</Eyebrow>
          <h2 className="mt-1 break-words text-title2 font-bold">{t.name}</h2>
          <p className="mt-1 break-words text-subhead text-text-2">{workoutLine(t.blocks)}</p>
        </Card>
        <Card>
          <Eyebrow>Training as</Eyebrow>
          <div className="mt-2 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-headline font-bold">
              {(name.trim()[0] ?? "?").toUpperCase()}
            </span>
            <span className="min-w-0 break-words text-headline font-bold">{name}</span>
          </div>
        </Card>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>{PREFLIGHT_COPY.strap}</Eyebrow>
            <HealthChip label={chip.label} tone={chip.tone} />
          </div>
          <p className="mt-2 text-subhead text-text-2">{body}</p>
          {health.batteryLow && hr.live?.battery_pct != null && (
            <p className="mt-1 text-subhead text-hold">Strap battery {hr.live.battery_pct}%.</p>
          )}
          {!ready && (
            <>
              <p className="mt-2 text-subhead text-text-2">
                Open {host}/relay on your Android phone or computer and tap Connect strap.
              </p>
              <Link
                to="/profile/zones"
                className={cn(dButton({ variant: "outline", size: "md" }), "mt-3 w-full")}
              >
                {PREFLIGHT_COPY.setup}
              </Link>
            </>
          )}
        </Card>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>{PREFLIGHT_COPY.zones}</Eyebrow>
            <HealthChip
              label={zonesConfirmed ? "Confirmed" : "Not set"}
              tone={zonesConfirmed ? "live" : "warn"}
            />
          </div>
          <p className="mt-2 text-subhead text-text-2">
            {zonesConfirmed && z
              ? `Zone 1 under ${z.b1} · Zone 5 from ${z.b4} bpm.`
              : PREFLIGHT_COPY.zonesNotSet}
          </p>
          {!zonesConfirmed && (
            <Link
              to="/profile/zones"
              className={cn(dButton({ variant: "outline", size: "md" }), "mt-3 w-full")}
            >
              {PREFLIGHT_COPY.setUpZones}
            </Link>
          )}
        </Card>

        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        {error && (
          <p role="alert" className="text-subhead font-medium text-hold">
            {error}
          </p>
        )}
        <DButton
          ref={startRef}
          variant={ready ? "primary" : "secondary"}
          size="lg"
          className="mt-2 h-16 text-title3"
          disabled={!ready || busy !== null}
          loading={busy === "live"}
          onClick={() => void begin(true)}
        >
          {PREFLIGHT_COPY.start}
        </DButton>
        <DButton
          ref={offRef}
          variant={ready ? "outline" : "primary"}
          size="lg"
          disabled={busy !== null}
          loading={busy === "off"}
          onClick={() => void begin(false)}
        >
          {PREFLIGHT_COPY.withoutLive}
        </DButton>
        <p className="text-center text-footnote text-text-2">{PREFLIGHT_COPY.withoutLiveHelp}</p>
        <p className="pb-4 text-center text-footnote text-text-2">{PREFLIGHT_COPY.nothingStarts}</p>
      </div>

      <ConfirmDialog
        open={!!running}
        title={PREFLIGHT_COPY.runningTitle}
        cancelLabel={PREFLIGHT_COPY.goToIt}
        confirmLabel={PREFLIGHT_COPY.endThenStart}
        busy={ending}
        onCancel={() => {
          const id = running?.id;
          setRunning(null);
          if (id) void navigate({ to: "/session/$id", params: { id } });
        }}
        onConfirm={() => void endRunningThenStart()}
      >
        {PREFLIGHT_COPY.runningBody}
      </ConfirmDialog>
    </>
  );
}
