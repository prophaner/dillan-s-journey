// Screen-level heart-rate copy and chips built on the shared H-state (h10-design 6): S04 Home
// "Heart-rate strap" card, S08 preflight chip, S14 strap rows and the S16 relay labels. Pure, so
// every phone and TV screen shows the same words, and the copy can be checked in one place.

import { BATTERY_LOW_PCT, type HrLiveRow, type HrSensorRow, type RelayMode } from "./hr";
import type { HealthState } from "./health";

export type ChipTone = "live" | "warn" | "off";

export interface Chip {
  label: string;
  tone: ChipTone;
}

/** "Polar H10 1A2B3C4D", or the advertised name of another HRS strap */
export function strapName(
  sensor: Pick<HrSensorRow, "sensor_name" | "sensor_serial"> | null,
  live?: Pick<HrLiveRow, "sensor_name" | "sensor_serial"> | null,
): string | null {
  const serial = live?.sensor_serial ?? sensor?.sensor_serial ?? null;
  if (serial) return `Polar H10 ${serial}`;
  return live?.sensor_name ?? sensor?.sensor_name ?? null;
}

export function batteryPctOf(
  live: Pick<HrLiveRow, "battery_pct"> | null,
  sensor: Pick<HrSensorRow, "last_battery_pct"> | null,
): number | null {
  return live?.battery_pct ?? sensor?.last_battery_pct ?? null;
}

export const isBatteryLow = (pct: number | null) => pct != null && pct <= BATTERY_LOW_PCT;

