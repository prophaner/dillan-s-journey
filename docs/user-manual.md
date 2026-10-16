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

At the top: an **End** button, your routine name, and the time since you started. Below that, a thin bar with one segment per exercise shows where you are. Then the exercise: a Main or Optional tag, "Exercise N of M", the save word for this session, and the name with the plan line (sets × reps, and the weight if there is one). A row of set pips shows which sets are done and which one is next.

**Reps** and **Load** have big minus and plus buttons. Reps move by 1. Load moves by 2.5 and takes decimals. Tap the number itself to type it. Under each number you see "last time N" when Dillan has a previous value for that exercise, or "—" when he does not. Reps and load start from the plan; if the plan has no value, they start from what you logged last time.

If the exercise has no weight, the Load row says "No weight · bodyweight" with an **Add weight** button.

**Reps left in the tank** is optional. It asks how many more good reps you could have done: 0 means none left, 4+ means four or more. Tap a number to pick it; tap it again to clear it.

**Log set** records the set with the numbers on screen. You see "Set N logged · saved on this device" with **Undo** for about six seconds. A second tap within one second is ignored, so a nervous thumb does not log the set twice. After the last set of an exercise, Dillan moves you to the next one and fills in its numbers.

**Undo** removes the set you just logged, cancels the rest, and takes you back to that exercise. Undo is the only way to change a set right now. You cannot edit a set after the toast goes away; that comes in a later slice.

**Pause** is not available yet. The session clock keeps running until you end the session.

**Something feels off** opens a sheet: "Thanks for telling me. You can stop right now, and what you did still counts." You can **Stop the session here**, which ends it as stopped and keeps every set, or **Keep going, lighter**, which closes the sheet and leaves the session as it is.

**End** (top left) ends the session in one tap. There is no confirmation. You go to the Done screen, and nothing you logged is lost.

When you type a number, the Log set button moves up to stay above the keyboard. The exercise card does not shrink to make room, so on a small screen you may need to scroll (unverified on a phone).

Dillan asks your browser to keep the screen awake during a session. Not every browser allows this (unverified on a phone).

### Rest

After each set except the very last one, the screen switches to a rest timer: a ring that empties, the time left in big numbers, and "of M:SS · your rest, your call." The rest length comes from your routine; if the routine does not say, it is 90 seconds.

- **−15s** and **+15s** change this rest. It will not go below 15 seconds.
- **Skip** ends the rest now.
- **Up next** tells you which set and exercise come next.

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

**Save session** finishes the session, removes the working copy from this device, and returns you to Train. Under the button you see the footer: "N sets synced · nothing waiting", "N changes saved on this device · will sync when you're online", or "Didn't sync · N" with **Retry**. You can save while offline; the finish syncs later with the rest.

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
