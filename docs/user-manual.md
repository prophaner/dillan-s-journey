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
- **Short** keeps the required and priority blocks and leaves out the optional ones. If your plan has only optional blocks, it keeps the first block.
- **Priority only** keeps only the block marked Priority, and leaves out the rest.

You mark the priority block in the Plan editor. If no block is marked, Dillan treats the first required block as the priority.

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

At the top: an **End** button, your routine name, and the time since you started. Below that, a thin bar with one segment per exercise shows where you are. Then the exercise: a Main, Priority or Optional tag, "Exercise N of M" (or "Round N of M" in a superset), the save word for this session, and the name with the plan line (sets × reps, and the weight if there is one). Until you log the first set of an exercise, a **Swap** button sits next to its name. A row of set pips shows which sets are done and which one is next; under it, once a set is done, "Tap a done set to change it."

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

- The goal's level this period: an **Improve**, **Maintain** or **Defer** tag, set on the Plan screen. Until you set one, the tag reads **Level not yet known**; Dillan does not guess.
- "Goal N of M".
- The goal in your words, or its title.
- A big number: your latest measurement for what the goal tracks (for example weight), in the goal's unit, with its date. If there is no entry yet, you see "—" with the Not yet known tag.
- "from <value> on <date> · target <value>". The starting value is the entry your goal points to, or your first entry when you have more than one; otherwise "—". Target is "—" when the goal has none.
- A chart, once there is at least one entry: a dot per entry, a line between entries, a dotted line labelled "no entry · N wk" across a gap longer than three weeks, and a dashed line labelled "target N" when the goal has a target.
- Without entries, a line says "No <metric> entries yet.", or "How this goal is measured isn't set yet.", or "Measurements load when you're online."
- A sample goal is marked "Demo data".

If the goals cannot load: "Couldn't load your goals" with Try again. If you have none: "No goals yet. Goals you add in onboarding or your profile show here."

**Steady weeks.** A card with a "Habit" tag and your weekly target ("3 sessions a week", or "Weekly target not set"). The heading reads **Steady weeks N of M**: the last eight weeks, with the current week shown as "now" and never counted against you. Weeks before your first session do not count either, so M grows as you go, up to 7. A week is steady when the sessions you logged in it reach your weekly target; finished, shortened and unfinished sessions all count. If your weekly target is not set, or you have no finished session yet, the count shows Not yet known, and the dots still show what happened.

Under the heading, one column per week, labelled with the Monday's date. Each dot is a session: a filled dot is Done, a half-filled dot is Shortened, a dot with a dot inside is Logged, not finished. Empty rings fill the column up to your target. If the sessions cannot load, the heading shows Not yet known and a line reads "Couldn't load your sessions." or, offline, "Your weeks load when you're online."

### Body

