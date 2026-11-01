# Dillan V1: Polar H10 Heart-Rate Interface Design

Status: recommended design, 2026-10-31. It replaces the Apple Watch and iPhone companion path in the Perplexity design package.
Winner: **Web Bluetooth HR Relay**, with the best ideas from the TV-native and HealthSource-lease proposals added.

---

## 1. Decision

In V1 a **Dillan web page, `/relay`, reads the strap. It runs in Chrome or Edge on a device that stays in the gym.** That device is one of:
- a spare Android phone or tablet in Chrome, docked on a charger
- a Windows, Mac or ChromeOS laptop in Chrome or Edge

How the relay works:
- It connects to the Polar H10 over Web Bluetooth.
- It uses only the standard Heart Rate Service (0x180D, Heart Rate Measurement 0x2A37) and the Battery Service (0x180F).
- It sends readings about once per second to one Supabase RPC, `hr_ingest`.
- The backend is the source of truth, and it decides when heart rate is wanted. The relay reads the strap only during preflight, during an active session, and for a short window after setup. After End it disconnects the strap and goes to standby.

The Fire TV, the iPhone and every other screen only display data. Each one subscribes to one Realtime `hr_live` row per user, plus that user's `hr_sensors` row, and works out the heart-rate state from server timestamps. **Only the `/relay` page ever touches Bluetooth.** S14's **Connect strap** just opens `/relay`.

This design needs no native code. The Lovable app gains:
- one route
- five tables, plus new columns on `workout_sessions` and possibly a pause-interval table (section 5.1)
- four RPCs
- one edge function, `finalize-session-hr`, which shares the zone module with the client
- some reworded copy

The owner's iPhone can still choose routines but cannot be the relay. No iOS browser has Web Bluetooth.

**Upgrade path (V1.1):**
- If the Fire TV turns out to run Fire OS (Android-based) and a sideloaded BLE scanner works on it (Gates G0 and G1 in section 10), a thin Kotlin "Dillan TV shell" can become a second source. It would be a WebView plus a native BLE service, and it would post to the same ingest contract with `source_kind = 'firetv_native'`. That would remove the separate relay device and the per-session tap.
- If Silk turns out to sleep during workouts, the same shell (WebView plus FLAG_KEEP_SCREEN_ON, with BLE optional) is the escalation path for the TV display.
- Neither upgrade needs a schema change.

**Gates before any build:**
1. **G0, the Fire TV OS and browser check (section 10), is go/no-go.** If the TV runs Vega OS and has no usable browser, the V1 `/tv` viewer cannot run on it. A different display path must be chosen before building.
2. **The one-hour hardware spike in section 10 must pass.** Polar's release notes confirm that H10 firmware 4.0.4 and later uses BLE secure pairing ([Polar H10 firmware 4.0.4](https://support.polar.com/en/updates/polar-h10-firmware-update-404)). A user report says the firmware cannot be rolled back, so assume there is no downgrade path. The open question is whether Chrome's Web Bluetooth completes the OS bonding prompt on each candidate relay OS (Android, Windows, macOS). Spike test 1 records the strap's firmware version and runs on every candidate relay OS.

---

## 2. Data path

```
 Polar H10 (worn, electrodes wet; firmware 4.0.4+ = secure pairing)
   | BLE GATT notify 0x2A37 at ~1 Hz; battery 0x2A19 read on connect
   | (uses 1 of the H10's 2 BLE slots; ANT+ stays free for gym gear)
   v
 RELAY  https://{host}/relay   Chrome Android / Chrome-Edge desktop / ChromeOS
   - on load: rpc('server_time') before Connect strap is enabled
   - parse flags -> { bpm, contact, rrMs[] }
   - measuredAt = Date.now() + serverOffsetMs
   - (streamId, seq) per page lifetime; outbox tagged with the signed-in user_id
   - outbox: up to 120 samples (2 min), flushed with original measuredAt;
     discarded on any auth/user change
   - immediate hr_ingest call on every RelayMode change
   - heartbeat 5 s while active; 30 s after 10 min idle/standby
   - subscribes to its own hr_sensors row (wanted_until) to wake from standby
   | supabase.rpc('hr_ingest', ...)  ~1 call/s, at most 30 samples/call
   v
 SUPABASE (authoritative)
   hr_ingest (SECURITY DEFINER, auth.uid(), per-user advisory lock)
     - one-active-relay fence (source_id + stream_id)
     - clamp/validate measured_at, bpm
     - HR-wanted check -> stop_requested
     - insert hr_samples (real) or hr_demo_samples (demo), attributed by measured_at
     - upsert hr_live (1 row per user), monotonic in measured_at, rev+1, last_seen_at = now()
   hr_request(minutes)  preflight/setup demand window; hr_request(0) at End
   edge fn finalize-session-hr (imports zoneAccounting.ts) at End (+ re-run within 2 min grace)
   | Realtime postgres_changes: public.hr_live and public.hr_sensors WHERE user_id = uid
   v
 VIEWERS (display only, never navigator.bluetooth)
   /tv on the Fire TV (Silk or a later shell WebView)
   phone / computer web: S04, S08, S09, S10, S11, S13, S14
   - deriveHealthState(hr_live, hr_sensors, serverNow, session)
   - re-select hr_live + hr_sensors on (re)subscribe and on visibilitychange
   - tear down channel + clear cache on lock / Switch user
```

What each hop does:

| Hop | Responsibility | Never does |
|---|---|---|
| H10 | Sends HR (uint8 BPM), sensor-contact bits and RR intervals at about 1 Hz through standard HRS. Battery level is readable. | It sends no sensor timestamp. Dillan does not use its PMD/ECG/ACC services, which would also risk battery drain if left streaming. |
| Relay page | Owns sensor facts: link up or down, contact, battery. Stamps `measuredAt` with a server-corrected clock. Queues samples during network loss, tagged with the user, and dedupes them by `(stream_id, seq)`. Sends the heartbeat. Obeys `stop_requested`. | It does not know about sessions, compute zones, invent samples or upload another user's queue. |
| `hr_ingest` | Owns time (`received_at`, `last_seen_at`), validation, the one-active-relay rule, whether HR is wanted, and session attribution by `measured_at`. | It does not trust relay clock skew beyond the clamp window. It never mixes demo samples with real sessions. |
| `hr_live` + Realtime | Fans out one row per user at about 1 update per second while HR is wanted, carrying `rev`, `measured_at` and `active_session_id`. | No client-to-client Broadcast. All writes go through the authoritative RPC. |
| Viewers | Derive the H-state from timestamps (`measured_at`, `last_seen_at`) against server-corrected time. Show a live zone tick for display only, computed with the same `zoneAccounting.ts` the backend uses. | They never treat `relay_mode = 'live'` as Live on its own, and never treat the live tick as final. |
| `finalize-session-hr` | Computes the authoritative zone, Unmeasured and coverage totals from `hr_samples` (or `hr_demo_samples`) using the shared `zoneAccounting.ts`. | It never interpolates. |

The TV, the iPhone, Safari and Firefox never call `navigator.bluetooth`.

---

## 3. HealthSource TypeScript interface and message types

Build order: write and unit-test these pure modules first, using fixture byte arrays, before any UI exists. That protects against Lovable fix loops.
- `parse.ts`
- `healthState.ts`
- `zoneAccounting.ts`. This is the **single** zone implementation. The client live tick and the `finalize-session-hr` edge function both import it (section 5.4).

```ts
// src/lib/hr/types.ts
export type SourceKind = 'web_ble' | 'firetv_native' | 'watch_companion' | 'demo'; // V1 builds web_ble + demo
export type SensorKind = 'polar_h10' | 'generic_hrs';

export const FRESH_LIVE_MS = 10_000;          // unchanged from design package
export const FRESH_UNAVAILABLE_MS = 30_000;   // unchanged
export const RELAY_OFFLINE_MS = 15_000;       // unchanged heartbeat rule (active modes)
export const RELAY_HEARTBEAT_MS = 5_000;
export const RELAY_IDLE_HEARTBEAT_MS = 30_000;   // after 10 min in idle/standby
export const RELAY_IDLE_BACKOFF_AFTER_MS = 600_000;
export const RELAY_OFFLINE_IDLE_MS = 75_000;     // offline threshold when last mode was idle/standby
export const HOLD_FORWARD_MAX_MS = 10_000;
export const CONNECTED_AT_TOLERANCE_MS = 2_000;
export const HR_WANTED_DEFAULT_MIN = 10;         // hr_request window from preflight / setup claim
export const BATTERY_LOW_PCT = 20;
export const HR_STORE_RR = false;             // parse RR, store only if enabled (HRV out of V1 scope)

export type SupportResult =
  | { ok: true }
  | { ok: false; reason:
      | 'no_api'            // Safari, any iOS browser, Firefox, Silk
      | 'insecure_context'  // not HTTPS
      | 'policy_blocked'    // cross-origin iframe (Lovable editor preview): getAvailability()===false or SecurityError
      | 'in_app_browser'    // Android WebView (Gmail/Slack link previews)
      | 'adapter_off' };

// Relay-local state, decided only by the /relay page, published in hr_live.relay_mode.
// 'unsupported' pages never call hr_ingest.
export type RelayMode =
  | 'unsupported' | 'idle' | 'choosing' | 'connecting' | 'waiting_first'
  | 'live' | 'no_contact' | 'reconnecting' | 'sensor_lost' | 'hidden'
  | 'standby'      // BLE disconnected because HR is not wanted; BluetoothDevice kept for gesture-free reconnect
  | 'superseded' | 'demo';

export interface SensorInfo {
  sensorKind: SensorKind;
  name: string;            // advertised name, e.g. 'Polar H10 1A2B3C4D'
  serial: string | null;   // '1A2B3C4D' parsed from /^Polar H10 ([0-9A-F]{8})$/i, else null
  batteryPct: number | null;
}

export interface ParsedHr { bpm: number | null; contact: boolean | null; rrMs: number[] }

export interface HrSample {
  seq: number;             // monotonic per streamId (resets each page load)
  measuredAt: string;      // ISO; relay clock + serverOffset at notification receipt
  bpm: number | null;      // null when contact === false or raw outside 25..250
  contact: boolean | null; // null = sensor does not report contact
  rrMs?: number[];
}

/** Hears the strap. V1: WebBleHrsDriver, a module-level singleton inside /relay
 *  so the BluetoothDevice survives re-renders. A future firetv_native driver lives in Kotlin. */
export interface HealthSensorDriver {
  readonly kind: SourceKind;
  checkSupport(): Promise<SupportResult>;
  /** MUST be called synchronously inside a click/touchend handler (transient activation). Opens Chrome's chooser. */
  pick(): Promise<SensorInfo>;
  /** Re-runs gatt.connect -> getPrimaryService -> getCharacteristic -> startNotifications on the SAME
   *  BluetoothDevice. No gesture needed while the page lives. Handles are re-fetched every time. */
  reconnect(): Promise<SensorInfo>;
  disconnect(): Promise<void>;    // keeps the BluetoothDevice object (used for standby)
  /** Best effort: calls device.forget() when present. It has shipped un-flagged since Chrome 101; feature-detect it.
   *  The hr_sensors tombstone is set server-side by hr_forget_sensor (S14). */
  forget(): Promise<void>;
  readBattery(): Promise<number | null>;
  onSample(cb: (p: ParsedHr & { receivedLocalMs: number }) => void): () => void;
  onLinkChange(cb: (up: boolean) => void): () => void; // gattserverdisconnected / reconnected
}

/** Talks to Supabase. Same for every source kind. No lease machine in V1. */
export interface HealthPublisher {
  readonly sourceId: string;     // hr_sources.id
  readonly streamId: string;     // uuid per page load (and re-minted on any auth change)
  readonly userId: string;       // user the outbox belongs to
  readonly serverOffsetMs: number;
  ingest(req: Omit<HrIngestRequest, 'p_source_id' | 'p_stream_id' | 'p_expected_user_id'>): Promise<HrIngestResponse>;
}

// requestDevice options: service filter keeps non-Polar HRS straps working
export const H10_REQUEST: RequestDeviceOptions = {
  filters: [{ services: ['heart_rate'] }],
  optionalServices: ['battery_service'],
};
```

