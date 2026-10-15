# 03 · Screens

Version 2.0 (web-first). Each screen has a mockup in `/mockups` and live HTML/CSS in `/prototype/` (`screens.html` for phone screens, `desktop.html` for D01–D02, `coach.html` for S15). The mockups use synthetic demo data (client "Alex M.," Coach "Maria R."). Requirement IDs refer to the web-first product brief v2 (FR = functional requirement, AT = acceptance test).

Phone mockups are rendered at 390 × 844 (S17 at 360 × 780, the narrow case). S01, S19 and S20 show a browser address bar to make the point that this is the product in a tab; the other screens are what the same page looks like when installed or when the browser chrome has collapsed on scroll. Desktop mockups are 1440 × 900.

Screens marked **[spec only]** have no mockup. Build them from the components in `02-design-system.md`, matching the look of the mocked screens.

---

## S01 · Today (`s01-today.png`)

**Question it answers:** What should I do today, and why? (brief §2.1, Q1–Q2)

**Layout, top to bottom**

1. Eyebrow: `THU, OCT 15 · BLOCK 2, WEEK 3` (13/600, Graphite). At right: the **save state** (Synced) and the avatar, which opens the menu (Plan, Profile, Coaching, Health data, Reminders, Your data, Settings).
2. **Dillan's sentence** (Newsreader 31/36): one short line naming the purpose. "Today is about your pull."
3. Supporting line (Newsreader 18, Graphite): links the session to a goal in 1–2 sentences.
4. Attribution (footnote, Smoke): mark + "Dillan · based on your plan v13." Tapping it opens the plan version.
5. **The Course** strip (this week).
6. Session card: name, "est. times," **time control** (Full / Short / Priority only), block list.
7. **Start session**, pinned above the bottom nav (sticky, 92 px from the bottom at phone widths; inline in the card on desktop, see D01).

**Behavior**

- If no Dillan text is available (AI off or failed), show the program's stored purpose text in Newsreader with the attribution "From your plan." Never invent text.
- Tap a block to see "Why this is here" (FR-06). (Tap, not long-press: long-press is unreliable in browsers and invisible to users.)
- If equipment is unavailable for an exercise, show a Hold tag on that block: "Needs: cable station · 2 alternatives." Tapping it opens Swap (FR-04).
- A flagged limitation shows a neutral tag on the affected block: "Adjusted for right shoulder" (FR-09).
- If there's an unfinished session: replace Start with **Resume session · 14 min in** and a quiet "Finish here" (FR-07, AT-17). The same resume card is the first thing on the Train tab (S16). A reload, a closed tab, or a new tab all return here with the session intact, because the session lives in IndexedDB, not in page memory.
- On a rest day: Dillan's sentence says so ("Rest day. Recovery is part of the plan.") and the card shows optional mobility, or nothing. There's no Start button; the secondary action is "Train anyway."
- **Check in first (optional)** appears as a quiet link only if check-ins are enabled.

**Missed-session state** (FR-06, AT-23): if a planned session passed without being done, a card appears above the session card. Dillan: "Wednesday didn't happen. No problem." Actions: **Do it today** · **Skip it** · **Rethink the week**. Never auto-cram.

**Return after a break** (7+ days, or illness noted): Dillan: "Welcome back. Let's ease in. Today is a lighter version of your normal session." The card shows a "Return week" tag. One-tap "Use my normal plan" override.

---

## S02 · Today, shortened (`s02-today-short.png`)

Selecting **Short** or **Priority only**:

- Dillan's sentence updates: "Short on time? We keep what matters."
- Omitted blocks get a strikethrough and stay visible. The time column shows "—."
- A sunken "Why this trade" note explains the choice in one sentence.
- Button label includes the time: "Start 25-min session."
- The original full plan is snapshotted. The session records which version was chosen (FR-06, AT-04).
- **Custom time:** long-press the control to enter "I have __ min." Dillan builds a version that keeps the priority block, or says honestly that it can't fit.

---

