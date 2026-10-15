# 02 · Design system

Version 2.0 (web-first). Source of truth for values: `/tokens/tokens.json`. Ready-made code: `/tokens/tokens.css` (CSS custom properties, the file the prototype actually uses) and `/tokens/tailwind.preset.cjs` (same values as a Tailwind preset, optional). Visual reference: `/prototype/*.html` and `/mockups/*.png`.

Dillan is a **mobile-first responsive web app** (brief §4.1). Everything below is specified for the browser first, phones first. Nothing depends on a native shell, and installing to the home screen is a convenience, never a requirement.

## Seven design principles

These come straight from the product brief. When two choices both look fine, use these to decide.

1. **One question per screen.** Today answers "What do I do, and why?" Progress answers "Am I getting there?" Dillan answers "What, if anything, should change?" If a screen tries to answer two questions, split it.
2. **No guilt, ever.** No streaks, red marks, sad faces, or "You missed…" headlines. A shortened session or a planned rest counts as a good decision, and the UI says so.
3. **Stop is always one tap.** End, skip, and "Something feels off" are visible on every training screen, including when the keyboard is open. They never ask "Are you sure?" and never need a reason.
4. **Who said it is always visible.** Dillan writes in serif. Records and people use sans. Guesses have dotted borders, unknowns have dashed borders, and confirmed facts have solid ones.
5. **Changes are cards, not sentences.** Anything that changes the plan, a directive, or memory shows up as a structured card with a status. Conversational text never changes data by itself (FR-12).
6. **Minimal input during training.** Values come prefilled from last time. A typical set takes one tap. The keyboard opens only when the user taps a number.
7. **Unknown is not zero, and "saved" is not "synced."** Missing data shows "—" with a dashed outline and "Not yet known," never 0. Data shows "Synced" only after the server acknowledges it (§10.2).

## Layout

- **Units:** CSS px, with type in rem (base 16 px). 4 px base grid. Screen margin 20 px (16 px below 360). Card padding 16–18 px. Gap between cards 12 px.
- **Breakpoints** (min-width): `sm` 360 · `md` 768 · `lg` 1024 · `xl` 1280. Design at 390, verify at **320** (no horizontal scroll, ever), 360, 430, 768, 1280, 1440.
- **Phone (< 768):** single column, bottom navigation (64 px + `env(safe-area-inset-bottom)`), content max-width none.
- **Tablet (768–1023):** single column centered at max 640 px, bottom nav stays. The coach workspace is usable here but is designed for ≥ 1024.
- **Desktop (≥ 1024):** 240 px left sidebar replaces the bottom nav; content max-width 1120 px; Today becomes two columns (plan left, decisions and Dillan right). See `D01`, `D02` and `s15-coach-workspace`.
- **Safe areas:** `viewport-fit=cover`, and every fixed element pads with `env(safe-area-inset-*)`. The bottom nav and sticky actions use `--safe-b`.
- **Viewport height:** use `100dvh`, never `100vh`, so the browser chrome collapsing on scroll doesn't hide the primary action.
- **Thumb zone:** primary actions (Start, Log set, Continue) sit in the bottom third on phones. End sits at the top, where it's harder to hit by accident but always visible.
- **Density:** generous. If a screen needs scrolling to reach its primary action, pin that action instead (`position: sticky; bottom: 0`).
- **Touch targets:** 44 px minimum, 56 px for steppers, 64 px for Log set. Nothing is hover-only; hover is an enhancement on desktop.

## Navigation

Four tabs on phones; the same four at the top of a sidebar on desktop. The brief lists eight areas (§4); the daily interface stays small by grouping them:

| Tab | Lucide icon | Contains (brief §4 areas) |
|---|---|---|
| **Today** | `sun` | Today, check-in, time choice, start or resume |
| **Train** | `dumbbell` | Resume an open session, today's session, routines, "log something I already did," recent sessions |
| **Progress** | `trending-up` | Progress, objectives, measurements, reviews, decision history |
| **Dillan** | custom Spot mark | Conversation, pending proposals, memory |

The **avatar** (top right on phones, bottom of the sidebar on desktop) opens the **menu**: My Plan (routines, exercise library, framework explainer), My Profile (equipment, limitations, availability, units), Coaching & Directives, Health data, Reminders, Your data on this device, and Settings (privacy, AI data permissions, export, deletion, accessibility, install). On desktop the same items appear in the sidebar under "More."

