// One typed interface for everything the V1 UI needs. Two implementations:
//  - supabase-api.ts: the Slice A tables and RPCs (0006_v1_core.sql) plus Realtime postgres_changes
//  - mock-api.ts: in-memory + localStorage, runs src/v1/core; dev builds with ?mock=1 only
// Screens never import supabase directly; they call useApi() (src/v1/data/client.ts).

import type { HrLiveRow } from "@/v1/core/hr";
import type {
  CommandKind,
  CommandPayload,
  CommandSource,
  DeviceGrantRow,
  SessionNoteRow,
  SessionRpcResult,
  SessionSummaryRow,
  TemplateBody,
  Unit,
  WorkoutSessionRow,
  WorkoutTemplate,
  ZoneConfig,
  ZoneCutoffs,
} from "@/v1/core/types";

export type OtpChannel = "email" | "sms";

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
}

/** Never says whether an account exists (brief: auth privacy). */
export type AuthErrorCode =
  | "invalid_contact"
  | "sms_not_configured"
  | "rate_limited"
  | "invalid_code"
  | "network"
  | "unknown";

export type AuthResult<T = object> = ({ ok: true } & T) | { ok: false; error: AuthErrorCode };

export interface Profile {
  id: string;
  display_name: string;
  timezone: string;
  weight_unit: Unit;
  weekly_goal: number; // 1..14, default 3
  /** true until the V1 name step was completed once */
  needs_name: boolean;
  version: number;
}

export type ProfilePatch = Partial<
  Pick<Profile, "display_name" | "timezone" | "weight_unit" | "weekly_goal">
> & {
  /** mark the V1 name step done */
  complete_name_step?: boolean;
};

/** A history row for Calendar/Home: the summary plus what the UI shows next to it. */
export interface HistoryItem extends SessionSummaryRow {
  name: string;
  template_id: string | null;
  has_note: boolean;
}

export type PairingError =
  "invalid_code" | "expired" | "already_resolved" | "rate_limited" | "for_other_user" | "network";

export type PairingPreview =
  | {
      ok: true;
      device_label: string;
      expires_at: string;
      for_other_user: boolean;
      for_name: string | null;
    }
  | { ok: false; error: PairingError; for_name?: string | null };

export type PairingResult =
  | { ok: true; device_label?: string }
  | { ok: false; error: PairingError; for_name?: string | null };

export interface StartOptions {
  templateId: string;
  liveData: boolean;
  timezone: string;
  commandId?: string;
  isDemo?: boolean;
}

export interface CommandInput {
  sessionId: string;
  kind: CommandKind;
  payload?: CommandPayload;
  expectedRevision: number;
  source: CommandSource;
  commandId?: string;
}

export type NoteSaveResult =
  | { ok: true; note: SessionNoteRow }
  | {
      ok: false;
      error: "stale_revision" | "not_found" | "invalid_text";
      note: SessionNoteRow | null;
    };

export type Unsubscribe = () => void;

/** Thrown by templates.update/remove when another device saved first. */
export class RevisionConflictError extends Error {
  constructor(public latest: WorkoutTemplate | null) {
    super("revision_conflict");
    this.name = "RevisionConflictError";
  }
}

/** Server rejected a template (same codes as core/validate). */
export class TemplateInvalidError extends Error {
  constructor(public details: Array<{ path: string; code: string }>) {
    super("invalid_template");
    this.name = "TemplateInvalidError";
  }
}

export interface DillanApi {
  /** "supabase" or "mock"; the shell shows a badge for mock */
  readonly kind: "supabase" | "mock";

  auth: {
    getUser(): Promise<AuthUser | null>;
    sendOtp(channel: OtpChannel, contact: string): Promise<AuthResult>;
    verifyOtp(
      channel: OtpChannel,
      contact: string,
      code: string,
    ): Promise<AuthResult<{ user: AuthUser }>>;
    signOut(): Promise<void>;
    onChange(cb: (user: AuthUser | null) => void): Unsubscribe;
  };

  profile: {
    get(): Promise<Profile>;
    update(patch: ProfilePatch): Promise<Profile>;
  };