## S03 · Check-in sheet (`s03-checkin.png`)

**Optional, never blocking** (FR-11).

- Title: "How are you arriving?" Quiet **Skip** top right.
- Three option rows: Ready / Normal / Running low. "Running low" offers Dillan's lighter version on the next screen; the user still chooses.
- Context chips (multi-select): Slept badly, Short on time, Sore, Stressed, Something hurts.
- **Something hurts** opens the S11 flow before training starts.
- Footer: "Saved to today's log only. Never turned into a diagnosis."
- If the user answered within the last 3 hours, prefill and show "From 8:02 am" (reuse plus freshness).

---

## S04 · Set logging (`s04-set.png`)

Full spec in `02-design-system.md` → Set card.

**Interaction details**

- **Log set** saves locally immediately (target under 300 ms acknowledgement), then the Spot drop plays, then rest starts automatically if the prescription has rest.
- **Undo:** a toast "Set 2 logged · Undo" appears for 5 seconds. Double-tapping Log within 1 second is ignored, so no duplicate sets (FR-07).
- **Edit a done set:** tap its pip and the values reopen in place.
- **Swap:** a sheet lists alternatives that match equipment, intent, and active limitations, each with a one-line "keeps: horizontal pull" explanation. A swap applies to **this session only** unless "Use from now on" is chosen, which creates a proposal (FR-15).
- **Why this?** opens a small sheet: the goal it serves, its block role (priority / maintain / accessory), and the plan rule it comes from. Answers are grounded in the active program (FR-03).
- **Overflow menu (…):** Skip exercise, Reorder, Add note, Add exercise, Pause session.
- **End:** ends immediately with no confirmation. A sheet offers "Finish and save" (default) or "Discard session." Partial sessions are valid.
- **Voice logging** (Phase 5): hold the mic in the overflow menu and say "ten at thirty-five." It drafts the values into the card, and the user taps Log. Never auto-logs (FR-07).

---

## S05 · Rest timer (`s05-rest.png`, shown in Night Gym dark mode)

- Cradle drains, dot waits, 88 px numerals. Caption: "of 1:30 · your rest, your call."
- −15s / +15s / Skip. Up next card.
- The timer is derived from `restStartedAt`, so locking the phone or switching tabs can't break it. On return, the display is recomputed immediately; if rest already ended, show S18.
- Banner tells the truth about the browser: "Keeps correct time if your screen locks. No sound while the screen is off." (AT-31)
- Tab title shows the countdown on desktop ("1:12 · Rest · Dillan").
- Tapping the screen background does nothing. Prevents accidental skips.

---

## S06 · Superset (`s06-superset.png`)

- Header tag "Superset," "Round 2 of 3," and the pattern line: "Go A → B · rest 20s between · 75s after the round."
- Orange rail connects A and B. Each item is its own card with its own result (FR-05, AT-02).
- The current item is expanded with steppers; completed items collapse to one line with a Done tag.
- Rest between A and B uses the transition time, and rest after B uses round rest. Both are editable.
- Different reps per exercise are supported, because each card has its own prescription.

---

## S07 · Session complete (`s07-done.png`)

**Question:** How did that go, honestly? (planned vs. actual)

- Mark (64) plus Dillan's headline (Newsreader 30). The headline praises the **decision**, not the volume:
  - Full: "Every set, done. Good, steady work."
  - Shortened: "You kept what mattered."
  - Ended early due to discomfort: "Stopping was the right call. Your sets are saved."
  - Overridden plan: "Logged as you did it. We'll look at it in your review."
- Block summary with tags: Done / Skipped (by choice · reason) / Partial (4 of 6 sets).
- Metrics tiles: **Time** and **Sets logged · Entered by you**. Every number on this screen was entered by the user and says so. There is no heart-rate or calorie tile, because the browser has no such data; when a future import exists, its tile appears only when data exists and is labeled with its source (AT-20).
- "How did it feel?" chips: Easy / Solid / Hard / Too much, plus Add note. Skippable.
- **Save session.** Saves even if nothing is selected. Under it, the save state: "9 sets synced · nothing waiting," or "3 sets saved on this device · will sync when you're online."
- After the first ever completed session, and only then, the install sheet (S19) may follow.
- Never show calories as a headline, a "new PR!" confetti burst, or a streak count. Real comparable PRs appear as a quiet line: "Best row yet at this weight: 10 reps" (FR-10 comparability).

