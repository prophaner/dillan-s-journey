# 01 · Interpretation of the brief and labeled assumptions

## What V1 is

Dillan V1 is a small, honest home-gym companion: build a workout on your phone, pick it on the TV, train with your real heart rate on the big screen, and find the session (with your notes) in a calendar afterwards. Several people share one TV without ever seeing each other's data.

Three design principles fall out of the brief and drive every decision below:

1. **Truthful live states.** A number on screen is live only if it is fresh (≤10 s). Everything else is labeled for what it is: Delayed, No recent reading, Paused, Disconnected, Not connected, Live data off. Missing time is "Unmeasured", never assigned to a zone.
2. **Nothing starts, ends or switches silently.** No hidden blank sessions, no default workout, Back never ends a workout, Switch user / Log out during a workout always offers Cancel or End and save.
3. **Privacy is structural, not cosmetic.** A remembered profile is a name tile only; a QR scan is only a channel to the phone; the TV clears before showing the chooser; the next user's data never flashes.

## PM defaults applied (as instructed, not re-litigated)

| Default | Applied as |
|---|---|
| Email and SMS one-time codes | 6-digit code, 10-minute validity, 30 s resend cooldown, no passwords. Register and Login are the same screen family; a known contact on "Register" silently becomes a login code; an unknown contact on "Login" offers to create the account. |
| Straight sets and supersets | Set type is chosen per exercise. Supersets are groups of ≥2 consecutive exercises sharing rounds and a rest after the last member. |
| Required user-confirmed zone boundaries | Four increasing BPM boundaries typed and confirmed by the user before any zone label is shown. Until then BPM shows with "Set up zones". |
| Weekly consistency goal of 3, editable | Goal lives in Profile (phone). TV shows it read-only ("Goal set on phone"). |
| Fresh verification when a locked profile is selected | Selecting a locked tile on the TV starts a new pairing request addressed to that user's phone; the TV never unlocks from the tile alone. |

## Labeled assumptions

Each assumption is reversible unless marked **[material]**.

- **A1 — Accounts.** One account = one person = one contact method at registration (email or phone). Adding a second contact is out of scope for V1 UI; the data model allows it. (Open question Q4.)
- **A2 — TV runtime.** The TV experience is a hosted web app rendered in a Fire TV WebView per Amazon's hybrid-app and Vega WebView guidance ([Fire tablets hybrid apps](https://developer.amazon.com/docs/fire-tablets/hybrid-apps-overview.html), [Vega WebView](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview)). A thin native shell forwards D-pad, OK and Back as keyboard events and owns the exit-on-Back-from-Home behavior. **[material]** — see Q1.
- **A3 — Pairing codes.** TV shows a QR plus a short typed fallback code `DLN-XXXX` from an unambiguous alphabet (no 0/O/1/I/L). Codes expire after 5 minutes and are single-use. The QR encodes a deep link that pre-fills the code on the phone; it never carries a session token.
- **A4 — Approval identity.** The TV is signed in as whoever approves on their phone. If a locked tile for Luis was chosen but Maya's phone scans the QR, the phone shows "This request was for Luis" and Maya can only approve as herself, which signs the TV in as Maya (clearing first). The TV never signs in as the tile name without that person's phone.
- **A5 — Auto-lock.** 15 min of no remote/phone activity outside workout mode locks the TV back to the chooser (session cleared, profile remembered). During a workout, the TV never auto-locks. After a workout ends, the summary screen counts as activity.
- **A6 — Companion.** Heart rate reaches Dillan only through the native iPhone companion (HealthKit) and its Watch app. The web and TV surfaces display what the companion publishes; they never request Health permissions themselves. Because HealthKit does not tell an app whether read permission was denied ([Apple: Authorizing access to health data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)), all empty states say "No data available", never "you denied access".
- **A7 — Freshness thresholds.** Reading age ≤10 s = Live; 10–30 s = Delayed (BPM shown de-emphasized, zone unknown, time counts as Unmeasured); >30 s = No recent reading (no BPM shown). Thresholds are configuration constants.
- **A8 — Zone time accounting.** Each second of active time is attributed to exactly one of Zone 1–5 or Unmeasured. Paused time is attributed to nothing. Rest time is active time (the workout is running) and is attributed like any other second.
- **A9 — Session status.** `completed` = every set was completed or skipped; `ended_early` = ended with sets not reached. Both are saved and shown in Calendar; only `completed` earns the "completed" dot. Both count toward the weekly session count (the user trained). **[material]** — see Q3.
- **A10 — Weight semantics.** Blank weight = Bodyweight. Any numeric weight requires a load basis: **Per implement** (each dumbbell/kettlebell) or **Total load**. The TV always renders the basis in words ("30 lb per dumbbell", "40 lb total").
- **A11 — Units.** Per user, lb or kg, set once at registration and editable in Profile. Stored weights are not converted retroactively; sessions snapshot the unit.
- **A12 — Phone as controller.** When the phone is signed in as the TV's active user, the phone dashboard mirrors the TV and can complete/skip sets, edit a set's actual reps and weight, pause, and end. Both surfaces share one session; there is no second session.
- **A13 — Desktop web.** Desktop (≥1024 px) is the same phone app with a left sidebar instead of a bottom tab bar. No desktop-only features.
- **A14 — Notes.** Plain text, one note per session, autosave 800 ms after the last keystroke, retained locally on failure and retried.
- **A15 — Example data.** Every mock and the prototype's default state use clearly synthetic data (users "Luis" and "Maya", "Living Room Fire TV"), labeled on screen.

## Material concerns flagged

1. **Back on Fire TV from Home exits the app.** On Fire TV, Back at the app root is expected to exit. V1 keeps the user signed in and lets auto-lock handle privacy, but a household with a non-household guest could resume the app within 15 minutes and see the last user's Home. Recommendation: offer "Lock on exit" in TV Profile in V1.1, or lock immediately on exit when more than one profile is remembered. (Q2)
2. **Rest-time attribution.** Rest counts as active time and is attributed to zones. This is physiologically meaningful and simple, but some users expect "active" to exclude rest. We label the metric "Active (excludes pauses)" everywhere. (Q3)
3. **Watch-only drops.** When the Watch disconnects from the iPhone, the iPhone companion may still publish stale values; the companion must publish an explicit `disconnected_watch` state or stop publishing, otherwise the web/TV cannot distinguish stale from live. The handoff specifies the publish contract. (Q5)
4. **Supersets and skipped sets.** Skipping A1 in round 2 does not skip A2; the user is asked per set. "Skip set" is a distinct outcome from "0 reps completed" in both data and UI.
