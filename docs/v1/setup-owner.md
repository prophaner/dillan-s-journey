# Dillan V1 — owner setup

Steps only you (the owner) can do. Do them in this order. Each step says how to check it worked.
This replaces `docs/v1/owner-setup.md`.

Project: Lovable project `dillan-s-journey`, Supabase project ref `dtlxwrrpwslulraolzdc`
(Lovable Cloud). Published URL: `https://dillan-s-journey.lovable.app` (written `{host}` below).

> Lovable Cloud screens change often. Where this guide says "Supabase dashboard → …", use the
> matching place in Lovable (**Cloud** tab: Database / Users / Auth settings / Secrets). If a
> setting is not exposed there, ask Lovable support or Lovable's chat to set it for you, and
> paste the exact value from this guide.

## 0. Merge first, then apply

1. Review the pull request from `claude/v1-release`. Merge it to `main` yourself (only you merge).
2. Lovable syncs `main` into the editor. Wait until the editor shows the merged code.
3. Then do step 1 (migration). The V1 screens need the 0006 tables; until 0006 is applied, the
   live app shows load errors on Home/Program/Calendar. Do 0 and 1 back to back.

## 1. Approve and apply migration 0006 (required)

What it is: `drizzle/migrations/0006_v1_core.sql` (identical copy `docs/v1/v1-schema.sql`).
Additive: 14 new tables, RPCs, RLS, Realtime publication for 3 tables. It changes exactly two
existing things: adds `profiles.weekly_goal` (default 3) and replaces the Phase-0 policy
`profiles: owner all` with read / insert / update policies (a paired TV session cannot edit the
profile; clients can no longer delete a profile row). No parked table is dropped or rewritten.
It is re-runnable: running it twice is safe.

**Approve.** Read the file (or the schema-guardian report on the PR) and say "0006 approved"
on the PR. Nothing else applies it.

**Number clash.** `docs/product/next-prompts.md` plans a different "Migration 0006"
(exercise_preferences, parked brief-v2 work). If that ever lands, it must be renumbered 0007.

**Apply — option A (Lovable chat, how 0004/0005 were applied).** Paste:

> Apply the SQL in `drizzle/migrations/0006_v1_core.sql` exactly as written, as one database
> migration. Do not change, split or reformat it, and do not change any app code. After it runs,
> add a journal entry and snapshot for 0006 in `drizzle/migrations/meta` like the earlier ones.

Approve the SQL card Lovable shows. If Lovable wants to rewrite the SQL, stop and use option B.

**Apply — option B (SQL editor).** Supabase dashboard → **SQL Editor → New query** → paste the
whole file → **Run**. It must finish without errors. (Then ask a Claude branch to add the
drizzle journal entry so `drizzle-kit` stays in step.)

**Verify** (SQL editor, or ask Lovable to run them read-only):

```sql
-- 1. All 14 V1 tables exist with RLS on (expect 14 rows, all rowsecurity = true)
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('workout_templates','zone_configs','workout_sessions',
  'session_commands','session_notes','session_summaries','hr_sources','hr_sensors','hr_live',
  'hr_samples','hr_demo_samples','pairing_challenges','pairing_approve_failures','device_grants')
 order by 1;

-- 2. Realtime publishes exactly the 3 V1 tables it needs (expect hr_live, hr_sensors, workout_sessions)
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename in
  ('workout_sessions','hr_live','hr_sensors','hr_samples','pairing_challenges','device_grants');

-- 3. Secret-holding pairing functions are not callable by app users (expect 0 rows)
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('pairing_create','pairing_status','pairing_consume','pairing_cancel')
   and has_function_privilege('authenticated', p.oid, 'execute');

-- 4. Clients cannot read pairing challenges (expect false)
select has_table_privilege('authenticated', 'public.pairing_challenges', 'select');

-- 5. Profiles: new column and policies (expect weekly_goal; policies read/insert/update, no "owner all")
select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'weekly_goal';
select policyname from pg_policies where tablename = 'profiles' order by 1;

-- 6. Server clock RPC answers (run as any signed-in user from the app, or here)
select public.server_time();
```

Then in the app: sign in, open **Program**, create a workout, open **Home**: no load errors.

**Rollback:** see `docs/v1/runbook.md` §3. Never run a down script without deciding it
yourself; it deletes all V1 data.

## 2. Email sign-in (done with Lovable defaults)

This project runs on **Lovable Cloud**, so there is no Supabase dashboard; auth settings live in
Lovable → **More → Users → Auth settings**, and emails come from Lovable's sender
(`no-reply@auth.lovable.cloud`), which delivers to anyone, not only team members (hourly cap).

