// Non-deliverable placeholder email given to phone-only accounts the first time they approve a TV,
// so the server can mint a one-time magic link for the TV (tv.functions.ts, build-plan D22).
// RFC 2606 reserves .invalid: nothing is ever delivered. The app never shows it as a contact.

export const PLACEHOLDER_EMAIL_DOMAIN = "users.dillan.invalid";

export const placeholderEmail = (userId: string) => `tv+${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`;

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}