**0x2A37 parser.** The flags byte decides the layout, so the parser never assumes fixed offsets.

```ts
// src/lib/hr/parse.ts
// Byte 0 flags: bit0 HR format (0=uint8, 1=uint16 LE); bit1 contact detected; bit2 contact supported;
// bit3 Energy Expended present (uint16, skipped); bit4 RR present (uint16 LE, 1/1024 s, repeated to end).
export function parseHeartRateMeasurement(v: DataView): ParsedHr {
  const flags = v.getUint8(0);
  let o = 1;
  const u16 = (flags & 0x01) !== 0;
  const bpmRaw = u16 ? v.getUint16(o, true) : v.getUint8(o);
  o += u16 ? 2 : 1;
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : null;
  if (flags & 0x08) o += 2;                         // energy expended: ignored
  const rrMs: number[] = [];
  if (flags & 0x10) {
    for (; o + 1 < v.byteLength; o += 2) rrMs.push(Math.round((v.getUint16(o, true) * 1000) / 1024));
  }
  const bpm = contact === false || bpmRaw < 25 || bpmRaw > 250 ? null : bpmRaw;
  return { bpm, contact, rrMs };
}
```

Required unit fixtures:
- uint8 with contact detected
- uint8 with contact supported but not detected (bpm must become null)
- uint16 format
- Energy Expended present followed by RR
- several RR values in one packet
- RR flag set with zero RR bytes
- contact not supported (contact must be `null`)

**Wire types** (RPC payloads):

```ts
// src/lib/hr/ingest.ts
export interface HrIngestRequest {
  p_source_id: string;          // hr_sources.id (localStorage 'dillan.relayId', try/catch; fallback per-load uuid)
  p_stream_id: string;          // uuid per page load; fence token + dedupe namespace
  p_expected_user_id: string;   // user the queued samples belong to; must equal auth.uid()
  p_source_kind: SourceKind;
  p_mode: RelayMode;
  p_connected_at: string | null; // relay's server-corrected time of the current startNotifications; clamped like measured_at
  p_sensor: { name: string; serial: string | null; battery_pct: number | null } | null;
  p_claim: boolean;             // true only on the first call after a user tap + fresh pick (Connect strap / Use this device / Use this strap)
  p_samples: Array<{ seq: number; measured_at: string; bpm: number | null; contact: boolean | null; rr_ms: number[] | null }>; // 0..30
}

export interface HrIngestResponse {
  server_now: string;
  accepted: number;
  duplicates: number;
  rejected: Array<{ seq: number; reason: 'too_old' | 'future' | 'out_of_range' | 'outside_session' | 'demo_mismatch' }>;
  superseded: boolean;          // another relay (different source) holds the user; stop publishing
  holder_name: string | null;   // e.g. 'Gym tablet'
  rate_limited: boolean;
  revoked: boolean;             // this source was removed in S14
  identity_mismatch: boolean;   // p_expected_user_id != auth.uid(); relay discards its outbox
  stop_requested: boolean;      // HR not wanted (no active session, no preflight/setup window): go to standby
  sensor_forgotten: boolean;    // hr_sensors is tombstoned; relay disconnects, calls forget(), goes idle
}

// Viewer side: the Realtime row
export interface HrLiveRow {
  user_id: string;
  rev: number;                  // incremented on every write
  active_session_id: string | null;
  holder_source_id: string; holder_stream_id: string;
  holder_name: string; source_kind: SourceKind;
  relay_mode: RelayMode;
  sensor_name: string | null; sensor_serial: string | null; battery_pct: number | null;
  bpm: number | null; contact: boolean | null; measured_at: string | null;
  connected_at: string | null; last_seen_at: string; is_demo: boolean; updated_at: string;
}

export type HealthStateId =
  | 'H0_not_set_up' | 'H1_relay_idle' | 'H2_waiting' | 'H3_live' | 'H4_delayed'
  | 'H5_no_recent' | 'H6_relay_offline' | 'H7a_strap_lost' | 'H7b_no_contact'
  | 'H8_reconnecting' | 'H9_paused' | 'H10_off';

export interface HealthState {
  id: HealthStateId; paused: boolean;            // H9 is an overlay flag
  variant: 'default' | 'hidden' | 'standby' | 'takeover';
  label: string; detail: string;
  bpm: number | null; showBpm: boolean; deemphasize: boolean;
  ageMs: number | null; countsTowardZone: boolean;
  via: string | null; batteryLow: boolean; demo: boolean;
}

export declare function deriveHealthState(a: {
  live: HrLiveRow | null;
  sensor: { paired: boolean } | null;           // hr_sensors row present and forgotten_at is null
  serverNowMs: number;
  session: { status: 'active' | 'paused' | 'none'; liveData: boolean; isDemo: boolean };
  zonesConfirmed: boolean;
}): HealthState;
```

Server clock offset:
- **Relay:** on page load, before **Connect strap** is enabled, call `rpc('server_time')` three times and take the median. After that, refine the offset from each `hr_ingest` response: `offset = server_now − (t_send + t_recv)/2`, smoothed as the median of the last 5. Any sample queued before an offset was known is re-stamped with the first known offset before it is sent.
- **Viewers:** the same calculation from `rpc('server_time')` on load and every 60 s.

---

## 4. Health state machine

### 4.1 Who decides what

| Owner | Decides |
|---|---|
| Relay page | Sensor facts: link, contact, battery, and `RelayMode` |
| Backend | `received_at`, `last_seen_at`, the measured_at clamp, which relay is active, whether HR is wanted (`stop_requested`), session attribution, final zone totals |
| Each viewer | The display H-state, from timestamps and server-corrected time, recomputed every 1 s and on every Realtime event |
| Session state machine (existing) | Start, pause and end. It is **not** gated on HR. The Watch start-acknowledgement gate is removed. End calls `hr_request(0)`. |

`relay_offline` needs no cron. It is derived from `last_seen_at`.

### 4.2 Relay page states (`RelayMode`)

Every mode change triggers an immediate `hr_ingest` call, so the server sees every transition, including `waiting_first`.

| Mode | Entered when | Leaves when |
|---|---|---|
| `unsupported` | `checkSupport()` fails. Never calls `hr_ingest`. | Terminal in this browser |
| `idle` | Page load or reload, Disconnect, Forget, `sensor_forgotten`. Heartbeats every 5 s, dropping to 30 s after 10 min, when the wake lock is also released. If `navigator.bluetooth.getDevices` exists and returns the saved strap, a silent connect is tried, but the design never depends on it. | User taps **Connect strap** |
| `choosing` | Chrome chooser open | Device picked, so `connecting`. Cancel (NotFoundError) returns to `idle` with no error shown. |
| `connecting` | GATT connect, then service, characteristic, startNotifications, battery read. GATT ops are queued serially. On firmware 4.x the OS may show a pairing prompt that must be accepted. | First notify, so `waiting_first`. After 20 s it times out to `idle` with the pairing troubleshooting copy. |
| `waiting_first` | Notifications started, no sample yet. `p_connected_at` is set. | First sample arrives |
| `live` | Sample with `contact !== false` and `bpm != null` | Sample with contact false, link loss, or `stop_requested` |
| `no_contact` | Sample with `contact === false`. These samples are still sent with `bpm: null`, as explicit evidence. | Contact back, link loss, or `stop_requested` |
| `reconnecting` | `gattserverdisconnected`, or more than 10 s with no notification while connected. Backoff 1, 2, 4, 8, 15 s, then every 15 s, redoing the full chain each time. | Connected, so `waiting_first`. After 2 min, `sensor_lost`. `stop_requested` gives `standby`. |
| `sensor_lost` | Reconnecting for more than 2 min. Keeps heartbeating. | Tap **Reconnect** (a gesture, and may reopen the chooser) |
| `standby` | `hr_ingest` returned `stop_requested: true` (End, or no session or preflight window). The relay calls `disconnect()` but keeps the `BluetoothDevice`, and stops sending samples. Heartbeats continue, backing off as in `idle`. | The relay's own `hr_sensors` subscription (or a heartbeat response) shows HR is wanted again, so it calls `reconnect()` without a gesture and goes to `waiting_first`. If the device object is gone, it goes to `idle`. |
| `hidden` | `visibilitychange` to hidden. Sends one `fetch(keepalive)` heartbeat with this mode and keeps working only if Chrome lets it. On Android, assume relaying stops (risk 2). | Visible again: re-request the wake lock and resume or reconnect |
| `superseded` | `hr_ingest` returned `superseded: true`. Heartbeats with this mode never take the holder implicitly, even from a stale holder. | Tap **Use this device** (claim). After 30 s the page disconnects BLE to free the H10's second slot. |
| `demo` | `/relay?demo=1` (dev toggle) | Stop demo, or a real source claims |

On any Supabase auth change, meaning sign-out or a different user signing in, the relay:
1. discards its outbox, because the brief forbids reassigning queued health events to a new login
2. mints a new `streamId`
3. resets `seq`
4. drops to `idle`