---

## S08 · Progress (`s08-progress.png`)

**Question:** Am I progressing toward what matters to me? (Q3)

- Large title. Dillan's one-line summary (voice block).
- **Objective cards**, one per active goal, ordered by priority:
  - Tag: Improve / Maintain / Defer (FR-02).
  - Name, big current value, baseline and date, target.
  - Chart with raw dots, labeled gaps, and a dashed target line.
  - Tap opens detail: full history, protocol versions, evaluation method, "How this is measured."
- **Steady weeks** card (habit/consistency goal) using course pips.
- Below the fold: **Body** (measurements, with left/right shown separately and BMI labeled "derived"), **Reviews** (past reviews), **Decisions** (proposal and override history, FR-15).
- Segmented filter at top when content grows: Goals · Body · History.

**Measurement entry [spec only]:** sheet with type, site and side, value with unit, method, and optional conditions ("morning, before food"). Shows "Last: 32.0 in · Sep 30." Units convert in display only; the original entry is stored (FR-10, AT-22).

---

## S09 · Dillan (`s09-chat.png`)

**Question:** What, if anything, should change? (Q4)

- Header: mark plus "Dillan" plus "Your gym coach · AI." Brain icon at right opens **Memory** (S14).
- User messages: Iron bubbles, right-aligned, sans.
- Dillan messages: no bubble, mark plus Newsreader text, left-aligned.
- **Proposal card** for any change:
  - Title plus status tag
  - **Diff:** − old (struck through, Smoke) / + new (semibold)
  - **Based on:** goals, equipment, notes, directives (each tappable, with dates)
  - **Trade-off:** what gets harder (one line)
  - Actions, according to decision class (brief §7.2): **Apply to plan** · **Just today** · or **Not now**
  - Footer: "Nothing changes until you choose."
  - After tap: tag goes to "Applied · plan v14" with **Undo** and "View change." If the write fails: "Didn't save · Retry" and the card keeps its previous state (AT-15).
- Quick-prompt chips above the composer: "Only 20 min," "Missed a week," "What changed?," "Why this exercise?" (FR-12).
- Composer: "Ask Dillan…" with mic.
- Pending proposals from a human coach appear at the top as a pinned card: "Coach Maria proposed a change · Dillan reviewed it."

**Data freshness:** if Health data is stale, Dillan says so inline: "Your last sync was Monday, so I can't see yesterday's run."

---

## S10 · Override sheet (`s10-override.png`)

Triggered when the user wants something Dillan recommended against. Only for **ordinary disagreements** (brief §7.2). Out-of-bounds requests get a different sheet with no override option, just an explanation and alternatives.

