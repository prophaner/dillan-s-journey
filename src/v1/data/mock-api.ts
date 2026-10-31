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
import { isValidTimeZone } from "@/v1/core/week";
import { validCutoffs } from "@/v1/core/zones";
import {
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

export const MOCK_DB_KEY = "dillan.mock.db.v1";
export const MOCK_SESSION_KEY = "dillan.mock.session";

export interface MockOptions {
  storage?: Storage | null;
  now?: () => number;
  db?: MockDb;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function createMockApi(opts: MockOptions = {}): DillanApi & { reset(): void; db(): MockDb } {
  const storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
  const now = opts.now ?? (() => Date.now());
  let db: MockDb = opts.db ?? load() ?? seedMockDb(now());
  let me: string | null = readSession();

  const authListeners = new Set<(u: AuthUser | null) => void>();
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
      return storage?.getItem(MOCK_SESSION_KEY) ?? null;
    } catch {
      return null;
    }
  }
  function writeSession(id: string | null) {
    me = id;
    try {
      if (id) storage?.setItem(MOCK_SESSION_KEY, id);
      else storage?.removeItem(MOCK_SESSION_KEY);
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
      if (e.key === MOCK_SESSION_KEY) {
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

  function user(): MockUser {
    const u = db.users.find((x) => x.id === me);
    if (!u) throw new Error("not_authenticated");
    return u;
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

  const api: DillanApi & { reset(): void; db(): MockDb } = {
    kind: "mock",
    reset() {
      db = seedMockDb(now());
      persist();
      writeSession(null);
    },
    db: () => db,

    auth: {
      async getUser() {
        return authUser();
      },
      async sendOtp(channel, contact) {
        const ok = channel === "email" ? normalizeEmail(contact) : normalizePhone(contact);
        return ok ? { ok: true } : { ok: false, error: "invalid_contact" };
      },
      async verifyOtp(channel, contact, code) {
        if (!/^\d{6}$/.test(code) || code === "000000") return { ok: false, error: "invalid_code" };
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
        const forName = p.for_user_id
          ? (db.users.find((x) => x.id === p.for_user_id)?.display_name ?? null)
          : null;
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
          const forName = db.users.find((x) => x.id === p.for_user_id)?.display_name ?? null;
          return { ok: false, error: "for_other_user", for_name: forName };
        }
        p.status = "approved";
        p.approved_user_id = u.id;
        // In the real flow the TV registers its grant after it signs in; the mock does it here.
        db.grants = db.grants.filter(
          (g) => !(g.user_id === u.id && g.device_id === p.device_id && !g.revoked_at),
        );
        db.grants.push({
          id: newId(),
          user_id: u.id,
          device_id: p.device_id,
          label: p.device_label,
          session_id: null,
          created_at: iso(),
          last_seen_at: iso(),
          revoked_at: null,
        });
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

    realtime: {
      onSession(userId, cb) {
        const l = { userId, cb };
        sessionListeners.add(l);
        return () => sessionListeners.delete(l);
      },
      onHrLive() {
        // The mock has no heart-rate relay (Slice E adds a labelled demo source).
        return () => {};
      },
    },

    hr: {
      async live() {
        return null;
      },
      async serverTime() {
        return now();
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
        db.pairings = db.pairings.filter(
          (p) => p.approved_user_id !== u.id && p.for_user_id !== u.id,
        );
        for (const k of Object.keys(db.commands))
          if (k.startsWith(`${u.id}:`)) delete db.commands[k];
        persist();
        return { sessions: mine.length, templates: tpl };
      },
      async deleteAccount() {
        const u = user();
        await api.account.deleteMyData();
        db.users = db.users.filter((x) => x.id !== u.id);
        persist();
        writeSession(null);
      },
    },
  };
  return api;
}
