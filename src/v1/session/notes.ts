// Session notes autosave (handoff 4.7, acceptance 33/34). One state machine per open note:
//   idle -> dirty ("Unsaved changes") -> saving ("Saving…", 800 ms after the last keystroke)
//        -> saved ("Saved HH:MM") | error ("Not saved — we kept your note on this device")
//        | conflict (the note changed on another device; the user picks a version)
// Every keystroke also writes pendingNotes[sessionId] for this user in localStorage, so a reload,
// a closed tab or a failed save never loses text. Pending text is retried on `online`, on app
// start (retryPendingNotes) and with Retry now; it is cleared only after the server saved it.
// Saves carry the note revision they started from (session_note_save checks it).

import type { SessionNoteRow } from "@/v1/core/types";
import type { DillanApi } from "@/v1/data/api";

export const NOTE_DEBOUNCE_MS = 800;
export const NOTE_MAX = 4000;
const PREFIX = "dillan.v1.pendingNotes.";

export type NoteStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error" }
  /** the note could not be read: the field stays read-only until a retry reads it */
  | { kind: "load_error" }
  | { kind: "conflict"; serverText: string; serverRevision: number };

export const NOTE_COPY = {
  placeholder: "How did it go? Anything to change next time?",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: (time: string) => `Saved ${time}`,
  error: "Not saved — we kept your note on this device",
  retry: "Retry now",
  loadError: "Couldn't load your note. Check your connection.",
  loadRetry: "Try again",
  conflict: "This note was changed on another device.",
  keepMine: "Keep this version",
  useTheirs: "Use the other version",
} as const;

export interface PendingNote {
  userId: string;
  sessionId: string;
  text: string;
  /** the server revision this text was written on top of (0 = no note yet) */
  baseRevision: number;
  updatedAt: number;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeStorage(): Store | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function pendingNotesKey(userId: string) {
  return `${PREFIX}${userId}`;
}

export function readPendingNotes(userId: string, store: Store | null = safeStorage()) {
  try {
    const raw = store?.getItem(pendingNotesKey(userId));
    const v = raw ? (JSON.parse(raw) as Record<string, PendingNote>) : {};
    // Only this user's entries, whatever else the key holds.
    return Object.fromEntries(Object.entries(v).filter(([, n]) => n && n.userId === userId));
  } catch {
    return {} as Record<string, PendingNote>;
  }
}

function writePendingNotes(userId: string, all: Record<string, PendingNote>, store: Store | null) {
  try {
    if (Object.keys(all).length === 0) store?.removeItem(pendingNotesKey(userId));
    else store?.setItem(pendingNotesKey(userId), JSON.stringify(all));
  } catch {
    /* storage full or blocked: the open editor still holds the text */
  }
}

export function setPendingNote(n: PendingNote, store: Store | null = safeStorage()) {
  const all = readPendingNotes(n.userId, store);
  all[n.sessionId] = n;
  writePendingNotes(n.userId, all, store);
}

export function clearPendingNote(
  userId: string,
  sessionId: string,
  store: Store | null = safeStorage(),
) {
  const all = readPendingNotes(userId, store);
  delete all[sessionId];
  writePendingNotes(userId, all, store);
}

/** App start / reconnect: push every pending note of this user. Conflicts wait for the editor. */
export async function retryPendingNotes(
  api: DillanApi,
  userId: string,
  store: Store | null = safeStorage(),
): Promise<number> {
  let saved = 0;
  const me = await api.auth.getUser().catch(() => null);
  if (me?.id !== userId) return 0;
  for (const p of Object.values(readPendingNotes(userId, store))) {
    try {
      const r = await api.notes.save(p.sessionId, p.text, p.baseRevision);
      if (r.ok || r.error === "not_found") {
        // not_found: the session is gone (deleted/discarded); nothing left to save it to.
        const cur = readPendingNotes(userId, store)[p.sessionId];
        if (cur && cur.text === p.text) clearPendingNote(userId, p.sessionId, store);
        if (r.ok) saved += 1;
      } else if (r.note && r.note.text === p.text) {
        clearPendingNote(userId, p.sessionId, store);
      }
    } catch {
      /* still offline */
    }
  }
  return saved;
}

export interface NoteAutosaveOptions {
  api: DillanApi;
  userId: string;
  sessionId: string;
  now?: () => number;
  storage?: Store | null;
  debounceMs?: number;
  listenOnline?: boolean;
}

export interface NoteSnapshot {
  loaded: boolean;
  text: string;
  status: NoteStatus;
}

export class NoteAutosave {
  private text = "";
  private revision = 0;
  private status: NoteStatus = { kind: "idle" };
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private again = false;
  private snap: NoteSnapshot = { loaded: false, text: "", status: { kind: "idle" } };
  private listeners = new Set<() => void>();
  private store: Store | null;
  private now: () => number;
  private off: (() => void) | null = null;
  private disposed = false;

