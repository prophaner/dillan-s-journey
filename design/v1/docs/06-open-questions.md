# 06 · Remaining product questions, ranked

"Blocking" means engineering should not finish that area without an answer. Everything else was resolved with a labeled default (see `01-interpretation-and-assumptions.md`) and can ship as designed.

## Blocking before build completes

| # | Question | Default in the design | Why it matters |
|---|---|---|---|
| Q1 | **TV runtime:** is V1 a hosted web app inside a Fire TV WebView (Vega/Android) or a packaged web app? Who ships the shell? | Hosted web app in a thin WebView shell that forwards D-pad/Back ([Amazon hybrid apps](https://developer.amazon.com/docs/fire-tablets/hybrid-apps-overview.html), [Vega WebView](https://developer.amazon.com/docs/vega/0.24/develop-your-app-with-webview)) | Affects Back-at-root handling, key codes, font loading, and how the TV obtains a stable `deviceId`. |
| Q2 | **Back on Home exits the app — should the TV lock on exit?** | Stay signed in; auto-lock after 15 min | Privacy on shared TVs vs. friction for a single-user household. Cheap to make a Profile toggle. |
| Q3 | **Does an `ended_early` session count toward the weekly goal of three?** | Yes (the user trained) | Changes Home numbers and the meaning of "consistency". |
| Q4 | **Can one account have both an email and an SMS contact in V1?** | Data model yes; UI exposes only the registration contact | Affects the "adding a second way to reach an existing account" branch, which is currently a merge prompt. |
| Q5 | **Companion publish contract:** will the iPhone app publish an explicit Watch-lost state and a heartbeat? | Yes, specified in handoff §7 | Without it the web cannot distinguish stale from live, which breaks the core truthfulness promise. |

## Should be answered before launch (not blocking the build)

| # | Question | Default |
|---|---|---|
| Q6 | Does rest time count as "active" and get zone attribution? | Yes; labeled "Active (excludes pauses)" |
| Q7 | Should the phone be allowed to **start** a workout that then shows on the TV, or only control one started on the TV? | Phone can start; TV shows "Workout running · Back to workout" and joins |
| Q8 | Retention: how long do we keep heart-rate readings vs. only per-session zone totals? | Store zone totals + unknown time per session; raw readings discarded after the session |
| Q9 | Minimum/maximum zone boundaries and whether to prefill from age formula | 60–220 bounds; placeholders labeled as generic, never age-based |
| Q10 | Should Skip rest be available on the TV via Play/Pause key as well as OK? | OK only; Play/Pause = Pause/Resume |
| Q11 | Should a locked profile tile show the last-trained date ("Luis · 2 days ago")? | No — name only, to keep "names only" literally true |

## Reversible aesthetic choices (decided, no answer needed)

- Spot orange used for progress, selection and TV primary CTA only; phone primary buttons are Iron.
- No red anywhere; attention states use Hold amber; "Not saved" is amber, not red.
- Zone 5 is deep clay, not alarm red; the ramp is cool→warm.
- TV type floor is 20 px; BPM is 168 px.
- Satoshi with Inter/system fallback.
- Hollow vs solid dot for ended-early vs completed sessions.
