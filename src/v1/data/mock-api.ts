// Mock DillanApi: in-memory state persisted to localStorage, running the real src/v1/core engine
// and validation. DEV ONLY (?mock=1): client.ts imports this module behind import.meta.env.DEV, so
// production builds never contain it. Every screen shows a "Mock data" badge while it is active.
//
// Mock auth: any 6-digit code works except 000000. A new contact becomes a new user.

import { applyCommand } from "@/v1/core/engine";
import { buildSteps } from "@/v1/core/steps";
import { engineStateFromRow } from "@/v1/core/types";
import type {
  SessionNoteRow,
  SessionRpcResult,
  WorkoutSessionRow,
  WorkoutTemplate,
  ZoneConfig,
} from "@/v1/core/types";
import { validateTemplate } from "@/v1/core/validate";
import { emailRedirectUrl, MOCK_LINK_PREFIX } from "./auth-callback";
import { isValidTimeZone } from "@/v1/core/week";
import { validCutoffs } from "@/v1/core/zones";
import {
  HrAuthError,
  newId,
  normalizeEmail,
  normalizePairingCode,
  normalizePhone,
  RevisionConflictError,
  TemplateInvalidError,
  type AuthUser,
  type DillanApi,
  type HistoryItem,
  type PairingPreview,
  type Profile,
} from "./api";
import { seedMockDb, summaryFor, type MockDb, type MockUser } from "./mock-fixtures";
import {
  emptyHrDb,
  mockForgetSensor,
  mockHrRequest,
  mockIngest,
  readMockHrGaps,
  readMockHrMode,
  readMockHrSince,
  relayRowRecent,
  simHrLive,
  simSamples,
  SIM_NAME,
  SIM_STREAM_ID,
  type MockHrDb,
  type MockHrMode,
} from "./mock-hr";
import { finalizeTotals, needsFinalize } from "@/v1/core/finalize";
import type { HrLiveRow, HrSensorRow, StoredSample } from "@/v1/core/hr";
import { clearLocalUserData } from "@/v1/session/local-data";

export const MOCK_DB_KEY = "dillan.mock.db.v1";
export const MOCK_SESSION_KEY = "dillan.mock.session";
/** The TV tab signs in on its own (two tabs = phone + TV in one browser). */
export const MOCK_TV_SESSION_KEY = "dillan.mock.session.tv";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Mock sign-in links carry this "access token" followed by the email address. */
export { MOCK_LINK_PREFIX };

/** The link a mock "email" would carry: same landing as Supabase (implicit flow, /auth#...). */
export function mockEmailLink(email: string, origin?: string, returnTo?: string): string {
  const o = origin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const landing = new URL(emailRedirectUrl(o, returnTo));
  landing.searchParams.set("mock", "1");
  const h = new URLSearchParams({
    access_token: MOCK_LINK_PREFIX + email,
    refresh_token: "mock",
    token_type: "bearer",
    expires_in: "3600",
    type: "magiclink",
  });
  landing.hash = h.toString();
  return landing.toString();
}

export interface MockOptions {
  storage?: Storage | null;
  now?: () => number;
  db?: MockDb;
  /** simulated relay state; default reads localStorage["dillan.mock.hr"] (see mock-hr.ts) */
  hrMode?: () => MockHrMode;
  /** when that state was chosen (stall/offline freeze from here); default localStorage */
  hrSince?: () => number;
  /** where the signed-in user id is kept (default MOCK_SESSION_KEY; the TV uses its own) */
  sessionKey?: string;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function createMockApi(
  opts: MockOptions = {},
): DillanApi & { reset(): void; db(): MockDb; lastEmailLink(): string | null } {
  const storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
  const now = opts.now ?? (() => Date.now());
  const sessionKey = opts.sessionKey ?? MOCK_SESSION_KEY;
  let db: MockDb = opts.db ?? load() ?? seedMockDb(now());
  let me: string | null = readSession();

  const hrMode = opts.hrMode ?? (() => readMockHrMode(storage));
  const hrSince = opts.hrSince ?? (() => readMockHrSince(storage));
  const hrGaps = () => (opts.hrMode ? [] : readMockHrGaps(storage));
  const authListeners = new Set<(u: AuthUser | null) => void>();
  let lastLink: string | null = null;
  const sessionListeners = new Set<{ userId: string; cb: (r: WorkoutSessionRow) => void }>();

  function safeLocalStorage(): Storage | null {
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null;
    }
  }
  function load(): MockDb | null {
    try {
      const raw = storage?.getItem(MOCK_DB_KEY);
      const v = raw ? (JSON.parse(raw) as MockDb) : null;
      return v && v.v === 1 ? v : null;
    } catch {
      return null;
    }
  }
  function persist() {
    try {
      storage?.setItem(MOCK_DB_KEY, JSON.stringify(db));
    } catch {
      /* quota or private mode: keep in memory */
    }
  }
  function readSession(): string | null {
    try {
      return storage?.getItem(sessionKey) ?? null;
    } catch {
      return null;
    }
  }
  function writeSession(id: string | null) {
    me = id;
    try {
      if (id) storage?.setItem(sessionKey, id);
      else storage?.removeItem(sessionKey);
    } catch {
      /* ignore */
    }
    const u = authUser();
    authListeners.forEach((cb) => cb(u));
  }

