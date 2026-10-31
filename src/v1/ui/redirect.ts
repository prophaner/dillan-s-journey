/** Only same-origin paths; never back to /auth. */
export function safeRedirect(r: string | undefined | null): string {
  if (
    !r ||
    !r.startsWith("/") ||
    r.startsWith("//") ||
    r.startsWith("/\\") ||
    r.startsWith("/auth")
  )
    return "/";
  return r;
}
