# Dillan H10 hardware spike: owner checklist

Goal: in about an hour, prove that a Polar H10 can reach your Fire TV through a web relay page. This decides whether we build V1 on this design. The design is in `../Dillan-H10-interface-design.md`, sections 1 and 10.

The spike page is a throwaway test tool, not the Dillan app. It has three modes:
- **Relay**: runs on the device that reads the strap.
- **TV viewer**: runs on the Fire TV.
- **Results**: runs on any computer and summarises the run.

---

## 0. Before you start (10 min, no strap needed)

- [ ] **Fire TV OS (Gate G0).** Open Settings → My Fire TV → About, and write down the model and the OS line.
  - Model: ______________________
  - OS: ______________________
- [ ] **Silk is installed on the TV.** If not, install it from the TV's app store. If there's no browser at all (possible on Vega OS), stop here and tell me. The TV needs a different display path before anything else.
- [ ] **Relay device.** Which device will read the strap?
  - An Android phone or tablet with Chrome. Write down the Android version: ______
  - Or a Windows / Mac laptop with Chrome or Edge.
  - An iPhone cannot be the relay.
- [ ] **Polar Flow (once).** Pair the H10 in the Polar Flow phone app and update its firmware. Write down the firmware version: ______
  - Check that the "2 Bluetooth connections" setting is on.
  - Then **close Polar Flow and Polar Beat** so they don't hold the strap.
  - Also remove the H10 from the phone's Bluetooth settings if Polar Flow added it there.

## 1. Set up the backend (5 min)

1. Create a **new, free Supabase project** named `dillan-spike` at supabase.com. Do **not** use the Dillan app's database.
2. Open **SQL Editor → New query**, paste all of `schema.sql`, and click **Run**. It should finish with no errors.
3. Open **Project Settings → API**. Copy the **Project URL** and the **anon** key (or the **publishable** key) into `config.js`.
   - Never paste the `service_role` or secret key into `config.js`.
   - If the TV later shows a Realtime error with a publishable key, switch to the legacy anon key under "Legacy API keys".

## 2. Put the page online (pick one)

Android needs **HTTPS** for Bluetooth, so the page has to be hosted.

- **A. Quickest with a laptop relay (no hosting):**
  1. In this folder run `python -m http.server 8000`.
  2. On the laptop, open `http://localhost:8000/#relay` (Bluetooth works on localhost).
  3. On the TV, open `http://<laptop-ip>:8000` and choose **TV viewer**.
  4. Caveat: the TV page isn't HTTPS, so "wakeLock" will read false. Re-check that on hosted HTTPS later.