  // Cross-tab: another tab (e.g. a TV tab) changed the mock db.
  if (typeof window !== "undefined" && storage && !opts.db) {
    window.addEventListener("storage", (e) => {
      if (e.key === MOCK_DB_KEY) {
        const before = new Map(db.sessions.map((s) => [s.id, s.revision]));
        db = load() ?? db;
        for (const s of db.sessions) if (before.get(s.id) !== s.revision) emitSession(s);
      }
      if (e.key === sessionKey) {
        me = readSession();
        const u = authUser();
        authListeners.forEach((cb) => cb(u));
      }
    });
  }

  function emitSession(row: WorkoutSessionRow) {
    for (const l of sessionListeners) if (l.userId === row.user_id) l.cb(clone(row));
  }

  const iso = (ms = now()) => new Date(ms).toISOString();
  const firstName = (userId: string): string | null =>
    (db.users.find((x) => x.id === userId)?.display_name ?? "").trim().split(/\s+/)[0] || null;

  function user(): MockUser {
    const u = db.users.find((x) => x.id === me);
    if (!u) throw new Error("not_authenticated");
    return u;
  }
  function hrDb(): MockHrDb {
    db.hr ??= emptyHrDb();
    return db.hr;
  }
  /** a relay tab's row while it is recent, else the simulated Demo relay */
  function liveFor(userId: string): HrLiveRow | null {
    const real = hrDb().live.find((l) => l.user_id === userId) ?? null;
    if (relayRowRecent(real, now())) return real;
    const active = db.sessions.find(
      (s) => s.user_id === userId && (s.state === "active" || s.state === "paused"),
    );
    return (
      simHrLive(userId, hrMode(), hrSince(), now(), active?.is_demo ? active.id : null) ?? real
    );
  }
  /** stored samples (relay tabs) plus the simulated relay's readings for demo sessions */
  function sessionSamples(row: WorkoutSessionRow): StoredSample[] {
    const stored = hrDb()
      .samples.filter((x) => x.session_id === row.id && x.is_demo === row.is_demo)
      .map((x) => ({
        stream_id: x.stream_id,
        seq: x.seq,
        measured_at: x.measured_at,
        bpm: x.bpm,
        contact: x.contact,
        is_demo: x.is_demo,
      }));
    return [...stored, ...simSamples(row, hrMode(), hrSince(), hrGaps(), now())].sort(
      (a, b) => a.measured_at - b.measured_at,
    );
  }
  function sourcesUsed(row: WorkoutSessionRow, samples: StoredSample[]): string[] {
    const ids = new Set(
      hrDb()
        .samples.filter((x) => x.session_id === row.id)
        .map((x) => x.source_id),
    );
    const names = hrDb()
      .sources.filter((x) => ids.has(x.id))
      .map((x) => x.display_name);
    if (samples.some((x) => x.stream_id === SIM_STREAM_ID)) names.push(SIM_NAME);
    return [...new Set(names)];
  }
  function authUser(): AuthUser | null {
    const u = db.users.find((x) => x.id === me);
    return u ? { id: u.id, email: u.email, phone: u.phone } : null;
  }
  function toProfile(u: MockUser): Profile {
    return {
      id: u.id,
      display_name: u.display_name,
      timezone: u.timezone,
      weight_unit: u.weight_unit,
      weekly_goal: u.weekly_goal,
      needs_name: !u.name_done || !u.display_name.trim(),
      version: u.version,
    };
  }
  function history(
    uid: string,
    filter: (s: { local_date: string; started_at: string }) => boolean,
  ): HistoryItem[] {
    return db.summaries
      .filter((s) => s.user_id === uid && filter(s))
      .map((s) => {
        const ws = db.sessions.find((x) => x.id === s.session_id);
        const note = db.notes.find((n) => n.session_id === s.session_id);
        return {
          ...clone(s),
          name: ws?.snapshot.name ?? "Workout",
          template_id: ws?.template_id ?? null,
          has_note: !!note?.text.trim(),
        };
      });
  }
  function remember(
    uid: string,
    commandId: string,
    session_id: string | null,
    result: SessionRpcResult,
  ) {
    db.commands[`${uid}:${commandId}`] = { session_id, result: clone(result) };
  }
  function lookupPairing(code: string) {
    const c = normalizePairingCode(code);
    const p = c ? db.pairings.find((x) => x.code === c) : undefined;
    if (!p) return { error: "invalid_code" as const };
    if (p.status === "awaiting" && Date.parse(p.expires_at) <= now()) {
      p.status = "expired";
      persist();
    }
    if (p.status === "expired") return { error: "expired" as const };
    if (p.status !== "awaiting") return { error: "already_resolved" as const };
    return { p };
  }