### 4.3 Viewer derivation (first match wins)

Let `age = serverNow − measured_at` and `seen = serverNow − last_seen_at`. Let `offlineMs = RELAY_OFFLINE_IDLE_MS` (75 s) if the last `relay_mode` is `idle` or `standby`, and `RELAY_OFFLINE_MS` (15 s) otherwise.

1. `session.liveData === false` → **H10 Live data off**
2. No `hr_sensors` row, or `forgotten_at` is set → **H0 Not set up**
3. No `hr_live` row, or `seen > offlineMs` → **H6 Relay offline**.
   - The BPM display still follows freshness: de-emphasized while `age ≤ 30 s`, hidden after that.
   - It never counts toward a zone.
   - If the last `relay_mode` was `hidden`, use the background variant of the detail text.
4. `relay_mode ∈ {idle, choosing}` → **H1 Strap not connected**
5. `relay_mode = 'standby'` → **H1 Strap not connected**, standby variant
6. `relay_mode = 'superseded'` → **H6 Relay offline**, takeover variant. This is defensive: a superseded relay should never hold the row.
7. `relay_mode = 'reconnecting'` → **H8 Reconnecting** (last BPM de-emphasized if `age ≤ 30 s`)
8. `relay_mode = 'sensor_lost'` → **H7a Strap disconnected**
9. `relay_mode = 'no_contact'` or `contact === false` → **H7b Check strap contact** (BPM shown as "--")
10. `relay_mode ∈ {connecting, waiting_first}`, or `measured_at` is null, or `measured_at < connected_at − 2 s` → **H2 Waiting**
11. `age ≤ 10 000` → **H3 Live**
12. `age ≤ 30 000` → **H4 Delayed**: BPM de-emphasized, zone unknown, time counted as Unmeasured
13. Otherwise → **H5 No recent reading**: no BPM

`live`, `hidden` and `demo` fall through to the freshness rules (11–13). `demo` adds the DEMO badge. `unsupported` pages never publish.

**H9 Paused** is an overlay while `session.status = 'paused'`. HR still shows if fresh, and nothing counts.

`countsTowardZone` requires all of the following:
- state H3
- `contact !== false`
- session active
- `liveData`
- zones confirmed
- `is_demo === session.isDemo` (demo samples count only in demo sessions, and real samples never count in demo sessions)

The displayed state is effectively min(relay mode, freshness). A relay claiming `live` with an old `measured_at` still shows Delayed or No recent.

### 4.4 Exact UI copy

| State | Label | Detail |
|---|---|---|
| H0 | Not set up | Connect a Polar H10 on an Android phone or a computer to see heart rate here. |
| H1 | Strap not connected | Relay is open on {relay}. Tap Connect strap there. |
| H1 (standby) | Strap resting | {relay} disconnected the strap between workouts. It reconnects when you open a workout. |
| H2 | Waiting for first reading | Strap connected. Waiting for the first beat. Wet the electrodes if this takes long. |
| H3 | Live | Updated {n}s ago · via {relay} |
| H4 | Delayed | Last reading {n}s ago. Counting as unmeasured until it catches up. |
| H5 | No recent reading | Last reading {m:ss} ago. Time is being recorded as unmeasured. |
| H6 | Relay offline | Lost {relay}. Keep the Dillan relay page open with the screen on. |
| H6 (hidden) | Relay offline | The relay page on {relay} went to the background. Bring it back to the front. |
| H6 (takeover) | Relay offline | Another device took over heart rate. Check which relay is open. |
| H7a | Strap disconnected | {relay} can't hear your strap. Check it's on, snug and in range. |
| H7b | Check strap contact | Strap is connected but not touching skin. Wet the electrodes and tighten the strap. |
| H8 | Reconnecting | Trying to reach your strap. Last reading shown below. |
| H9 | Paused | Heart rate still updates, but time in zone is not counting. |
| H10 | Live data off | You chose to continue without live heart rate. |

Badges and extra lines:
- If `is_demo`, an outlined **DEMO** badge sits next to every BPM.
- When battery is at 20% or below, an extra line appears on the relay, S14 and S08 (phone only): "Strap battery {p}%. Replace the CR2025 soon."
- Wherever HR is shown for a workout (S08, S09), the source line names the user: "Heart rate from {relay} for {user}."

### 4.5 Old → new mapping

| Design package (Watch) | New (H10) | Change |
|---|---|---|
| H0 Not connected: "Set up the Dillan iPhone app…" | H0 Not set up | Re-worded |
| H1 Setup required: "Finish Apple Health access…" | H1 Strap not connected (relay idle or standby). Unsupported browser is handled on S14 and /relay. | Redesigned |
| H2 Waiting: "Keep the iPhone app open…" | H2 Waiting: "Wet the electrodes…" | Re-worded |
| H3 Live / H4 Delayed / H5 No recent | Same | Unchanged |
| H6 Disconnected (phone) | H6 Relay offline (heartbeat missing for more than 15 s, or 75 s for idle/standby relays) | Renamed |
| H7 Disconnected (Watch) | H7a Strap disconnected, plus **new** H7b Check strap contact (contact bit) | Split |
| H8 Reconnecting ("Trying to reach your iPhone") | H8 Reconnecting ("…your strap") | Re-worded |
| H9 Paused / H10 Live data off | Same | Unchanged |
| Watch start-acknowledgement gate | Removed. Ready means H3 at that moment. | Dropped |
| End "requests native session termination" | End calls `hr_request(0)`. The relay gets `stop_requested`, disconnects the strap and goes to `standby`. | Replaced (same intent) |
| `CompanionState.mode` | `hr_live.relay_mode` (never trusted alone) | Replaced |
| `User.companion` | `hr_sensors` row + `hr_sources` registry | Replaced |
| `disconnected_watch` (10 s without Watch samples) | `reconnecting` / `sensor_lost` (gattserverdisconnected or more than 10 s without notify) | Replaced |

### 4.6 New acceptance items (add to handoff section 8 as 39–47)

The package's criteria already run to 38, so these continue the numbering.

- **39.** Killing the relay tab shows H6 on the TV within about 16 s. The reading is already Delayed at 10 s, so Unmeasured accounting stays truthful.
- **40.** Taking the strap off shows H7b within about 2 s via the contact bit. When the link actually drops, which depends on the relay OS's supervision timeout (measured in spike test 2), H8 and then H7a follow. Freshness rules make the time Unmeasured from 10 s regardless.
- **41.** An unsupported or blocked browser shows the supported-browser message, and never a dead **Connect strap** button.
- **42.** `contact=false` samples are never zone-eligible, in `zoneAccounting.ts`, which the client and `finalize-session-hr` share. A unit test covers this.
- **43.** When HR turns Live during preflight, TV focus does not move. Start becomes enabled and a polite live region announces "Heart rate ready".
- **44.** Every BLE acceptance test runs on the published URL, never inside the Lovable editor iframe.
- **45.** S09 focus order on the TV:
  - Down from All zones focuses the Heart rate panel, and Down again focuses Pause.
  - Back with the Heart rate sheet open closes the sheet. Otherwise Back pauses, as in acceptance 22.
- **46.** Within about 2 s of End, the relay disconnects the strap (standby) and `hr_live.bpm` is cleared. No BPM is written to `hr_live` while there is no active session and no preflight or setup window.
- **47.** On a relay sign-out or user switch, queued samples are discarded and never stored under the new user. `hr_live` and `hr_sensors` are cleared from the TV cache, and the channel is removed before the lock or chooser frame paints (with acceptance 9).

---

## 5. Backend contract

### 5.1 Tables

```sql
-- Registry of relays (source-agnostic; future firetv_native / watch_companion plug in here)
create table public.hr_sources (
  id uuid primary key,                       -- generated by the client
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('web_ble','firetv_native','watch_companion','demo')),
  display_name text not null,                -- default from UA: 'Android tablet', 'Edge on Windows'; editable
  platform text,                             -- 'android'|'windows'|'macos'|'chromeos'|'other'
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz                     -- 'Remove' in S14; revoked sources are refused
);

-- The user's saved strap (replaces User.companion). Also carries the HR demand window.
create table public.hr_sensors (
  user_id uuid primary key references auth.users on delete cascade,
  sensor_kind text not null default 'polar_h10',
  sensor_name text not null,                 -- 'Polar H10 1A2B3C4D'
  sensor_serial text,                        -- '1A2B3C4D'; NOT unique: household members may list the same physical strap
  paired_at timestamptz not null default now(),
  forgotten_at timestamptz,                  -- Forget strap tombstone; row is treated as absent while set
  wanted_until timestamptz,                  -- HR demand window (preflight / setup claim); see hr_request
  last_source_id uuid references public.hr_sources,
  last_battery_pct smallint,
  battery_read_at timestamptz
);

-- Exactly one row per user
create table public.hr_live (
  user_id uuid primary key references auth.users on delete cascade,
  rev bigint not null default 0,             -- state revision, +1 on every write
  active_session_id uuid references public.workout_sessions on delete set null,
  holder_source_id uuid not null references public.hr_sources,
  holder_stream_id uuid not null,            -- fence token: only this stream may write
  holder_name text not null,
  source_kind text not null,
  relay_mode text not null,
  sensor_name text, sensor_serial text, battery_pct smallint,
  bpm smallint, contact boolean, measured_at timestamptz,
  connected_at timestamptz,
  last_seen_at timestamptz not null default now(),
  is_demo boolean not null default false,
  updated_at timestamptz not null default now()
);
alter publication supabase_realtime add table public.hr_live;
alter publication supabase_realtime add table public.hr_sensors;   -- so open viewers leave H0 when setup completes / Forget happens

create table public.hr_samples (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  session_id uuid not null references public.workout_sessions on delete cascade,
  source_id uuid not null references public.hr_sources,
  stream_id uuid not null,
  seq int not null,                          -- (stream_id, seq) is the brief's event ID
  schema_version smallint not null default 1,
  metric text not null default 'heart_rate',
  unit text not null default 'bpm',
  measured_at timestamptz not null,
  received_at timestamptz not null default now(),
  bpm smallint check (bpm is null or bpm between 25 and 250),  -- NULLABLE: contact=false rows are evidence
  contact boolean,
  rr_ms smallint[],                          -- written only when HR_STORE_RR is on (default off)
  unique (stream_id, seq)                    -- dedupe on retry/flush
);
create index on public.hr_samples (session_id, measured_at);

-- Demo data is stored separately (brief: "separate storage"). Only demo sessions reference it.
create table public.hr_demo_samples (like public.hr_samples including all);
alter table public.hr_demo_samples
  add foreign key (user_id) references auth.users on delete cascade,
  add foreign key (session_id) references public.workout_sessions on delete cascade,
  add foreign key (source_id) references public.hr_sources;

alter table public.workout_sessions
  add column live_data boolean not null default true,
  add column zone_snapshot jsonb,             -- {b1,b2,b3,b4} copied at Start
  add column zone_algo_version smallint not null default 1,
  add column hr_zone_ms jsonb,                -- {z1..z5}
  add column hr_measured_ms bigint,
  add column hr_unmeasured_ms bigint,
  add column hr_coverage_pct smallint,
  add column hr_sources_used text[],          -- display names, for 'via …' on the summary
  add column hr_finalize_dirty boolean not null default false,  -- late samples arrived within grace
  add column is_demo boolean not null default false;            -- set ONLY by the dedicated demo start path

-- Pause intervals: finalize must rebuild pause history to compute active_ms.
-- Use the package's existing pause-event storage if it has one (name it here when porting).
-- Only if none exists:
create table public.workout_session_pauses (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.workout_sessions on delete cascade,
  paused_at timestamptz not null,
  resumed_at timestamptz
);
```