**A session is a mode, not a tab.** Starting a session (from Today or Train) opens the session runner full-bleed and hides the bottom nav, so the only choices are the set, the rest, and the exit. The runner is its own route (`/session/:id`), so a refresh or a reopened tab lands back in the session, not on Today (AT-17). The browser back button leaves the runner with the session still open, never ends it.

**Coaches** use the same app. A "My training / Coaching" segmented toggle appears at the top of the sidebar for accounts with coaching access; Coaching swaps the nav to Clients / Reviews / Proposals. One account, one login, one design system (brief §4.3).

The pending-proposal count appears as a small Spot dot on the Dillan tab, never a red number badge. Browser tab title gets no counter either.

## Components

Each component lists its anatomy, states, and the brief requirement it serves. Sizes are in CSS px. Every component is a real HTML element with a real role: buttons are `<button>`, options are `<input type="radio">` or `role="radiogroup"`, sheets are `<dialog>` with focus trapped.

### Primary button

- 58 tall (64 for **Log set**), full width, radius 18, Spot fill, **Iron text** (never white: white on Spot is only 3.1:1). Keyboard focus: 2 px Iron ring offset 2 px (`:focus-visible`), never removed.
- Label: verb first, 1–3 words. "Start session," "Log set," "Save session."
- Pressed (`:active`): scale 0.98 plus 85% opacity, 120 ms. `touch-action: manipulation` so double-tap never zooms. Disabled: Oak fill, Smoke text. Use this sparingly; prefer explaining what's missing.
- **Loading:** label stays and a 16 px spinner replaces the icon. Never blank the button.
- Only one per screen.

### Secondary and quiet buttons

- Secondary: Oak fill, Iron text, 44–58 tall.
- Quiet: text only, Graphite, 44 tall. Used for "Skip," "Later," and "I'm not sure yet."

### Chips

- 36 tall (30 small), pill shape, Paper fill with hairline border. Selected: Iron fill and Chalk text (inverted).
- Used for reasons, quick replies, feelings, and filters. Multi-select unless stated.

### Status tag

- 24 tall, pill shape, **always icon + word + color**. Never color alone (brief §12 accessibility).

| Tag | Look | Meaning |
|---|---|---|
| Done / Applied / Confirmed | Steady on Steady tint, checkmark | Happened, and the write succeeded |
| Waiting on you | Hold on Hold tint, clock | Needs your decision |
| Priority / Main goal | Spot-ink on Spot tint | Today's priority work |
| Skipped / Draft | Graphite on Oak | Neutral record |
| Not yet known | Smoke text, **dashed** outline | Missing data |
| Dillan's guess | Graphite text, **dotted** outline | AI inference, unconfirmed |
| Failed to apply / Didn't sync | Iron text on Hold tint, `circle-alert` | Write failed; nothing changed |

**Proposal status mapping** (brief §7.3) to user-facing tags: `draft` → Draft · `submitted/evaluating` → Dillan is reviewing · `awaiting_information` → Needs your input · `ready_for_authorization` → Waiting on you · `declined` → Not applied · `overridden` → Your call (override) · `applied` → Applied · `failed_to_apply` → Didn't save · `expired/superseded/withdrawn` → Closed.

### Card