  function signInContact(
    channel: "email" | "sms",
    contact: string,
  ): { ok: true; user: AuthUser } | { ok: false; error: "invalid_contact" } {
    const c = channel === "email" ? normalizeEmail(contact) : normalizePhone(contact);
    if (!c) return { ok: false, error: "invalid_contact" };
    let u = db.users.find((x) => (channel === "email" ? x.email === c : x.phone === c));
    if (!u) {
      u = {
        id: newId(),
        email: channel === "email" ? c : null,
        phone: channel === "sms" ? c : null,
        display_name: "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        weight_unit: "lb",
        weekly_goal: 3,
        name_done: false,
        version: 1,
      };
      db.users.push(u);
      persist();
    }
    writeSession(u.id);
    return { ok: true, user: { id: u.id, email: u.email, phone: u.phone } };
  }

  const api: DillanApi & { reset(): void; db(): MockDb; lastEmailLink(): string | null } = {
    kind: "mock",
    reset() {
      db = seedMockDb(now());
      persist();
      writeSession(null);
    },
    db: () => db,
    lastEmailLink: () => lastLink,

    auth: {
      async getUser() {
        return authUser();
      },
      async sendOtp(channel, contact, opts) {
        const ok = channel === "email" ? normalizeEmail(contact) : normalizePhone(contact);
        if (ok && channel === "email") {
          // The real email carries a sign-in link: the mock makes one (open it to test the link
          // landing); the 6-digit code path keeps working too.
          lastLink = mockEmailLink(ok, undefined, opts?.returnTo);
          if (import.meta.env.DEV && import.meta.env.MODE !== "test")
            console.info(`[mock] sign-in link for ${ok}: ${lastLink}`);
        }
        return ok ? { ok: true } : { ok: false, error: "invalid_contact" };
      },
      async verifyOtp(channel, contact, code) {
        if (!/^\d{6}$/.test(code) || code === "000000") return { ok: false, error: "invalid_code" };
        return signInContact(channel, contact);
      },
      async signInWithLink({ accessToken }) {
        if (!accessToken.startsWith(MOCK_LINK_PREFIX)) return { ok: false, error: "invalid_code" };
        return signInContact("email", accessToken.slice(MOCK_LINK_PREFIX.length));
      },
      async signOut() {
        writeSession(null);
      },
      onChange(cb) {
        authListeners.add(cb);
        return () => authListeners.delete(cb);
      },
    },

    profile: {
      async get() {
        return toProfile(user());
      },
      async update(patch) {
        const u = user();
        if (patch.display_name !== undefined)
          u.display_name = patch.display_name.trim().slice(0, 40);
        if (patch.timezone !== undefined) {
          if (!isValidTimeZone(patch.timezone)) throw new Error("invalid_timezone");
          u.timezone = patch.timezone;
        }
        if (patch.weight_unit !== undefined) u.weight_unit = patch.weight_unit;
        if (patch.weekly_goal !== undefined) {
          if (
            !Number.isInteger(patch.weekly_goal) ||
            patch.weekly_goal < 1 ||
            patch.weekly_goal > 14
          )
            throw new Error("invalid_goal");
          u.weekly_goal = patch.weekly_goal;
        }
        if (patch.complete_name_step) u.name_done = true;
        u.version += 1;
        persist();
        return toProfile(u);
      },
    },

    zones: {
      async get() {
        const u = user();
        return clone(db.zones.find((z) => z.user_id === u.id) ?? null);
      },
      async confirm(cutoffs) {
        const u = user();
        if (!validCutoffs(cutoffs)) throw new Error("invalid_zones");
        const [b1, b2, b3, b4] = cutoffs;
        let z = db.zones.find((x) => x.user_id === u.id);
        if (!z) {
          z = {
            user_id: u.id,
            b1,
            b2,
            b3,
            b4,
            confirmed_at: iso(),
            version: 1,
            created_at: iso(),
            updated_at: iso(),
          };
          db.zones.push(z);
        } else {
          Object.assign(z, {
            b1,
            b2,
            b3,
            b4,
            confirmed_at: iso(),
            version: z.version + 1,
            updated_at: iso(),
          });
        }
        persist();
        return clone(z) as ZoneConfig;
      },
    },

    templates: {
      async list() {
        const u = user();
        return clone(
          db.templates
            .filter((t) => t.user_id === u.id && !t.deleted_at)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        );
      },
      async get(id) {
        const u = user();
        return clone(db.templates.find((t) => t.id === id && t.user_id === u.id) ?? null);
      },
      async create(body, id) {
        const u = user();
        const errs = validateTemplate(body);
        if (errs.length)
          throw new TemplateInvalidError(errs.map(({ path, code }) => ({ path, code })));
        // Same id again = a retry of a create that already went through (no duplicate row).
        const existing = id ? db.templates.find((x) => x.id === id) : undefined;
        if (existing) {
          if (existing.user_id !== u.id || existing.deleted_at) throw new Error("duplicate_id");
          return clone(existing);
        }
        const t: WorkoutTemplate = {
          id: id ?? newId(),
          user_id: u.id,
          name: body.name.trim(),
          blocks: clone(body.blocks),
          revision: 1,
          created_at: iso(),
          updated_at: iso(),
          deleted_at: null,
        };
        db.templates.push(t);
        persist();
        return clone(t);
      },
      async update(id, body, expectedRevision) {
        const u = user();
        const t = db.templates.find((x) => x.id === id && x.user_id === u.id);
        if (!t || t.deleted_at || t.revision !== expectedRevision)
          throw new RevisionConflictError(clone(t ?? null));
        const errs = validateTemplate(body);
        if (errs.length)
          throw new TemplateInvalidError(errs.map(({ path, code }) => ({ path, code })));
        t.name = body.name.trim();
        t.blocks = clone(body.blocks);
        t.revision += 1;
        t.updated_at = iso();
        persist();
        return clone(t);
      },
      async remove(id, expectedRevision) {
        const u = user();
        const t = db.templates.find((x) => x.id === id && x.user_id === u.id);
        if (!t || t.revision !== expectedRevision)
          throw new RevisionConflictError(clone(t ?? null));
        t.deleted_at = iso();
        t.revision += 1;
        t.updated_at = iso();
        persist();
      },
    },

    sessions: {
      async start(o) {
        const u = user();
        const commandId = o.commandId ?? newId();
        const prior = db.commands[`${u.id}:${commandId}`];
        if (prior) return clone(prior.result);
        let result: SessionRpcResult;
        const t = db.templates.find(
          (x) => x.id === o.templateId && x.user_id === u.id && !x.deleted_at,
        );
        const running = db.sessions.find((s) => s.user_id === u.id && s.state !== "ended");
        if (!isValidTimeZone(o.timezone))
          result = { ok: false, error: "invalid_timezone", session: null };
        else if (!t) result = { ok: false, error: "template_not_found", session: null };
        else if (running)
          result = { ok: false, error: "session_running", session_id: running.id, session: null };
        else {
          const z = db.zones.find((x) => x.user_id === u.id && x.confirmed_at);
          const row: WorkoutSessionRow = {
            id: newId(),
            user_id: u.id,
            template_id: t.id,
            snapshot: clone({
              template_id: t.id,
              template_revision: t.revision,
              name: t.name,
              blocks: t.blocks,
            }),
            steps: buildSteps(t.blocks),
            zone_snapshot: z
              ? {
                  cutoffs: [z.b1, z.b2, z.b3, z.b4],
                  version: z.version,
                  confirmed_at: z.confirmed_at as string,
                }
              : null,
            start_timezone: o.timezone,
            state: "preparing",
            outcome: null,
            revision: 1,
            live_data: o.liveData,
            is_demo: !!o.isDemo,
            created_at: iso(),
            started_at: null,
            ended_at: null,
            paused_at: null,
            paused_ms: 0,
            pauses: [],
            cursor: 0,
            rest_started_at: null,
            rest_ends_at: null,
            results: {},
            last_command_id: null,
            last_source: null,
            last_client_at: iso(),
            updated_at: iso(),
          };
          db.sessions.push(row);
          result = { ok: true, session: clone(row) };
          emitSession(row);
        }
        remember(u.id, commandId, result.session?.id ?? null, result);
        persist();
        return result;
      },
      async command(c) {
        const u = user();
        const commandId = c.commandId ?? newId();
        const prior = db.commands[`${u.id}:${commandId}`];
        if (prior) {
          if (prior.session_id !== c.sessionId)
            return { ok: false, error: "command_id_reused", session: null };
          return clone(prior.result);
        }
        const row = db.sessions.find((s) => s.id === c.sessionId && s.user_id === u.id);
        if (!row) return { ok: false, error: "not_found", session: null };
        const at = now();
        const r = applyCommand(
          engineStateFromRow(row),
          {
            kind: c.kind,
            ...(c.payload ? { payload: c.payload } : {}),
            expected_revision: c.expectedRevision,
          },
          at,
        );
        let result: SessionRpcResult;
        if (r.ok) {
          const s = r.state;
          const ts = (v: number | null) => (v == null ? null : new Date(v).toISOString());
          Object.assign(row, {
            state: s.state,
            outcome: s.outcome,
            revision: s.revision,
            cursor: s.cursor,
            results: s.results,
            started_at: ts(s.started_at),
            ended_at: ts(s.ended_at),
            paused_at: ts(s.paused_at),
            paused_ms: s.paused_ms,
            pauses: s.pauses,
            rest_started_at: ts(s.rest_started_at),
            rest_ends_at: ts(s.rest_ends_at),
            last_command_id: commandId,
            last_source: c.source,
            last_client_at: iso(),
            updated_at: iso(at),
          });
          const sum = summaryFor(row);
          if (sum && !db.summaries.some((x) => x.session_id === row.id)) db.summaries.push(sum);
          // End stops heart-rate demand (h10-design: End calls hr_request(0)).
          if (row.state === "ended") mockHrRequest(hrDb(), u.id, 0, at);
          result = { ok: true, session: clone(row) };
          emitSession(row);
        } else {
          result = { ok: false, error: r.error, session: clone(row) };
        }
        remember(u.id, commandId, row.id, result);
        persist();
        return result;
      },
      async current() {
        const u = user();
        return clone(db.sessions.find((s) => s.user_id === u.id && s.state !== "ended") ?? null);
      },
      async recover(id) {
        const u = user();
        return clone(db.sessions.find((s) => s.id === id && s.user_id === u.id) ?? null);
      },
      async history(o) {
        const u = user();
        return history(u.id, (s) => !o?.before || s.started_at < o.before)
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .slice(0, o?.limit ?? 50);
      },
      async month(year, month) {
        const u = user();
        const prefix = `${year}-${String(month).padStart(2, "0")}-`;
        return history(u.id, (s) => s.local_date.startsWith(prefix)).sort((a, b) =>
          a.started_at.localeCompare(b.started_at),
        );
      },
      async summary(id) {
        const u = user();
        return clone(db.summaries.find((s) => s.session_id === id && s.user_id === u.id) ?? null);
      },
      async finalize(id) {
        // Same steps as src/v1/data/finalize.functions.ts, in memory.
        const u = user();
        const sum = db.summaries.find((s) => s.session_id === id && s.user_id === u.id);
        if (!sum) return null;
        if (!needsFinalize(sum)) return clone(sum);
        const row = db.sessions.find((s) => s.id === id && s.user_id === u.id);
        if (!row) return clone(sum);
        const samples = sessionSamples(row);
        const t = finalizeTotals(row, samples, sum.active_ms);
        if (!t) return clone(sum);
        Object.assign(sum, {
          zone_ms: t.zone_ms,
          measured_ms: t.measured_ms,
          unmeasured_ms: t.unmeasured_ms,
          coverage: Math.round(t.coverage * 10_000) / 10_000,
          algorithm_version: t.algorithm_version,
          hr_sources_used: t.measured_ms > 0 ? sourcesUsed(row, samples) : [],
          hr_status: "final",
          hr_finalize_dirty: false,
          finalized_at: iso(),
        });
        persist();
        return clone(sum);
      },
    },

    notes: {
      async get(sessionId) {
        const u = user();
        return clone(
          db.notes.find((n) => n.session_id === sessionId && n.user_id === u.id) ?? null,
        );
      },
      async save(sessionId, text, expectedRevision) {
        const u = user();
        if (text.length > 4000) return { ok: false, error: "invalid_text", note: null };
        const ws = db.sessions.find(
          (s) => s.id === sessionId && s.user_id === u.id && s.outcome !== "discarded",
        );
        if (!ws) return { ok: false, error: "not_found", note: null };
        let n = db.notes.find((x) => x.session_id === sessionId);
        if (!n) {
          if ((expectedRevision ?? 0) !== 0)
            return { ok: false, error: "stale_revision", note: null };
          n = {
            session_id: sessionId,
            user_id: u.id,
            text,
            revision: 1,
            created_at: iso(),
            updated_at: iso(),
          } as SessionNoteRow;
          db.notes.push(n);
        } else if (n.revision !== expectedRevision) {
          return { ok: false, error: "stale_revision", note: clone(n) };
        } else {
          Object.assign(n, { text, revision: n.revision + 1, updated_at: iso() });
        }
        persist();
        return { ok: true, note: clone(n) };
      },
    },

    devices: {
      async list() {
        const u = user();
        return clone(db.grants.filter((g) => g.user_id === u.id && !g.revoked_at));
      },
      async revoke(grantId) {
        const u = user();
        const g = db.grants.find((x) => x.id === grantId && x.user_id === u.id);
        if (!g) return false;
        g.revoked_at = g.revoked_at ?? iso();
        persist();
        return true;
      },
    },

    pairing: {
      async preview(code): Promise<PairingPreview> {
        const u = user();
        const l = lookupPairing(code);
        if (!("p" in l) || !l.p) return { ok: false, error: l.error };
        const p = l.p;
        // Like v1_first_name: an unauthenticated TV picks for_user_id, so only the first name.
        const forName = p.for_user_id ? firstName(p.for_user_id) : null;
        return {
          ok: true,
          device_label: p.device_label,
          created_at: p.created_at,
          expires_at: p.expires_at,
          for_other_user: !!p.for_user_id && p.for_user_id !== u.id,
          for_name: forName,
        };
      },
      async approve(code, confirmOtherUser = false) {
        const u = user();
        const l = lookupPairing(code);
        if (!("p" in l) || !l.p) return { ok: false, error: l.error };
        const p = l.p;
        if (p.for_user_id && p.for_user_id !== u.id && !confirmOtherUser) {
          const forName = firstName(p.for_user_id);
          return { ok: false, error: "for_other_user", for_name: forName };
        }
        p.status = "approved";
        p.approved_user_id = u.id;
        // As in the real flow, the TV registers its grant when it signs in (tv.pairPoll).
        persist();
        return { ok: true, device_label: p.device_label };
      },
      async deny(code) {
        user();
        const l = lookupPairing(code);
        if (!("p" in l) || !l.p) return { ok: false, error: l.error };
        l.p.status = "denied";
        persist();
        return { ok: true };
      },
    },

    tv: {
      async pairStart(device, forUserId) {
        // Same lifecycle as pairing_create: one live code per device, 5 minutes.
        for (const p of db.pairings)
          if (p.device_id === device.id && p.status === "awaiting") p.status = "cancelled";
        let code = "";
        do {
          code = "DLN-";
          for (let i = 0; i < 4; i++)
            code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
        } while (db.pairings.some((p) => p.code === code && p.status === "awaiting"));
        const p = {
          id: newId(),
          secret: newId().replace(/-/g, ""),
          code,
          device_id: device.id,
          device_label: device.label,
          status: "awaiting" as const,
          created_at: iso(),
          expires_at: iso(now() + 5 * 60_000),
          for_user_id: forUserId,
          approved_user_id: null,
        };
        db.pairings.push(p);
        persist();
        return {
          ok: true,
          challenge: { challengeId: p.id, code, expiresAt: p.expires_at, secret: p.secret },
        };
      },
      async pairPoll(device, ch) {
        db = load() ?? db;
        const p = db.pairings.find((x) => x.id === ch.challengeId);
        if (!p || p.secret !== ch.secret) return { status: "error", error: "bad_secret" };
        if (p.status === "awaiting" && Date.parse(p.expires_at) <= now()) {
          p.status = "expired";
          persist();
        }
        if (p.status === "awaiting" || p.status === "denied" || p.status === "expired")
          return { status: p.status };
        if (p.status === "consumed") return { status: "consumed" };
        if (p.status !== "approved" || !p.approved_user_id) return { status: "cancelled" };
        p.status = "consumed";
        const grant = {
          id: newId(),
          user_id: p.approved_user_id,
          device_id: device.id,
          label: device.label,
          session_id: newId(),
          created_at: iso(),
          last_seen_at: iso(),
          last_active_at: iso(),
          revoked_at: null,
        };
        db.grants.push(grant);
        persist();
        writeSession(p.approved_user_id);
        const u = authUser();
        if (!u) return { status: "error", error: "sign_in_failed" };
        return { status: "signed_in", user: u, grantId: grant.id };
      },
      async pairCancel(ch) {
        const p = db.pairings.find((x) => x.id === ch.challengeId);
        if (p && p.secret === ch.secret && p.status === "awaiting") {
          p.status = "cancelled";
          persist();
        }
      },
      async checkGrant(deviceId, active = false) {
        db = load() ?? db;
        if (!me) return { valid: false, grantId: null };
        const g = db.grants.find(
          (x) => x.user_id === me && x.device_id === deviceId && !x.revoked_at,
        );
        if (!g) return { valid: false, grantId: null };
        // Same rule as device_grant_touch: 15 min with no reported activity and no running
        // workout revokes the grant.
        const running = db.sessions.some(
          (s) => s.user_id === me && (s.state === "active" || s.state === "paused"),
        );
        const lastActive = g.last_active_at ? Date.parse(g.last_active_at) : now();
        if (!active && !running && now() - lastActive > 15 * 60_000) {
          g.revoked_at = iso();
          persist();
          writeSession(null);
          return { valid: false, grantId: null };
        }
        g.last_seen_at = iso();
        if (active || running) g.last_active_at = iso();
        persist();
        return { valid: true, grantId: g.id };
      },
      async lock(grantId) {
        const g = grantId ? db.grants.find((x) => x.id === grantId) : undefined;
        if (g && !g.revoked_at) {
          g.revoked_at = iso();
          persist();
        }
        writeSession(null);
      },
      isTvSession() {
        // The mock TV keeps its own sign-in (MOCK_TV_SESSION_KEY): a phone tab is never the TV's.
        return false;
      },
    },

    realtime: {
      onSession(userId, cb, onSubscribed) {
        const l = { userId, cb };
        sessionListeners.add(l);
        // Joined: like a real channel, report SUBSCRIBED asynchronously.
        let live = true;
        if (onSubscribed) queueMicrotask(() => live && onSubscribed());
        return () => {
          live = false;
          sessionListeners.delete(l);
        };
      },
      onHrLive(userId, cb, onSubscribed) {
        // The relay tab's row (mock hr_ingest) or the simulated Demo relay, checked every second.
        if (typeof window === "undefined") return () => {};
        if (onSubscribed) queueMicrotask(onSubscribed);
        const tick = () => {
          if (me !== userId) return;
          const row = liveFor(userId);
          if (row) cb(clone(row));
        };
        const t = window.setInterval(tick, 1000);
        return () => window.clearInterval(t);
      },
      onHrSensor(userId, cb, onSubscribed) {
        if (typeof window === "undefined") return () => {};
        if (onSubscribed) queueMicrotask(onSubscribed);
        let last = "";
        const tick = () => {
          if (me !== userId) return;
          const row = hrDb().sensors.find((s) => s.user_id === userId) ?? null;
          const key = JSON.stringify(row);
          if (key === last) return;
          last = key;
          if (row) cb(clone(row));
        };
        const t = window.setInterval(tick, 1000);
        return () => window.clearInterval(t);
      },
    },

    hr: {
      async live(): Promise<HrLiveRow | null> {
        const u = user();
        return clone(liveFor(u.id));
      },
      async serverTime() {
        return now();
      },
      async sensor() {
        const u = user();
        const s = hrDb().sensors.find((x) => x.user_id === u.id);
        return s && !s.forgotten_at ? { paired: true } : null;
      },
      async sensorRow(): Promise<HrSensorRow | null> {
        const u = user();
        return clone(hrDb().sensors.find((x) => x.user_id === u.id) ?? null);
      },
      async request(minutes) {
        const u = user();
        mockHrRequest(hrDb(), u.id, minutes, now());
        persist();
      },
      async ingest(req) {
        db = load() ?? db;
        if (!me) throw new HrAuthError();
        const res = mockIngest(hrDb(), db, me, req, now());
        persist();
        return res;
      },
      async forgetSensor() {
        const u = user();
        mockForgetSensor(hrDb(), u.id, now());
        persist();
      },
      async sources() {
        const u = user();
        return hrDb()
          .sources.filter((s) => s.user_id === u.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((s) => ({
            id: s.id,
            user_id: s.user_id,
            kind: s.kind,
            display_name: s.display_name,
            platform: s.platform,
            last_seen_at: s.last_seen_at,
            created_at: s.created_at,
            revoked_at: s.revoked_at,
          }));
      },
      async renameSource(id, name) {
        const u = user();
        const s = hrDb().sources.find((x) => x.id === id && x.user_id === u.id);
        const v = name.trim().slice(0, 60);
        if (!s || !v) throw new Error("invalid_name");
        s.display_name = v;
        persist();
      },
      async revokeSource(id) {
        const u = user();
        const s = hrDb().sources.find((x) => x.id === id && x.user_id === u.id);
        if (s && !s.revoked_at) {
          s.revoked_at = iso();
          persist();
        }
      },
      async samples(sessionId) {
        const u = user();
        const row = db.sessions.find((s) => s.id === sessionId && s.user_id === u.id);
        return row ? sessionSamples(row) : [];
      },
    },

    account: {
      async deleteMyData() {
        const u = user();
        const mine = db.sessions.filter((s) => s.user_id === u.id).map((s) => s.id);
        const tpl = db.templates.filter((t) => t.user_id === u.id).length;
        db.sessions = db.sessions.filter((s) => s.user_id !== u.id);
        db.summaries = db.summaries.filter((s) => s.user_id !== u.id);
        db.notes = db.notes.filter((n) => n.user_id !== u.id);
        db.templates = db.templates.filter((t) => t.user_id !== u.id);
        db.zones = db.zones.filter((z) => z.user_id !== u.id);
        db.grants = db.grants.filter((g) => g.user_id !== u.id);
        const hr = hrDb();
        hr.sources = hr.sources.filter((x) => x.user_id !== u.id);
        hr.sensors = hr.sensors.filter((x) => x.user_id !== u.id);
        hr.live = hr.live.filter((x) => x.user_id !== u.id);
        hr.samples = hr.samples.filter((x) => x.user_id !== u.id);
        db.pairings = db.pairings.filter(
          (p) => p.approved_user_id !== u.id && p.for_user_id !== u.id,
        );
        for (const k of Object.keys(db.commands))
          if (k.startsWith(`${u.id}:`)) delete db.commands[k];
        persist();
        // Pending note text and queued set commands of the deleted sessions can never save.
        clearLocalUserData(u.id);
        return { sessions: mine.length, templates: tpl };
      },
      async deleteAccount() {
        const u = user();
        await api.account.deleteMyData();
        clearLocalUserData(u.id);
        db.users = db.users.filter((x) => x.id !== u.id);
        persist();
        writeSession(null);
      },
    },
  };
  return api;
}