- Title states the request: "Add a fourth day this week?"
- Dillan's view (voice block) plus sources (`dmeta`). One or two sentences, ending with "It's your call."
- **Your reason** chips (one tap, optional "Other" opens a single text line). No essays (FR-15).
- **For how long:** This week only (default) / Until next review / Make it permanent (opens plan revision; it's not an override).
- Buttons: secondary "Keep [Dillan's plan]" · primary "[Do the thing] this week."
- Footer promise: "Logged as your override. Dillan won't bring it up again."
- The override shows in Decisions history and is compared at the next review. It expires automatically (AT-09).

**Friction is proportional:** a session-level swap needs zero reasons, so it's just "Just today." A weekly volume change gets this sheet. A permanent program change goes through plan revision.

---

## S11 · Something feels off (`s11-off.png`)

Reachable from: the link under Log set, the overflow menu, and the check-in. **Never more than one tap from any training screen.**

- Title: "Stop or adjust. Your call." Subtitle: "Your sets so far are saved."
- Actions take effect immediately on tap: **Stop this exercise** · **Try a gentler option** (only if a reviewed alternative exists) · **End the session.**
- Optional: "Where?" body-area chips with side. Optional one-line note.
- Info box: saved as a dated note, not a diagnosis, plus the reviewed escalation copy. **The escalation copy in the mockup is a placeholder and must be reviewed before release** (brief §19).
- Afterwards, the affected exercise is flagged in future sessions with "Check in about this before your next Pull session" (FR-09, flow C). Dillan asks one or two follow-up questions at the end of the session, not during it.

---

## S12 · Onboarding (`s12-onboard.png`)

**Goal:** first usable session in under 3 minutes (activation metric, brief §13).

Six steps, one question each. Every step has **Later** (top right) and **I'm not sure yet** (quiet button). Progress dots, no percentages.

1. **Welcome:** mark animation (dot drops into cradle). "I'm Dillan, your gym coach. I'll help you train with purpose and stay steady." → Start.
2. **Goals in your words:** a text field ("What do you want training to do for you?") plus example chips. Dillan reflects it back as 1–3 objectives the user can edit.
3. **Time:** days per week (chips) plus typical minutes (Full / Short defaults).
4. **Equipment** (mocked): tiles with quantities and increments. Dashed "Something else."
5. **Anything to work around?** Chips (shoulder, knee, back, etc. with side) plus "Nothing I know of" plus "Prefer not to say." Saved as limitations with source "You, onboarding" (FR-09).
6. **Your current routine:** **"Enter what I already do"** (primary) or "Build one with Dillan." An existing routine is accepted as-is (FR-01, AT-01).

Then a summary screen: "Here's what I know and what I don't yet." Known items get solid tags; unknowns get dashed "Not yet known" tags. → **Start first session.** Nothing is requested before the first session: no notification permission, no install prompt, no account extras. Those come after (S19, S22).

---

## S13 · Directives (`s13-directives.png`)

Path: Avatar → Coaching & Directives → How Dillan coaches you (FR-13).

Three sections that mirror the policy layers (brief §7.1):

- **Set by you** (editable): adaptation permission, communication style, review cadence, uncertainty handling. Tap opens an editor with a **"Here's what changes"** preview before saving.
- **From [coach]** (scoped): each directive shows status, expiry, reason, and version. Pending ones show "Waiting on you."
- **Always on** (locked): product boundaries, each with a lock tile. Tap explains the reason in plain language. Can't be edited.

Each directive detail shows: author, scope, reason, effective dates, version history (restore = new version), and **"Used in"** (the last 5 recommendations it influenced).

---

## S14 · What Dillan remembers (`s14-memory.png`)

Path: Dillan tab → brain icon (FR-08).

- Filters: All / Confirmed / Dillan's guesses.
- **Confirmed fact:** solid card, Steady tag, source ("You said · Sep 30").
- **Dillan's guess:** dashed card, dotted "Dillan's guess" tag, written in Newsreader (because Dillan authored it), with an honest confidence phrase ("only three sessions, so I'm not sure yet"). Actions: That's right / Not true.
- **Note:** original text, date, movement and side, visibility (Private / Shared with coach), and "One-time note, not a diagnosis." Actions: Edit / Remove. Removing shows "This also updates 2 summaries that used it" (AT-24).

---

## S15 · Coach workspace (`s15-coach-workspace.png`, desktop, 1440)

Brief FR-14, §4.3, flow D. It is the same app, not a separate portal: a coach signs in to one Dillan account, and a **My training / Coaching** toggle at the top of the sidebar switches the navigation.

- **Left:** brand, the My training / Coaching toggle, Clients / Reviews / Proposals, and the list of **only** clients who shared with this coach. Footer: "You see only what each client shares," and the coach's own avatar.
- **Main:** client header with **sharing-scope tags** (what's shared; dashed "Private notes not shared"). Objective cards, adherence (same Steady weeks pips), recent sessions table (planned vs. actual, plan version, and "entered by Alex" so the coach knows the source).
- **Right panel:** New proposal: what, why, scope, duration, review trigger, flexibility. Dillan's preliminary review appears in a voice block. **When a private constraint applies, Dillan says only "One private constraint may apply"** and never paraphrases private content (AT-11).
- After submit: the proposal shows "Pending · Alex reviews" until authorized (FR-14).
- Below 1024 px the right panel becomes a sheet opened by a "New proposal" button, and the client list becomes a page of its own. The coach workspace is usable on a phone but designed for a laptop.

---

## S16 · Train (`s16-train.png`)

**Question:** Where's my session? (brief §4.1 proposed nav)

- Top: **resume card** if a session is open (2 px Iron border, Hold tag "In progress," save state, "Started 8:12 am · 7 of 12 sets logged · you were on set 2 of rows"). Actions: **Resume** · Finish here. This is the AT-17 recovery path made visible.
- "Other ways to train": Today's session (with the three time estimates), Pick a routine, **Log something I already did** (a walk, a class, yesterday's session). The last one records a session with `source: user_entered_after_the_fact` and never pretends it was tracked.
- Recent: last sessions with Done / "2 sets skipped" tags. Neutral, no red.
- On desktop this is a page under the sidebar with the same three cards in a row.

---

## S17 · Typing a value, keyboard open, 360 px (`s17-keyboard.png`)

The narrow-phone, keyboard-open case (AT-35).

- The user tapped the load numeral in S04. It becomes a focused `<input inputmode="decimal">` with a 2 px Iron ring; reps sit beside it. The hint "Last time 35 · your dumbbells go in 2.5 steps" stays visible.
- Cues, chips, RIR and the big steppers hide while the keyboard is open, so the card fits above it at 360 × 640.
- **Sticky action row** above the keyboard: Something feels off (icon) · Done · **Log set**. It tracks `visualViewport` height so it is never hidden behind the keyboard. End stays in the run bar.
- No horizontal scroll at 320 px: every row is `min-width: 0` and numerals use `font-variant-numeric: tabular-nums` so widths are predictable.
- Enter logs the set. Blur with no change discards nothing.

---

## S18 · Back from a locked screen (`s18-rest-return.png`, Night Gym)

- The user locked the phone during rest and came back after rest ended. The timer was derived from timestamps, so the screen says **Rest ended · 2:14 ago** with the dot settled in the cradle (AT-31).
- Dillan's one line of honesty: "Your screen was locked, so there was no sound. Ready when you are." No apology loop, no "you missed."
- Actions: **Start set 3** · Add 30s more rest. Up next card unchanged.
- The elapsed session time in the run bar also comes from `sessionStartedAt`, so it's right too.

---

## S19 · Install, offered once (`s19-install.png`)

- Context: the first completed session (S07) behind the dim. Never on first visit, never during a session (AT-29).
- Sheet: icon, "Keep Dillan one tap away?", "Optional. Adds an icon to your home screen." Three plain rows: opens full-screen; lets you turn on reminders later if you want; doesn't change what Dillan can see.
- iOS has no install API, so the sheet shows the real path: Share → Add to Home Screen. On Chrome/Edge, **Show me how** calls the deferred `beforeinstallprompt`.
- **Not now** is a quiet button. Footer: "We'll ask once. You can always do it from Settings." Record the dismissal; never ask again.

---

## S20 · First visit without a connection (`s20-offline-first.png`)

- Nothing is cached yet, so the only honest screen is this one: mark, "Dillan needs a connection the first time," what will work after the first load, **Try again**, and "Nothing was lost. There's nothing saved here yet." (AT-36)
- This is the service worker's offline fallback page; it must ship in the precache so it renders even when `index.html` can't be fetched.
- Once the plan has loaded once, this screen is never shown again; offline becomes a banner on Today.

---

## S21 · Honest save state and safe updates (`s21-savestate.png`)

Two things on one screen, because they are both about trust on a device you don't fully control.

- **Update banner** at the top of Today: "A new version of Dillan is ready · Update." Appears only on Today, only when no session is open; the waiting service worker activates on tap or on the next cold start (AT-32).
- **Your data on this phone** sheet (menu → Your data): three counted rows, Synced 41 · Saved on this device 3 · Didn't sync 0, each with a one-line meaning. **Sync now.** Info row: "Clearing your browser data would remove the 3 unsynced sets. Sync first if you can." (AT-34) Footer: "Signed in as alex@… · Signing out clears this device's copy." (AT-33)
- The Today eyebrow shows "3 unsynced" in Hold while the outbox is non-empty.

---

## S22 · Reminders (`s22-reminders.png`)

FR-11, AT-30. In-app is the baseline; everything else depends on the browser and is described honestly.

- Intro line: "Dillan reminds, never nags. A missed reminder is never followed up."
- **Where:** In the app (always on) · Phone notifications (state depends on capability: On / Off / **Not available here** with the reason, e.g. "On iPhone this needs Dillan on your home screen first") · Email (opt-in toggle, "one message, no health details").
- **When:** session days at a time, weekly reflection, quiet hours.
- Footer: "Delivery depends on your browser and phone settings, so timing is approximate. Your plan works the same either way."
- Push permission is requested only from this screen, after the user turns the row on. Never on load.

---

## S23 · Health data (`s23-health.png`)

FR-16, AT-20. Replaces the v1 "Health connection" screen.

- Top card: "Where your data comes from · You." Every set, measurement and note was entered by the user and keeps its date and source.
- **Connected sources:** Apple Health / Watch shows a dashed **Not connected** tag with the plain reason: "A web browser can't read Apple Health. We're exploring a safe import for later." File import: Later. There is no Connect button that can't work.
- **What Dillan does without it:** plans, logs and reviews training; tracks what you enter; doesn't guess heart rate, sleep or steps. Unknown stays unknown.
- **Tell me when imports are ready** records interest; it does not subscribe anyone to anything else.

---

## D01 · Today, desktop (`d01-today-desktop.png`, 1440)

- 240 px sidebar: Today / Train / Progress / Dillan, then "More": Plan, Profile, Coaching & directives, Settings. Footer: save state and avatar.
- Two columns at ≥ 1024: the session card (time control, blocks, Start) on the left; Waiting on you, Dillan's note, and the active objective on the right. The course strip moves up beside the eyebrow.
- Dillan's sentence scales to 44 px; it is still one sentence.
- Under Start: "Logging on a phone? Open dillan.app there and tap Train. Your session follows your account." Sessions started on desktop are allowed; the runner simply renders at 640 px max width centered.

---

## D02 · Routine editor, desktop (`d02-routine-editor.png`, 1440)

FR-05, AT-03. The screen that justifies a desktop layout.

- Header: breadcrumb, "Editing Pull + Core," Draft of v14 tag, Discard, **Save as v14**. Banner: "Saving creates version 14. Sessions you've already done keep version 13 exactly as it was."
- Blocks with the same dot language as Today (Iron = required, Spot = priority, ring = optional). Each exercise is a row: grip, name, sets, reps, load, rest, overflow. Fields are real inputs with `inputmode` set per column.
- Supersets are a group with an orange rail, their own round/rest pattern, and Ungroup.
- Right rail: Dillan's check against goals, limitations and equipment (voice block); **What changed from v13** as a diff with an optional reason; the live time estimate for Full / Short / Priority only.
- Keyboard: Tab moves across a row, Enter adds a row below, `Cmd/Ctrl+S` saves. Drag reorder is an enhancement over the up/down actions in the overflow menu.

---

## Screens to build from the system [spec only]

| Screen | Key content | Brief |
|---|---|---|
| **Plan** (menu) | Active block card ("Block 2 · Strength base · week 3 of 6"), "How this plan works" (framework in plain language, Newsreader), weekly schedule, routine list, Exercise library | FR-03, FR-05, FR-06 |
| **Routine editor, phone** | Same content as D02 in one column: each exercise is a card with its prescription fields stacked, reorder via up/down buttons (drag is an enhancement), superset grouping via "Group with next." Version banner at the top | FR-05, AT-03 |
| **Exercise detail** | Name, intended emphasis (not claimed activation), setup, cues, breathing, common mistakes, alternatives, content badge (Reviewed / Yours / Drafted by Dillan), "I don't understand this" button, technique-confidence slider (Not sure / Getting it / Confident) | FR-05 |
| **Periodic review** | Dillan's summary: Planned · Done · Learned · Changed. Evidence sufficiency ("Enough data" / "Need one more test"). Recommendation card: Stay the course (celebrated as a valid outcome) / Adjust / Gather more / See a professional | FR-11, flow F |
| **Profile** | Equipment, Limitations (with status: accommodated / avoided / pending / resolved), Availability, Units (lb/kg, in/cm), Timezone | FR-04, FR-09 |
| **Manual measurement entry** | Body weight, measurements, resting heart rate if the user knows it: numeric fields (`inputmode="decimal"`), date defaulting to today, unit label from Profile, source recorded as "Entered by you." Each entry is editable and deletable with undo | FR-16, AT-20 |
| **Coach invite** | Coach email, role, **scope checklist** (Goals, Sessions, Measurements, Limitations, Selected notes), a "What they won't see" list, a note that downloaded copies can't be recalled, and **Send invite** (explicit; drafts don't send) | FR-14, §3 |
| **Privacy & data** | Three separate toggles with plain explanations: Keep a copy on this device · Send context to AI · Share with coach. Plus the always-on fact "Your account data is stored on Dillan's servers so it follows you between devices." Export (JSON/CSV and readable PDF). Delete account. | FR-17 |
| **Sign in** | Email plus magic link or passkey; no password to forget at the gym. Wordmark, one field, one button, Dillan's one-line reassurance. Shows which account is signed in on this device and offers "Not you?" (AT-33) | §4.1, AT-33 |
| **Conflict resolution** | Side-by-side: Yours / Theirs / Merge, with version numbers | AT-21 |
| **Settings → Install** | "Add Dillan to your home screen" with per-browser instructions (detect iOS Safari, Android Chrome, desktop), and the same honest "what it changes / doesn't" list as S19 | §4.1, AT-29 |
| **Storage warning** | Banner variant for AT-34 (private mode / storage full / cleared): what still works, what won't be kept | AT-34 |