**Add a measurement** sits at the top; see Adding a measurement below. Under it, one card per thing you measure: Weight, Height, Waist, Hips, Arm / biceps, Thigh, or Other with the name you gave it. Arm and thigh are kept by side: a Left card and a Right card, never mixed. Each card shows your latest value in the unit from your profile (lb or kg, in or cm) and its date. If you entered it in another unit, a line says "Entered as 32.5 in". If the entry is still waiting on this device, its save word (Saved on this device or Didn't sync) takes the place of the date. With more than one entry, the card has the same chart as a goal card. On a desktop the cards sit in two columns.

**BMI** has its own card with a **Derived** tag and the line "kg / m² · v1", which names the formula. It is worked out from your latest weight and height, and shows "—" with Not yet known until both exist. The card says: "Worked out from your latest weight and height. It isn't a full picture of fitness."

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

Plan shows the routine you train on, its versions, and the level you have set for each goal this period. From here you open the routine editor and a detail page for each exercise.

### What it shows

**The header.** The Plan title and the save word for everything waiting on this device: Saved on this device · N, Synced, or Didn't sync · N with **Retry**.

**Your routine.** A card with an **In use** tag, "Version N", and a "Demo data" label when the routine is the sample one. Under the name: how many blocks it has and "about N min (estimate)" for the full session. Then one row per block: a dot (filled for a required block, a ring for an optional one, a marked dot for the priority block), the exercise names, and a line that reads Required, Priority or Optional, with "superset · N rounds" when the block is a superset. Under the list sits **Edit routine**.

While the routine loads you see grey placeholders. If it cannot load: "Couldn't load your routine" with Try again. If you have none: "No routine yet. Add one in onboarding and it shows here."

**How this plan works.** Your plan's purpose text in Dillan's voice, with "From your plan · vN" under it. If your plan has none: Not yet known, "Why this plan is built this way isn't written down yet."

**Exercises in this routine.** One row per exercise. Tap one to open its detail page; see Exercise detail below. An exercise you added by name in the editor joins this list once that save has synced, because the server is what matches the name to the library.

**Versions.** Newest first: vN with the date it was made, an **In use** tag on the version your sessions use, and a **Locked** tag on every version the server has stored. A locked version never changes again. A save that is still on this device sits at the top as vN+1 with its own save word. Under the list: "Saving an edit makes a new version. Sessions you've done keep the version they used." If the versions cannot load: "Couldn't load versions." or, offline, "Versions load when you're online."

**Goals · this period.** One card per active goal, in your words, with three chips: **Improve**, **Maintain** and **Defer**.

- **Improve** — this goal gets the work this period.
- **Maintain** — hold where you are; keep it, do not push it.
- **Defer** — set aside for now. It stays a goal.

Until you pick one, the card reads "Level not yet set." The level you pick also shows as a tag on the goal's card in Progress. Dillan does not plan around the level yet; it is a record of your choice. A sample goal is marked "Demo data". If the goals cannot load: "Couldn't load your goals" with Try again. If you have none: "No goals yet. Goals you add in onboarding show here."

### What you can do

- **Set a goal's level.** Tap Improve, Maintain or Defer. It saves at once, through the same queue as your sets, and works offline. The card shows its own save word (Saved on this device, or Didn't sync with Retry) until the server confirms. Tap another chip to change your mind; only the last choice is sent. If this device cannot store it: "Couldn't save on this device. Nothing changed." If the same goal was changed on another device first, the change shows Didn't sync.
- **Edit routine.** Opens the editor; see Editing your routine below.
- **Open an exercise.** Tap its row, or its name inside the editor.

On a desktop, at 1024 px and wider, Plan has two columns: the routine on the left, Versions and Goals on the right. On a phone everything is one column (unverified on a phone).

### Editing your routine

The editor is headed "Editing <routine name>" with a **Draft of vN+1** tag. A banner reads "Saving creates version N+1. Sessions you've already done keep version N exactly as it was." Every change is kept as a draft on this device as you go, so a reload, a locked screen or going offline loses nothing (unverified on a phone). The draft belongs to the version you started from; if that version changes, the draft is set aside. If this browser is not keeping data, a banner says "This browser isn't keeping data between visits (private mode or storage full). Your edits stay while this tab is open."

The routine's name and purpose text cannot be changed here.

**Blocks.** Each block is a card headed "Block N", with "· Superset" when it is one. Three chips set what the block is for:

- **Required** — runs in Full and Short.
- **Priority** — the one block Today keeps for Priority only. There can be only one, so marking a block Priority turns the previous one back to Required. If no block is marked, Today keeps the first required block.
- **Optional** — left out in Short and Priority only.

**Move up** and **Move down** swap the block with its neighbour, one place at a time. **Remove block** removes it at once. There is no Undo in the editor; Discard draft puts everything back to the saved version.

**Exercise fields.** For each exercise: **Sets**, **Reps**, **Load** in your unit, and **Rest (s)**. Rest belongs to the block, so every exercise in a block shares it. Load takes decimals, and a comma works as a decimal point. An empty field means not set and shows "—". Sets must be between 1 and 20. Tap an exercise's name to open its detail page.

**Supersets.** **Group with next** joins a block with the one under it into one superset. The rounds become the larger of the two set counts, and each exercise keeps its reps and load. A superset card shows **Rounds**, **Rest between (s)** — the pause from A to B, 20 seconds unless you change it — and **Round rest (s)**, the pause after the last exercise in the round. Each exercise in it carries a letter (A, B, …), its Reps and Load, and its own remove button. Rounds must be between 1 and 20. **Ungroup** splits the superset back into one block per exercise, each with as many sets as the superset had rounds.

**Add an exercise.** Type a name under "Add an exercise" and tap **Add** (or press Enter). It becomes a new Required block at the end: 3 sets of 10, no load, the default rest. The line under it says "Matched to the exercise library by name; otherwise saved as your own exercise." The match happens when the save reaches the server.

