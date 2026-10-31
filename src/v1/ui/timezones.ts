// IANA timezone choices for Profile and the name step. Weeks run Monday–Sunday in this zone.

const FALLBACK = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** All IANA zones the browser knows, always including `keep` (the saved value). */
export function timeZoneOptions(keep?: string): string[] {
  let all: string[] = FALLBACK;
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (f) all = f("timeZone");
  } catch {
    /* older browser */
  }
  const set = new Set(all);
  if (!set.has("UTC")) all = ["UTC", ...all];
  if (keep && !set.has(keep)) all = [keep, ...all];
  return all;
}
