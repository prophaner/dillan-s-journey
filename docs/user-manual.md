# Dillan — user manual

One section per screen. Status words you will see:

- **Saved on this device** — your entry is stored on your phone and will sync when you are online.
- **Synced** — the server has confirmed your entry.
- **Didn't sync** — the entry could not be sent. Tap Retry.
- **Not yet known** — there is no value yet. Shown as "—".

## Today
This section is not written yet.

## Train

Train is where you start a session, pick up one you left open, and see what you did recently.

### What it shows

**A session in progress.** If you left a session open, it sits at the top with an "In progress" tag, the routine name, when you started, how many sets you have logged, and which exercise you were on. Next to the tag you see the save word for that session (Saved on this device, Synced, or Didn't sync with Retry).

**Your routine.** When nothing is in progress, you see your routine: its name, how many exercises and sets it has, the plan version, and one line per exercise (sets × reps, and the weight if the plan has one). Dillan uses your own approved routine. If you do not have one yet, he uses a sample routine and marks it "Demo data". Anything you log against the sample routine is marked the same way.

**Other ways to train.**
- *Today's session* takes you to Today. Full, Short and Priority-only sessions come with that screen.
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

**Something feels off** opens a sheet: "Thanks for telling me. You can stop right now, and what you did still counts." You can **Stop the session here**, which ends it as stopped and keeps every set, or **Keep going, lighter**, which closes the sheet and leaves the session as it is.

**End** (top left) ends the session in one tap. There is no confirmation. You go to the Done screen, where you can save the session or discard it. Nothing you logged is lost unless you choose Discard.

When you type a number, the Log set button moves up to stay above the keyboard. The exercise card does not shrink to make room, so on a small screen you may need to scroll (unverified on a phone).

Dillan asks your browser to keep the screen awake during a session. Not every browser allows this (unverified on a phone).

### Changing a set

Tap a done pip to reopen that set. The chip reads "Changing set N", and Reps, Load and Reps left in the tank show what you logged for it. Change what you need and tap **Save change**. You see "Set N changed · saved on this device". A change corrects the same set; it does not add a new one, and there is no Undo on a change. To put it back, tap the pip again and change it again. **Cancel** closes the set as it was.

You can change a set only while you are still on its exercise and not resting. Once Dillan moves you to the next exercise, the sets of the one before are no longer on screen; to change a set during rest, Skip the rest first. While you are changing a set, Log set and Swap are hidden. If the change could not be stored on this device, the storage banner appears; tap **Try again**. On a small screen the numbers may sit under the keyboard while you type (unverified on a phone).

### Swapping an exercise

**Swap** opens a sheet, "Swap <exercise>", with the exercises you can do instead: the shared library and the ones you added. Tap one and it takes the exercise's place for this session only. Your plan stays the same. Under the name you see "Swapped for <planned exercise> · this session only", and the Done screen says the same. Reps and load start again from the plan, or from what you logged last time for the new exercise.

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

If this browser is not keeping data, you see a banner: "This browser isn't keeping data between visits (private mode or storage full)." While nothing is waiting, it adds "Logging still works while this tab is open." If a set or an undo could not be stored, the banner says "That set wasn't logged." or "That undo didn't go through." Tap **Try again** to send it again. A set that was queued but could not be stored on this device still shows as logged, so it is never logged twice.

### Save words on the Session screen

- **Saved on this device · N** — N changes from this session are waiting to sync. Dillan sends them when you are online, when you come back to the tab, and every 15 seconds in between.
- **Synced** — every set in this session has been confirmed by the server.
- **Didn't sync · N** — the server refused or the retries ran out. Tap **Retry**.

### The Done screen

When the session ends you see one of three headlines:

- "Every set, done. Good, steady work." — every planned set was logged.
- "Logged as you did it. What you did still counts." — you ended with some sets left.
- "Stopping was the right call. Your sets are saved." — you stopped from the Something feels off sheet.

Below it: each exercise with Done, "Partial · x of y sets", or Skipped; the time in minutes; and the number of sets logged, entered by you.

**How did it feel?** is optional: Easy, Solid, Hard, or Too much. Tap again to clear. **Note** is optional, up to 1000 characters.

**Save session** finishes the session, removes the working copy from this device, and returns you to Train. It saves once, even if you tap it twice or come back after a reload. Under it sits **Discard session**; see Discarding a session below. Under the buttons you see the footer: "N sets synced · nothing waiting", "N changes saved on this device · will sync when you're online", or "Didn't sync · N" with **Retry**. You can save while offline; the finish syncs later with the rest.

### Discarding a session

On the Done screen, **Discard session** throws the session away instead of saving it. Dillan asks once more, inline: "This removes the session and its N sets from your history." with **Discard** and **Keep it**. Keep it closes the question and changes nothing. Discard removes the session and every set in it, shows "Session discarded", and returns you to Train. There is no Undo on a discard.

Discard works offline; the removal is queued and sent with the rest of your changes. While a discard is waiting to be stored, Save session is greyed out, so a session is never both saved and removed.

### If a session is not on this device

Open sessions live on the device where you started them. If you open a session link on another device, or after the working copy has been removed, you see "This session isn't on this device" with a button to Train. Finished sessions are listed on Train.

### Signing out

Signing out clears this device's copy: open sessions, the cached routine, and any onboarding draft. If changes are still waiting to sync, Dillan asks first: "N items saved on this device haven't synced yet. Sign out anyway? They'll be removed from this device." Sync first if you can.

## Progress
Coming later.

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
