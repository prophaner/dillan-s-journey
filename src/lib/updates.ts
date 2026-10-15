/**
 * Every update the app sends must carry the version it read (optimistic concurrency).
 * The database trigger rejects a mismatch with "version conflict"; without a version
 * that check would be skipped, so we refuse to build such an update at all.
 */
export interface VersionedUpdate<T extends Record<string, unknown>> {
  table: string;
  id: string;
  patch: T & { version: number };
}

export class MissingVersionError extends Error {
  constructor(table: string) {
    super(`Update to ${table} has no version; send the version you read.`);
    this.name = "MissingVersionError";
  }
}

/** Outbox kinds that change an existing row and therefore must carry a version. */
export function isUpdateKind(kind: string) {
  return kind.startsWith("update:") || kind === "onboarding:complete"; // onboarding updates the profile
}

export function assertVersion(table: string, version: unknown): asserts version is number {
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new MissingVersionError(table);
  }
}

export function buildUpdate<T extends Record<string, unknown>>(
  table: string,
  id: string,
  patch: T,
  version: number | null | undefined,
): VersionedUpdate<T> {
  assertVersion(table, version);
  if ("version" in patch) throw new Error("Pass the version separately, not inside the patch.");
  return { table, id, patch: { ...patch, version } };
}