- **B. Hosted HTTPS (needed for an Android relay):**
  - Upload this folder to any static host: Netlify Drop (sign in so the site doesn't expire), GitHub Pages, or Cloudflare Pages.
  - Or ask me to add it to the Lovable project under `/spike`, which also tests the real domain.
  - Do **not** use the Lovable editor preview. It runs in a frame that blocks Bluetooth.

Write down the address: https://______________________

Quick check before the strap:
1. Open the address on the relay and choose **Relay**.
2. Tap **Simulate strap (DEMO)**.
3. Open the TV viewer. Within a few seconds it should show a DEMO heart rate with "Live · DEMO".

If that works, the backend, Realtime and the TV are fine. Stop the simulation and **reload the relay page** before testing the real strap. DEMO data is stored separately and never counts toward the test verdicts.

---

## 3. The six tests (about 60 min)

Keep the relay **plugged in with the screen on** unless a test says otherwise. Use the **Test markers** buttons on the relay at the moment you do something; they make the timings line up in Results.

### Test 1: Web Bluetooth connect (15 min, repeat on each relay device you might use)
1. Wet the strap's electrodes and put it on.
2. On the relay, tap **Connect strap**.
   - If the strap is missing from the list, try **Connect (show all devices)**.
   - On Android 12+, Chrome may ask for **Nearby devices**: allow it. On Android 11 or older, turn **Location** on.
3. Pick "Polar H10 XXXXXXXX". Check the 8 characters match the number printed on the strap.
4. Accept any **pairing prompt** from the phone or computer. This is the key unknown, because firmware 4.x uses secure pairing.
5. Wait for "Sending" and let it run for at least 2 minutes.

| Record | Value |
|---|---|
| Device, OS and browser | |
| Name shown in the chooser | |
| Pairing prompt appeared? Completed? | |
| Connect timing (from the "Connect timing" card) | |
| Notifications per second | |
| Battery % / firmware (or "not readable") | |

**Pass:** the strap appears, pairing completes, and the rate is about 1.0 per second.
- If it fails on Android, repeat it on a Windows or Mac laptop before calling it a no-go.

### Test 2: Contact and removal (5 min)
1. Tap **Strap loosened / dried**, then loosen the strap or dry the electrodes. Watch the contact pill.
2. Wet it again and wait for "Sending".
3. Tap **Strap unclipped** and unclip the sensor pod. Keep the page open and wait up to 3 minutes for "Strap lost". With Auto-reconnect ticked it reads "Strap lost — reconnecting…".

| Record | Value |
|---|---|
| Seconds until "contact ✗" after loosening | |
| Seconds until "Strap lost" (link dropped) after unclipping (Results computes this too) | |

**Pass:** contact goes false before the link drops, and "Strap lost" eventually appears. The timings are what we need.

### Test 3: Reconnect without a tap (5 min)
1. With **Auto-reconnect** ticked, re-clip the pod after test 2 (tap **Strap re-clipped**). Wait 30 s.
2. Then tap **Disconnect**, followed by **Reconnect same strap**. This one is a tap, not a chooser.

| Record | Value |
|---|---|
| Did it reconnect by itself after re-clipping? | |
| Did "Reconnect same strap" work without the chooser? | |

**Pass:** it reconnects without the chooser. Doing it by itself is the best case.

### Test 4: End to end to the TV (15 min, alongside test 6 steps 1–2 only)
1. On the TV, open the address and choose **TV viewer**. Leave the strap streaming with the relay screen on.
2. Let it run at least 10 minutes. Don't touch the relay, the TV's Wi-Fi, or the Home button.
3. **Write the numbers down before** test 5 or test 6 steps 3–5. Those deliberately cause gaps.

| Record | Value |
|---|---|
| p50 / p95 / max latency on the TV | |
| Gaps over 10 s | |
| Verdict line on the TV | |

**Pass:** p95 ≤ 5 s and no gap over 10 s.

### Test 5: Relay screen off / background (10 min, informational)
Do each step for 2 minutes, then bring the relay back to the front.
1. Tap **About to lock screen**, then lock the relay's screen.
2. Tap **About to background Chrome**, then switch to another app.
3. On a laptop: tap **About to sleep laptop**, then close the lid.

| Record | Value |
|---|---|
| Did the TV keep getting readings while locked? | |
| While backgrounded? | |
| After waking, did it recover by itself, or did you need to tap Connect / Reconnect? | |

**No pass or fail.** This decides the on-screen advice ("keep the relay screen on") and whether a laptop relay is the better choice.

### Test 6: Silk checks (10 min)
Do steps 1–2 during test 4. Do steps 3–5 only **after** you have written down test 4's numbers.

On the TV viewer:
1. Press **every remote button** once except Home: arrows, Select, Play/Pause, Rewind, Fast-forward, **Back**, Menu. The key list shows what Silk delivers.
2. Press **Back** a few times. The **Back captured** counter ("pop N · key M") should go up, and the page should stay put.
3. Turn the TV's Wi-Fi off for 30 s, then back on. **Realtime** should return to "subscribed (rejoined …)". Gaps during this are counted separately as "during TV outage".
4. Leave the remote alone for at least 20 minutes. Note whether the screensaver or sleep kicks in. "Page suspended" counts any freezes.
5. Last, press **Home**, reopen Silk, and note whether the viewer page survived or reloaded.

| Record | Value |
|---|---|
| `bluetooth` / `wakeLock` / HTTPS (top of the TV panel) | |
| Keys that showed up, with their keyCodes | |
| Back: captured, or did it leave Silk? | |
| After Home: page survived or reloaded? | |
| Realtime came back after the Wi-Fi toggle? | |
| Screensaver or sleep during idle? After how long? | |

**Pass:** Realtime recovers by itself, and Back can be captured (via popstate or as a key).

---

## 4. Collect the results (5 min)

1. On any computer, open the address and choose **Results**. Set the look-back to cover your session and click **Load**.
2. Read the **Auto-judged** lines. Click **Download everything (JSON)** and **Download samples (CSV)**.
3. Optionally, on the relay, click **Download log (JSON)**.
4. Send me the filled-in tables above plus the JSON file. I'll write the go/no-go and update the design.

## Go / no-go

- **Go:** G0 passes (the TV has a browser that opens the viewer) **and** tests 1 and 4 pass with the relay screen on.
- **No-go on one relay OS only:** try the other relay type (Android ↔ laptop).
- **No-go everywhere:** we revisit the design, for example a different strap or the native TV app path.

## Clean up

When we're done, delete the `dillan-spike` Supabase project and the hosted site. The anon key in `config.js` lets anyone read and write the test tables while they exist.
