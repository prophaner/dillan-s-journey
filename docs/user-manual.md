# Dillan — user manual

One section per screen. Status words you will see:

- **Saved on this device** — your entry is stored on your phone and will sync when you are online.
- **Synced** — the server has confirmed your entry.
- **Didn't sync** — the entry could not be sent. Tap Retry.
- **Not yet known** — there is no value yet. Shown as "—".

## Today

Today shows what is planned, lets you say how much time you have, and starts the session.

### What it shows

**The header.** The date, a "Demo data" label when your routine is the sample one, and the save word for everything waiting on this device: Saved on this device · N, Synced, or Didn't sync · N with **Retry**.

**Your plan's purpose.** If your plan has a purpose text, it sits at the top in Dillan's voice, with "From your plan · vN" under it. It is the text stored with your plan. Dillan's own sentence for the day comes later.

**The week strip.** Seven circles, Monday to Sunday. Today has a ring around it. A filled circle is a finished session. A half-filled circle is a session you shortened (Short or Priority only). A circle with a dot in it is a session you logged but did not finish. A plain circle is a day with nothing logged, or a day still to come.

The strip needs this week's sessions from the server. Until they load, or if they cannot load, every other day shows a dashed "—", which means Not yet known. Dillan never says "nothing logged" when he does not know. Under the strip you then see "Couldn't load this week." or, offline, "This week loads when you're online." On a phone the strip sits under the purpose text; on a desktop it sits at the top.

**The plan card.** Your routine's name and the words "est. times". Under them, the time choice: **Full**, **Short** and **Priority only**, each with its estimated minutes. Then one row per block: a dot (filled for a main block, a ring for an optional one, a marked dot for the priority block), the exercise names, sets × reps with the weight if there is one, and the block's minutes. The first main block carries a **Priority** tag. Blocks your choice leaves out are struck through, with "—" instead of minutes.

What each choice keeps:

- **Full** keeps every block.
- **Short** keeps the main blocks and leaves out the optional ones. If your plan has no main blocks, it keeps the first block.
- **Priority only** keeps only the first main block, the one tagged Priority, and leaves out the rest.

Your routine does not have a priority block of its own yet, so Dillan treats the first main block as the priority.

**The minutes are estimates.** Dillan counts about a minute of setup per exercise, 45 seconds per set, and the rest from your plan between sets (90 seconds when the plan does not say). In a superset he counts the transition between exercises as well (20 seconds when the plan does not say). The card says so: "Estimates include setup and rest. Your pace decides the real time." The session clock is what counts.

**Why this trade.** When you pick Short or Priority only, a line under the blocks explains it: "Keeps <blocks>, so the purpose stays: <your plan's purpose>. Leaves out <blocks>." If your plan has no purpose text, it reads "Keeps <blocks>, your main work." If there is nothing to leave out: "Nothing to leave out — this plan has no optional blocks."

**Resume card.** If you have a session open, the Start button is replaced by a card with an "In progress" tag, the routine name, **Resume session · N min in** and **Finish here**. The minutes come from the clock, so they are right after a screen lock or a reload (unverified on a phone). Finish here takes you straight to the Done screen.

**Waiting on you.** Reads "Nothing right now. Coach and Dillan proposals will show here, each with its status."

**Your goal.** Your first active goal, in your words, with "Progress —" and the Not yet known tag; progress against a goal is not measured here yet. If you have no goal: "No goal yet. Add one in your profile." If it cannot load: Not yet known, "Loads when you're online." A sample goal is marked "Demo data".

### What you can do

- **Pick Full, Short or Priority only.** Tap one. The rows update at once, and the button reads **Start N-min session** with the estimate for that choice. On Full it reads **Start session**.
- **Start.** The session is created on this device with your choice recorded, and you go to the Session screen. Only the kept blocks run; a left-out block never shows up in the session. Your full plan is not changed. On the Done screen a card headed "Short plan" or "Priority only plan" reads "Kept <blocks>. Left out <blocks> today." and "Your full plan vN is unchanged." You can start offline once your routine has loaded on this device at least once.
- Until Dillan has checked whether a session is already open, the Start button is greyed out. If this device cannot store the new session, a banner says "Couldn't start on this device. Private mode or full storage can block it. Try again."

While the plan loads you see grey placeholders. If it cannot load: "Couldn't load today's plan" with Try again. If you have no routine: "No routine yet. Add one in onboarding or your plan, and today's session shows up here."

