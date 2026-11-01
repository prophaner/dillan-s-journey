# Code-only sign-in emails (answers, then optional work)

## Answers
1. **What the emails contain now:** they have not been customized. The project has no custom templates and no email domain, so both emails use Lovable Cloud's default templates. I can't see the default text from here, so I can't confirm whether it has the 6-digit code, a link, or both. The standard default sign-in email is built around a link. Before relying on codes, send yourself a code and check what arrives.
2. **Code-only emails with your wording:** yes, but only after a custom email domain is set up. I would generate the branded sign-in emails, then change Magic link and Confirm signup to show only the code, with subject "Your Dillan code" and your exact wording. Body background stays white. Your sign-in page needs no change.
3. **10-minute code expiry, 6 digits:** I can't change these settings myself. You set them in More → Users → Auth settings → Email: "Email OTP expiration (seconds)" = 600 and "Email OTP length" = 6.
4. **Who sends them:** Lovable sends them, not the built-in test sender with its team-only limit. Until a domain is set up, they come from Lovable's default sender address. Anyone can receive them, including a household member who isn't on the Lovable team. There is an hourly cap on sign-in emails, which can be raised once your domain is active.
5. **Domain needed?** Only for item 2. Items 3 and 4 work without one. Custom emails need a domain you own, on a paid plan. You'd add a few nameserver records for a subdomain such as notify.yourdomain.com, and the exact records appear in More → Emails. Until those records are verified, the default emails keep going out.

## If you approve (after the domain is set up)
- Generate the branded sign-in emails.
- Change Magic link and Confirm signup to the code-only design above.
- Leave the other four sign-in emails and all app code as they are.
