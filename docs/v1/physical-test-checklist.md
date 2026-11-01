# Dillan V1 — physical test checklist (Fire TV + Polar H10 + phones)

Automated tests passed on the branch; **none of this has been run on real hardware yet.** This
checklist is the release gate for "real health" and "TV usability" in the dev-brief matrix.
It builds on the one-hour spike in `spike/CHECKLIST.md` (run that first if it has not been run:
it decides go/no-go for Silk and the H10 relay before the full app is tested).

Rules:
- Use the **published URL** (`https://dillan-s-journey.lovable.app`), never the Lovable editor
  preview (acceptance 44). Migration 0006 applied and `setup-owner.md` §2–§8 done.
- Write actual results, including failures. "Not tested" is a valid entry; a blank is not.
- Times: use a phone stopwatch or the relay's / TV's on-screen ages. Note Wi-Fi (same network?
  2.4/5 GHz?).

Tester: ______ Date: ______ Deployed commit: ______

## 1. Devices and versions

| Device | Model | OS + version | Browser + version | Notes |
|---|---|---|---|---|
| Fire TV | | Fire OS / Vega OS line from Settings → My Fire TV → About: | Silk: | |
| Relay (Android) | | Android: | Chrome: | Nearby devices / Location granted? |
| Relay (laptop, if used) | | Windows / macOS / ChromeOS: | Chrome / Edge: | Energy Saver on? |
| Phone A (owner) | | iOS / Android: | Safari / Chrome: | |
| Phone B (second user) | | | | |
| Polar H10 | serial ID on pod: | firmware: | — | battery % shown by relay: |

## 2. Spike results carried over (from `spike/CHECKLIST.md`)

| Spike test | Result | Notes |
|---|---|---|
| G0 Fire TV OS + browser opens `/tv` | pass / fail | |
| 1 Web Bluetooth connect (per relay OS) | | pairing prompt completed? |
| 2 Contact and removal | | s to contact ✗: ___ s to strap lost: ___ |
| 3 Reconnect without a tap | | |
| 4 End to end to TV | | p50 ___ p95 ___ max ___ gaps >10 s ___ |
| 5 Relay screen off / background | | |
| 6 Silk checks | | |

## 3. TV (Silk) with the real app

| # | Check | Expected | Result |
|---|---|---|---|
| T1 | `/tv` loads, 1920×1080 canvas fills the screen, text readable from the bench | No cut-off, no scrollbars | |
| T2 | Remote keys: arrows, Select, Back, Play/Pause, Menu, Rewind/FF | Arrows move focus; Select activates; Back = app Back; Play/Pause pauses/resumes on dashboard | |
| T3 | Back on Home with no workout | Exit toast; second Back leaves (or stays in Silk — record) | |
| T4 | Back delivered as popstate or keydown? | Either works (D23); record which | |
| T5 | Pairing: Get started → QR scanned by phone A → approve | TV Home within ~2 s (acc. 4) | s: |
| T6 | Signed-out phone scans QR | Login first, then approve with code kept (acc. 5) | |
| T7 | Deny on phone | "Request declined", Try again focused (acc. 6) | |
| T8 | Wait 5 min on the code | Expired, New code focused (acc. 7) | |
| T9 | Switch user | Blank frame, then chooser; no A data visible (acc. 9) | |
| T10 | Switch user during a workout | "A workout is running", Cancel focused (acc. 10) | |
| T11 | 15 min idle, no workout | Locks to chooser; toast at 14 min (acc. 11) | |
| T12 | 15+ min idle during a paused workout | Does **not** lock | |
| T13 | Screensaver / sleep during a 30 min workout | Screen stays on? (wake lock in Silk) | minutes until screensaver: |
| T14 | Home button mid-workout, reopen Silk | Workout paused, "Paused while Dillan was in the background", Resume focused (acc. 21) | page survived / reloaded: |
| T15 | TV Wi-Fi off 30 s mid-workout, on again | Freshness decays (never stale-as-Live); recovers by itself | s to recover: |
| T16 | Revoke the TV from phone Profile → Devices | TV back to chooser within 60 s | s: |
| T17 | Focus sizes / visibility | Every focus ring visible from the bench (acc. 35) | |

## 4. Heart rate end to end (H10 → relay → backend → TV)

Run a **45-minute session** with the remote idle except for set taps, strap worn and wet, relay
plugged in with the screen on (h10-design §10 post-build test).

### 4.1 Latency distribution

Measure "reading age" = TV clock-corrected time minus `measured_at` (shown as "{n}s ago" on the
TV HR sheet), or export `hr_samples` (`received_at - measured_at` is the relay → server part).
Record at least 20 spot readings, or the computed percentiles.

| Leg | p50 | p95 | max | Samples | Notes |
|---|---|---|---|---|---|
| Strap → server (`received_at − measured_at`) | | | | | |
| Strap → TV render (reading age on TV) | | | | | |
| Gaps > 10 s (count, longest) | | | | | |
| Coverage % on the summary | | | | | |