- Paper fill, 1 px hairline, radius 24, padding 16–18. No drop shadows on in-flow cards. Shadows are reserved for floating layers such as sheets and toasts.
- A **proposal card** has a 1.5 px Iron border, because it's the most important decision object in the app.
- A **guess card** (Dillan's hypothesis) has a 1.5 px dashed border.

### Segmented time control (signature)

- Three segments: **Full · Short · Priority only**, each showing estimated minutes in rounded numerals with the label underneath. The header reads "est. times," because estimates are always labeled (FR-06).
- Changing the segment animates the block list: omitted blocks get a strikethrough in Smoke and stay in place. They never disappear, and a one-line "Why this trade" appears below.

### Block row

- 12 px dot plus name plus exercises plus time.
- Dot styles: Iron filled = required, **Spot filled = priority**, hollow ring = optional. That's the same visual language as the course strip.

### The Course (week strip, signature)

Seven pips, one per day. Shapes do the work, so it reads without color:

| Pip | Meaning |
|---|---|
| ● filled | Done |
| ◐ half | Shortened (a good decision) |
| ◎ ring with center dot | Rest, planned or chosen |
| ○ hairline ring | Planned, upcoming |
| dashed ring | Not done (neutral, no red) |
| Spot ring with halo | Today |

The same shapes appear in **Steady weeks** on Progress (8 columns × planned sessions per week).

### Set card (session runner, signature)

Top to bottom:

1. Run bar: **End** (left, always), session name and elapsed time (center), overflow menu (right).
2. Block rail: thin segments for each block. Done = Iron, current = Spot.
3. Block tag and "Exercise 2 of 4."
4. Exercise name (Title 1), one cue line from reviewed content (sans; this is content, not Dillan).
5. Chips: **Why this?** (opens the goal link, FR-06), **Swap** (alternatives filtered by equipment and limitations, FR-04), **How-to**.
6. Set pips: done sets show a check on Steady tint, the current set has an Iron outline, upcoming sets sit on Oak. Tap a done set to edit it.
7. Side toggle for unilateral work (Left/Right). Each side logs separately (FR-07).
8. Measures: big rounded numerals (64) with 56 px round steppers. The label beneath says what the number means ("PER DUMBBELL," "TOTAL," "EACH SIDE") plus **"last time 35"**. Tapping the numeral turns it into an `<input inputmode="decimal" enterkeyhint="done">` at 26 px (never below 16 px, which would make iOS Safari zoom). See **Keyboard-open layout** below.
9. Optional effort: "Reps left in the tank" 0 / 1 / 2 / 3 / 4+ (RIR). The info icon explains the scale. It's skippable, and the app never converts it silently to RPE (FR-07).
10. **Log set** (64, Spot). Below it, a quiet link: **"Something feels off."**
11. Save state, top right of the card header: Synced / Saved on this device / Didn't sync (see **Save state**).

Field types change per exercise (reps, load, time, distance, hold, assistance band), following FR-07. Keep the same layout and swap the labels and steppers.

### Rest timer (signature)

The brand mark becomes the timer. The **cradle drains** clockwise as rest runs down, while the **dot waits** above it. Numerals are 88 rounded. Controls: −15s, +15s, and Skip. "Up next" shows the next set. When rest ends: the cradle completes and the dot does a small hop (plus `navigator.vibrate` where available). No alarm sound by default.

**Time is derived, never counted.** Store `restStartedAt` and `restDurationMs`; render `now − restStartedAt` on each frame. On `visibilitychange`/`focus`, recompute immediately. If the screen was locked past the end, show **Rest ended · 2:14 ago** with the mark fully settled and "Your screen was locked, so there was no sound" (S18, AT-31). The banner under the timer says exactly what the browser can and can't do: "Keeps correct time if your screen locks. No sound while the screen is off." Request `navigator.wakeLock` during a session where supported, and release it on end.

### Sheets

- Bottom sheet on phones (radius 34, grabber, Chalk background, 38% dim behind), centered dialog at ≥ 768 (radius 24, max-width 480). Both are a `<dialog>`: focus trapped, Esc and the dim close it, scroll locked behind.
- Title (sans, 22/700) is a question or a choice. Dillan's view, if any, sits in a voice block below it.
- Primary action at the bottom. "Skip" or "Cancel" goes top right as a quiet button.
- Medium detent by default; large detent only for forms.

### Voice block (Dillan speaking)

- Spot mark (28) plus Newsreader text. No bubble: Dillan's words sit directly on the page like a note from a coach.
- Optional `dmeta` line (12, Smoke, sans) lists sources: "From: your notes Oct 12, Oct 14 · Directive: Review before adding volume." This is how the app shows its reasoning (FR-12, FR-13).
- User messages use Iron bubbles aligned right, in sans. Human coach messages use Paper bubbles with the coach's avatar and name, in sans.

### Option row (radio / action)

- Paper fill, 1.5 hairline, radius 18, 40 px icon tile, title and subtitle. Selected: Iron 2.5 border plus a filled radio.
- Used in check-in, override scope, "Something feels off," and onboarding.

### Banner

- Oak fill, radius 14, icon plus one sentence, optional trailing action in bold. Used for offline, AI unavailable, stale data, timer honesty, and "a new version is ready." Always calm and always says what still works: "Dillan is offline. Your plan and logging work normally."

### Save state (new in v2)

A small dot plus word, 13 px/600, shown wherever data is being written: top right of the session card, top right of Today, in the sidebar footer, and summarized in **Your data on this device** (S21).

| State | Dot | Word | Meaning |
|---|---|---|---|
| `synced` | Steady | Synced | Server acknowledged the write |
| `local` | Hold | Saved on this device | In the IndexedDB outbox; will retry |
| `failed` | Spot-ink | Didn't sync | Retries exhausted or rejected; previous value still shown, Retry offered |

Never show "Synced" optimistically. Never show a spinner for the outbox. "3 unsynced" replaces the word when the count is more than one.

### Toast with undo (new in v2)

Iron fill, Chalk text, radius 14, bottom-anchored above the nav or sticky actions, 5 s. Used after any destructive or hard-to-reverse tap (delete a set, end a session, decline a proposal): "Set removed · **Undo**." Visible undo is the web equivalent of the native swipe-back habit (brief §4.1).

### Sticky actions and keyboard-open layout (new in v2)

When any input in the session runner has focus, the layout switches to the **keyboard-open** arrangement (S17): the measures collapse to two 50 px fields, cues and chips hide, and a 61 px **sticky action row** (Something feels off · Done · Log set) pins to the bottom of the visual viewport (`visualViewport` resize listener, `position: fixed; bottom: 0`). End stays in the run bar. Test at 360 × 640 with the keyboard open; nothing may scroll horizontally and Log set may never be covered (AT-35).

### Numeric input (new in v2)

`<input type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*">` for loads, `inputmode="numeric"` for reps and seconds. Font size 16 px or larger. Accept both `.` and `,` as decimal separators. Select-all on focus. Steppers remain available next to the field on desktop and tablet. Units are shown as a label, never typed.

### Install prompt (new in v2)

A standard sheet (S19), shown at most once, only after the first **completed** session, never on first visit. Content: what install adds (full-screen, reminders possible), what it doesn't change (data, privacy), and the honest iOS path (Share → Add to Home Screen) because iOS has no install API. "Not now" is a quiet button; Settings keeps an "Add to home screen" entry forever. Chrome/Edge: use `beforeinstallprompt` behind the "Show me how" button. No install banner ever appears during a session (AT-29).

### Update banner (new in v2)

When a new service-worker version is waiting, show the Banner on Today only: "A new version of Dillan is ready · **Update**." Never auto-reload. Never show it on session routes; if an update arrives mid-session, hold it until the session ends (AT-32).



### Charts

- Raw observations are always drawn as dots. Trend lines connect actual observations only.
- **Gaps are drawn as dotted segments with a label** ("no test · travel"), never smoothed over (FR-10).
- Targets are dashed Spot lines with a label.
- Results from different protocols are shown in a separate series with a "Different test" tag. They are never joined to the main line (AT-22).
- No universal "volume score" totals (FR-10).

## States every screen needs

Claude should build these as real states, not afterthoughts (brief §17.7).

| State | Treatment |
|---|---|
| **Empty** | One Dillan sentence plus one action. "No routine yet. Want to enter the one you already do, or build one together?" |
| **Loading** | Skeleton blocks in Oak at real layout sizes; no spinners for content. Logging never waits on the network. |
| **Offline, plan already on device** | Banner: "You're offline. Logging works; it'll sync when you're back." Save state shows **Saved on this device**. |
| **Offline, first visit** | Full screen (S20): "Dillan needs a connection the first time." Try again. No fake offline promise (AT-36). |
| **AI unavailable** | Dillan tab shows banner plus manual actions. Today shows the saved plan without the Dillan sentence and uses the program's stored purpose text instead. Never fabricate (FR-12, §10.4). |
| **Health data** | "Not connected" with a dashed tag and a plain reason: a browser can't read Apple Health. Manual entry is first-class. Never "0 bpm," "0 workouts," or a "Connect" button that can't work (S23, AT-20). |
| **Unknown value** | "—" plus a dashed "Not yet known" tag |
| **Stale data** | "Last synced 3 days ago" in footnote, Smoke |
| **Failed write** | Save state **Didn't sync** plus Retry. The previous value stays visible (AT-15). |
| **Conflict** | Card: "Your plan changed on another device. Keep yours, keep theirs, or compare?" (AT-21) |
| **Storage unavailable / cleared** | Banner on Today: "This browser isn't keeping data between visits (private mode or storage full). Logging still works while the tab is open; nothing is saved here when you leave." Sync becomes immediate and blocking per set (AT-34). |
| **Push not available** | Reminders row shows "Not available here" (dashed), with the reason and the email fallback (S22, AT-30). |
| **Account switch** | Signing out clears this device's copy after confirming unsynced items are gone or synced. A different account never sees the previous user's outbox (AT-33). |
| **Update ready** | Banner on Today only, never mid-session (AT-32). |

## Accessibility

- **Text scaling:** all type in rem; layouts must survive 200% browser zoom and large OS text sizes. At large sizes the set card stacks steppers below numerals, and bottom-nav labels wrap to two lines rather than truncate.
- **Contrast:** all text pairs meet WCAG AA (4.5:1 for body, 3:1 for large text and graphics). Ratios are listed in `tokens.json`.
- **Screen readers:** semantic HTML first. The set card reads "Set 2 of 3, right side. 10 reps, last time 10. 35 pounds per dumbbell. Log set, button." Steppers are buttons with `aria-label` and the numeral is an `aria-live="polite"` region. The course strip is a list with one sentence per day: "Thursday, today, Pull and Core."
- **Keyboard:** everything reachable with Tab, in reading order; `:focus-visible` ring everywhere; Esc closes sheets; Enter logs a set when a field is focused.
- **Touch targets:** 44 px minimum, 56 for steppers, and 64 for Log set (sweaty hands, phone on the floor). Spacing of at least 8 px between adjacent targets.
- **Reduced motion:** `prefers-reduced-motion` turns all movement into a 150 ms crossfade, and the Spot drop becomes a fade. Already in `tokens.css`.
- **Color scheme:** `prefers-color-scheme` picks Night Gym automatically; Settings can pin either.
- **Differentiate without color:** status already uses shapes and words. `forced-colors` mode must keep the pips distinguishable by shape, so pips are drawn with borders, not background alone.
- **One-handed and glance use:** a phone on a bench three feet away must still be readable, so set numerals are 64+.

## Motion

One personality: **settle**. Things arrive with a soft ease-out and come to rest. Nothing bounces for attention. All motion is CSS transitions or the Web Animations API; nothing animates layout properties other than `transform` and `opacity`. Haptics are optional (`navigator.vibrate`, Android only); nothing depends on them.

| Moment | Motion | Vibrate (optional) |
|---|---|---|
| **Log set (signature: Spot drop)** | Button compresses. A small Spot dot lifts from the button and drops into the next set pip, which turns to a check. 380 ms. | 20 ms |
| Stepper +/− | Numeral slides up or down 6 px with a crossfade, 140 ms | none |
| Rest ends | Cradle completes and the dot hops 4 px | 3 × 20 ms, 120 ms apart |
| Time segment change | Blocks cross out or restore in sequence, 40 ms stagger | none |
| Session complete | Mark fades up, then Dillan's sentence reveals (calm, 520 ms total) | 30 ms |
| Proposal applied | Tag morphs Waiting → Applied, border settles from Iron to hairline | none |
| Override saved | Sheet dismisses; nothing celebratory | none |
| Missed / skipped | **No animation, no vibration.** It's just a record. | none |
| Route change | 180 ms crossfade; the runner slides up from the bottom and down on exit | none |

## Sound

Off by default. Optional rest-end chime: a single soft wooden "tok," like a plate gently set down, played through the Web Audio API and only while the page is visible. The UI never promises sound while the screen is off, because browsers can't guarantee it. Sound must never be the only signal.

## Browser and platform surfaces

- **Tab title:** "Today · Dillan." During rest, the title shows the countdown ("1:12 · Rest · Dillan") so a desktop user can see it from another tab. Never health details in the title.
- **Favicon:** the mark as SVG with a `prefers-color-scheme` media query inside, plus PNG fallbacks.
- **Theme color:** `<meta name="theme-color">` Chalk `#F6F3EC`, Night Gym `#121210`, so installed-app chrome matches.
- **Web app manifest:** `display: standalone`, `start_url: /today`, Iron background, icons per `01-brand.md`. Shortcuts: "Start today's session," "Log a set."
- **Notifications:** in-app first (FR-11). Web push is offered only where `Notification` and `PushManager` exist and, on iOS, only after install. Body text is generic by default ("Your session is ready when you are"). Email is the opt-in fallback. A missed reminder is never followed up (S22).
- **Share:** session summaries use `navigator.share` where available, otherwise copy-to-clipboard. Nothing is shared with health details by default.
- **Wake lock:** `navigator.wakeLock.request('screen')` while the runner is visible, released on end or hidden. If it isn't available, nothing changes except the timer honesty banner.
- **Not in scope on the web:** lock-screen live activities, home-screen widgets, watch apps, background audio. If any of these is wanted later, it is a native project with its own brief.
