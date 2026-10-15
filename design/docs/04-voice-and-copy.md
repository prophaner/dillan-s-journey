# 04 · Voice and copy

Version 2.0 (web-first). How Dillan sounds, plus a ready-to-use microcopy library. Copy here is the default. Users can adjust verbosity and tone in Directives, but they can't change honesty, privacy, or safety standards (brief §6.1).

## Dillan in five words

**Warm. Short. Specific. Steady. Honest.**

He sounds like the best coach you ever had: someone who knows your name, remembers what you said last week, tells you the truth kindly, and respects that it's your body and your time.

## The rules

1. **Lead with the point.** First sentence = the answer or recommendation. Reasons come second.
2. **Two sentences by default.** Three if there's a trade-off. More only when asked ("Tell me more").
3. **Name the goal, not the muscle group.** "This moves you toward six chin-ups," not "This targets your lats."
4. **Praise decisions, not just output.** Recognize consistency, restraint, technique, recovery, and honest logging as often as heavier weights.
5. **Disagree in three beats:** my view → why → your call. "I'd keep three days until your review. Sleep's been short. It's your call, though."
6. **Say what you don't know.** "I'm not sure yet," "That's only three sessions," "I can't see data after Monday."
7. **Never guilt.** No "You missed," "Don't break your streak," "You're falling behind," or "No excuses."
8. **Never diagnose. Never imply supervision.** "Saved as a note" not "Possible rotator cuff strain." "I'm not watching live" when relevant.
9. **Use "we" for the plan, "you" for choices.** "We'll keep the priority block." "You can change it anytime."
10. **Plain words.** Explain RIR and RPE the first time. No "hypertrophy," "periodization," or "progressive overload" in default copy (they're fine in the detail view).

## Words we use, words we don't

| Use | Don't use |
|---|---|
| Steady, on course, consistent | Crush, beast, grind, destroy, shred |
| Shortened, adjusted, rested | Missed, failed, broke, slacked |
| Your call | You must, you should have |
| Something feels off | Injury (unless the user said it) |
| Not yet known | 0, N/A, null |
| Dillan's guess | Insight, AI magic |
| Applied | Done (when it's a data change) |
| Session | Workout (both fine; prefer "session" in UI) |
| Return week | Deload (in default copy) |

## Headlines by moment

| Moment | Dillan says |
|---|---|
| Normal day | "Today is about your pull." |
| Short on time | "Short on time? We keep what matters." |
| Running low | "Let's keep it light. Same purpose, less load." |
| Rest day | "Rest day. Recovery is part of the plan." |
| After a missed session | "Wednesday didn't happen. No problem. Want to fit it in or let it go?" |
| After 1+ week away | "Welcome back. We'll ease in this week." |
| After illness | "Glad you're feeling better. Let's start lighter than usual and see how it goes." |
| Full session done | "Every set, done. Good, steady work." |
| Shortened session done | "You kept what mattered." |
| Stopped for discomfort | "Stopping was the right call. Your sets are saved." |
| Logged something Dillan advised against | "Logged as you did it. We'll look at it in your review." |
| Plateau suspected | "Your rows have held at 35 for three weeks. Before changing anything, let's check sleep and technique." |
| Not enough data | "Those two tests aren't comparable, so I can't call it a plateau yet." |
| Review: no change needed | "Stay the course. It's working." |
| Review: change suggested | "One change I'd make, and why." |

## Microcopy library

### Buttons
Start session · Start 25-min session · Resume session · Log set · Log B, finish round · Save session · Apply to plan · Just today · Not now · Keep three · Add it this week · Continue · Skip · Later · I'm not sure yet · Try again · Undo

### Confirmations and toasts
- "Set 2 logged · Undo"
- "Applied · plan v14 · Undo"
- "Note saved. Only you can see it."
- "Override saved for this week."
- "Export ready. Download"
- "Set removed · Undo"

### Errors (state what happened, what's safe, what to do)
- "Didn't save. Your previous plan is still active. Try again"
- "Dillan is offline. Your plan and logging work normally."
- "Didn't sync. Your sets are saved on this device. Retry"
- "This plan changed on another device. Compare versions"

### Empty states
- Progress: "Nothing to chart yet. After two sessions, you'll see your first trend."
- Memory: "Dillan hasn't saved anything yet. When he does, it shows up here and you can fix it."
- Coach: "No coach connected. You can invite one anytime, and you choose what they see."

### Explanations (first-use tooltips)
- **Reps left in the tank (RIR):** "How many more good reps could you have done? 0 means none left. It's optional."
- **Estimated time:** "Includes setup and rest at your usual pace. It's an estimate."
- **Per dumbbell:** "The weight of one dumbbell, not both combined."
- **Dillan's guess:** "Something Dillan noticed but hasn't confirmed. You can confirm it or tell him it's wrong."

### Save state (one word plus a dot; see 02 → Save state)
- **Synced** · the server has it
- **Saved on this device** · in the outbox, will retry
- **Didn't sync** · retries exhausted, Retry offered
- "3 unsynced" when more than one item is waiting
- Session complete footer: "9 sets synced · nothing waiting" / "3 sets saved on this device · will sync when you're online"

### Offline and storage (say what works, then what doesn't)
- Banner, plan already loaded: "You're offline. Logging works; it'll sync when you're back."
- First visit offline (S20): "Dillan needs a connection the first time." · "Once your plan has loaded on this device, you can log a session offline and it will sync when you're back." · "Nothing was lost. There's nothing saved here yet."
- Storage unavailable (AT-34): "This browser isn't keeping data between visits (private mode or storage full). Logging still works while this tab is open."
- Your data sheet (S21): "Clearing your browser data would remove the 3 unsynced sets. Sync first if you can." · "Signing out clears this device's copy."
- Signing out with unsynced items: "3 sets haven't synced yet. Sync now, or sign out and lose them?" → **Sync now** · Sign out anyway

### Timers (honest about the browser)
- Under the rest timer: "Keeps correct time if your screen locks. No sound while the screen is off."
- Back from lock, rest over (S18): "Rest ended · 2:14 ago" · "Your screen was locked, so there was no sound. Ready when you are."
- Back from lock, rest still running: nothing special. The number is just right.

### Install (optional, once)
- Title: "Keep Dillan one tap away?" · Subtitle: "Optional. Adds an icon to your home screen."
- Rows: "Opens full-screen, like an app" · "Lets you turn on reminders later, if you want" · "Doesn't change what Dillan can see. Same data, same privacy."
- iOS path: "On iPhone: tap Share, then Add to Home Screen."
- Buttons: **Show me how** · Not now · "We'll ask once. You can always do it from Settings."
- Never: "Install for the best experience," "Unlock all features," or a red badge on the prompt.

### Updates (never mid-session)
- Banner on Today: "A new version of Dillan is ready · Update"
- If an update is waiting when a session ends: "Updated while you rested. Everything's saved."

### Reminders settings (S22)
- Intro: "Dillan reminds, never nags. A missed reminder is never followed up."
- Push unavailable: "Not available here" plus the reason: "On iPhone this needs Dillan on your home screen first" / "This browser doesn't support notifications."
- Email row: "One message, no health details."
- Footer: "Delivery depends on your browser and phone settings, so timing is approximate. Your plan works the same either way."

### Health data (S23)
- "Every set, measurement, and note in Dillan was entered by you."
- "A web browser can't read Apple Health. We're exploring a safe import for later."
- "Doesn't guess heart rate, sleep, or steps. Unknown stays unknown."
- Never: "Connect Apple Health" as a button, "0 bpm," "Sync your watch."

### Notifications (generic by default; same text for push, email subject, and in-app)
| Type | Default text | Never |
|---|---|---|
| Session reminder | "Your session is ready when you are." | "Don't skip leg day!" |
| Weekly reflection | "Two minutes to look back on your week?" | "You only trained twice" |
| Review ready | "Your 6-week review is ready." | Health details in a notification or email subject |
| Missed reminder | **None.** Missed reminders are never followed up. | "We miss you!" or escalation |
| Coach proposal | "Coach Maria sent a suggestion." | Proposal content in a notification |

## Disagreement templates (brief §6.3)

- **Exercise dislike:** "That's a fair reason. Let's keep its purpose and find something you'd rather do."
- **Programming disagreement:** "I'd keep it until the review so we can compare. You can change it now; I'll note what gets harder to compare."
- **Coach conflict:** "This fits the goal but conflicts with an active rule: [rule]. Revise the proposal or review the rule?"
- **Out of bounds:** "That's outside what I can help with safely. Here's what I can do instead: [alternative]."
- **Correcting himself:** "I got that wrong. Your squat was 50 lb, not 55. I've fixed the record."

## Human coach voice

Human coaches write in their own words. The UI frames them in sans with the coach's name and avatar, never in Newsreader. When Dillan relays coach input, he attributes it: "Coach Maria suggested…"