**Default email (owner's choice, 2026-11-01):** Lovable's default sign-in email has a heading
"One-time login link" and a **Log In** button, with **no 6-digit code**. The app therefore asks
the user to open the link on the same device; it sends the link back to the site the user started
on, then signs them in. A "Have a code?" path stays for a future custom template.

**Later, optional: branded code-only email.** Needs a custom email domain (paid Lovable plan,
DNS records shown in Lovable → **More → Emails**). Then ask Lovable to generate the auth email
templates and change "Magic link" and "Confirm signup" to: subject `Your Dillan code`, heading
"Your Dillan code", "Enter this code to register or log in:", the code `{{ .Token }}` large,
"If you didn't ask for it, ignore this email." No link.

**Optional: expiry.** Lovable → More → Users → Auth settings → Email → "Email OTP expiration
(seconds)" = `600` (default 3600). Lovable's agent cannot change this setting.

**Check:** on `{host}/auth`, enter your email, open the link from the email on the same device,
land signed in. Done by the owner in the preview on 2026-11-01.

## 3. SMS codes (optional; app works by email until then)

Until a provider is configured, the "Text message" option shows "SMS isn't set up yet".

Supabase dashboard → **Authentication → Providers → Phone** → enable, choose a provider:

| Provider | Fields to fill | Rough cost (US, check current prices) |
|---|---|---|
| **Twilio** (recommended) | Account SID, Auth Token, Message Service SID | ~$0.008–0.012 per SMS incl. carrier fees + ~$1.15/month per number. US numbers need **A2P 10DLC** registration (one-time brand ~$4–$44 and campaign vetting ~$15, then ~$2–10/month) or a toll-free number with free toll-free verification (takes days). |
| Twilio Verify | Account SID, Auth Token, Verify Service SID | ~$0.05 per successful verification + SMS fee; no number or 10DLC needed. Simplest for a household. |
| MessageBird (Bird) | Access Key, Originator | Comparable per-SMS pricing; varies by country |
| Vonage | API Key, API Secret, From | ~$0.008 per SMS US + number; 10DLC also applies |
| Textlocal | API Key, Sender | UK/India oriented |

For a two-person household signing in a few times a month, cost is cents per month plus any
number / registration fee. **Twilio Verify** avoids the 10DLC paperwork.

Also on the Phone provider page: SMS OTP expiry `600`, OTP length `6`, message template
`Your Dillan code is {{ .Code }}`.

Never paste these credentials into chat, the repo or Lovable prompts. Enter them only in the
Supabase/Lovable Auth settings form.

**Check:** on `{host}/auth`, choose Text message, enter a phone number in +1… form, receive a code.

## 4. Auth rate limits (recommended)

Supabase dashboard → **Authentication → Rate Limits**:

| Limit | Suggested | Why |
|---|---|---|
| Emails sent per hour | 30 (with custom SMTP; the built-in sender caps lower) | A household rarely sends more |
| SMS sent per hour | 10–30 | Caps cost if the form is abused |
| Token verifications (per 5 min per IP) | default (30) | The app also locks after 5 wrong codes |
| Token refreshes | default | — |
| Minimum interval between OTP sends (Email / Phone) | 30–60 s | Matches the app's 30 s resend countdown |

**CAPTCHA** (Attack Protection): leave off for V1 unless you see abuse; the app has no CAPTCHA UI.

## 5. Realtime (required)

Migration 0006 adds `workout_sessions`, `hr_live` and `hr_sensors` to the `supabase_realtime`
publication itself (verify query 2). Also check: Supabase dashboard → **Realtime** is enabled
for the project and "Allow public access"/private-channel settings are unchanged (V1 uses
`postgres_changes` with RLS, no Broadcast). **Check:** start a workout on the phone and watch
another signed-in tab of the same user follow within a second or two.

## 6. Site URL and redirects (required)

The email sign-in link returns to the site the person started on, as
`<host>/auth?redirect=<path>` (for example `/auth?redirect=%2Fapprove-tv%3Fcode%3DABCD` when
approving a TV). Auth only honors that address if it is allowed; otherwise the link falls back to
the Site URL and lands on Home instead of the TV approval.

- **Site URL**: `https://dillan-s-journey.lovable.app`
- **Redirect URLs** (if Lovable's auth settings show this list): `https://dillan-s-journey.lovable.app/**`
  (the `/**` wildcard is needed for the `?redirect=` query) and, if you use a custom domain
  later, `https://<your-domain>/**`. Keep any Lovable preview entries Lovable added.

**Check:** on the phone, scan a TV's QR code, send the link, open it: you land on the TV
approval screen. A link this browser did not ask for (for example opened inside the Gmail app)
first asks "Continue with this sign-in link?" naming the email; that is expected.

## 7. Server secret for TV pairing and Delete account (check only)

TV pairing and Delete account run server functions that need `SUPABASE_SERVICE_ROLE_KEY` in the
hosting environment (Lovable Cloud sets it). Do not copy it anywhere. **Check:** pairing a TV
(step 9) works; if pairing fails, tell Claude — do not paste the key.

## 8. Publish

In Lovable, click **Publish → Update** so `{host}` serves the merged code. The relay and the TV
must use the **published URL**, never the editor preview (the preview frame blocks Bluetooth).

## 9. Open the TV page in Silk (Fire TV)

1. Fire TV: Settings → My Fire TV → **About**: write down the model and **OS line** (Fire OS or
   Vega OS) in `docs/v1/physical-test-checklist.md`.
2. Install/open **Silk Browser** (Amazon Appstore). If no browser exists (possible on Vega OS),
   stop: V1 needs another display path (`docs/v1/issues.md` B4).
3. In Silk, open `https://dillan-s-journey.lovable.app/tv`. Bookmark it (Silk menu → Add
   bookmark) so the remote can reopen it in two clicks.
4. The TV shows **Get started**. Select it: a code `DLN-XXXX` and a QR code appear (valid 5 min).
5. On your phone, scan the QR (or open `{host}/approve-tv` and type the code), sign in if asked,
   check the request says it is for you, tap **Approve**. The TV shows your Home within ~2 s.
6. Optional: TV Profile → "Name shown on this TV" On, so your name appears on the chooser.

Remote: arrows move, Select (center) activates, **Back** goes back (on the workout dashboard it
pauses), **Play/Pause** pauses/resumes. The TV locks itself after 15 idle minutes outside a
workout.

## 10. Use /relay with the Polar H10

Once per strap (about 5 min):

1. In **Polar Flow** on any phone: update the H10 firmware; check the two-connection setting
   is on. Close Polar Flow / Polar Beat afterwards. Remove the H10 from the phone's Bluetooth list
   if Flow added it there.
2. On the phone or computer app: **Profile → Heart-rate strap & zones**, confirm your four zone
   cutoffs (without them, BPM shows but time counts as Unmeasured).
3. On the relay device (Android phone/tablet in Chrome, or a laptop in Chrome/Edge — not an
   iPhone, not Silk), open `{host}/relay`, sign in as the person who will **wear** the strap,
   check "Relaying for {name}". Android 12+: allow Chrome **Nearby devices**; Android 11 or
   older: turn Location on.
4. Wet the strap electrodes, put it on, tap **Connect strap**, pick "Polar H10 XXXXXXXX" (match
   the ID printed on the pod), accept the pairing prompt.
5. The relay shows "Waiting for first beat", then **Sending to Dillan**. Keep it plugged in with
   the screen on and the page in front.

Every workout: wear the strap, wake the relay (it reconnects when a workout's preflight opens;
otherwise tap Connect strap once), choose the workout, **Start with live data**. End stops the
strap (relay goes to standby). Switching wearer: sign out on the relay and sign in as the other
person; queued readings of the previous person are discarded.

No strap or relay? Choose **Continue without live data**; the summary says no heart-rate data.

## 11. Demo script: two-user gym session (about 20 min)

Cast: **A** (owner, has the H10) and **B** (second household member). Devices: Fire TV, A's
phone, B's phone, relay device. Record results in `docs/v1/physical-test-checklist.md` §6.

1. **B registers.** On B's phone, `{host}/auth` → email or phone → code → name, timezone,
   units. B creates a workout in **Program** (e.g. "Push day": Goblet squat 3×10 at 30 lb per
   dumbbell, plus a superset of two exercises, 3 rounds, rest 60 s).
2. **A on the TV.** TV at `/tv` → Get started → A approves on A's phone → A's Home on the TV.
3. **A trains with live heart rate.** A wears the H10, relay signed in as A shows Sending.
   On the TV: Workout Now → pick a workout → preflight shows "Live · ready … for A" → Start
   with live data. Complete two sets with the remote; complete one from A's phone and watch the
   TV follow. Press Back on the TV: it pauses; Play/Pause resumes. Take the strap off for 40 s:
   the TV goes Delayed, then No recent reading; zone timers stop and the summary later shows
   Unmeasured time. Put it back on; End on the phone. Summary appears on both, with zones,
   Unmeasured and coverage.
4. **Switch to B.** TV Profile → Switch user. The screen blanks, then the chooser shows (A's
   name only if A opted in; nothing else of A's). Select **Add user** → B approves
   on B's phone → B's Home. Nothing of A's workouts, history or BPM is visible.
5. **B trains without a strap.** Relay: sign out A, sign in B (or leave it). B starts "Push day"
   → Continue without live data → completes a few sets → End early. Summary says "Ended early".
6. **B writes a note.** On B's phone: Calendar → today → the session → type a note; status goes
   Unsaved changes → Saving… → Saved HH:MM. On the TV the note is read-only.
7. **History.** On A's phone, Calendar shows A's completed session (solid dot) and not B's.
   On B's phone, B's session shows a hollow dot and the note pencil. Home: A's weekly count
   went up by one; B's shows "+1 ended early".
8. **Lock.** TV Profile → **Lock this TV**. The chooser shows no private data. Wait 15 min idle (or note
   it) to confirm auto-lock outside a workout.
9. **Revoke.** On A's phone: Profile → Devices → remove the TV. Within 60 s a TV still signed
   in as A returns to the chooser.