  constructor(private o: NoteAutosaveOptions) {
    this.store = o.storage === undefined ? safeStorage() : o.storage;
    this.now = o.now ?? (() => Date.now());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private emit() {
    this.snap = { loaded: this.loaded, text: this.text, status: this.status };
    this.listeners.forEach((l) => l());
  }

  /** Server note, then any newer text kept on this device. */
  async load(): Promise<void> {
    this.disposed = false;
    if (this.o.listenOnline !== false && typeof window !== "undefined" && !this.off) {
      const on = () => {
        if (this.status.kind === "error") void this.saveNow();
        else if (this.status.kind === "load_error") void this.load();
      };
      window.addEventListener("online", on);
      this.off = () => window.removeEventListener("online", on);
    }
    let server: SessionNoteRow | null = null;
    let reached = true;
    try {
      server = await this.o.api.notes.get(this.o.sessionId);
    } catch {
      reached = false;
    }
    const pending = readPendingNotes(this.o.userId, this.store)[this.o.sessionId];
    this.text = server?.text ?? "";
    this.revision = server?.revision ?? 0;
    this.status = server?.text
      ? { kind: "saved", at: Date.parse(server.updated_at) }
      : { kind: "idle" };
    if (pending && pending.text !== this.text) {
      const serverAt = server ? Date.parse(server.updated_at) : 0;
      if (!reached || pending.updatedAt >= serverAt || pending.baseRevision === this.revision) {
        // Restore the text kept on this device over the server text.
        const serverText = this.text;
        this.text = pending.text;
        if (reached && pending.baseRevision !== this.revision) {
          this.status = { kind: "conflict", serverText, serverRevision: this.revision };
        } else {
          this.revision = reached ? this.revision : pending.baseRevision;
          this.status = { kind: "error" };
        }
      } else {
        clearPendingNote(this.o.userId, this.o.sessionId, this.store);
      }
    } else if (pending) {
      clearPendingNote(this.o.userId, this.o.sessionId, this.store);
    }
    if (!reached && !pending) {
      // Unknown, not empty: an editable blank field would claim there is no note, and a save
      // from revision 0 would end in a conflict the user never caused.
      this.text = "";
      this.loaded = false;
      this.status = { kind: "load_error" };
      this.emit();
      return;
    }
    this.loaded = true;
    this.emit();
    // App start retry for text that was kept on this device.
    if (reached && this.status.kind === "error") void this.saveNow();
  }

  input(text: string) {
    if (this.status.kind === "load_error") return;
    const t = text.slice(0, NOTE_MAX);
    this.text = t;
    if (this.status.kind !== "conflict") this.status = { kind: "dirty" };
    setPendingNote(
      {
        userId: this.o.userId,
        sessionId: this.o.sessionId,
        text: t,
        baseRevision: this.revision,
        updatedAt: this.now(),
      },
      this.store,
    );
    this.emit();
    if (this.status.kind === "conflict") return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, this.o.debounceMs ?? NOTE_DEBOUNCE_MS);
  }

  /** Retry now (and the debounce target). Coalesces calls made while a save is running. */
  async saveNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.status.kind === "conflict") return;
    if (this.saving) {
      this.again = true;
      return this.saving;
    }
    this.saving = this.doSave().finally(() => {
      this.saving = null;
      if (this.again && !this.disposed) {
        this.again = false;
        void this.saveNow();
      }
    });
    return this.saving;
  }

  private async doSave() {
    const sent = this.text;
    this.status = { kind: "saving" };
    this.emit();
    try {
      const r = await this.o.api.notes.save(this.o.sessionId, sent, this.revision);
      if (r.ok) {
        this.revision = r.note.revision;
        if (this.text === sent) {
          clearPendingNote(this.o.userId, this.o.sessionId, this.store);
          this.status = { kind: "saved", at: this.now() };
        } else {
          // Typed more while saving: the newer text goes out next.
          this.status = { kind: "dirty" };
          this.again = true;
          setPendingNote(
            {
              userId: this.o.userId,
              sessionId: this.o.sessionId,
              text: this.text,
              baseRevision: this.revision,
              updatedAt: this.now(),
            },
            this.store,
          );
        }
      } else if (r.error === "stale_revision") {
        const serverText = r.note?.text ?? "";
        const serverRevision = r.note?.revision ?? 0;
        if (serverText === sent) {
          this.revision = serverRevision;
          clearPendingNote(this.o.userId, this.o.sessionId, this.store);
          this.status = { kind: "saved", at: this.now() };
        } else {
          this.status = { kind: "conflict", serverText, serverRevision };
        }
      } else {
        this.status = { kind: "error" };
      }
    } catch {
      this.status = { kind: "error" };
    }
    this.emit();
  }

  /** Conflict: save this device's text on top of the other version. */
  keepMine() {
    if (this.status.kind !== "conflict") return;
    this.revision = this.status.serverRevision;
    this.status = { kind: "dirty" };
    setPendingNote(
      {
        userId: this.o.userId,
        sessionId: this.o.sessionId,
        text: this.text,
        baseRevision: this.revision,
        updatedAt: this.now(),
      },
      this.store,
    );
    this.emit();
    void this.saveNow();
  }

  /** Conflict: take the other device's text; this device's text is discarded. */
  useTheirs() {
    if (this.status.kind !== "conflict") return;
    this.text = this.status.serverText;
    this.revision = this.status.serverRevision;
    clearPendingNote(this.o.userId, this.o.sessionId, this.store);
    this.status = { kind: "saved", at: this.now() };
    this.emit();
  }

  /** Leaving the screen: send unsaved text now; pendingNotes keeps it if that fails. */
  dispose() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      void this.saveNow();
    }
    this.disposed = true;
    this.off?.();
    this.off = null;
  }
}