**Dillan's check.** Marked **Coming with Dillan**: "A check against your goals, limitations and equipment." Nothing is checked yet.

**What changed from vN.** A plain list of your changes against the version you started from: "Added <exercise>", "Removed <exercise>", "<exercise>: reps 10 → 8", the same for sets, load and rest, "Required → Priority", "moved to position N", "now in a superset" or "no longer in a superset", and for a superset "<A + B>: rounds 3 → 4", "round rest" and "rest between". When nothing has changed it reads "Nothing yet." Under it, **Why** is optional, up to 300 characters, for example "Knee felt better with fewer reps"; it is stored with the new version. Anything that blocks saving is listed here too, for example "Add at least one exercise." or "<exercise>: sets must be 1–20."

**Time estimate.** Minutes for Full, Short and Priority only, worked out the same way as on Today: "Minutes, estimated from sets, rest and setup." They update as you edit.

**Save as vN+1.** Greyed out until something has changed and nothing blocks saving. On a keyboard, Ctrl+S or Cmd+S does the same. The save goes through the same queue as your sets: you see "Saved as vN+1 · saved on this device" and return to Plan, where the new version sits at the top of Versions with its save word. Train and Today use the new version right away, even offline. A session you start on it syncs after the version does, so the server never sees a session on a version it does not have. Sessions you have already done keep the version they used, exactly as it was.

**Discard draft.** Throws the draft away and returns you to Plan. There is no question first. The saved version is untouched.

### A save that did not sync

If the server refuses the save — most often because a newer version was saved on another device — the Versions card shows vN+1 with Didn't sync and two buttons. **Keep editing** reopens the editor on the newest version with your blocks laid over it, so "What changed" is worked out against that version; save again as the next number. **Discard this save** removes it from this device. While a save shows Didn't sync, Train and Today use the version stored on the server, not your unsent one.

### Exercise detail

Opened from Plan or from the editor. A **Plan** link takes you back. Under the name sits a badge: **Reviewed** for a library exercise that has been reviewed, **Yours** for one you added, **Not reviewed** for a library exercise that has not been reviewed yet. A sample exercise is marked "Demo data".

- **Intended emphasis** — the movement and the muscles the exercise aims at, or Not yet known. Under it: "What the exercise aims at. How it feels doesn't prove which muscles worked."
- **Cues** — a short list, or Not yet known.
- **Equipment** — what it needs, or Not yet known.
- **Alternatives** — Not yet known: "No reviewed alternatives are stored yet."

Exercise detail needs a connection. If it cannot load: "Couldn't load this exercise" with Try again. If the exercise no longer exists: "Exercise not found".

## Your data and updates

Dillan keeps a copy of your work on this device and sends it to your account when it can. This section is about seeing that copy, sending it, and what happens when a new version of Dillan arrives.

### The Your data sheet

Tap your initials, then **Your data** in the menu. The sheet is called "Your data on this phone". It counts the changes on this device, straight from the queue that holds them, in three rows:

- **Synced** — "Stored on your account. Safe if this phone is lost." The server has them.
- **Saved on this device** — "Kept here. Sends when you're online and Dillan is open." They are waiting to go.
- **Didn't sync** — "Tried and stopped. Retry, or choose a version if it changed elsewhere." Items the server refused, and items that changed on another device; see When something changed on another device below.

**Sync now** puts every Didn't sync item back in the queue and sends everything that is waiting. The button shows a spinner while it works. Items that changed on another device stay put; their card is what settles them.

Under the button, a note about clearing browser data. While something is waiting: "Clearing your browser data would remove the N unsynced items. Sync first if you can." When nothing is: "Everything here is synced. Clearing your browser data only removes this device's copy." Clearing browser data never touches what is already on your account.

At the bottom: "Signed in as <your email> · Signing out clears this device's copy." See Signing out under Session.