/** S08 Preflight chip (phone and TV). */
export function preflightChip(h: HealthState, contact: boolean | null | undefined): Chip {
  if (h.id === "H3_live" && contact !== false) return { label: "Live · ready", tone: "live" };
  switch (h.id) {
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

export const HOME_HR_COPY = {
  eyebrow: "Heart-rate strap",
  notSetUp: "Connect a Polar H10 to show heart rate during workouts.",
  standby: (relay: string) =>
    `Strap rests between workouts. It reconnects on ${relay} when you open a workout.`,
  offline:
    "Strap set up. Open the Dillan relay on your Android phone or computer before you train.",
  battery: (p: number) => `Strap battery low (${p}%). It takes a CR2025.`,
  setUp: "Set up live data",
  settings: "Live data settings",
  openRelay: "Open relay on this device",
  tvFallback: "Finish setup on a phone or computer: Profile → Live data.",
  tvOpenRelay: (host: string, relay: string) =>
    `Open ${host}/relay on ${relay} and tap Connect strap.`,
} as const;

export interface HomeHrCard {
  chip: Chip;
  text: string;
  battery: string | null;
  /** H0: the phone action is Set up live data */
  notSetUp: boolean;
  /** relay idle or offline: offer Open relay on this device (supported browsers only) */
  relayOffline: boolean;
  /** TV: show the QR + "Open {host}/relay on {relay}…" (H1 not standby, or H6) */
  showRelayQr: boolean;
}

/** S04 Home "Heart-rate strap" card (phone and TV), h10-design 6 S04 table. */
export function homeHrCard(
  h: HealthState,
  live: HrLiveRow | null,
  sensor: HrSensorRow | null,
): HomeHrCard {
  const relay = live?.holder_name ?? "the relay";
  const pct = batteryPctOf(live, sensor);
  const battery = isBatteryLow(pct) ? HOME_HR_COPY.battery(pct as number) : null;
  const base = { battery, notSetUp: false, relayOffline: false, showRelayQr: false };
  if (h.id === "H0_not_set_up")
    return {
      ...base,
      battery: null,
      chip: { label: "Not set up", tone: "off" },
      text: HOME_HR_COPY.notSetUp,
      notSetUp: true,
    };
  if (h.id === "H3_live") {
    const parts = [`${strapName(sensor, live) ?? "Strap"} via ${relay}`];
    if (pct != null) parts.push(`${pct}%`);
    return { ...base, chip: { label: "Live", tone: "live" }, text: parts.join(" · ") };
  }
  if (h.id === "H1_relay_idle" && h.variant === "standby")
    return { ...base, chip: { label: "Ready", tone: "live" }, text: HOME_HR_COPY.standby(relay) };
  if (h.id === "H1_relay_idle" || h.id === "H6_relay_offline" || h.id === "H5_no_recent")
    return {
      ...base,
      chip: { label: "Relay offline", tone: "warn" },
      text: HOME_HR_COPY.offline,
      relayOffline: true,
      showRelayQr: h.id !== "H5_no_recent",
    };
  // Connected but not live yet (waiting, delayed, contact, reconnecting): the H-state says why.
  return { ...base, chip: { label: h.label, tone: "warn" }, text: h.detail };
}

/** S16 relay: label per mode (h10-design 6 S16 table). */
export const RELAY_COPY = {
  title: "Dillan relay",
  relayingFor: (name: string) => `Relaying for ${name}`,
  thisDevice: "This device",
  idle: "Strap not connected",
  choosing: "Choose your strap…",
  connecting: (serial: string | null) =>
    `Connecting to Polar H10${serial ? ` ${serial}` : ""}… Accept any pairing prompt.`,
  waiting_first: "Waiting for first beat",
  live: "Sending to Dillan",
  demo: "Sending DEMO readings",
  no_contact: "Not touching skin. Snug it up and wet the electrodes.",
  reconnecting: (n: number) => `Reconnecting… (attempt ${n})`,
  sensor_lost: "Strap lost. Make sure it's on and nearby, then tap Reconnect.",
  standby: "Resting between workouts. The strap reconnects when you open a workout.",
  superseded: (holder: string) => `Another device is relaying now (${holder}).`,
  supersededRelease: "Auto-disconnects after 30 s to free the strap.",
  connectTimeout:
    "Couldn't finish pairing. Remove \"Polar H10\" from this device's Bluetooth settings, update the strap in Polar Flow, and try again.",
  chooserEmpty:
    "No strap found? Wet the electrodes and wear it. On Android, allow Chrome's Nearby devices permission, or turn on Location on older Android. Then tap Connect strap again. If it still doesn't appear, check the battery.",
  connectFailed: "Couldn't connect to the strap. Tap Connect strap to try again.",
  signedOut: "Signed out. Sign in to keep relaying.",
  forgotten: "This strap was forgotten in Live data settings.",
  revoked: "This device was removed from your relays.",
  differentStrap: (old: string, next: string) =>
    `This is a different strap than last time (was ${old}). Check this ID matches the number printed on your strap: ${next}.`,
  offline: (k: number) => `Offline - holding ${k}s of readings`,
  lastSent: (n: number) => `Last sent ${n}s ago`,
  battery: (p: number) => `Battery ${p}%`,
  batteryLow: (p: number) => `Strap battery ${p}%. Replace the CR2025 soon.`,
  footer: "Keep this page open with the screen on during your workout. Plug the device in.",
  wakeOn: "Screen will stay on",
  wakeOff: "Screen may sleep - keep it plugged in and open",
  resting: "Resting - screen may sleep",
  androidHint: "Add to Home screen for a full-screen relay.",
  leave: "Leaving stops heart rate on the TV.",
  steps: [
    "Wet the electrodes and put the strap on.",
    "On Android, allow Chrome's Nearby devices permission (Android 12+), or turn on Location and allow it for Chrome (Android 11 and earlier).",
    "Tap Connect strap and choose 'Polar H10 …' from the list.",
    "During workouts, keep this page open with the screen on. A docked phone or tablet works best.",
  ],
  connect: "Connect strap",
  showAll: "Show all devices",
  cancel: "Cancel",
  disconnect: "Disconnect",
  reconnectNow: "Reconnect now",
  reconnect: "Reconnect",
  connectNow: "Connect now",
  useThisDevice: "Use this device",
  useThisStrap: "Use this strap",
  pickAgain: "Pick again",
  signIn: "Sign in",
  addAgain: "Add it again",
  simulate: "Simulate strap (DEMO)",
  stopSimulate: "Stop simulation",
} as const;

export function relayModeLabel(
  mode: RelayMode,
  o: { serial?: string | null; attempt?: number; holder?: string | null },
): string {
  switch (mode) {
    case "unsupported":
      return "";
    case "idle":
      return RELAY_COPY.idle;
    case "choosing":
      return RELAY_COPY.choosing;
    case "connecting":
      return RELAY_COPY.connecting(o.serial ?? null);
    case "waiting_first":
      return RELAY_COPY.waiting_first;
    case "live":
    case "hidden":
      return RELAY_COPY.live;
    case "demo":
      return RELAY_COPY.demo;
    case "no_contact":
      return RELAY_COPY.no_contact;
    case "reconnecting":
      return RELAY_COPY.reconnecting(o.attempt ?? 1);
    case "sensor_lost":
      return RELAY_COPY.sensor_lost;
    case "standby":
      return RELAY_COPY.standby;
    case "superseded":
      return RELAY_COPY.superseded(o.holder ?? "another device");
  }
}

/** S14 copy (h10-design 6 S14). */
export const S14_COPY = {
  body: "Dillan reads a Polar H10 chest strap through a relay page on an Android phone or a computer. The TV and other screens only show what the relay sends.",
  steps: [
    "Wet the electrodes and put the strap on.",
    "On Android, allow Chrome's Nearby devices permission (Android 12+), or turn on Location and allow it for Chrome (Android 11 and earlier).",
    "Open the relay, tap Connect strap and choose 'Polar H10 …' from the list.",
    "During workouts, keep the relay page open with the screen on. A docked phone or tablet works best.",
  ],
  openRelayHere: "Open relay on this device",
  openRelay: "Open relay",
  noApi:
    "This browser can't connect to Bluetooth sensors. That's fine: start the relay on Chrome on an Android phone or tablet, or Chrome or Edge on a computer, and this screen will show it.",
  copyLink: "Copy link",
  linkCopied: "Link copied",
  policyBlocked: "Bluetooth is blocked in this preview. Open the published site in its own tab.",
  inApp: "Open this page in Chrome, not inside another app.",
  forget: "Forget strap",
  forgetConfirm: (serial: string) =>
    `Forget ${serial}? The relay will disconnect it, and you'll pick it again next time.`,
  forgotten: "Strap forgotten",
  relays: "Relay devices",
  noRelays: "No relay has connected yet.",
  remove: "Remove",
  removed: "Relay removed",
  troubleTitle: "Strap not showing up?",
  trouble: [
    "Wet the electrodes and wear the strap - it sleeps when off skin.",
    "On Android, check Chrome has the Nearby devices permission (Android 12+), or that Location is on and allowed for Chrome (Android 11 and earlier).",
    "Close other apps using the strap (Polar Beat, Zwift). The H10 allows two connections.",
    "Update the strap in Polar Flow.",
    "If it still fails, remove 'Polar H10' from this device's Bluetooth settings and try again.",
  ],
  zonesFootnote: "These are Dillan's zones. Set them yourself; nothing is estimated.",
  demoTitle: "Demo heart rate",
  demoBody:
    "Development only. Simulated readings are labelled DEMO, stored apart from real data and count only in demo workouts.",
  demoRelay: "Open demo relay",
  demoWorkout: "Start demo workout",
} as const;
