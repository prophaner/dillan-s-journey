// S13 Session detail: the snapshot as it was that day, every set (Done reps · weight / Skipped /
// Not reached), active vs elapsed time labelled, zones with coverage and Unmeasured, and the notes
// editor (autosave, handoff 4.7). Viewing a pending heart-rate summary finalizes it (useSummary).

import { useNavigate } from "@tanstack/react-router";
import { Check, Minus, Slash } from "lucide-react";
import { formatDuration } from "@/v1/core/timing";
import { useProfile, useSessionRow, useSummary, useTemplate } from "@/v1/data/queries";
import {
  counts,
  doneText,
  exercisesWithSteps,
  formatDay,
  prescribedText,
} from "@/v1/session/format";
import { formatClock } from "./timezones";
import { useUser } from "./user-context";
import { NotesEditor } from "./notes-editor";
import { OutcomeTag, ZonesCard } from "./summary-view";
import { ScreenHeader } from "@/components/dillan/app-shell";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { Card, ScreenState } from "@/components/dillan/surfaces";
import { StatusTag } from "@/components/dillan/tags";
import { cn } from "@/lib/utils";

export const DETAIL_COPY = {
  title: "Session",
  snapshot:
    "Snapshot of the workout as it was that day. Editing the template later doesn't change this.",
  deleted: "from a deleted workout",
} as const;

export function SessionDetailPage({ sessionId }: { sessionId: string }) {
  const user = useUser();
  const { data: profile } = useProfile(user.id);
  const q = useSessionRow(user.id, sessionId);
  const row = q.data;
  const ended = row?.state === "ended" && row.outcome !== "discarded";
  const summary = useSummary(user.id, sessionId, !!ended);
  const tpl = useTemplate(user.id, row?.template_id ?? null);
  const day = summary.data?.local_date;
  const back = <ScreenHeader title={DETAIL_COPY.title} back="/calendar" />;

  if (q.isLoading) return <ScreenState kind="loading" />;
  if (q.isError)
    return (
      <>
        {back}
        <ScreenState
          kind="failed"
          title="Couldn't load this session"
          body="Check your connection."
          action={{ label: "Try again", onClick: () => void q.refetch() }}
        />
      </>
    );
  if (!row || !ended)
    return (
      <>
        {back}
        <ScreenState kind="empty" title="Session not found" body="It may have been removed." />
      </>
    );

  const tz = profile?.timezone ?? row.start_timezone;
  const c = counts(row);
  const deleted = !row.template_id || (!tpl.isLoading && (!tpl.data || !!tpl.data.deleted_at));
  const s = summary.data;

  return (
    <>
      <DetailHeader day={day} />
      <div className="flex flex-col gap-3 pb-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <OutcomeTag outcome={row.outcome} done={c.done} total={c.total} />
            {!row.live_data && <StatusTag kind="neutral">No HR data</StatusTag>}
          </div>
          <h2 className="mt-2 break-words text-title2 font-bold">{row.snapshot.name}</h2>
          {deleted && <p className="text-subhead text-text-2">{DETAIL_COPY.deleted}</p>}
          {row.started_at && row.ended_at && (
            <p className="mt-1 text-subhead text-text-2">
              {formatDay(row.started_at, row.start_timezone)} ·{" "}
              {formatClock(row.started_at, row.start_timezone)}–
              {formatClock(row.ended_at, row.start_timezone)}
            </p>
          )}
          {s && (
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <dt className="text-footnote font-bold uppercase tracking-wider text-text-2">
                  Active (excludes pauses)
                </dt>
                <dd className="font-num text-title3 font-bold tabular">
                  {formatDuration(s.active_ms)}
                </dd>
              </div>
              <div>
                <dt className="text-footnote font-bold uppercase tracking-wider text-text-2">
                  Elapsed (includes pauses)
                </dt>
                <dd className="font-num text-title3 font-bold tabular">
                  {formatDuration(s.elapsed_ms)}
                </dd>
              </div>
            </dl>
          )}
          <p className="mt-3 text-footnote text-text-2">{DETAIL_COPY.snapshot}</p>
        </Card>

        <Card>
          <Eyebrow>Sets</Eyebrow>
          <div className="mt-2 flex flex-col gap-5">
            {exercisesWithSteps(row.snapshot, row.steps).map(({ key, ex, block, steps, label }) => (
              <div key={key}>
                <h3 className="break-words text-headline font-bold">
                  {label ? `${label} · ` : ""}
                  {ex.name}
                </h3>
                <p className="text-subhead text-text-2">Prescribed: {prescribedText(block, ex)}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {steps.map((st) => {
                    const r = row.results[st.key];
                    const status = r?.status ?? "not_reached";
                    return (
                      <li
                        key={st.key}
                        data-status={status}
                        className="flex min-h-12 items-center gap-3 rounded-btn border border-line px-3 py-2"
                      >
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-full",
                            status === "done" ? "bg-steady text-bg" : "bg-surface-2 text-text-2",
                          )}
                          aria-hidden
                        >
                          {status === "done" ? (
                            <Check className="size-4" />
                          ) : status === "skipped" ? (
                            <Slash className="size-4" />
                          ) : (
                            <Minus className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-footnote text-text-2">
                            {block.type === "superset" ? "Round" : "Set"} {st.set + 1}
                          </span>
                          <span
                            className={cn(
                              "block font-num text-headline tabular",
                              status === "done" ? "font-bold" : "text-text-2",
                            )}
                          >
                            {status === "done" && r
                              ? doneText(r, ex)
                              : status === "skipped"
                                ? "Skipped"
                                : "Not reached"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <ZonesCard row={row} summary={s} loading={summary.isLoading} />

        <Card>
          <NotesEditor sessionId={row.id} userId={user.id} timeZone={tz} />
        </Card>
      </div>
    </>
  );
}

/** Back returns to Calendar with this session's day selected. */
function DetailHeader({ day }: { day: string | undefined }) {
  const navigate = useNavigate();
  return (
    <ScreenHeader
      title={DETAIL_COPY.title}
      onBack={() => void navigate({ to: "/calendar", search: day ? { day } : {} })}
    />
  );
}
