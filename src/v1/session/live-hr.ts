// Live heart rate for every viewer (h10-design 2, 4.3, 5.5): the caller's hr_live row and
// hr_sensors row (initial read + Realtime, re-read on (re)subscribe and when the page becomes
// visible again), the H-state from core/health.ts recomputed every second from server-corrected
// time, and the live zone aggregates from core/zones.ts (the same module the saved summary uses).
// Viewers never touch Bluetooth and never treat relay_mode = 'live' as Live on its own.

import { useEffect, useMemo, useRef, useState } from "react";
import { deriveHealthState, type HealthState } from "@/v1/core/health";
import { sensorActive, type HrLiveRow, type HrSensorRow, type StoredSample } from "@/v1/core/hr";
import { activeIntervals } from "@/v1/core/timing";
import type { EngineState, ZoneCutoffs } from "@/v1/core/types";
import { accountZones, zoneOf, type ZoneNumber, type ZoneTotals } from "@/v1/core/zones";
import { useApi } from "@/v1/data/client";
import { useNow } from "./use-session";

export interface LiveHr {
  live: HrLiveRow | null;
  /** what deriveHealthState needs: a strap is paired (or a demo relay is publishing) */
  sensor: { paired: boolean } | null;
  /** the hr_sensors row when paired (null when none or forgotten) */
  sensorRow: HrSensorRow | null;
  loaded: boolean;
}

/**
 * Paired = an hr_sensors row that is not tombstoned. A demo relay never saves a strap, so a
 * demo hr_live row counts as paired too (its readings carry the DEMO badge everywhere).
 */
export function pairedFrom(row: HrSensorRow | null, live: HrLiveRow | null) {
  return sensorActive(row) || live?.source_kind === "demo" ? { paired: true } : null;
}

