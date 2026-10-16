# States S20, S21 and conflicts

S20, S21. AT-21, AT-34. Steps 9 to 13 need the published app (service worker), not the preview.

## 1. Wi-Fi
1. Menu, "Your data on this phone". Three rows with counts: Synced, Saved on this device, Didn't sync.
2. On device A, change a goal level offline. On device B, change the same goal to another level. A online. Today shows a card "Changed on another device".
3. Tap Compare. Yours and Theirs show.
4. Tap Keep theirs. The label now matches device B.
5. Repeat step 2, tap Keep yours. The label is yours.
6. Make a conflict, start a session with that set. The runner says "Changed on another device · resolve on Today". Plan: "resolve above".

## 2. Airplane mode
7. Airplane on. Log three sets. Your data: "Saved on this device" is 3. Today eyebrow: "3 unsynced".
8. Airplane off, tap Sync now. Synced rises. The other two read 0.
9. Signed in, airplane on, close the tab, reopen within the hour. Today with "You're offline", not sign-in.
10. Private tab, airplane on, first visit. Page says "Dillan needs a connection the first time." Tap Try again.

## 3. Lock
11. Lock two minutes on Your data, unlock. Counts unchanged.

## 4. Update and storage
12. After publishing a new build, open Today, no session open. Banner "A new version of Dillan is ready". Tap Update.
13. Start a session with the banner up. No reload mid-session.
14. Private tab, Today. The storage warning shows.

## 5. 320 px
15. Your data, conflict card, banners: no sideways scroll.

## 6. Night Gym
16. Dark mode. Sheet, card and offline page follow.

```
Device/browser: iPhone __ Safari __ / Android __ Chrome __
Passed: __ / 16 steps
Failed steps (number + what happened):
Verified on phone: yes / no
```