### 5.2 RLS and ownership

- Every HR table allows `select` only where `user_id = auth.uid()`. Session-keyed tables check ownership through `workout_sessions.user_id`.
- `hr_live`, `hr_samples` and `hr_demo_samples` cannot be inserted, updated or deleted directly by clients. Writes go only through the SECURITY DEFINER RPCs.
- `hr_sensors` is select-only for clients. It is written only by `hr_ingest` (create and update), `hr_request` (demand window) and `hr_forget_sensor` (tombstone). This prevents a connected relay from silently undoing Forget.
- `hr_sources`: the owner may update only `display_name` and `revoked_at` on their own rows, enforced with column grants or a tiny RPC. Rows are created by `hr_ingest` (upsert on first call). An id that belongs to another user is refused.
- Realtime subscriptions are authorized by the same select policies. Clients remove the channel on lock, Switch user and revocation (section 5.5).
- Relay auth in V1 is a normal Supabase session, signed in on the relay device as the user who is wearing the strap. There are no device tokens in V1. Future non-browser sources get `hr_source_tokens(source_id, token_hash)` and a token-auth edge function that calls the same ingest logic.
- Integrity rests on authenticated writes only. Do not treat the BLE link as private: the standard Heart Rate Service has no encryption requirement, and the H10 accepts a second connection. Firmware 4.x secure pairing may encrypt a bonded link, but Dillan does not rely on that.

**Household use (one strap, one relay):**
- The relay always shows **Relaying for {name}** in its header. S08 shows "Heart rate from {relay} for {user}". This gives a wearer a chance to notice that the relay is signed in as someone else.
- To switch wearer, sign the relay out and sign in as the other user. Each user has their own `hr_sensors` row, and several rows may hold the same serial, so one physical strap can be shared.
- The outbox is tagged with its `user_id` and discarded on any auth change. `hr_ingest` also refuses a call whose `p_expected_user_id` differs from `auth.uid()` (`identity_mismatch`).
- Dillan cannot detect a different person wearing the strap while the relay is signed in as the owner. The visible "for {user}" line is the only mitigation (risk 17).

### 5.3 Ingestion RPC: `public.hr_ingest(...) returns jsonb`

The function is SECURITY DEFINER with `search_path = public`. Steps:

1. `uid := auth.uid()`. If null, raise. The relay shows "Signed out. Sign in to keep relaying." and keeps BLE connected but sends nothing. If `p_expected_user_id <> uid`, return `{identity_mismatch: true}` and write nothing.
2. **Serialize per user:** `perform pg_advisory_xact_lock(hashtext(uid::text))`. `SELECT … FOR UPDATE` cannot lock a row that does not exist yet, so two concurrent first calls (a double tap or a retry) would otherwise both insert `hr_live` and one would fail with a primary-key error.
3. **Source:** upsert `hr_sources(p_source_id, uid, kind, …)` and set `last_seen_at = now()`. If the source is revoked, return `{revoked: true}`.
4. **Rate and size:** more than 30 samples is rejected. More than 3 calls per second from a source returns `{rate_limited: true}`.
5. **One active relay** (read `hr_live` under the advisory lock). "Stale" means the holder's `last_seen_at` is older than its offline threshold: 15 s, or 75 s if its mode is `idle` or `standby`.

   | Situation | Result |
   |---|---|
   | No row | Accept and become holder |
   | Same `p_stream_id` | Accept |
   | Same `p_source_id`, different stream (tab reload, PWA relaunch) | Take over silently. One source runs one page at a time. |
   | Different source, holder stale, `p_mode <> 'superseded'` | Take over (stale holder) |
   | Different source, holder fresh, `p_claim = true` | Take over (explicit user tap) |
   | Different source, holder fresh, `p_claim = false` | Return `{superseded: true, holder_name}` and write nothing |
   | Demo source vs a fresh real holder | Always refused |
   | Real source vs a demo holder | Always takes over |

   This is a fence, not a lease. There is no standby relay and no auto-failover, which keeps the H10's second BLE slot free.
6. **Validate each sample:**
   - `measured_at` must fall in [`now() − 150 s`, `now() + 5 s`]. Otherwise the sample is rejected with `too_old` or `future`. The 150 s window covers the relay's 120 s outbox.
   - `bpm` outside 25..250, or `contact = false`, makes `bpm` null.
   - `p_connected_at` is clamped to the same window.
7. **Is HR wanted?** `wanted := (an attributable active session with live_data exists) or hr_sensors.wanted_until > now()`. A call with `p_claim = true` sets `wanted_until = greatest(wanted_until, now() + 10 min)`. If not wanted, the response carries `stop_requested: true`. Samples are not stored, and `bpm`/`contact` are not written to `hr_live`.
8. **Session attribution by `measured_at`:** a sample belongs to the user's single most recent `workout_sessions` row (`order by started_at desc limit 1`) that meets all of these:
   - `started_at ≤ measured_at`
   - `ended_at` is null or `measured_at < ended_at`
   - `started_at > measured_at − 6 h`, so a session that was never ended stops attracting samples
   - `live_data` is true
   - `is_demo` equals `(p_source_kind = 'demo')`

   Then:
   - The Start path ends any session still open for that user before creating a new one. Use the package behaviour if it exists, otherwise add it.
   - Samples in no session update `hr_live` only and are not stored (`outside_session`). A kind mismatch, meaning demo vs real, is reported as `demo_mismatch`.
   - Real samples go to `hr_samples`, and demo samples go to `hr_demo_samples`. Demo samples are never attached to a real session, and nothing here sets `is_demo` on a session.
   - Inserts use `ON CONFLICT (stream_id, seq) DO NOTHING`, and conflicts are counted as `duplicates`.
   - If a session ended less than 2 min ago and received late samples, set `hr_finalize_dirty = true` (section 5.4).
9. **Upsert `hr_live`:**
   - `bpm`, `contact` and `measured_at` take the latest accepted sample only when its `measured_at` is greater than the stored `measured_at` (or that is null). Outbox flushes, which arrive oldest first, therefore never move the TV backwards.
   - When the mode is `idle`, `standby` or `sensor_lost`, or HR is not wanted, `bpm` and `contact` are set to null.
   - Always: `relay_mode`, `sensor_*`, `battery_pct`, `last_seen_at = now()`, `active_session_id`, `is_demo`, `rev = rev + 1`.
   - `connected_at = p_connected_at` (clamped) whenever it changes.
10. **Sensor row:**
    - If `p_sensor` is present and there is no `hr_sensors` row, insert one.
    - If the row is tombstoned (`forgotten_at` set), update it and clear `forgotten_at` only when `p_claim = true`, which follows a fresh user pick. Otherwise return `sensor_forgotten: true`.
    - If the row exists and is active, update `last_source_id` and the battery fields.
    - The relay itself handles the different-strap confirmation before it sends.
11. Return `{server_now, accepted, duplicates, rejected, superseded: false, holder_name, rate_limited: false, revoked: false, identity_mismatch: false, stop_requested, sensor_forgotten}`.

**Batching and rate:**
- Normal operation is 1 call per second carrying 1–2 samples, plus an immediate call on every mode change.
- With no samples to send (idle, standby, reconnecting), the relay sends a heartbeat with `p_samples: []` every 5 s, dropping to every 30 s after 10 min in `idle` or `standby`.
- After a network outage the outbox flushes 30 samples per call until it is empty.

**Load:**
- **Training:** about 1 `hr_live` UPDATE per second per user, which is about 3,600 Realtime messages per subscribed viewer per hour, and about 3,600 `hr_samples` rows per training hour.
- **Idle relay left open:** at 5 s this would be about 17,000 messages per viewer per day. With the 30 s back-off it is about 2,900 per viewer per day. Supabase counts every `postgres_changes` delivery per subscriber toward plan quotas.
- Both are small at one-household scale, but the back-off is required.

### 5.4 Other RPCs and the finalize function

- `public.server_time() returns timestamptz` (stable, `select now()`): the clock offset for viewers and for the relay on load.
- `public.hr_request(p_minutes int default 10) returns void`:
  - It sets `hr_sensors.wanted_until = now() + least(p_minutes, 30) min`.
  - S08 calls it on open and every 2 min while open.
  - The End path calls `hr_request(0)`.
  - S04 Home does **not** call it, so a TV left on Home never keeps the strap streaming.
- `public.hr_forget_sensor() returns void`:
  - It sets `hr_sensors.forgotten_at = now()`, clears `wanted_until`, and nulls `bpm`/`contact` in `hr_live`.
  - The holder relay gets `sensor_forgotten: true` on its next call. It then disconnects, calls `driver.forget()` and goes to `idle`.
- **Edge function `finalize-session-hr` (session id):**
  - It is idempotent. It imports the same `zoneAccounting.ts` the client uses, so there is one zone implementation. It is called from the existing End-session path.
  - It re-runs when `hr_finalize_dirty` is true. `hr_ingest` triggers this through `pg_net` (`net.http_post`) when available. Otherwise the summary screen calls it while the flag is set and the grace window is open.
  - It reads samples (`hr_samples`, or `hr_demo_samples` for demo sessions) ordered by `measured_at`. Each eligible sample (`contact is not false and bpm is not null`) is held forward to the next sample, at most 10 s.
  - Paused intervals come from the pause-interval store (section 5.1) and are excluded. Zones come from `zone_snapshot`.
  - It writes `hr_zone_ms`, `hr_measured_ms`, `hr_unmeasured_ms`, `hr_coverage_pct = measured/active` and `hr_sources_used`, and clears `hr_finalize_dirty`.
  - Invariant: `sum(zone_ms) + unmeasured_ms = active_ms`. It is tested with shared fixtures that run against both the client import and the edge function.
  - Samples arriving after the grace window are ignored and stay Unmeasured, which is truthful.

