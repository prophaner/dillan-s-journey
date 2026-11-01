// Session notes field with autosave (handoff 4.7): status line, Retry now, conflict choice.

import { useEffect, useId, useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/v1/data/client";
import { NOTE_COPY, NOTE_MAX, NoteAutosave, type NoteStatus } from "@/v1/session/notes";
import { formatClock } from "./timezones";
import { DButton } from "@/components/dillan/button";
import { Eyebrow, TextArea } from "@/components/dillan/form-pieces";
import { cn } from "@/lib/utils";

export function statusText(s: NoteStatus, tz?: string): string {
  switch (s.kind) {
    case "dirty":
      return NOTE_COPY.dirty;
    case "saving":
      return NOTE_COPY.saving;
    case "saved":
      return NOTE_COPY.saved(formatClock(s.at, tz));
    case "error":
      return NOTE_COPY.error;
    case "conflict":
      return NOTE_COPY.conflict;
    case "load_error":
      return NOTE_COPY.loadError;
    default:
      return "";
  }
}

export function NotesEditor({
  sessionId,
  userId,
  timeZone,
  label = "Session notes",
}: {
  sessionId: string;
  userId: string;
  timeZone?: string;
  label?: string;
}) {
  const api = useApi();
  const id = useId();
  const ctl = useMemo(() => new NoteAutosave({ api, userId, sessionId }), [api, userId, sessionId]);
  useEffect(() => {
    void ctl.load();
    return () => ctl.dispose();
  }, [ctl]);
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  const st = snap.status;
  const qc = useQueryClient();
  const savedAt = st.kind === "saved" ? st.at : null;
  useEffect(() => {
    // Calendar/Home show a note indicator: refresh them once a save lands.
    if (savedAt == null) return;
    void qc.invalidateQueries({ queryKey: ["v1", userId, "month"] });
    void qc.invalidateQueries({ queryKey: ["v1", userId, "history"] });
  }, [savedAt, qc, userId]);
  const warn = st.kind === "error" || st.kind === "conflict" || st.kind === "load_error";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={`${id}-notes`}>
          <Eyebrow>{label}</Eyebrow>
        </label>
        <span
          id={`${id}-status`}
          role="status"
          aria-live="polite"
          className={cn("text-footnote", warn ? "font-medium text-hold" : "text-text-2")}
        >
          {statusText(st, timeZone)}
        </span>
      </div>
      <TextArea
        id={`${id}-notes`}
        aria-describedby={`${id}-status`}
        className="min-h-32"
        placeholder={NOTE_COPY.placeholder}
        maxLength={NOTE_MAX}
        value={snap.text}
        disabled={!snap.loaded}
        onChange={(e) => ctl.input(e.target.value)}
      />
      {st.kind === "load_error" && (
        <DButton
          size="md"
          variant="secondary"
          className="self-start"
          onClick={() => void ctl.load()}
        >
          {NOTE_COPY.loadRetry}
        </DButton>
      )}
      {st.kind === "error" && (
        <DButton
          size="md"
          variant="secondary"
          className="self-start"
          onClick={() => void ctl.saveNow()}
        >
          {NOTE_COPY.retry}
        </DButton>
      )}
      {st.kind === "conflict" && (
        <div className="flex flex-col gap-2 rounded-btn bg-hold-tint p-3 text-subhead">
          <p className="text-text">The other version:</p>
          <p className="whitespace-pre-wrap break-words text-text-2">
            {st.serverText || "(empty)"}
          </p>
          <div className="flex flex-wrap gap-2">
            <DButton
              size="md"
              variant="secondary"
              className="bg-surface"
              onClick={() => ctl.keepMine()}
            >
              {NOTE_COPY.keepMine}
            </DButton>
            <DButton size="md" variant="outline" onClick={() => ctl.useTheirs()}>
              {NOTE_COPY.useTheirs}
            </DButton>
          </div>
        </div>
      )}
    </div>
  );
}
