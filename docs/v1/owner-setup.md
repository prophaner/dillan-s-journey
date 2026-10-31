# Dillan V1 — owner setup (Supabase Auth)

Steps only the owner can do in the Supabase dashboard (Lovable Cloud → Supabase project
`dtlxwrrpwslulraolzdc`). The app code assumes them; until they are done the real sign-in cannot be
completed. Slice F folds this into the full owner checklist.

## 1. Email sign-in sends a 6-digit code (required)

V1 sign-in (S02) asks for the 6-digit code from the email. Supabase's default "Magic Link" and
"Confirm signup" templates contain only a link (`{{ .ConfirmationURL }}`), so users would get no
code. In **Authentication → Email Templates**, edit **both** templates:

- **Magic Link** (returning users) and **Confirm signup** (first sign-in):

  ```html
  <h2>Your Dillan code</h2>
  <p>Enter this code to register or log in:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
  <p>If you didn't ask for it, ignore this email.</p>
  ```

  Subject: `Your Dillan code`. Do not include `{{ .ConfirmationURL }}`: V1 does not use links.

## 2. Code expiry (recommended: 10 minutes)

**Authentication → Providers → Email → Email OTP Expiration**: set `600` seconds (the default is
3600). The app does not state a fixed expiry, so any value works; 10 minutes matches the handoff.

## 3. SMS codes (optional, D7)

**Authentication → Providers → Phone**: enable and configure an SMS provider (Twilio, MessageBird,
Vonage). Until then the "Text message" option shows "SMS isn't set up yet".

## 4. Delete account (server secret)

S15 "Delete account" runs a server function that deletes the auth user with the service-role key
(`SUPABASE_SERVICE_ROLE_KEY`, already used by server code through
`src/integrations/supabase/client.server.ts`). Nothing to add if that secret is set in the hosting
environment; if it is missing, Delete account fails with "Nothing was deleted".

## 5. Schema

Migration `drizzle/migrations/0006_v1_core.sql` is not applied (D3). It now also replaces the
Phase-0 `profiles: owner all` policy with read/insert/update policies that refuse writes from a
paired TV session and drop client deletes of `profiles`. Review it with the rest of 0006.