The counts also show in the header of Today, Train, Progress and Plan as the save word (Saved on this device · N, Synced, Didn't sync · N with Retry). On Today, when anything is waiting, the date line adds "· N unsynced" with a small alert mark, so you see it before you start.

### Updates

Dillan does not update itself in the middle of a session. When a new version is ready and no session is open, Today shows a banner: "A new version of Dillan is ready" with an **Update** button. Tap it and Dillan reloads on the new version. The banner is only on Today, and only while no session is open.

If you start a session with the banner up, nothing reloads during the session. The update waits. If a new version arrived while Dillan was closed, it is applied quietly the next time you open Dillan, unless you open straight into a session.

Dillan's offline copy holds only the app itself, never your signed-in data; your data is on this device in its own store and on your account.

## When something changed on another device

If you change something on this device while the same thing was changed on another device first, the server refuses the later change rather than overwrite silently. Dillan then shows a **conflict card** and waits for you. Nothing resolves itself.

**Where it appears.** At the top of every app screen: Today, Train, Progress, Dillan, Plan, Profile and Settings, above the screen's own content. One card per item. It has a "Changed on another device" eyebrow and the question "Your plan changed on another device. Keep yours, keep theirs, or compare?" for a routine save or a goal level, or "This changed on another device. Keep yours, keep theirs, or compare?" for a set change, a session finish or your setup.

**The three buttons**, in plain words:

- **Keep yours** — your change wins. Dillan reads the newest version from the server and sends your change again on top of it. You chose it, so this is not a silent overwrite. For a routine save, your edit comes back as a draft on the newest version and the editor opens: "Your edit is back as a draft on the newest version." If a session you started on your unsent version has not synced yet, the save stays as well, and you see "A session on this version hasn't synced yet, so the save stays; your edit is also a draft on the newest version." If the item no longer exists on the server: "That item no longer exists, so there's nothing to keep."
- **Keep theirs** — their change wins. Your change is removed from this device and the screen reloads from the server. For a routine save that a not-yet-synced session was started on, Dillan refuses: "A session you started on this version hasn't synced yet, so this save has to stay until it does."
- **Compare** — shows Yours and Theirs side by side before you decide. For a goal: Goal level. For a set: Reps, Load, Reps in reserve. For a session finish: Ended as, Feeling, Note. For your setup: Setup. For a routine save: "Yours compared with theirs (vN):" with the same plain list as "What changed" in the editor, or "No differences in the exercises." Compare needs a connection; otherwise "Couldn't load their version. Check your connection."

If a button cannot do its work: "Couldn't do that. Try again." or, offline, "You're offline. Try again when you're back."

**Retry does not clear a card.** Retry and Sync now resend items the server refused for other reasons; an item that changed on another device waits for your choice. Items counted under Didn't sync include these.

**During a session.** The Session screen has no conflict cards. If a change from the open session is in conflict, the save word in the set screen header and in the Done screen footer reads "Changed on another device · resolve on Today". Finish or leave the session, then settle it on Today.

**On Plan.** A routine save in conflict sits in Versions as vN+1 with the tag "Changed on another device · resolve above"; the card is at the top of the Plan screen. Keep editing and Discard this save are offered only for a save that failed for another reason.

## Offline

**The first visit needs a connection.** Dillan has to load once on a device before it can work offline. If you open it for the first time with no connection you see a page in Dillan's voice: "Dillan needs a connection the first time." with "After Dillan loads once on this device, your plan, set logging and rest timers keep working without a connection. Sets you log offline sync when you're back.", a **Try again** button and "Nothing was lost. There's nothing saved here yet."

**After that, a calm banner.** Once Dillan has loaded on this device and your routine is on it, going offline shows a banner on Today: "You're offline. Logging works; it'll sync when you're back." Starting a session, logging sets, resting, changing a set, finishing and discarding all work offline, through the same queue. Things that need the server say so in place: "This week loads when you're online.", "Versions load when you're online.", "Exercises load once you're online."

**Reopening offline.** You can close Dillan and open it again without a connection; it trusts the sign-in stored on this device. This works for about an hour after your last online use. After that you see the sign-in page until you are online once (unverified on a phone). Being sent to the sign-in page this way does not clear this device's copy; only Sign out does (unverified).

**Private mode and full storage.** When Dillan starts it checks that this browser can keep data. If it cannot, Today shows: "This browser isn't keeping data between visits (private mode or storage full). Logging still works while the tab is open; nothing is saved here when you leave." The Session screen and the editor show their own version of the same warning when a set, undo, note or edit could not be stored; see If the device cannot save under Session. Dillan does not yet stop a set from being logged when storage is unavailable; it warns and lets you keep going while the tab is open.

## Profile
This section is not written yet.

## Settings
The Settings screen is a placeholder for now: "Notifications, privacy, AI data permissions, export and deletion." The Your data sheet lives in the menu for now: tap your initials, then **Your data**. See Your data and updates above.

## Coaching
Coming later.
