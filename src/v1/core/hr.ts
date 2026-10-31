// Heart-rate types, constants and the 0x2A37 parser (h10-design section 3). Pure.

export type SourceKind = "web_ble" | "firetv_native" | "watch_companion" | "demo"; // V1 builds web_ble + demo
export type SensorKind = "polar_h10" | "generic_hrs";

export const FRESH_LIVE_MS = 10_000;
export const FRESH_UNAVAILABLE_MS = 30_000;
export const RELAY_OFFLINE_MS = 15_000;
export const RELAY_HEARTBEAT_MS = 5_000;
export const RELAY_IDLE_HEARTBEAT_MS = 30_000;
export const RELAY_IDLE_BACKOFF_AFTER_MS = 600_000;
export const RELAY_OFFLINE_IDLE_MS = 75_000;
export const HOLD_FORWARD_MAX_MS = 10_000;
export const CONNECTED_AT_TOLERANCE_MS = 2_000;
export const HR_WANTED_DEFAULT_MIN = 10;
export const BATTERY_LOW_PCT = 20;
export const HR_STORE_RR = false;

export type SupportResult =
  | { ok: true }
  | {
      ok: false;
      reason: "no_api" | "insecure_context" | "policy_blocked" | "in_app_browser" | "adapter_off";
    };

export type RelayMode =
  | "unsupported"
  | "idle"
  | "choosing"
  | "connecting"
  | "waiting_first"
  | "live"
  | "no_contact"
  | "reconnecting"
  | "sensor_lost"
  | "hidden"
  | "standby"
  | "superseded"
  | "demo";

export interface SensorInfo {
  sensorKind: SensorKind;
  name: string;
  serial: string | null;
  batteryPct: number | null;
}

export interface ParsedHr {
  bpm: number | null;
  contact: boolean | null;
  rrMs: number[];
}

export interface HrSample {
  seq: number;
  measuredAt: string;
  bpm: number | null;
  contact: boolean | null;
  rrMs?: number[];
}

/** Hears the strap (implemented in Slice E). */
export interface HealthSensorDriver {
  readonly kind: SourceKind;
  checkSupport(): Promise<SupportResult>;
  pick(): Promise<SensorInfo>;
  reconnect(): Promise<SensorInfo>;
  disconnect(): Promise<void>;
  forget(): Promise<void>;
  readBattery(): Promise<number | null>;
  onSample(cb: (p: ParsedHr & { receivedLocalMs: number }) => void): () => void;
  onLinkChange(cb: (up: boolean) => void): () => void;
}

export interface HrIngestSample {
  seq: number;
  measured_at: string;
  bpm: number | null;
  contact: boolean | null;
  rr_ms: number[] | null;
}

/** Arguments of public.hr_ingest */
export interface HrIngestRequest {
  p_source_id: string;
  p_stream_id: string;
  p_expected_user_id: string;
  p_source_kind: SourceKind;
  p_mode: RelayMode;
  p_connected_at: string | null;
  p_sensor: { name: string; serial: string | null; battery_pct: number | null } | null;
  p_claim: boolean;
  p_samples: HrIngestSample[]; // 0..30
  p_source_name?: string | null;
  p_platform?: string | null;
}

export type HrRejectReason =
  "too_old" | "future" | "out_of_range" | "outside_session" | "demo_mismatch" | "sensor_forgotten";

export interface HrIngestResponse {
  server_now: string;
  accepted: number;
  duplicates: number;
  rejected: Array<{ seq: number; reason: HrRejectReason }>;
  superseded: boolean;
  holder_name: string | null;
  rate_limited: boolean;
  revoked: boolean;
  identity_mismatch: boolean;
  stop_requested: boolean;
  sensor_forgotten: boolean;
}

export interface HealthPublisher {
  readonly sourceId: string;
  readonly streamId: string;
  readonly userId: string;
  readonly serverOffsetMs: number;
  ingest(
    req: Omit<HrIngestRequest, "p_source_id" | "p_stream_id" | "p_expected_user_id">,
  ): Promise<HrIngestResponse>;
}

/** public.hr_live row (the Realtime row viewers read) */
export interface HrLiveRow {
  user_id: string;
  rev: number;
  active_session_id: string | null;
  holder_source_id: string;
  holder_stream_id: string;
  holder_name: string;
  source_kind: SourceKind;
  relay_mode: RelayMode;
  sensor_name: string | null;
  sensor_serial: string | null;
  battery_pct: number | null;
  bpm: number | null;
  contact: boolean | null;
  measured_at: string | null;
  connected_at: string | null;
  last_seen_at: string;
  is_demo: boolean;
  updated_at: string;
}

/** public.hr_sensors row */
export interface HrSensorRow {
  user_id: string;
  sensor_kind: SensorKind;
  sensor_name: string;
  sensor_serial: string | null;
  paired_at: string;
  forgotten_at: string | null;
  wanted_until: string | null;
  last_source_id: string | null;
  last_battery_pct: number | null;
  battery_read_at: string | null;
}

/** A stored sample as zone accounting sees it (hr_samples / hr_demo_samples). */
export interface StoredSample {
  stream_id: string;
  seq: number;
  measured_at: number; // epoch ms
  bpm: number | null;
  contact: boolean | null;
  is_demo: boolean;
}

/** requestDevice options: the service filter keeps non-Polar HRS straps working. */
export const H10_REQUEST = {
  filters: [{ services: ["heart_rate"] }],
  optionalServices: ["battery_service"],
} as const;

/** 'Polar H10 1A2B3C4D' -> '1A2B3C4D' */
export function parseH10Serial(name: string): string | null {
  const m = /^Polar H10 ([0-9A-F]{8})$/i.exec(name);
  return m?.[1] ? m[1].toUpperCase() : null;
}

/**
 * Heart Rate Measurement (0x2A37). Byte 0 flags: bit0 HR format (0 uint8, 1 uint16 LE);
 * bit1 contact detected; bit2 contact supported; bit3 Energy Expended present (uint16, skipped);
 * bit4 RR present (uint16 LE, 1/1024 s, repeated to the end).
 */
export function parseHeartRateMeasurement(v: DataView): ParsedHr {
  const flags = v.getUint8(0);
  let o = 1;
  const u16 = (flags & 0x01) !== 0;
  const bpmRaw = u16 ? v.getUint16(o, true) : v.getUint8(o);
  o += u16 ? 2 : 1;
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : null;
  if (flags & 0x08) o += 2;
  const rrMs: number[] = [];
  if (flags & 0x10) {
    for (; o + 1 < v.byteLength; o += 2)
      rrMs.push(Math.round((v.getUint16(o, true) * 1000) / 1024));
  }
  const bpm = contact === false || bpmRaw < 25 || bpmRaw > 250 ? null : bpmRaw;
  return { bpm, contact, rrMs };
}