On a desktop, at 1024 px and wider, Today has two columns: the plan on the left, Waiting on you and Your goal on the right, and the week strip above both. Under the Start button a line reads "Logging on a phone? Open Dillan there and tap Train. Your session follows your account." On a phone everything is one column and the Start button stays at the bottom of the screen (unverified on a phone).

A custom time, a "Why this is here" line per block, a check-in before you start and a missed-session card are not built yet.

## Train

Train is where you start a session, pick up one you left open, and see what you did recently.

### What it shows

**The save word in the header.** Next to the Train title sits the save word for everything waiting on this device, across all your sessions and notes: Saved on this device · N, Synced, or Didn't sync · N with **Retry**. Retry sends every change that failed again. When it reads Synced, nothing is waiting.

**A session in progress.** If you left a session open, it sits at the top with an "In progress" tag, the routine name, when you started, how many sets you have logged, and which exercise you were on. Next to the tag you see the save word for that session alone (Saved on this device, Synced, or Didn't sync with Retry).

**Your routine.** When nothing is in progress, you see your routine: its name, how many exercises and sets it has, the plan version, and one line per exercise (sets × reps, and the weight if the plan has one). Dillan uses your own approved routine. If you do not have one yet, he uses a sample routine and marks it "Demo data". Anything you log against the sample routine is marked the same way.

**Other ways to train.**
- *Today's session* takes you to Today, where you choose Full, Short or Priority only.
- *Pick a routine* — Comes later.
- *Log something I already did* — Comes later.

**Recent.** Your last five finished sessions, with the date, the number of sets, and a tag: Done, Partial, or Stopped early. Until you finish one, it says "No sessions yet". Recent needs a connection. If it cannot load, your sessions are safe; try again when you are online.

### What you can do

- **Start session.** Starts your routine and opens the Session screen. The session is created on this device first, so you can start it offline once your routine has loaded on this device at least once.
- **Resume.** Opens the session you left. You can only have one session open at a time, so Start session will not create a second one.
- **Finish here.** Ends the open session and takes you straight to the Done screen so you can save it.

If your routine cannot load and there is no copy on this device, you see "Couldn't load your routine" with Try again. If you have no routine at all, you see "No routine yet". Add one in onboarding or your plan and it shows up here.

## Session

The Session screen runs one exercise at a time: log a set, rest, log the next one. When every set is done, or when you end early, it shows the Done screen.

### The set screen

At the top: an **End** button, your routine name, and the time since you started. Below that, a thin bar with one segment per exercise shows where you are. Then the exercise: a Main or Optional tag, "Exercise N of M" (or "Round N of M" in a superset), the save word for this session, and the name with the plan line (sets × reps, and the weight if there is one). Until you log the first set of an exercise, a **Swap** button sits next to its name. A row of set pips shows which sets are done and which one is next; under it, once a set is done, "Tap a done set to change it."

**Reps** and **Load** have big minus and plus buttons. Reps move by 1. Load moves by 2.5 and takes decimals. Tap the number itself to type it. Under each number you see "last time N" when Dillan has a previous value for that exercise, or "—" when he does not. Reps and load start from the plan; if the plan has no value, they start from what you logged last time.

If the exercise has no weight, the Load row says "No weight · bodyweight" with an **Add weight** button.

**Reps left in the tank** is optional. It asks how many more good reps you could have done: 0 means none left, 4+ means four or more. Tap a number to pick it; tap it again to clear it.

**Log set** records the set with the numbers on screen. You see "Set N logged · saved on this device" with **Undo** for about six seconds. A second tap within one second is ignored, so a nervous thumb does not log the set twice. After the last set of an exercise, Dillan moves you to the next one and fills in its numbers.

**Undo** removes the set you just logged, cancels the rest, and takes you back to that exercise. Undo runs once, even if you tap it twice. While an undo is still being stored on this device, Log set is greyed out, so a new set cannot land on top of one that is going away. After the toast goes away you can still change the set; see Changing a set below.

**Pause** is not available yet. The session clock keeps running until you end the session.

**Something feels off** sits under Log set. It opens a sheet where you can stop the exercise or end the session, and leave a dated note. See Something feels off below.

**End** (top left) ends the session in one tap. There is no confirmation. You go to the Done screen, where you can finish and save the session or discard it. Nothing you logged is lost unless you choose Discard.

When you type a number, the Log set button moves up to stay above the keyboard. The exercise card does not shrink to make room, so on a small screen you may need to scroll (unverified on a phone).

Dillan asks your browser to keep the screen awake during a session. Not every browser allows this (unverified on a phone).

### Something feels off

The **Something feels off** button is on every training screen: while you log a set, during rest, inside a superset round, and while you are changing a set. One tap opens the sheet "Stop or adjust. Your call." with the line "Your sets so far are saved." What you pick here happens at once; there is no confirmation.

- **Stop this exercise** ("Skip ahead. Sets you've done stay saved.") drops the sets you have not done yet for this exercise and keeps the ones you did. Any rest is cancelled and the next exercise starts. On the Done screen the exercise shows as Partial or Skipped. This row is not shown once every set in the session is done.
- **End the session** ("Stops here and keeps everything you logged.") ends it as stopped and takes you to the Done screen. The headline reads "Stopping was the right call. Your sets are saved."

During rest, the sheet is about the exercise you just did, not the one coming next; the note names that exercise.
- **Try a gentler option** is not shown yet. It appears only once there are reviewed alternatives for the exercise, and none are stored yet.
- **Keep going** closes the sheet and changes nothing. Nothing is saved.

**Where?** is optional. Pick an area (Shoulder, Elbow, Wrist, Neck, Back, Hip, Knee, Ankle, Other), then Left, Right or Both. Tap a chip again to clear it. **Note** is optional, up to 140 characters, with the prompt "What did you notice?".

When you tap Stop this exercise or End the session, the area, side and note are saved as a dated note on that exercise: a limitation dated with today's date where you are, linked to the exercise and to this session, and marked as coming from a session. It is not a diagnosis. The note goes through the same queue as your sets, so it saves offline and syncs later. Two fast taps make one note. If the note could not be stored on this device, the storage banner adds "Your note wasn't saved."; tap **Try again**.

The sheet also carries a message about pain: "Saved as a dated note on <exercise>, not a diagnosis. If pain is sharp, getting worse, or comes with numbness or swelling, stop and get it checked by a clinician." In the app this message is marked "Placeholder wording · to be reviewed before release"; the final wording comes before release.

On the Done screen, a **Noted today** card lists each note from this session: the exercise, and the area and side if you picked them, each with its own save word (Saved on this device, Synced, or Didn't sync with Retry). Under the list: "A dated note, not a diagnosis." The chips and the card fit a narrow screen without sideways scrolling (unverified on a phone).

### Changing a set

Tap a done pip to reopen that set. The chip reads "Changing set N", and Reps, Load and Reps left in the tank show what you logged for it. Change what you need and tap **Save change**. You see "Set N changed · saved on this device". A change corrects the same set; it does not add a new one, and there is no Undo on a change. To put it back, tap the pip again and change it again. The corrected numbers become the starting point for the next set of that exercise. **Cancel** sits under Save change, one button above the other, and closes the set as it was.

You can change a set only while you are still on its exercise and not resting. Once Dillan moves you to the next exercise, the sets of the one before are no longer on screen; to change a set during rest, Skip the rest first. While you are changing a set, Log set and Swap are hidden. If the change could not be stored on this device, the storage banner appears; tap **Try again**. On a small screen the numbers may sit under the keyboard while you type (unverified on a phone).

### Swapping an exercise

**Swap** opens a sheet, "Swap <exercise>", with the exercises you can do instead: the shared library and the ones you added. Tap one and it takes the exercise's place for this session only. Your plan stays the same. Under the name you see "Swapped for <planned exercise> · this session only", and the Done screen says the same. Reps and load start from what you logged last time for the new exercise; if there is no last time, they start from the plan.

The alternatives are not yet matched to your equipment or limitations; the sheet says so. To go back, open Swap again and tap **Back to <planned exercise>**. Once a set of the exercise is logged, Swap goes away; the swap is settled for that exercise.

The list needs a connection the first time; after that a copy stays on this device. Offline without a copy you see "Exercises load once you're online." If the list cannot load, "Couldn't load exercises" with Try again. If there is nothing else to pick, "No other exercises yet". The list scrolls inside the sheet (unverified on a phone).

### Supersets

When your routine pairs exercises in a superset, the Session screen runs them as rounds: A, then B, then a longer rest, then the next round. Instead of "Exercise N of M" you see a Superset tag and "Round N of M". A line spells out the pattern, for example "Go A → B · rest 20s between · 75s after the round." Under it, a list shows each exercise in the round with its letter, how many of its sets are done, and the reps. The one you are on is outlined. A finished one shows Done instead of the count.

The plan line reads rounds instead of sets. Log set works the same. After A you rest for the transition rest: 20 seconds unless your routine says otherwise. After the last exercise in the round you rest for the round rest: 90 seconds unless the routine says otherwise. During rest, Up next reads "Round N · <exercise>". −15s, +15s and Skip work as on any rest. The numbers you type for A and for B are kept apart, so moving between them does not mix them up. Undo and Changing a set work the same inside a round.

### Rest

After each set except the very last one, the screen switches to a rest timer: a ring that empties, the time left in big numbers, and "of M:SS · your rest, your call." The rest length comes from your routine; if the routine does not say, it is 90 seconds.

- **−15s** and **+15s** change this rest. It will not go below 15 seconds.
- **Skip** ends the rest now.
- **Up next** tells you which set and exercise come next. In a superset it names the round and the exercise.

The timer counts from the clock, not from ticks, so it stays correct if your screen locks. There is no sound while the screen is off. If the rest ran out while your screen was locked, you come back to the next set with no message about it. On a laptop, the browser tab title shows the countdown.

### If the device cannot save

If this browser is not keeping data, you see a banner: "This browser isn't keeping data between visits (private mode or storage full)." While nothing is waiting, it adds "Logging still works while this tab is open." If a set or an undo could not be stored, the banner says "That set wasn't logged." or "That undo didn't go through." Tap **Try again** to send it again. A set that was queued but could not be stored on this device still shows as logged, so it is never logged twice. If you close the tab at that point, the queued set comes back when you reopen the session, and it shows once; an undo or change you had queued is applied to it.

### Save words on the Session screen

- **Saved on this device · N** — N changes from this session are waiting to sync. Dillan sends them when you are online, when you come back to the tab, and every 15 seconds in between.
- **Synced** — every set in this session has been confirmed by the server.
- **Didn't sync · N** — the server refused or the retries ran out. Tap **Retry**.

### The Done screen

When the session ends you see one of three headlines:

- "Every set, done. Good, steady work." — every planned set was logged.
- "Logged as you did it. What you did still counts." — you ended with some sets left.
- "Stopping was the right call. Your sets are saved." — you stopped from the Something feels off sheet.

If you started the session from Today as Short or Priority only, a card headed "Short plan" or "Priority only plan" comes first: "Kept <blocks>. Left out <blocks> today." and "Your full plan vN is unchanged." Below it: each exercise with Done, "Partial · x of y sets", or Skipped. If you left a note from the Something feels off sheet, the **Noted today** card follows; see Something feels off above. Then the time in minutes, and the number of sets logged, entered by you.

**How did it feel?** is optional: Easy, Solid, Hard, or Too much. Tap again to clear. **Note** is optional, up to 1000 characters.

**Finish and save** finishes the session, removes the working copy from this device, and returns you to Train. It saves once, even if you tap it twice or come back after a reload. Under it sits **Discard session**; see Discarding a session below. Under the buttons you see the footer: "N sets synced · nothing waiting", "N changes saved on this device · will sync when you're online", or "Didn't sync · N" with **Retry**. You can save while offline; the finish syncs later with the rest.

### Discarding a session

On the Done screen, **Discard session** throws the session away instead of saving it, in one tap. There is no question first. It removes the session and every set in it, shows "Session discarded" with **Undo**, and returns you to Train. Once Finish and save has been tapped, Discard session is no longer offered.

**Undo** is offered for about six seconds. The discard itself waits about eight seconds on this device before it is sent, so an Undo tapped while the toast is up takes it back: the session is put back as it was and reopens on the Done screen, with every set still in it. If the discard has already left this device, the session stays discarded and you see "Discard is being sent" or "Already discarded on the server". If this browser could not put the session back, the storage banner appears with "This browser isn't keeping data between visits (private mode or storage full)."

Discard works offline; the removal is queued and sent with the rest of your changes once the eight seconds are up. While a discard is waiting to be stored, Finish and save is greyed out, so a session is never both saved and removed.

### If a session is not on this device

Open sessions live on the device where you started them. If you open a session link on another device, or after the working copy has been removed, you see "This session isn't on this device" with a button to Train. Finished sessions are listed on Train.

### Signing out

Signing out clears this device's copy: open sessions, the cached routine, and any onboarding draft. If changes are still waiting to sync, Dillan asks first: "N items saved on this device haven't synced yet. Sign out anyway? They'll be removed from this device." Sync first if you can.

## Progress

Progress has three views, picked from a switch at the top: **Goals**, **Body** and **History**. Next to the Progress title sits the save word for everything waiting on this device: Saved on this device · N, Synced, or Didn't sync · N with **Retry**. If your plan has a purpose text, it sits under the title with "From your plan · vN".

### Goals

One card per active goal, in priority order, then the Steady weeks card. On a desktop the cards sit in two columns.

**A goal card**, top to bottom:

- A **Level not yet known** tag. Whether a goal is set to Improve, Maintain or Defer is not stored yet, so Dillan does not guess.
- "Goal N of M".
- The goal in your words, or its title.
- A big number: your latest measurement for what the goal tracks (for example weight), in the goal's unit, with its date. If there is no entry yet, you see "—" with the Not yet known tag.
- "from <value> on <date> · target <value>". The starting value is the entry your goal points to, or your first entry when you have more than one; otherwise "—". Target is "—" when the goal has none.
- A chart, once there is at least one entry: a dot per entry, a line between entries, a dotted line labelled "no entry · N wk" across a gap longer than three weeks, and a dashed line labelled "target N" when the goal has a target.
- Without entries, a line says "No <metric> entries yet.", or "How this goal is measured isn't set yet.", or "Measurements load when you're online."
- A sample goal is marked "Demo data".

If the goals cannot load: "Couldn't load your goals" with Try again. If you have none: "No goals yet. Goals you add in onboarding or your profile show here."

**Steady weeks.** A card with a "Habit" tag and your weekly target ("3 sessions a week", or "Weekly target not set"). The heading reads **Steady weeks N of 7**: the last eight weeks, with the current week shown as "now" and never counted against you. A week is steady when the sessions you logged in it reach your weekly target; finished, shortened and unfinished sessions all count. If your weekly target is not set, the count shows Not yet known, and the dots still show what happened.

Under the heading, one column per week, labelled with the Monday's date. Each dot is a session: a filled dot is Done, a half-filled dot is Shortened, a dot with a dot inside is Logged, not finished. Empty rings fill the column up to your target. If the sessions cannot load, the heading shows Not yet known and a line reads "Couldn't load your sessions." or, offline, "Your weeks load when you're online."

### Body

**Add a measurement** sits at the top; see Adding a measurement below. Under it, one card per thing you measure: Weight, Height, Waist, Hips, Arm / biceps, Thigh, or Other with the name you gave it. Arm and thigh are kept by side: a Left card and a Right card, never mixed. Each card shows your latest value in the unit from your profile (lb or kg, in or cm) and its date. If you entered it in another unit, a line says "Entered as 32.5 in". If the entry is still waiting on this device, its save word (Saved on this device or Didn't sync) takes the place of the date. With more than one entry, the card has the same chart as a goal card. On a desktop the cards sit in two columns.

**BMI** has its own card with a **derived** tag. It is worked out from your latest weight and height, and shows "—" with Not yet known until both exist. The card says: "Worked out from your latest weight and height. It isn't a full picture of fitness."

If you have no measurements: "No measurements yet. Add one when you want to track it. Nothing here is required." If they cannot load and none are on this device: "Couldn't load measurements. Anything you add now is saved on this device." with Try again.

### Adding a measurement

The sheet is called "Add a measurement".

1. Pick what you are measuring. For **Other**, type what it is under "What you're measuring" (for example Calf). For **Arm / biceps** and **Thigh**, pick **Left** or **Right**.
2. Type the **Value**. Decimals are fine, and a comma works as a decimal point. It has to be a number above 0 and below 2000; otherwise you see "Enter a number, like 32.5." Pick the unit next to it: lb or kg for weight, in or cm for the rest. The unit starts from your profile.
3. Under the value you see "Last: <value> <unit> · <date>" for that measurement and side, or "Last: — Not yet known".
4. **Method** is optional: Scale, Tape measure, or Other. Tap again to clear. **Conditions** is optional, up to 120 characters, for example "Morning, before food".
5. **Save** is greyed out until there is a value (and a name, for Other). It saves once per tap. The entry is dated now, goes through the same queue as your sets, works offline, and shows in Body right away with its save word.

Under Save: "Saved as you typed it. Units convert only on screen." Dillan keeps the number and unit you entered; switching units in your profile changes only what is shown. If this device cannot store the entry, a banner says "This browser isn't keeping data between visits (private mode or storage full). That entry wasn't saved."

### History

Two cards, both marked **Coming later**. Reviews: "Past goal reviews will appear here." Decisions: "Proposals and what you decided will appear here."

## Dillan
Coming later.

## Plan
Coming later.

## Profile
This section is not written yet.

## Settings
This section is not written yet.

## Coaching
Coming later.
