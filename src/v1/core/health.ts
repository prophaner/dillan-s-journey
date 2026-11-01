// Viewer health-state derivation (h10-design 4.3, first match wins) with the exact copy of 4.4.
// Recompute every 1 s and on every Realtime event, from server-corrected time.

import {
  BATTERY_LOW_PCT,
  CONNECTED_AT_TOLERANCE_MS,
  FRESH_LIVE_MS,
  FRESH_UNAVAILABLE_MS,
  RELAY_OFFLINE_IDLE_MS,
  RELAY_OFFLINE_MS,
  type HrLiveRow,
} from "./hr";
import { formatDuration } from "./timing";

export type HealthStateId =
  | "H0_not_set_up"
  | "H1_relay_idle"
  | "H2_waiting"
  | "H3_live"
  | "H4_delayed"
  | "H5_no_recent"
  | "H6_relay_offline"
  | "H7a_strap_lost"
  | "H7b_no_contact"
  | "H8_reconnecting"
  | "H9_paused"
  | "H10_off";

export interface HealthState {
  id: HealthStateId;
  paused: boolean; // H9 is an overlay flag
  variant: "default" | "hidden" | "standby" | "takeover";
  label: string;
  detail: string;
  bpm: number | null;
  showBpm: boolean;
  deemphasize: boolean;
  ageMs: number | null;
  countsTowardZone: boolean;
  via: string | null;
  batteryLow: boolean;
  demo: boolean;
}

export interface HealthInput {
  live: HrLiveRow | null;
  sensor: { paired: boolean } | null; // hr_sensors row present and forgotten_at null
  serverNowMs: number;
  session: { status: "active" | "paused" | "none"; liveData: boolean; isDemo: boolean };
  zonesConfirmed: boolean;
}

/** Exact copy, h10-design 4.4. {relay}, {n}, {m:ss} are filled in by healthCopy(). */
export const HEALTH_COPY = {
  H0: {
    label: "Not set up",
    detail: "Connect a Polar H10 on an Android phone or a computer to see heart rate here.",
  },
  H1: {
    label: "Strap not connected",
    detail: "Relay is open on {relay}. Tap Connect strap there.",
  },
  H1_standby: {
    label: "Strap resting",
    detail:
      "{relay} disconnected the strap between workouts. It reconnects when you open a workout.",
  },
  H2: {
    label: "Waiting for first reading",
    detail: "Strap connected. Waiting for the first beat. Wet the electrodes if this takes long.",
  },
  H3: { label: "Live", detail: "Updated {n}s ago · via {relay}" },
  H4: {
    label: "Delayed",
    detail: "Last reading {n}s ago. Counting as unmeasured until it catches up.",
  },
  H5: {
    label: "No recent reading",
    detail: "Last reading {m:ss} ago. Time is being recorded as unmeasured.",
  },
  H6: {
    label: "Relay offline",
    detail: "Lost {relay}. Keep the Dillan relay page open with the screen on.",
  },
  H6_hidden: {
    label: "Relay offline",
    detail: "The relay page on {relay} went to the background. Bring it back to the front.",
  },
  H6_takeover: {
    label: "Relay offline",
    detail: "Another device took over heart rate. Check which relay is open.",
  },
  H7a: {
    label: "Strap disconnected",
    detail: "{relay} can't hear your strap. Check it's on, snug and in range.",
  },
  H7b: {
    label: "Check strap contact",
    detail: "Strap is connected but not touching skin. Wet the electrodes and tighten the strap.",
  },
  H8: { label: "Reconnecting", detail: "Trying to reach your strap. Last reading shown below." },
  H9: { label: "Paused", detail: "Heart rate still updates, but time in zone is not counting." },
  H10: { label: "Live data off", detail: "You chose to continue without live heart rate." },
} as const;

export const DEMO_BADGE = "DEMO";

export function batteryLine(pct: number): string {
  return `Strap battery ${pct}%. Replace the CR2025 soon.`;
}

export function sourceLine(relay: string, user: string): string {
  return `Heart rate from ${relay} for ${user}.`;
}

function fill(t: string, relay: string, ageMs: number | null): string {
  const n = ageMs == null ? 0 : Math.floor(ageMs / 1000);
  return t
    .replace("{relay}", relay)
    .replace("{n}", String(n))
    .replace("{m:ss}", formatDuration(ageMs ?? 0));
}

const ms = (iso: string | null | undefined) => (iso == null ? null : Date.parse(iso));

