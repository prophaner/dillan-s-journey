# 01 · Brand

Version 2.0 (web-first) · October 15, 2026 · Owner: Luis Ramos · Design: UI/UX lead

## The name: Dillan

**Recommendation: the app is called Dillan.** The coach and the product share one name.

Why one name:

- **The relationship is the product.** People say "I train with my coach," not "I use my coaching platform." One name removes a layer of translation.
- **It's clear.** Searches for short English words in this category (Keel, Steady, Stead, Plumb) all turned up existing fitness or wellness apps. "Dillan" (with this spelling) had no conflict in Health & Fitness when checked on Oct 15, 2026. A trademark search is still needed before launch.
- **It's warm without being cute.** It reads as a person, which fits the brief: caring, firm, respectful.

Usage:

| Context | Write it as |
|---|---|
| Browser tab title | **Dillan** (plus the screen name, e.g. "Today · Dillan") |
| Home-screen label, if installed | **Dillan** |
| Domain / URL style | short and lowercase, e.g. `dillan.app` (placeholder; not yet checked or owned) |
| In copy, the coach | **Dillan** ("Dillan suggests…") |
| In copy, the app | **the app** or **Dillan** (never "Dillan app" in UI) |
| Wordmark | lowercase **dillan** (logo only, never in body text) |
| Always disclose | "Your gym coach · AI" under Dillan's name in the chat header |

Dillan is always presented as an AI coach. He never implies a human is watching in real time.

## The idea: The Spot

In a gym, a **spotter** stands close enough to catch the bar but never touches it unless you need help. You do the lift. They have your back.

That is Dillan's whole personality, and it is the logo.

**The mark is a dot held just above a cradle.**

- The **dot** (Spot orange) is you: your effort, your session, the thing worth protecting.
- The **cradle** (Iron) is Dillan: steady, open, underneath you.
- The **gap** between them is the respect: close enough to catch you, never in your way.

At a glance it also reads as a calm, slightly smiling face. That's intentional. The app should feel like someone who's glad you showed up.

**Brand line:** "Close enough to catch you. Never in your way."
**Short line (landing page, meta description, install prompt):** "A gym coach who has your back."

### What the brand is not

No flames, lightning bolts, skulls, neon green, black-and-red "beast mode," shredded torsos, streak fires, or trophies. No gradient-blob "AI" glow or sparkle icons. The category is loud. Dillan is the calm one in the room.

## Logo system

Files are in `/brand`.

| Asset | File | Use |
|---|---|---|
| Mark | `dillan-mark.svg` | Favicon (SVG), avatar, nav icon for the Dillan tab, small spaces |
| Wordmark | `dillan-wordmark.svg` / `-reversed.svg` | Landing page, sign-in, loading screen, coach workspace header |
| Lockup | `dillan-lockup.svg` | Website, social cards, documents |
| Icon | `app-icon.png` (Iron), `app-icon-light.png`, `app-icon-tinted.png` | Web app manifest icons (192/512, plus a maskable variant), `apple-touch-icon`, and bookmark icons. Not an App Store icon. |

For the web app manifest, export `app-icon.png` at 192×192 and 512×512, and a **maskable** version with the mark at 80% of the canvas on solid Iron, so Android's adaptive icon shapes never clip the cradle. The light and tinted variants are for marketing and dark/light favicon pairs only.

**Construction.** The mark lives on a 64-unit grid. The cradle is the lower half of a 19-unit-radius circle centered at (32, 31), stroked at 7 units with round caps. The dot is 7.5-unit radius at (32, 27). The wordmark is drawn as custom monoline geometric letters using the same round-capped stroke, so the mark and type feel like one object. The only color in the wordmark is the orange dot over the "i," which echoes the mark.

**Rules**

- Minimum size: mark 16 px; wordmark 64 px wide.
- Clear space: the dot's diameter on all sides.
- The dot is always Spot orange. The cradle is always Iron on light, Chalk on dark.
- Never rotate, outline, add gradients, add shadows, or separate the dot from the cradle (except in the rest-timer animation).
- Never place the mark on orange. The orange belongs to the dot.

## Color story: materials of a home gym

