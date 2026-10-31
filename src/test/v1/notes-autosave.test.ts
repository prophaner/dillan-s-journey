// Notes autosave state machine (handoff 4.7, acceptance 33/34): Unsaved changes immediately,
// Saving… after 800 ms idle, Saved HH:MM; a failed save keeps the text on this device, survives a
// reload, retries on app start / Retry now; revision conflicts ask which version to keep.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "@/v1/data/mock-api";
import { MOCK_LUIS, MOCK_MAYA, seedMockDb } from "@/v1/data/mock-fixtures";
import type { DillanApi } from "@/v1/data/api";
import {
  NOTE_COPY,
  NoteAutosave,
  readPendingNotes,
  retryPendingNotes,
  setPendingNote,
} from "@/v1/session/notes";
import { statusText } from "@/v1/ui/notes-editor";

type Api = ReturnType<typeof createMockApi>;
let api: Api;
let sessionId: string;

beforeEach(async () => {
  localStorage.clear();
  api = createMockApi({ storage: null, db: seedMockDb(), hrMode: () => "off" });
  await api.auth.verifyOtp("email", "luis@example.com", "123456");
  // A seeded ended session without a note.
  const h = await api.sessions.history();
  sessionId = h.find((x) => !x.has_note)!.session_id;
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function failing(base: DillanApi) {
  const s = { fail: true };
  const a: DillanApi = {
    ...base,
    notes: {
      ...base.notes,
      save: async (...args) => {
        if (s.fail) throw new TypeError("Failed to fetch");
        return base.notes.save(...args);
      },
    },
  };
  return { api: a, s };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("notes autosave", () => {
  it("dirty at once, saving after 800 ms idle, then Saved HH:MM", async () => {
    vi.useFakeTimers();
    const n = new NoteAutosave({ api, userId: MOCK_LUIS, sessionId, listenOnline: false });
    await n.load();
    expect(n.getSnapshot().status.kind).toBe("idle");
    n.input("Felt");
    expect(statusText(n.getSnapshot().status)).toBe("Unsaved changes");
    vi.advanceTimersByTime(500);
    n.input("Felt good");
    vi.advanceTimersByTime(799);
    expect(n.getSnapshot().status.kind).toBe("dirty");
    vi.advanceTimersByTime(1);
    expect(statusText(n.getSnapshot().status)).toBe(NOTE_COPY.saving);
    await flush();
    const st = n.getSnapshot().status;
    expect(st.kind).toBe("saved");
    expect(statusText(st, "UTC")).toMatch(/^Saved \d{1,2}:\d{2} (AM|PM)$/);
    expect((await api.notes.get(sessionId))?.text).toBe("Felt good");
    expect(readPendingNotes(MOCK_LUIS)[sessionId]).toBeUndefined();
    n.dispose();
  });

  it("keeps the note on this device when saving fails, survives reload, and retries", async () => {
    vi.useFakeTimers();
    const f = failing(api);
    const n = new NoteAutosave({ api: f.api, userId: MOCK_LUIS, sessionId, listenOnline: false });
    await n.load();
    n.input("Try 35 lb next time");
    vi.advanceTimersByTime(800);
    await flush();
    expect(statusText(n.getSnapshot().status)).toBe("Not saved — we kept your note on this device");
    expect(readPendingNotes(MOCK_LUIS)[sessionId]?.text).toBe("Try 35 lb next time");
    // Retry now while still failing: still an error, text still kept.
    await n.saveNow();
    expect(n.getSnapshot().status.kind).toBe("error");
    n.dispose();

    // Reload while still offline: the text is restored over the (empty) server note.
    const n2 = new NoteAutosave({ api: f.api, userId: MOCK_LUIS, sessionId, listenOnline: false });
    await n2.load();
    await flush();
    expect(n2.getSnapshot().text).toBe("Try 35 lb next time");
    expect(n2.getSnapshot().status.kind).toBe("error");

    // Back online: Retry now saves it and clears the device copy.
    f.s.fail = false;
    await n2.saveNow();
    expect(n2.getSnapshot().status.kind).toBe("saved");
    expect((await api.notes.get(sessionId))?.text).toBe("Try 35 lb next time");
    expect(readPendingNotes(MOCK_LUIS)[sessionId]).toBeUndefined();
    n2.dispose();
  });

  it("retries pending notes on app start, only for the signed-in user", async () => {
    setPendingNote({
      userId: MOCK_LUIS,
      sessionId,
      text: "From last night",
      baseRevision: 0,
      updatedAt: Date.now(),
    });
    await api.auth.verifyOtp("email", "maya@example.com", "123456");
    expect(await retryPendingNotes(api, MOCK_LUIS)).toBe(0);
    expect(readPendingNotes(MOCK_LUIS)[sessionId]?.text).toBe("From last night");
    expect(readPendingNotes(MOCK_MAYA)).toEqual({});

    await api.auth.verifyOtp("email", "luis@example.com", "123456");
    expect(await retryPendingNotes(api, MOCK_LUIS)).toBe(1);
    expect((await api.notes.get(sessionId))?.text).toBe("From last night");
    expect(readPendingNotes(MOCK_LUIS)[sessionId]).toBeUndefined();
  });

  it("asks which version to keep when the note changed on another device", async () => {
    const n = new NoteAutosave({ api, userId: MOCK_LUIS, sessionId, listenOnline: false });
    await n.load();
    // Another device saves first.
    await api.notes.save(sessionId, "From the TV phone", 0);
    n.input("From this phone");
    await n.saveNow();
    const st = n.getSnapshot().status;
    expect(st.kind).toBe("conflict");
    if (st.kind === "conflict") expect(st.serverText).toBe("From the TV phone");
    expect(readPendingNotes(MOCK_LUIS)[sessionId]?.text).toBe("From this phone");

    n.keepMine();
    await flush();
    expect(n.getSnapshot().status.kind).toBe("saved");
    const saved = await api.notes.get(sessionId);
    expect(saved?.text).toBe("From this phone");
    expect(saved?.revision).toBe(2);
    n.dispose();
  });

  it("use the other version replaces the text and drops the device copy", async () => {
    const n = new NoteAutosave({ api, userId: MOCK_LUIS, sessionId, listenOnline: false });
    await n.load();
    await api.notes.save(sessionId, "Theirs", 0);
    n.input("Mine");
    await n.saveNow();
    n.useTheirs();
    expect(n.getSnapshot().text).toBe("Theirs");
    expect(n.getSnapshot().status.kind).toBe("saved");
    expect(readPendingNotes(MOCK_LUIS)[sessionId]).toBeUndefined();
    n.dispose();
  });
});