  zones: {
    get(): Promise<ZoneConfig | null>;
    /** saves the four cutoffs and records confirmation */
    confirm(cutoffs: ZoneCutoffs): Promise<ZoneConfig>;
  };

  templates: {
    /** not deleted, most recently updated first */
    list(): Promise<WorkoutTemplate[]>;
    /** includes soft-deleted rows (null when missing) */
    get(id: string): Promise<WorkoutTemplate | null>;
    create(body: TemplateBody): Promise<WorkoutTemplate>;
    /** throws RevisionConflictError when expectedRevision is not current */
    update(id: string, body: TemplateBody, expectedRevision: number): Promise<WorkoutTemplate>;
    /** soft delete; throws RevisionConflictError when expectedRevision is not current */
    remove(id: string, expectedRevision: number): Promise<void>;
  };

  sessions: {
    start(opts: StartOptions): Promise<SessionRpcResult>;
    command(input: CommandInput): Promise<SessionRpcResult>;
    /** the one unfinished session (preparing/active/paused/ending), if any */
    current(): Promise<WorkoutSessionRow | null>;
    /** reload a session by id (recovery after reload/Back) */
    recover(id: string): Promise<WorkoutSessionRow | null>;
    /** ended, non-discarded sessions, newest first */
    history(opts?: { limit?: number; before?: string }): Promise<HistoryItem[]>;
    /** sessions whose local start date falls in the month (1-12) */
    month(year: number, month: number): Promise<HistoryItem[]>;
    summary(id: string): Promise<SessionSummaryRow | null>;
  };

  notes: {
    get(sessionId: string): Promise<SessionNoteRow | null>;
    save(sessionId: string, text: string, expectedRevision: number): Promise<NoteSaveResult>;
  };

  devices: {
    /** TV grants that are not revoked */
    list(): Promise<DeviceGrantRow[]>;
    revoke(grantId: string): Promise<boolean>;
  };

  pairing: {
    preview(code: string): Promise<PairingPreview>;
    approve(code: string, confirmOtherUser?: boolean): Promise<PairingResult>;
    deny(code: string): Promise<PairingResult>;
  };

  realtime: {
    /** changes to the caller's own workout_sessions rows */
    onSession(userId: string, cb: (row: WorkoutSessionRow) => void): Unsubscribe;
    /** the caller's own hr_live row */
    onHrLive(userId: string, cb: (row: HrLiveRow | null) => void): Unsubscribe;
  };

  hr: {
    live(): Promise<HrLiveRow | null>;
    serverTime(): Promise<number>;
  };

  account: {
    /** delete_my_v1_data(): every V1 row the caller owns */
    deleteMyData(): Promise<{ sessions: number; templates: number }>;
  };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Phone numbers to E.164: keeps a leading +, strips spaces/dashes/brackets; 10 bare digits = US. */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const plus = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  if (!plus) {
    if (digits.length === 10) digits = `1${digits}`;
    else if (!(digits.length === 11 && digits.startsWith("1"))) return null;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

/** RFC-lite: x@y.z (handoff 4.1). */
export function normalizeEmail(input: string): string | null {
  const v = input.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
}

/** "lu•••@e•••.com" / "+• ••• ••• ••42" */
export function maskContact(c: string): string {
  if (c.includes("@")) {
    const [local = "", domain = ""] = c.split("@");
    const dot = domain.lastIndexOf(".");
    const host = dot > 0 ? domain.slice(0, dot) : domain;
    const tld = dot > 0 ? domain.slice(dot) : "";
    return `${local.slice(0, 2)}•••@${host.slice(0, 1)}•••${tld}`;
  }
  return `•••${c.slice(-2)}`;
}

/** Pairing codes: DLN-XXXX from ABCDEFGHJKMNPQRSTUVWXYZ23456789 (handoff 4.2). */
export function normalizePairingCode(input: string): string | null {
  const v = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = v.startsWith("DLN") ? v.slice(3) : v;
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(body) ? `DLN-${body}` : null;
}