/** hr_live + hr_sensors for the signed-in user (one channel each, torn down on unmount). */
export function useLiveHr(userId: string): LiveHr {
  const api = useApi();
  const [state, setState] = useState<{
    live: HrLiveRow | null;
    row: HrSensorRow | null;
    loaded: boolean;
  }>({ live: null, row: null, loaded: false });
  useEffect(() => {
    let on = true;
    let lastRev = -1;
    // Different user (Switch user): never show the previous user's row, even for a frame.
    setState({ live: null, row: null, loaded: false });
    const take = (row: HrLiveRow | null) => {
      if (!on || !row || row.user_id !== userId) return;
      // Rows with rev <= the cached rev are ignored (h10-design 5.5).
      if (row.rev <= lastRev) return;
      lastRev = row.rev;
      setState((s) => ({ ...s, live: row }));
    };
    const takeSensor = (row: HrSensorRow | null) => {
      if (!on || (row && row.user_id !== userId)) return;
      setState((s) => ({ ...s, row }));
    };
    const reselect = () =>
      void Promise.all([
        api.hr.live().catch(() => undefined),
        api.hr.sensorRow().catch(() => undefined),
      ]).then(([live, row]) => {
        if (!on) return;
        setState((s) => {
          let next = s;
          // A Realtime row may have arrived first: keep it unless the read is newer.
          if (live && live.user_id === userId && live.rev > lastRev) {
            lastRev = live.rev;
            next = { ...next, live };
          } else if (live === null && lastRev < 0) next = { ...next, live: null };
          if (row !== undefined) next = { ...next, row };
          return { ...next, loaded: true };
        });
      });
    reselect();
    const offLive = api.realtime.onHrLive(userId, take);
    const offSensor = api.realtime.onHrSensor(userId, takeSensor);
    // A TV waking from sleep never shows stale data as Live: re-read when visible again.
    const onVis = () => {
      if (document.visibilityState === "visible") reselect();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    return () => {
      on = false;
      offLive();
      offSensor();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    };
  }, [api, userId]);
  return useMemo(
    () => ({
      live: state.live,
      sensor: pairedFrom(state.row, state.live),
      sensorRow: sensorActive(state.row) ? state.row : null,
      loaded: state.loaded,
    }),
    [state],
  );
}

export function healthFor(
  hr: Pick<LiveHr, "live" | "sensor">,
  nowMs: number,
  session: {
    status: "active" | "paused" | "none";
    liveData: boolean;
    isDemo: boolean;
  },
  zonesConfirmed: boolean,
): HealthState {
  return deriveHealthState({
    live: hr.live,
    sensor: hr.sensor,
    serverNowMs: nowMs,
    session,
    zonesConfirmed,
  });
}

export interface HeartRateContext {
  session?: { status: "active" | "paused" | "none"; liveData: boolean; isDemo: boolean };
  zonesConfirmed?: boolean;
}

/**
 * Everything a viewer shows about heart rate: the rows, server-corrected now (ticking every
 * second) and the derived health state.
 */
export function useLiveHeartRate(userId: string, ctx: HeartRateContext = {}) {
  const hr = useLiveHr(userId);
  const now = useNow();
  const session = ctx.session ?? { status: "none" as const, liveData: true, isDemo: false };
  const health = healthFor(hr, now, session, !!ctx.zonesConfirmed);
  return { ...hr, now, health };
}

export interface LiveZones {
  totals: ZoneTotals;
  currentZone: ZoneNumber | null;
  /** active time spent in the current zone since it last changed */
  timeInZoneMs: number;
}

/**
 * Samples of this session (stored ones on load, then each new hr_live reading) run through
 * accountZones() against the active intervals, so pauses and stale gaps are Unmeasured.
 */
export function useLiveZones(
  sessionId: string | null,
  isDemo: boolean,
  liveData: boolean,
  live: HrLiveRow | null,
  timing: EngineState | null,
  cutoffs: ZoneCutoffs | null,
  nowMs: number,
  countsNow: boolean,
): LiveZones {
  const api = useApi();
  const samples = useRef<StoredSample[]>([]);
  const [, bump] = useState(0);

  useEffect(() => {
    samples.current = [];
    if (!sessionId || !liveData) return;
    let on = true;
    void api.hr
      .samples(sessionId, isDemo)
      .then((s) => {
        if (!on) return;
        samples.current = [...s, ...samples.current];
        bump((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [api, sessionId, isDemo, liveData]);

  const lastMeasured = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || !live?.measured_at || live.measured_at === lastMeasured.current) return;
    if (live.active_session_id && live.active_session_id !== sessionId) return;
    lastMeasured.current = live.measured_at;
    const at = Date.parse(live.measured_at);
    samples.current.push({
      stream_id: live.holder_stream_id,
      seq: at,
      measured_at: at,
      bpm: live.bpm,
      contact: live.contact,
      is_demo: live.is_demo,
    });
  }, [live, sessionId]);

  return useMemo(() => {
    const empty: ZoneTotals = {
      zone_ms: [0, 0, 0, 0, 0],
      measured_ms: 0,
      unmeasured_ms: 0,
      active_ms: 0,
      coverage: 0,
    };
    if (!timing || timing.started_at == null)
      return { totals: empty, currentZone: null, timeInZoneMs: 0 };
    const end = timing.ended_at ?? nowMs;
    const intervals = activeIntervals(timing, end);
    const totals = accountZones({
      samples: liveData ? samples.current : [],
      intervals,
      cutoffs,
      sessionStart: timing.started_at,
      sessionEnd: end,
      sessionIsDemo: isDemo,
    });
    const currentZone = countsNow ? zoneOf(live?.bpm ?? null, cutoffs) : null;
    let timeInZoneMs = 0;
    if (currentZone != null) {
      // Walk back over contiguous samples (gaps <= 10 s) in the same zone.
      const sorted = [...samples.current].sort((a, b) => a.measured_at - b.measured_at);
      let since = sorted.length ? (sorted[sorted.length - 1] as StoredSample).measured_at : end;
      for (let i = sorted.length - 1; i >= 0; i--) {
        const s = sorted[i] as StoredSample;
        const next = sorted[i + 1];
        if (zoneOf(s.bpm, cutoffs) !== currentZone || s.contact === false) break;
        if (next && next.measured_at - s.measured_at > 10_000) break;
        since = s.measured_at;
      }
      for (const iv of intervals) {
        const lo = Math.max(iv.from, since);
        const hi = Math.min(iv.to, end);
        if (hi > lo) timeInZoneMs += hi - lo;
      }
    }
    return { totals, currentZone, timeInZoneMs };
    // samples.current is a ref: nowMs (1 s tick) and live drive recomputation.
  }, [timing, nowMs, liveData, cutoffs, isDemo, countsNow, live]);
}