export function deriveHealthState(a: HealthInput): HealthState {
  const live = a.live;
  const relay = live?.holder_name ?? "the relay";
  const measured = ms(live?.measured_at);
  const age = measured == null ? null : Math.max(0, a.serverNowMs - measured);
  const base = {
    paused: a.session.status === "paused",
    bpm: live?.bpm ?? null,
    ageMs: age,
    via: live?.holder_name ?? null,
    batteryLow: live?.battery_pct != null && live.battery_pct <= BATTERY_LOW_PCT,
    demo: live?.is_demo ?? false,
    countsTowardZone: false,
  };
  const make = (
    id: HealthStateId,
    copy: { label: string; detail: string },
    o: Partial<Pick<HealthState, "variant" | "showBpm" | "deemphasize" | "bpm">> = {},
  ): HealthState => ({
    ...base,
    id,
    variant: o.variant ?? "default",
    label: copy.label,
    detail: fill(copy.detail, relay, age),
    showBpm: o.showBpm ?? false,
    deemphasize: o.deemphasize ?? false,
    bpm: o.bpm !== undefined ? o.bpm : base.bpm,
  });
  const recent = age != null && age <= FRESH_UNAVAILABLE_MS && live?.bpm != null;

  let st: HealthState;
  if (!a.session.liveData) {
    return make("H10_off", HEALTH_COPY.H10, { bpm: null });
  } else if (!a.sensor || !a.sensor.paired) {
    st = make("H0_not_set_up", HEALTH_COPY.H0, { bpm: null });
  } else if (
    !live ||
    a.serverNowMs - (ms(live.last_seen_at) ?? 0) >
      (live.relay_mode === "idle" || live.relay_mode === "standby"
        ? RELAY_OFFLINE_IDLE_MS
        : RELAY_OFFLINE_MS)
  ) {
    const hidden = live?.relay_mode === "hidden";
    st = make("H6_relay_offline", hidden ? HEALTH_COPY.H6_hidden : HEALTH_COPY.H6, {
      variant: hidden ? "hidden" : "default",
      showBpm: recent,
      deemphasize: true,
    });
  } else if (live.relay_mode === "idle" || live.relay_mode === "choosing") {
    st = make("H1_relay_idle", HEALTH_COPY.H1, { bpm: null });
  } else if (live.relay_mode === "standby") {
    st = make("H1_relay_idle", HEALTH_COPY.H1_standby, { variant: "standby", bpm: null });
  } else if (live.relay_mode === "superseded") {
    st = make("H6_relay_offline", HEALTH_COPY.H6_takeover, { variant: "takeover", bpm: null });
  } else if (live.relay_mode === "reconnecting") {
    st = make("H8_reconnecting", HEALTH_COPY.H8, { showBpm: recent, deemphasize: true });
  } else if (live.relay_mode === "sensor_lost") {
    st = make("H7a_strap_lost", HEALTH_COPY.H7a, { bpm: null });
  } else if (live.relay_mode === "no_contact" || live.contact === false) {
    st = make("H7b_no_contact", HEALTH_COPY.H7b, { bpm: null });
  } else if (
    live.relay_mode === "connecting" ||
    live.relay_mode === "waiting_first" ||
    measured == null ||
    (live.connected_at != null &&
      measured < (ms(live.connected_at) as number) - CONNECTED_AT_TOLERANCE_MS)
  ) {
    st = make("H2_waiting", HEALTH_COPY.H2, { bpm: null });
  } else if ((age as number) <= FRESH_LIVE_MS) {
    st = make("H3_live", HEALTH_COPY.H3, { showBpm: live.bpm != null });
    // contact === false was handled by H7b above
    st.countsTowardZone =
      live.bpm != null &&
      a.session.status === "active" &&
      a.session.liveData &&
      a.zonesConfirmed &&
      live.is_demo === a.session.isDemo;
  } else if ((age as number) <= FRESH_UNAVAILABLE_MS) {
    st = make("H4_delayed", HEALTH_COPY.H4, { showBpm: live.bpm != null, deemphasize: true });
  } else {
    st = make("H5_no_recent", HEALTH_COPY.H5, { bpm: null });
  }

  if (st.paused) {
    st.countsTowardZone = false;
    st.detail =
      st.id === "H3_live" ? HEALTH_COPY.H9.detail : `${st.label}. ${HEALTH_COPY.H9.detail}`;
    st.label = HEALTH_COPY.H9.label;
  }
  return st;
}