---

## Icon mapping (Lucide)

All icons are Lucide, 1.75 px stroke, `currentColor`. The Dillan tab and avatar use the brand mark, never an icon.

| Use | Lucide name |
|---|---|
| Today tab | `sun` |
| Train tab | `dumbbell` |
| Progress tab | `trending-up` |
| Menu / avatar fallback | `menu`, `user` |
| Plan, Profile, Coaching & directives, Settings | `clipboard-list`, `user`, `shield-check`, `settings` |
| Start / Resume | `play` |
| Log set, Done, Applied | `check` |
| Why this?, info | `circle-help`, `info` |
| Swap | `arrow-left-right` |
| How-to | `book-open` |
| Something feels off | `hand` |
| Overflow | `ellipsis` |
| Back / forward | `chevron-left`, `chevron-right` |
| Waiting on you | `clock` |
| Didn't sync / failed | `circle-alert` |
| Offline, first visit | `wifi-off` |
| Secure (URL bar), timer honesty | `lock` |
| Install / share path | `share`, `plus-square` |
| Update ready | `sparkle` (the only sparkle in the app, and it's for a deploy) |
| Reminders | `bell` |
| Health data | `heart-pulse` |
| Edit / add note | `pencil`, `pencil-line` |
| Reorder | `grip-vertical`, `arrow-up`, `arrow-down` |
| Group as superset | `link` |
| Version history | `history` |
| Keyboard delete | `delete` |