Target (not a guarantee): p95 ≤ 5 s strap → TV on stable Wi-Fi, no gap > 10 s with the screen on.

### 4.2 Foreground / background behavior of the relay

| Relay state (2 min each) | TV keeps Live? | Recovers by itself? | Tap needed? | Notes |
|---|---|---|---|---|
| Screen on, page in front (baseline) | | | | |
| Screen locked | | | | |
| Chrome backgrounded (other app) | | | | |
| Relay tab reloaded | | | | |
| Relay tab closed, reopened | | | | expected: Connect strap tap |
| Laptop lid closed / sleep, then wake | | | | |
| Relay Wi-Fi off 30 s, on again | | | | "Offline - holding {k}s", backfill counted? |

### 4.3 Heart-rate states on the TV

| # | Action | Expected | Result (seconds) |
|---|---|---|---|
| H1 | Loosen / dry the strap | "Check strap contact" within ~2 s; time → Unmeasured (acc. 40) | |
| H2 | Unclip the pod | Contact lost, then strap lost (timing per OS) | |
| H3 | Close the relay tab | Relay offline on TV within ~16 s (acc. 39) | |
| H4 | Reading 11 s old | "Delayed", "Zone unknown" (acc. 24) | |
| H5 | Reading 31 s old | No BPM, "No recent reading" (acc. 25) | |
| H6 | HR goes Live during preflight | TV focus does not move; "Heart rate ready" (acc. 43) | |
| H7 | End the workout | Relay to standby, BPM cleared within ~2 s (acc. 46) | |
| H8 | Sign out on relay, sign in other user | Queued readings discarded; TV cache cleared (acc. 47) | |
| H9 | Second relay device opened | First shows superseded, frees the strap after 30 s | |
| H10 | Strap battery % | Shown on relay, S14, preflight | |

### 4.4 Zone totals

After the session: summary zones + Unmeasured = Active time (±1 s). Compare with Polar Flow /
another app's average HR only as a sanity check; no medical claims.

| Active | Z1 | Z2 | Z3 | Z4 | Z5 | Unmeasured | Coverage | Sum OK? |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## 5. Phones (controller)

| # | Check | Phone A | Phone B |
|---|---|---|---|
| P1 | Email code sign-in (real email arrives; code works) | | |
| P2 | SMS code sign-in (if a provider is configured) | | |
| P3 | Wrong code clears the boxes; resend waits 30 s (acc. 2–3) | | |
| P4 | 320 px width: no horizontal scroll on Home/Editor/Dashboard/Calendar (acc. 36) | | |
| P5 | Lock the phone 2 min mid-workout, unlock | Times correct, same step | |
| P6 | Airplane mode: complete a set, pause → "Offline—changes pending"; reconnect → synced | | |
| P7 | Phone tap reflected on TV (seconds) | | |
| P8 | TV remote tap reflected on phone (seconds) | | |
| P9 | Phone and TV press Pause at the same time | One pause, one history row | |
| P10 | Note autosave, reload, still there; appears on Calendar day (acc. 33–34) | | |
| P11 | iPhone opening `/relay` | "iPhones can't relay heart rate from a web page." No dead button (acc. 41) | |

## 6. Two-user demo (`setup-owner.md` §11)

| Step | Result | Notes |
|---|---|---|
| 1 B registers, creates a workout | | |
| 2 A pairs the TV | | |
| 3 A trains with live HR, strap-off gap, End on phone | | |
| 4 Switch to B; nothing of A visible | | |
| 5 B trains without live data, ends early | | |
| 6 B's note autosaves; read-only on TV | | |
| 7 Calendars and Home counts are per user | | |
| 8 Lock; auto-lock | | |
| 9 Revoke the TV from A's phone | | |

Acceptance 38 (second household user end to end, only their first name ever visible to the other): pass / fail

## 7. Known limitations to confirm or update

Record whether each is still true on this hardware:

| Limitation | Still true? | Notes |
|---|---|---|
| iPhones cannot be the relay (no Web Bluetooth) | | |
| Android relay must stay in front with the screen on | | |
| One Connect strap tap + chooser pick per relay page load (`getDevices()` flag-gated) | | |
| H10 has two BLE slots; Polar Beat / Zwift can block the relay | | |
| Silk may not keep the screen awake (no muted-video fallback in V1) | | |
| Revoked TV access token can live up to 1 h; app re-checks every 60 s | | |
| Someone else wearing the strap while relay is signed in as A records into A's history | | |

## 8. Unresolved defects found

| # | Severity (blocker / major / minor) | Steps | Expected | Actual | Device |
|---|---|---|---|---|---|
| | | | | | |

Verdict: **Release / Release with known issues / Do not release** — owner signature: ______