### 5.5 Realtime channel

```ts
supabase.channel(`hr-live:${uid}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_live',    filter: `user_id=eq.${uid}` }, p => onRow('live', p.new))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_sensors', filter: `user_id=eq.${uid}` }, p => onRow('sensor', p.new))
  .subscribe(status => { if (status === 'SUBSCRIBED') reselectHrLiveAndSensor(); });
// onRow is the single adapter; a future broadcast transport feeds the same function.
// Rows with rev <= the cached rev are ignored.
```

- **Deliberate brief deviation:** the brief specifies a session-scoped channel. This channel is per user on purpose, because:
  - HR must be visible before a session exists (S08 preflight).
  - The relay knows nothing about sessions.

  The brief's message requirements are still met, because every `hr_live` row carries `rev` (state revision), `measured_at` (sample timestamp) and `active_session_id`. Session-scoped results such as finalized totals arrive through the existing `workout_sessions` subscription.
- Viewers re-select `hr_live`, `hr_sensors` and `server_time()` on every (re)subscribe and on `visibilitychange`, so a TV waking from sleep never shows stale data as Live.
- **Teardown:** `lockDevice`, Switch user and source revocation call `supabase.removeChannel()` on the `hr-live` channel and clear the cached `HrLiveRow` and sensor row **before** the blank frame paints (acceptance 9 and 47).
- There is no client Broadcast, because writes must pass through the authoritative RPC.
- **Fallback if the spike shows `postgres_changes` p95 above 5 s:** `hr_ingest` calls `realtime.send(payload, 'hr', 'hr-live:' || uid, true)`. That is a Broadcast, not a `postgres_changes` event, so **clients do change**:
  - They subscribe with `.on('broadcast', { event: 'hr' }, …)` on a channel created with `config: { private: true }`.
  - The project needs an RLS policy on `realtime.messages` that limits topic `hr-live:<uid>` to that user.
  - The `onRow` adapter keeps the rest of the client unchanged.

### 5.6 Heartbeat and offline

- The relay sends a heartbeat every 5 s even when it has no samples. After 10 min in `idle` or `standby` it sends one every 30 s and releases the wake lock.
- Viewers derive H6 when `last_seen_at` is more than 15 s old, or 75 s when the last mode was `idle` or `standby`. No pg_cron job is needed.

### 5.7 Retention

The brief governs: V1 keeps the samples needed to reconstruct session history until the user deletes that history or the account, and supports recompute after backfill.
- Default, per the brief: keep BPM samples until the session is deleted (cascade). RR is not stored (`HR_STORE_RR = false`), because it is not needed to reconstruct zone history.
- Deleting `hr_samples` after finalize would be a **deviation from the brief**. It is offered only if the owner explicitly approves it (Q8). It would also remove the ability to recompute.

---

## 6. Screen-by-screen changes

Shared rules for all screens:
- One shared `deriveHealthState` supplies the label and detail on both phone and TV.
- A "via {relay}" caption appears wherever the source is named.
- The DEMO badge appears whenever `is_demo`.
- HR state changes **never** move TV focus and never open modals. A non-focusable toast "Heart rate: {label}" shows top-right for 4 s.

TV keys:
- **Source of the table:** it comes from Amazon's docs for web apps run through Web App Tester or packaged as apps ([Amazon: supporting controllers in web apps](https://developer.amazon.com/docs/fire-tv/supporting-controllers-in-web-apps.html)). Amazon documents nothing for Silk, so every value is **unverified in Silk**. Spike test 6 logs every remote key.
  - **Arrows:** keyCodes 37–40
  - **Select:** 13
  - **Play/Pause:** 179
  - **Rewind:** 227
  - **Fast-forward:** 228
- **Back:** by default Back may navigate history, or go to the home screen, without ever reaching the page as a key event.
  - The **primary** mechanism is a history guard. On mount the page pushes a guard state, and `popstate` is treated as Back, after which the guard is re-pushed.
  - A `keydown` with keyCode 4, or `event.key` 'GoBack', 'BrowserBack' or 'Escape', is the fallback.
  - If Silk exits to Home regardless, record that in the spike. It then becomes a reason to escalate to the shell.

### S04 Home, "Live data" card

The card and chip structure stay. The eyebrow becomes **Heart-rate strap**.

| Condition | Chip | Text | Phone action |
|---|---|---|---|
| No `hr_sensors` row, or forgotten | Not set up | Connect a Polar H10 to show heart rate during workouts. | **Set up live data** → S14 |
| Relay live | Live | Polar H10 {serial} via {relay} · {battery}% | **Live data settings** |
| Relay in standby | Ready | Strap rests between workouts. It reconnects on {relay} when you open a workout. | **Live data settings** |
| Set up, relay idle/offline | Relay offline | Strap set up. Open the Dillan relay on your Android phone or computer before you train. | **Open relay on this device** (supported browsers only), else **Live data settings** |
| Battery ≤ 20 | (extra line) | Strap battery low ({p}%). It takes a CR2025. | n/a |

TV version:
- Same chips. Fallback line: "Finish setup on a phone or computer: Profile → Live data."
- When the state is H1 (not standby) or H6: "Open {host}/relay on {last relay name} and tap Connect strap." A 160 px QR code to `https://{host}/relay` sits on the right.
- The card is focusable. Enter shows the QR full screen and Back closes it.

### S08 Preflight (phone and TV)

On open, and every 2 min while open, S08 calls `hr_request(10)`. A relay in standby then reconnects the strap without a tap.

**Layout:**
- The eyebrow changes from "Apple Watch" to **Heart-rate strap**.
- Chip:
  - **Live · ready**: H3 with contact true
  - **Preparing**: H1 (including standby), H2, H7b, H8
  - **Not configured**: H0
  - **Unavailable**: H5, H6, H7a
- Body: "Reading {bpm} bpm, {n}s ago · Heart rate from {relay} for {user}", or the H-state detail.
- Phone only: "Strap battery {p}%." when at 20% or below.
- When not ready, a fix line: "Open {host}/relay on your Android phone or computer and tap Connect strap." The TV also shows the QR.

**Buttons:**
1. **Start with live data**. Enabled only in H3.
2. **Continue without live data**. Sets `session.live_data = false`, which gives H10.
3. **Show relay QR**. TV only, and only when not ready.
4. **Back**.

The phone adds **Open live data setup**.

**There is no start-acknowledgement wait.**

**TV focus:**
- On open, initial focus is **Start** if H3, otherwise **Continue without live data** (acceptance 18 unchanged).
- If the state later turns H3, focus does **not** move. Start becomes enabled and a polite `aria-live` region announces "Heart rate ready".
- Up and Down move between buttons, and Enter activates.
- Play/Pause equals Start only while Start is enabled.
- Back returns to the routine screen.

### S09 Dashboard (TV right panel, phone compact metrics)

`metricsPanel` is structurally unchanged:
- BPM: de-emphasized in H4, H6-while-fresh and H8; hidden in H5, H6-stale and H7a; shown as "--" in H7b
- status label and detail line
- zone pill ('Zone N · lo–hi' / 'Zone unknown' / 'Set up zones to see zone' / 'Zones unavailable')
- In this zone, Active time
- All-zones bar with Unmeasured

Only the strings change (section 4.4). A 12 px battery glyph appears only at 20% or below. The bar is never interpolated.