The palette comes from the room people actually train in: chalk, iron plates, oak plyo boxes, rubber floors, and one safety-orange detail. In the real world, safety orange marks the things that protect you, like life rings, buoys, and spotter arms. Here it does the same job.

| Name | Hex | Role |
|---|---|---|
| **Chalk** | `#F6F3EC` | Background. Warm, never clinical white. |
| **Paper** | `#FFFDF8` | Cards |
| **Oak** | `#EEE7DA` | Sunken surfaces, steppers, secondary buttons |
| **Iron** | `#1A1A18` | Text and "done" marks |
| **Graphite** | `#57544D` | Secondary text |
| **Spot** | `#FF5A1F` | The one action that matters on each screen. The brand dot. |
| **Steady** | `#276B4A` | Done, applied, confirmed |
| **Hold** | `#855610` | Waiting on your decision |

**Night Gym** (dark mode) uses `#121210` as the background, warm off-white text, and a slightly brighter Spot (`#FF6A30`). The session runner looks especially good in dark mode for early-morning or late-night training.

**The one-orange rule.** Each screen gets at most one orange-filled element: the primary action, or "today" on the course strip. If everything is urgent, nothing is.

**There is no red.** Missed sessions, skipped sets, and declined suggestions never turn red. Red is how other apps make people feel bad. Destructive actions (delete data) use plain Iron text on a confirmation dialog with the destructive option last; still no red.

## Typography: who's talking is visible

Dillan is a web app, so it ships its own typefaces. Three open-license web fonts, self-hosted in production (`woff2`, `font-display: swap`, preloaded for the two weights the first screen needs).

| Typeface | Role | Rule |
|---|---|---|
| **Newsreader** (serif, variable) | **Dillan's voice** | Any sentence Dillan writes is set in Newsreader at optical size 16–24. Nothing else is. |
| **Satoshi** (sans, 400/500/700) | Your data, UI, labels, human coach messages | Everything that is a fact, a control, or a human. |
| **M PLUS Rounded 1c** (700/800, tabular figures) | Numbers you lift and count | Reps, loads, timers, metrics. Friendly, not aggressive. |

This is the brand's most important rule, and it does real product work. The brief requires the app to separate measurements, user reports, coach statements, and AI inferences (FR-08, FR-12). Typography makes that separation visible at a glance: **if it's serif, Dillan said it. If it's sans, it's a record or a person.**

Sources and licenses: Satoshi is free under the Fontshare license (Indian Type Foundry); Newsreader and M PLUS Rounded 1c are on Google Fonts under the SIL Open Font License. The prototype loads them from the Fontshare and Google CDNs for convenience; production must self-host so the app works offline and the session runner never waits on a font server.

Fallback stacks (also in `tokens/tokens.css`):

```
--font-voice: "Newsreader", "Iowan Old Style", Georgia, serif;
--font-ui:    "Satoshi", system-ui, -apple-system, "Segoe UI", sans-serif;
--font-num:   "M PLUS Rounded 1c", "Satoshi", system-ui, sans-serif;
```

Numbers always get `font-variant-numeric: tabular-nums` so timers and columns don't jitter. Base size is 16 px (1 rem) and the scale is in rem, so browser zoom and OS text-size settings both work.

## Iconography

- **Lucide** icons only (ISC license), 1.75 px stroke at 18–22 px, `currentColor`, no filled variants. The prototype uses `lucide@0.469.0`; production should import icons individually, not the whole set. Mapping is in `03-screens.md`.
- The Dillan mark replaces a generic "chat bubble" or "sparkle" for the Dillan tab and avatar.
- No illustrated mascots. No 3D muscle renderings in the core flow. Exercise how-to media should be clean, real-person video or line drawings on Chalk once reviewed content is licensed (brief §16).

## Photography and illustration (marketing only)

Real home gyms, in daylight, with real equipment. Garages, spare rooms, and balconies. Show people mid-rest, chalking up, checking their phone, or smiling between sets, not grimacing at max effort. Bodies of every type and age. No before/after shots, ever.

## Brand voice in one line

**Dillan talks like a good coach who respects your time: short, warm, specific, and honest about what he doesn't know.** Full guide in `04-voice-and-copy.md`.
