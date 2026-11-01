// S08 Preflight (phone/desktop). Never auto-starts (acceptance 18): Start with live data is enabled
// and focused only in H3 (Live); otherwise Continue without live data is the primary, focused
// action. If heart rate turns Live later, focus stays put and a polite live region says so.
// Start = session_start (one snapshot, idempotent on command_id) + the start command.
// A second unfinished session is refused by the server (session_running): M4-like choice.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { WorkoutSessionRow } from "@/v1/core/types";
import { newId } from "@/v1/data/api";
import { useApi } from "@/v1/data/client";
import { useProfile, useTemplate, useZones } from "@/v1/data/queries";
import { workoutLine } from "@/v1/session/format";
import {
  PREFLIGHT_HR_COPY,
  preflightChip,
  preflightKindMismatch,
  preflightReady,
} from "@/v1/core/hr-views";
import { useLiveHeartRate } from "@/v1/session/live-hr";
import { deviceSource } from "@/v1/session/use-session";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/v1/data/queries";
import { useUser } from "./user-context";
import { RunningBanner } from "./running-banner";
import { HealthChip } from "./zone-pieces";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { DButton, dButton } from "@/components/dillan/button";
import { ConfirmDialog } from "@/components/dillan/confirm-dialog";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { Card, ScreenState } from "@/components/dillan/surfaces";
import { cn } from "@/lib/utils";
import { browserTimeZone } from "./timezones";

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
  // M4 canonical labels; Cancel goes back to the running workout, as the body says.
  goToIt: "Cancel",
  endThenStart: "End and save, then continue",
  startFailed: "Couldn't start the workout. Check your connection and try again.",
  demoTitle: "Demo workout",
  demoBody:
    "Development only. Heart rate comes from the simulated DEMO strap and is stored apart from real data.",
} as const;

export function PreflightPage({
  templateId,
  demo = false,
}: {
  templateId: string;
  demo?: boolean;
}) {
  const user = useUser();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const profile = useProfile(user.id);
  const tpl = useTemplate(user.id, templateId);
  const zones = useZones(user.id);
  const zonesConfirmed = !!zones.data?.confirmed_at;
  const hr = useLiveHeartRate(user.id, {
    session: { status: "none", liveData: true, isDemo: demo },
    zonesConfirmed,
  });
  const health = hr.health;
  // Ready means a live reading right now (H3 with a BPM) of this session's kind (demo or real).
  const ready = preflightReady(health, hr.live, demo);
  const kindMismatch = preflightKindMismatch(health, hr.live, demo);
  const chip = preflightChip(health, hr.live?.contact, kindMismatch);

  const [busy, setBusy] = useState<"live" | "off" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<{ id: string; liveData: boolean } | null>(null);
  const [ending, setEnding] = useState(false);
  // One command id per Start attempt and per choice: retrying the same button replays the same
  // session (a lost response is not a second session), and the other button never replays a
  // session started with the opposite live-data choice.
  const attempt = useRef({ live: newId(), off: newId() });

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

  // start_timezone is the starting device's zone (0006: the session's calendar day uses it), so a
  // workout logged while travelling lands on the day it happened. Weeks use the profile zone.
  const tz = browserTimeZone();

  async function begin(liveData: boolean) {
    const choice = liveData ? "live" : "off";
    setBusy(choice);
    setError(null);
    try {
      const res = await api.sessions.start({
        templateId,
        liveData,
        timezone: tz,
        commandId: attempt.current[choice],
        ...(demo && liveData ? { isDemo: true } : {}),
      });
      if (!res.ok && res.error === "session_running" && res.session_id) {
        attempt.current[choice] = newId();
        setRunning({ id: res.session_id, liveData });
        return;
      }
      if (!res.ok || !res.session) {
        attempt.current[choice] = newId();
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
  // Before the first successful read, H0 is not a fact: say we're checking, never "not set up".
  const body = !hr.loaded
    ? hr.error
      ? PREFLIGHT_HR_COPY.readFailed
      : PREFLIGHT_HR_COPY.checking
    : kindMismatch
      ? demo
        ? PREFLIGHT_HR_COPY.realOnly
        : PREFLIGHT_HR_COPY.demoOnly
      : ready
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
            {hr.loaded && <HealthChip label={chip.label} tone={chip.tone} />}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-subhead text-text-2">
            <span>{body}</span>
            {hr.loaded && health.demo && (
              <span className="rounded-chip border border-text px-2 text-footnote font-bold text-text">
                DEMO
              </span>
            )}
          </p>
          {health.batteryLow && hr.live?.battery_pct != null && (
            <p className="mt-1 text-subhead font-bold text-hold">
              Strap battery {hr.live.battery_pct}%.
            </p>
          )}
          {hr.loaded && !ready && !kindMismatch && (
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
        {demo && (
          <Card variant="guess">
            <div className="flex items-center gap-2">
              <Eyebrow>{PREFLIGHT_COPY.demoTitle}</Eyebrow>
              <span className="rounded-chip border border-text px-2 text-footnote font-bold">
                DEMO
              </span>
            </div>
            <p className="mt-2 text-subhead text-text-2">{PREFLIGHT_COPY.demoBody}</p>
          </Card>
        )}
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