TV D-pad:
- Unchanged from the package: Enter or Play/Pause pauses and resumes, Right or FF goes to the next set, Left or Rewind to the previous set.
- **Focus order (updates the package's S09 focus table):** Complete set → Skip set (→) ; ↓ All zones ; ↓ **Heart rate** ; ↓ Pause ; End.
- Enter on **Heart rate** opens the **Heart rate** sheet, which shows:
  - the source ("via Gym tablet, for {user}")
  - "Polar H10 1A2B3C4D"
  - battery
  - last reading time
  - the current fix line
  - the relay QR
  - a **Close** button
- **Back:** if the Heart rate sheet or another dialog is open, Back closes it. Otherwise Back **pauses** (opens S10), unchanged from the package and acceptance 22.

### S10 Paused overlay and reconnecting

- The paused overlay is unchanged: frozen Active time, BPM if fresh, and "Time in zone and rest are not counting while paused."
- Reconnecting stays a dashboard H-state (H8), not an overlay.
- New F6 row: "Relay page backgrounded, screen locked or tab closed". The workout is **not** paused. The TV is the session surface, and the HR state goes H4 → H6 → H5 with the time counted as Unmeasured.

### S11 Summary and S13 Session detail

- Structure is unchanged: zone bar and legend with Unmeasured, plus "Unmeasured = no fresh reading, paused, or zones not set. Never guessed."
- New line: **Heart-rate coverage {pct}% · via {relay}**. If the relay changed mid-session: "via Gym tablet, Office laptop".
- `live_data = false`: chip **No HR data** with "No heart-rate data - you continued without live data."
- Live data was on but there are no samples: "No heart-rate data recorded."
- Demo sessions: chip **Demo data**.
- The seed note becomes "Strap battery was dead. No heart-rate data for this one."
- End dialog: "End workout? Heart rate after this point won't count toward this session, and the relay will disconnect the strap."
  - End calls `hr_request(0)`. The relay receives `stop_requested`, disconnects the strap and goes to standby.
  - `hr_live.bpm` is cleared, and nothing more is collected until the next preflight.
- Within 2 min of End, a "Summary is final" note replaces any provisional numbers once finalize re-runs.
- TV: **Done** is autofocused.

### S14 Live data (route `health`; account row renamed "Heart-rate strap & zones")

**Card 1, eyebrow "Heart-rate strap".** Body: "Dillan reads a Polar H10 chest strap through a relay page on an Android phone or a computer. The TV and other screens only show what the relay sends."

| Browser and state | Content |
|---|---|
| Supported, no strap yet | Steps: 1. "Wet the electrodes and put the strap on." 2. "On Android, allow Chrome's Nearby devices permission (Android 12+), or turn on Location and allow it for Chrome (Android 11 and earlier)." 3. "Open the relay, tap Connect strap and choose 'Polar H10 …' from the list." 4. "During workouts, keep the relay page open with the screen on. A docked phone or tablet works best." Primary: **Open relay on this device**, which navigates to `/relay`. The user taps **Connect strap** there. S14 never calls Bluetooth itself. |
| `no_api` (iPhone, Safari, Firefox) | "This browser can't connect to Bluetooth sensors. That's fine: start the relay on Chrome on an Android phone or tablet, or Chrome or Edge on a computer, and this screen will show it." QR code, `{host}/relay`, **Copy link**. No Connect button is rendered. |
| `policy_blocked` | "Bluetooth is blocked in this preview. Open the published site in its own tab." |
| `in_app_browser` | "Open this page in Chrome, not inside another app." |
| Paired | Rows: Strap "Polar H10 {serial}" · Battery "{p}% (read {when})" · Relaying now "{relay}, for {user}" with the H chip · Last reading "{bpm} bpm, {n}s ago". Buttons: **Open relay** (capable browser) and **Forget strap**. Forget confirms "Forget Polar H10 {serial}? The relay will disconnect it, and you'll pick it again next time." and then calls `hr_forget_sensor()`. |

- **Relay devices** list: name, kind, last seen, and **Remove** (sets `revoked_at`).
- Troubleshooting disclosure, "Strap not showing up?":
  - "Wet the electrodes and wear the strap - it sleeps when off skin."
  - "On Android, check Chrome has the Nearby devices permission (Android 12+), or that Location is on and allowed for Chrome (Android 11 and earlier)."
  - "Close other apps using the strap (Polar Beat, Zwift). The H10 allows two connections."
  - "Update the strap in Polar Flow."
  - "If it still fails, remove 'Polar H10' from this device's Bluetooth settings and try again."
- Dev only: a **Demo heart rate** toggle that opens `/relay?demo=1`, labelled DEMO, plus a **Start demo workout** path, which is the only way to create an `is_demo` session.

**Card 2, Zones:** editor, validation and confirm are unchanged. Footnote: "These are Dillan's zones. Set them yourself; nothing is estimated."

**TV version of S14:** read-only status, relay list and QR. Up and Down scroll. No destructive actions on the TV.

### S16 Relay (NEW, route `/relay`, phone or computer only)

On the TV, `/relay` renders only a QR handoff.

**Layout:**
- Full screen, dark, high contrast, a single column built for a docked device. It is the PWA `start_url` candidate.
- Header: **Dillan relay**, a prominent **Relaying for {name}** line, and an editable chip "This device: Android tablet ✎".
- Centre: a status ring with BPM at 96 px and the mode label below it.
- Sub-line: "Polar H10 {serial} · Battery {p}% · Last sent {n}s ago". On network error: "Offline - holding {k}s of readings".
- Persistent footer banner: "Keep this page open with the screen on during your workout. Plug the device in."
  - The wake-lock status reads "Screen will stay on" or "Screen may sleep - keep it plugged in and open".
  - In standby, after 10 min, it reads "Resting - screen may sleep".
- Android hint: "Add to Home screen for a full-screen relay."
- `beforeunload` while connected: "Leaving stops heart rate on the TV."
- No workout controls appear on the relay.

| Mode | Label | Buttons |
|---|---|---|
| unsupported | This browser can't connect to Bluetooth sensors. Open {host}/relay in Chrome on Android, or Chrome or Edge on a computer. For iPhone UAs: "iPhones can't relay heart rate from a web page." | none |
| idle | Strap not connected (with the setup steps, including the Android permission step) | **Connect strap** (primary, 64 px tall) |
| connecting | Connecting to Polar H10 {serial}… Accept any pairing prompt. | **Cancel** |
| waiting_first | Waiting for first beat | **Disconnect** |
| live | Sending to Dillan | **Disconnect** (secondary) |
| no_contact | Not touching skin. Snug it up and wet the electrodes. | **Disconnect** |
| reconnecting | Reconnecting… (attempt {n}) | **Reconnect now** |
| sensor_lost | Strap lost. Make sure it's on and nearby, then tap Reconnect. | **Reconnect**, **Connect strap** |
| standby | Resting between workouts. The strap reconnects when you open a workout. | **Connect now** |
| superseded | Another device is relaying now ({holder}). | **Use this device** (claim). Auto-disconnects after 30 s to free the strap. |
| connect timeout (20 s) | Couldn't finish pairing. Remove "Polar H10" from this device's Bluetooth settings, update the strap in Polar Flow, and try again. | **Connect strap** |
| empty chooser / cancel | No strap found? Wet the electrodes and wear it. On Android, allow Chrome's Nearby devices permission, or turn on Location on older Android. Then tap Connect strap again. If it still doesn't appear, check the battery. | **Connect strap** |
| signed out | Signed out. Sign in to keep relaying. (BLE stays connected; queued readings are discarded) | **Sign in** |
| sensor forgotten | This strap was forgotten in Live data settings. | **Connect strap** |
| revoked | This device was removed from your relays. | **Add it again**. This mints a new source id, replaces localStorage `dillan.relayId`, and claims on the next Connect. |

Different strap seen (serial differs from `hr_sensors`): "This is a different strap than last time (was {old}). Check this ID matches the number printed on your strap: Polar H10 {new}." Buttons **Use this strap** and **Pick again**. Nothing is sent until the user confirms.

---

## 7. Owner flows

### First-time setup (about 5 minutes, once, after G0 and the spike pass)

1. In Polar Flow on any phone, update the H10 firmware and make sure the two-connection ("2 Bluetooth devices") setting is on. Polar's 4.0.4 notes describe it as on by default, but check it in Flow. Then close Polar Flow and Polar Beat.
2. On the iPhone or computer, open Profile → Live data (S14) and confirm zones (Card 2). On the iPhone, S14 shows the unsupported message and a QR code to `/relay`.
3. On the relay device, open `https://{host}/relay`. Use the published URL, not the Lovable preview and not an in-app browser.
   - Sign in as the person who will wear the strap, and check the "Relaying for {name}" line.
   - On Android, grant Chrome the Nearby devices permission (Android 12+), or turn on Location and allow it for Chrome (Android 11 and earlier).
   - Rename the device if you like, for example "Gym tablet". Optionally use **Add to Home screen**.
4. Wet the electrodes and put the strap on. Tap **Connect strap**. In Chrome's chooser, pick "Polar H10 {ID}" and check that the ID matches the sensor. Accept the OS pairing prompt. Firmware 4.x requires it.
5. The relay reads the battery, saves the strap, and shows "Waiting for first beat", then "Sending to Dillan". The claim opens a 10-minute HR window.
6. On the Fire TV, open `{host}/tv`. The home card reads "Live · Polar H10 {ID} via Gym tablet". Setup is done. After the 10-minute window the relay goes to standby and the card shows **Ready**.

### Every workout (target: no tap if the relay page survived; otherwise one tap plus one pick)

1. Wet the strap and put it on.
2. Wake the docked relay.
   - If the relay page is still open from last time with its device object, nothing is needed: it reconnects by itself when preflight opens.
   - Otherwise, tap **Connect strap** and pick the strap. This is needed once per page load, because `getDevices()` is still flag-gated.
3. Choose the routine on the phone or computer. The TV preflight requests HR. The relay leaves standby and the preflight shows "Live · ready · Reading 92 bpm, 1s ago · Heart rate from Gym tablet for {user}". Press Select on **Start with live data**.
4. Train. Any drop is labelled on the TV and counted as Unmeasured. The workout never pauses because of HR, and the relay reconnects by itself.
5. End the workout on the TV or phone. The relay disconnects the strap (standby). The summary shows zones, Unmeasured and Coverage %.
6. Take the strap off and rinse it. The relay can stay open in standby, and it backs off heartbeats and releases the wake lock after 10 min. It can also be closed.

**Switching wearer (household):** on the relay, sign out and sign in as the other user. Queued readings from the previous user are discarded. Each user picks the strap once (Connect strap), and the same physical strap may be listed by several users.

**Fallback with no relay available:** choose **Continue without live data** on the TV. The summary shows "No HR data".

---

## 8. Failure modes

| Cause | What the user sees | Recovery |
|---|---|---|
| Strap dry or loose | H7b "Check strap contact" within about 2 s. BPM shows "--" and the time is Unmeasured. | Wet the electrodes and tighten the strap. It returns to H3 on the next good sample. |
| Strap removed mid-workout | H7b within about 2 s. When the link drops, H8 and then H7a after 2 min. Link-drop timing is unverified: it depends on the relay OS's supervision timeout, measured in spike test 2. Freshness makes the time Unmeasured regardless. | Put it back on. Auto-reconnect works while the page and device object are alive; otherwise tap **Reconnect** |
| Strap battery low | Warning at 20% or below on the relay, S14 and S08 (phone) | Replace the CR2025 |
| Strap battery dead | Strap never appears in the chooser. Relay says "check the battery". TV preflight stays not ready. | Replace the battery, or use **Continue without live data** |
| Android Bluetooth permission missing (Nearby devices on 12+; Location on 11 and earlier) | Empty chooser, or Chrome shows a "turn on location" notice | Grant the permission (setup step 3, troubleshooting copy) |
| Relay screen locked or Chrome backgrounded (Android) | TV: H4 at 10 s, H6 "went to the background" at about 15 s, time Unmeasured. Workout not paused. | Bring the relay to the front. The wake lock is re-requested and BLE resumes or reconnects; if the device object was lost, tap **Connect strap**. Assume relaying stops while hidden (risk 2). Spike test 5 measures it. |
| Laptop sleeps | H6 on the TV | On wake the relay tries `reconnect()`. If that needs a gesture, it shows **Reconnect** (to verify in spike). |
| Relay tab closed | H6 until reopened, then H1 "Tap Connect strap there" | Reopen `/relay` and tap **Connect strap** |
| Relay tab reloaded or PWA relaunched on the same device | Brief H6 or H1 at most. The new page takes over silently (same source id). | Tap **Connect strap** if the device object was lost |
| Wi-Fi drop on the relay | Relay: "Offline - holding {k}s of readings". TV: H4 → H6 → H5, Unmeasured. | On reconnect the outbox flushes real samples with their original `measured_at`. `hr_live` only moves forward in time, so the TV does not regress during the flush. Dedupe protects against doubles. Finalize counts them if they arrive within the grace window. The live tick may undercount, and the saved summary is the truth. |
| Wi-Fi drop on the TV | Freshness decays to Delayed or No recent, never stale-as-Live | Realtime re-subscribes, re-selects `hr_live` and `hr_sensors`, and resyncs the session |
| TV sleeps or screensaver | Display goes dark | `/tv` requests a wake lock, falls back to a muted looping video, and resyncs on wake (Silk behaviour to verify in spike). Escalate to the Fire OS shell with FLAG_KEEP_SCREEN_ON if needed. |
| TV runs Vega OS with no usable browser | `/tv` cannot be opened at all | G0 no-go for the TV. Use a cheap Fire OS stick (check the OS line under About before relying on it), cast from a laptop, or run HDMI from a relay laptop. |
| Second relay opened (a different device) | New relay: "Another device is relaying now (Gym tablet)" | **Use this device** claims. The old relay shows superseded and disconnects BLE after 30 s. |
| Other apps hold both H10 slots | Strap missing from the chooser, or connect times out | Close Polar Beat or Zwift (troubleshooting copy) |
| Firmware 4.x secure-pairing prompt not completed via Web Bluetooth | 20 s timeout with the pairing copy | Forget in OS Bluetooth, update in Polar Flow, retry. A firmware downgrade is not an option. If it fails systematically on one OS, try another relay OS (spike test 1 covers all candidates); if all fail, the design is reconsidered (spike gate). |
| Wrong strap (guest's or another brand) | "This is a different strap than last time…" prompt | Confirm or pick again. Non-Polar HRS straps are accepted with serial null. |
| Someone else wears the strap while the relay is signed in as the owner | Their HR is recorded in the owner's session. Dillan cannot detect this. | "Relaying for {name}" and "for {user}" on preflight make it visible. Switch user on the relay. |
| Relay user changed with readings queued | Queue discarded. Nothing is uploaded under the new user. | None needed. That time stays Unmeasured for the old user. |
| Strap forgotten in S14 while the relay is connected | Relay disconnects and shows "This strap was forgotten". Viewers show H0. | Connect strap again (fresh pick) to re-pair |
| Session never ended (TV crash, abandoned tab) | Samples stop attaching to it after 6 h, or immediately when the next session starts | The next Start ends it. The summary shows what was measured. |
| iPhone, Firefox, Safari, Silk, in-app browser, Lovable iframe | Specific unsupported or blocked message plus QR or link; never a dead button | Use Chrome on Android or Chrome/Edge on a computer, on the published URL |
| Relay sign-in expired | "Signed out. Sign in to keep relaying." BLE stays up and queued readings are discarded. | Sign in |
| Relay clock skew | Offset taken from `server_time()` on load, before any sample. Samples outside the clamp are rejected, which shows as Delayed or Unmeasured, never fake Live. | Server offset re-estimated on every response |
| Demo running when the real strap connects | DEMO badge disappears | The real source always takes over from demo. Demo samples never enter real sessions. |

---

## 9. What stays unchanged from the design package

- Backend authoritative. Web and TV are display-only and subscribe via Supabase Realtime.
- Freshness thresholds: `FRESH_LIVE_MS = 10000` and `FRESH_UNAVAILABLE_MS = 30000` (Live, Delayed, No recent, none). The research's "grey out after 5 s" idea is not adopted, because it would contradict acceptance 24–25. Strap removal is caught faster by the contact bit instead.
- Freshness is computed from the reading timestamp against a server-corrected clock. The status flag alone is never trusted.
- The relay heartbeat rule: 5 s heartbeat, offline after more than 15 s, while active. Idle and standby relays back off (section 5.6).
- Zone model: four user-confirmed increasing cutoffs (60–220), Z1–Z5 boundaries and no age formula. Paused time goes nowhere and rest counts as active. Hold-forward is at most 10 s. A zone snapshot and algorithm version are stored per session. Zones + Unmeasured = active duration. Computing by measurement time is now done in one shared module (`zoneAccounting.ts`), run by both the client and the finalize edge function. Fix the prototype's `timeInCurrentZone` discrepancy when porting.
- Unmeasured accounting, the never-fabricate rule and the DEMO badge, with separate demo storage.
- The **Continue without live data** path and H10 Live data off.
- `metricsPanel` structure (S09), the S10 Paused overlay, and the S11/S13 zone bar and legend.
- TV Back on the S09 dashboard pauses (opens S10), as in acceptance 22. Back closes an open HR sheet first.
- The zones editor, validation and confirm flow in S14.
- Acceptance 18 (preflight focus), 22 (TV Back pauses) and 24–28 (Delayed at 11 s, no BPM at 31 s, Set up zones, zone pill text, no "denied" copy).
- H-states H3, H4, H5, H9 and H10 with their copy.
- The brief's 5 s end-to-end delivery target.
- The brief's rule that End stops health-data collection. It is now done with `hr_request(0)` → `stop_requested` → relay standby.

What changes in the package's TV focus table:
- S09 gains a **Heart rate** stop between All zones and Pause (section 6, acceptance 45).

What is removed:
- the Apple Watch, the native iPhone companion repo and the HealthKit entitlement copy
- the Watch start-acknowledgement gate
- the companion-specific publish contract. Q5 is closed by design, because Dillan now writes both ends.

**Explicit deviations from the brief (owner to acknowledge):**
1. The Realtime channel is per user, not per session (section 5.5). The rationale is above, and `rev`, `measured_at` and `active_session_id` are carried in every row.
2. Delete-after-finalize retention applies only if the owner approves it (section 5.7). The default follows the brief.

---

## 10. Owner checklist and hardware spike

### Buy or confirm

1. **Polar H10.** About $77 on sale to $105 list. A spare CR2025 coin cell is optional; the battery is rated at roughly 400 h.
2. **Relay device.** Tell us whether your phone is an iPhone or Android.
   - Android phone with current Chrome: it can be the relay, but a docked spare device is better.
   - iPhone only, and no laptop in the gym: get a cheap Android phone or tablet with current Chrome (used, about $50–120), plus a stand and a charger. Note its Android version, because older versions need Location on for Bluetooth scanning.
   - A Windows 10 1703+ or Mac laptop, or a Chromebook, in Chrome or Edge, also works.
   - Linux mini-PCs need flags and are not recommended.
3. **Fire TV OS (Gate G0, go/no-go).** Go to Settings → My Fire TV → About and report the model **and the OS line**. Rely on the OS line, not the model name, because our model-to-OS mapping is incomplete.
   - **Fire OS (Android-based):** the V1 `/tv` viewer runs in Silk, and the V1.1 TV shell is possible.
   - **Vega OS:** there is no APK sideloading, and we found no documented third-party BLE API, so the V1.1 shell is ruled out. Sources confirm the Fire TV Stick 4K Select launched Vega OS and a newer Fire TV Stick HD runs it ([Digit](https://www.digit.in/news/tvs/amazon-vega-os-launched.html), [AFTVNews](https://www.aftvnews.com/?p=45426)). We have no confirmed list for other models.
   - Check that Silk, or any browser, is installed and opens `{host}/tv`. Silk's availability on Vega is unconfirmed. **If the TV runs Vega and has no usable browser, V1 needs a different display path before building:**
     - a cheap Fire OS stick (verify its OS line)
     - casting a browser tab from a laptop
     - HDMI from the relay laptop
4. **Polar Flow, once:** update the firmware (4.0.4+ brings secure pairing; Polar's [4.0.4 release notes](https://support.polar.com/en/updates/polar-h10-firmware-update-404)), note the firmware version, and make sure the two-connection setting is on.
5. **Retention (Q8).** The default follows the brief: keep BPM samples until the session is deleted, and do not store RR. Delete-after-finalize would be a deviation you would need to approve.

### One-hour hardware spike

Tools:
- a bare HTML test page deployed to the **published** Lovable HTTPS URL
- a throwaway Supabase table `spike_hr(measured_at, received_at, bpm, contact)` with Realtime on

| # | Test (time) | Steps | Record | Pass criteria |
|---|---|---|---|---|
| 1 | Web BT connect (15 min, repeated on **each** candidate relay OS: Android, Windows, macOS as available) | Record the strap firmware version first. On Android, check the Nearby devices permission (12+) or Location (11 and earlier) and record the Android version. With the strap worn and wet, tap a button that calls `requestDevice(H10_REQUEST)`, connects, subscribes to 0x2A37 and reads 0x2A19. | Firmware version, OS and version, chooser name format, the OS pairing prompt and whether it completes, time to first beat, battery % | Strap appears as "Polar H10 XXXXXXXX". Pairing completes. Notifications arrive at about 1 Hz. |
| 2 | Contact and removal (5 min per relay OS) | Loosen or dry the strap, then unclip it | Contact-bit transition, seconds until the link drops on this OS | Contact goes false before the drop. A `gattserverdisconnected` event fires eventually. Record the timing; it sets the copy and the A40 expectations. |
| 3 | Reconnect without a gesture (5 min) | Call `disconnect()` (simulating standby), then `reconnect()` on the same device object. Also re-clip the strap while the page is still open. | Whether `device.gatt.connect()` succeeds silently | Reconnects without a tap |
| 4 | End-to-end to TV (15 min) | Insert into `spike_hr` at 1 Hz. Open a viewer page in Silk on the Fire TV that subscribes and renders `now − measured_at` | p50/p95 latency from measured_at to TV render, gaps over 10 min | p95 ≤ 5 s. No gap over 10 s with the relay screen on. |
| 5 | Relay screen and background (10 min) | Hold a wake lock. Then lock the screen for 2 min, then background Chrome for 2 min (Android), or sleep and wake the laptop. On desktop, note whether Energy Saver is on. | Gaps; whether samples continue; whether reconnect needs a tap | Informational only. It decides the copy and whether a laptop relay is preferred. Screen-on operation must be stable. |
| 6 | Silk checks (10 min, alongside 4) | On the TV page, log `'bluetooth' in navigator` and `'wakeLock' in navigator`. Log `keyCode` and `key` for **every** remote button (arrows, Select, Play/Pause, Rewind, FF, Back). Check whether Back fires `popstate` with a pushed guard state, arrives as a key event, or exits Silk. Check Realtime reconnect after toggling TV Wi-Fi. Leave it idle with no remote presses for the rest of the hour. | Values, Back behaviour, and screensaver behaviour | Realtime recovers after the Wi-Fi toggle. Back is capturable through the history guard or keydown. Note whether the screen slept. |

**Go/no-go:**
- G0 must pass: the TV has a browser that opens `/tv`, or an alternative display path has been chosen.
- Tests 1 and 4 must pass, with the screen on. If test 1 fails on Android, repeat it on a Windows or Mac laptop before declaring no-go.

**Optional V1.1 gate G1 (separate hour, Fire OS only):** enable Developer Options, sideload nRF Connect and subscribe to 0x2A37 for 10 min. Note any location-permission prompt (an `adb pm grant` workaround may be needed), any bond prompt, and reliability at 3–4 m.

Later, after the build, run a 45-minute session with the remote idle, counting gaps (target p95 ≤ 5 s, no gap over 10 s with the strap on).

---

## 11. Open risks and unknowns

| # | Risk or unknown | Confidence | Mitigation |
|---|---|---|---|
| 1 | H10 firmware 4.0.4+ uses BLE secure pairing (confirmed by Polar's release notes). A user report says the firmware cannot be rolled back. **Unknown:** whether Chrome Web Bluetooth completes the OS bonding prompt on Android, Windows and macOS. | Secure pairing: confirmed. Web BT bonding: unverified. | Spike test 1 on every candidate relay OS, recording the firmware version. Laptop fallback. |
| 2 | Relay continuity when hidden. **Desktop:** Chrome freezes background tabs after 5 min only when Energy Saver is on (Chrome 133+), and pages connected via Web Bluetooth are exempt ([Chrome: freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver)). Intensive timer throttling after 5 min hidden is a separate mechanism. **Android:** background pages have been frozen after 5 min since M68, with no documented Bluetooth exemption, and throttling of timers and network starts earlier. | Desktop: documented. Android: assume relaying stops when hidden. | Docked device, wake lock, foreground copy, H6 honesty. Spike test 5. |
| 3 | One **Connect strap** tap plus a chooser pick per page load. `getDevices()` has been behind `chrome://flags/#enable-experimental-web-platform-features` since Chrome 83, with no announced ship date ([implementation status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)). Re-check at spike time. | High that it is flag-gated today | Accepted for V1. Feature-detect `getDevices`. Standby keeps the device object, so most workouts need no tap. |
| 4 | Owner's phone is an iPhone, so a second relay device is required. No iOS browser has Web Bluetooth; Bluefy is best-effort only and needs foreground. | High (platform fact) | Buy a cheap Android device or use a laptop |
| 5 | The Lovable editor preview iframe almost certainly blocks `requestDevice` (Permissions-Policy `bluetooth` defaults to self). Lovable's AI cannot "see" BLE working. | High that it blocks; unverified for Lovable specifically | Test only on the published URL. `policy_blocked` copy. Pure-module unit tests first. |
| 6 | Silk on Fire TV: Realtime/WebSocket stability, wake lock support, remote key delivery (Amazon's key table is documented only for packaged web apps), Back behaviour, inactivity sleep | Low (undocumented) | Spike test 6. History-guard Back. Muted-video fallback. Fire OS shell escalation. |
| 7 | Fire TV OS unknown. Vega OS rules out the V1.1 shell, and with no browser it also blocks the V1 viewer. The model-to-OS mapping is only partly sourced. | High (that it matters) | Gate G0 is go/no-go, using the About screen's OS line. Alternative display paths listed in section 10. |
| 8 | Whether a sleeping laptop reconnects to the H10 on wake without a gesture | Unverified | **Reconnect** button. Spike test 5. |
| 9 | H10 link-drop timing after removal. The H10 does not disconnect immediately. The drop follows the central's connection supervision timeout, so it varies by relay OS. No source supports a specific figure. | Unverified | State derivation relies on the contact bit and freshness, not on disconnect timing. Spike test 2 measures it per OS. |
| 10 | The H10 has only two BLE slots. Relay + Polar Beat/Zwift/watch can lock someone out. | High | Troubleshooting copy. Superseded relay frees its slot after 30 s. No standby relays. |
| 11 | `postgres_changes` latency or quota at 1 Hz has not been measured end to end | Unverified | Spike test 4. Fallback to server-side `realtime.send()` Broadcast, which needs a client listener change, a private channel and `realtime.messages` RLS behind the `onRow` adapter. |
| 12 | The relay device holds a full user session. A lost spare phone is an exposure. | High (by design) | S14 **Remove** plus sign-out. Scoped relay tokens in V2. |
| 13 | The live TV zone tick can differ from the final server totals after late flushes, even though both use the same module | High (by design) | "Summary is final". The live tick is never shown as final. |
| 14 | Retention: the brief says keep, and Q8 discusses discarding | Brief governs | Default keep BPM, no RR. Discard only as an approved deviation. |
| 15 | Fire OS BLE from a sideloaded app (V1.1), including location-permission handling on API 28/30 | Low to medium (Peloton/Fiit evidence plus anecdotes, one failure on a 1st-gen 4K stick) | Gate G1 before any Kotlin work |
| 16 | Whether Silk exposes `navigator.bluetooth`. It is not listed in any compatibility table. | Low; assumed absent | Not needed. The TV is a passive viewer. |
| 17 | Shared household strap: someone other than the signed-in user wears it, and their HR lands in the wrong history | High (undetectable) | "Relaying for {name}" on the relay and "for {user}" on preflight. Switch user on the relay. |
| 18 | Android OS permissions (Nearby devices on 12+; Location on 11 and earlier) leave the chooser empty, which is likely on a cheap used device | Medium | Setup step, troubleshooting and empty-chooser copy. Spike test 1 on the actual device. |
| 19 | Idle relay load and an always-on screen if the relay is left open | High (by design) | Standby after End. 30 s heartbeat and wake-lock release after 10 min idle. |

---

## Verification notes

Corrected in this revision:
- **Secure pairing (sections 1 and 11, risk 1):** now stated as confirmed for H10 firmware 4.0.4+ (Polar release notes), with no downgrade path reported. The open question is narrowed to whether Web Bluetooth completes the OS bond on each OS. Spike test 1 now records the firmware and runs on every candidate relay OS.
- **`getDevices()`:** removed the unsourced "M169 / 2027" target. It is now described as flag-gated since Chrome 83 with no announced ship date, to be re-checked at spike time.
- **`BluetoothDevice.forget()`:** corrected from "flag-gated" to shipped in Chrome 101, feature-detected.
- **Background behaviour (risk 2):** split into two claims. Desktop freezes only with Energy Saver on, and Bluetooth-connected pages are exempt. Android freezes after 5 min since M68, with no documented exemption. Intensive throttling is noted as a separate mechanism.
- **Fire TV models:** the model-to-OS lists are reduced to sourced models, and the OS line under About is the source of truth. A Vega TV with no browser is now a G0 go/no-go, with alternative display paths.
- **TV keys:** the key table is marked as coming from Amazon's packaged web-app docs and unverified in Silk. The popstate history guard is now the primary Back mechanism. Spike test 6 logs every key.
- **H10 removal timing:** the "45 s to a few minutes" figure is marked unverified and OS-dependent (supervision timeout). Spike test 2 measures it, and acceptance 40 is reworded.
- **End and data collection:** End now calls `hr_request(0)`. The relay receives `stop_requested`, disconnects the strap and goes to the new `standby` mode. `hr_live` BPM is written only while HR is wanted (active session or preflight/setup window).
- **TV focus:**
  - S09 Back restored to Pause (acceptance 22). Back closes an open HR sheet first.
  - The HR panel has a defined slot in the S09 focus order.
- **Acceptance numbering:** the new items are numbered 39–47 so they no longer collide with the package's 29–38. Items 45–47 are new.
- **Demo data:**
  - Stored in a separate `hr_demo_samples` table.
  - Demo sessions are created only by a dedicated demo start path.
  - Demo and real samples are never mixed (`demo_mismatch`).
  - `countsTowardZone` requires the kinds to match.
- **Household and identity:**
  - "Relaying for {name}" on the relay and "for {user}" on preflight.
  - The outbox is tagged with the user and discarded on auth change.
  - `p_expected_user_id` check.
  - Several users may list the same serial.
  - The undetectable wrong-wearer case is added as risk 17.
- **Realtime:**
  - The per-user channel is listed as a brief deviation.
  - `hr_live` gains `rev` and `active_session_id`.
  - Channel teardown on lock and Switch user is specified.
  - `hr_sensors` is added to the publication so viewers leave H0 without a reload.
  - The `realtime.send()` fallback is corrected: clients switch to a Broadcast listener and need a private channel plus `realtime.messages` RLS.
- **Zone math:** a single implementation. `finalize-session-hr` is now an edge function that imports `zoneAccounting.ts`, with shared fixtures. Late re-runs use `hr_finalize_dirty`.
- **Forget strap:** now a tombstone (`forgotten_at`) set through `hr_forget_sensor()`. `hr_ingest` will not recreate the row without a fresh claim, and the relay is told to disconnect.
- **Viewer derivation:**
  - Every `RelayMode` is mapped explicitly (`choosing` and `standby` → H1, `superseded` → H6 takeover; `demo`, `live` and `hidden` → freshness).
  - The `connected_at` comparison has a 2 s tolerance.
- **Relay timing and clock:**
  - The relay sends its own `p_connected_at` and calls ingest immediately on every mode change.
  - It calls `server_time()` on load, and samples queued before an offset was known are re-stamped.
- **Fence and locking:**
  - Same source with a new stream (reload or relaunch) now takes over silently.
  - Superseded relays never take a stale holder implicitly.
  - A per-user advisory lock replaces the `FOR UPDATE` that could not lock a missing row.
- **`hr_live` updates:** the BPM, contact and `measured_at` fields are now monotonic in `measured_at`, so outbox flushes do not regress the TV.
- **Revoked relays:** **Add it again** now mints a new source id and replaces `dillan.relayId`.
- **Session attribution:** uses the most recent session only, with a 6 h maximum age. Start ends any open session. The tie-break is documented.
- **Pause intervals:** finalize reads the package's pause storage. `workout_session_pauses` is added if none exists.
- **Retention:** the default now follows the brief, and delete-after-finalize is marked as a deviation needing approval. `hr_samples` gains `schema_version`, `metric` and `unit`, and `(stream_id, seq)` is documented as the event ID.
- **Idle load:** idle and standby heartbeats back off to 30 s after 10 min, with a 75 s offline threshold, and the wake lock is released. Idle load is added to the estimate.
- **S14 Connect strap:** now only navigates to `/relay`, removing the device-object hand-off problem and the contradiction with "only /relay touches Bluetooth".
- **Android permissions:** the Nearby devices / Location requirement is added to setup, troubleshooting, the empty-chooser copy, failure modes, spike test 1 and risk 18.
- **Unsourced Polar claims:**
  - The "2 Bluetooth devices default" claim is reworded to "make sure the setting is on", citing the 4.0.4 notes.
  - The "Polar says nearby devices can receive it" attribution is replaced with general HRS behaviour (no encryption requirement, second connection accepted).