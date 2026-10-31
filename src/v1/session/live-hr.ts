// Live heart rate for preflight and the dashboard: the caller's hr_live row (Realtime + initial
// read), the paired strap, the H-state from core/health.ts every second, and the live zone
// aggregates from core/zones.ts (the same module the saved summary uses). Slice E adds the relay;
// until then the Supabase hr_live row is empty and the mock backend simulates one (mock-hr.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { deriveHealthState, type HealthState } from "@/v1/core/health";
import type { HrLiveRow, StoredSample } from "@/v1/core/hr";
import { activeIntervals } from "@/v1/core/timing";
import type { EngineState, ZoneCutoffs } from "@/v1/core/types";
import { accountZones, zoneOf, type ZoneNumber, type ZoneTotals } from "@/v1/core/zones";
import { useApi } from "@/v1/data/client";
import { useServerClock } from "./use-session";

export interface LiveHr {
  live: HrLiveRow | null;
  sensor: { paired: boolean } | null;
  loaded: boolean;
}

/** hr_live + hr_sensors for the signed-in user. */
export function useLiveHr(userId: string): LiveHr {
  const api = useApi();
  const [state, setState] = useState<LiveHr>({ live: null, sensor: null, loaded: false });
  useEffect(() => {
    let on = true;
    let lastRev = -1;
    const take = (row: HrLiveRow | null) => {
      if (!on) return;
      // Rows with rev <= the cached rev are ignored (h10-design 5.5).
      if (row && row.rev < lastRev) return;
      lastRev = row?.rev ?? lastRev;
      setState((s) => ({ ...s, live: row }));
    };
    void Promise.all([api.hr.live().catch(() => null), api.hr.sensor().catch(() => null)]).then(
      ([live, sensor]) => {
        if (!on) return;
        lastRev = live?.rev ?? -1;
        setState({ live, sensor, loaded: true });
      },
    );
    const off = api.realtime.onHrLive(userId, take);
    return () => {
      on = false;
      off();
    };
  }, [api, userId]);
  return state;
}

export function healthFor(
  hr: LiveHr,
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
