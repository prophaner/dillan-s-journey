// S11 Summary: shown as soon as the session is ended (saved automatically by the End command;
// notes are never required). Also the shared pieces of S13 (status chip, zones card).

import { Link } from "@tanstack/react-router";
import {
  engineStateFromRow,
  type SessionSummaryRow,
  type WorkoutSessionRow,
  type ZoneCutoffs,
} from "@/v1/core/types";
import { activeMs, formatDuration } from "@/v1/core/timing";
import { useProfile, useSummary } from "@/v1/data/queries";
import { counts } from "@/v1/session/format";
import { formatClock } from "./timezones";
import { useUser } from "./user-context";
import { NotesEditor } from "./notes-editor";
import { ZONE_COPY, ZoneBreakdown } from "./zone-pieces";
import { DButton, dButton } from "@/components/dillan/button";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { Card } from "@/components/dillan/surfaces";
import { StatusTag } from "@/components/dillan/tags";
import { cn } from "@/lib/utils";

export const SUMMARY_COPY = {
  title: "Workout saved",
  saved: "Saved automatically. You can edit notes any time from Calendar.",
  completed: "Completed",
  endedEarly: "Ended early",
  done: "Done",
  finalizing: "Adding up heart-rate zones…",
  discarded: "This workout was discarded. It doesn't count toward your progress.",
  zonesNotSet: "Zones weren't set for this session, so all time is Unmeasured.",
  loadFailed: "Couldn't load the heart-rate summary. Check your connection.",
  tryAgain: "Try again",
} as const;

export function OutcomeTag({
  outcome,
  done,
  total,
}: {
  outcome: "completed" | "partial" | "discarded" | null;
  done?: number;
  total?: number;
}) {
  if (outcome === "completed") return <StatusTag kind="done">{SUMMARY_COPY.completed}</StatusTag>;
  return (
    <StatusTag kind="neutral" icon={false}>
      {SUMMARY_COPY.endedEarly}
      {done != null && total != null ? ` · ${done} of ${total} sets` : ""}
    </StatusTag>
  );
}

/** Heart-rate card body for summary and detail. */
export function ZonesCard({
  row,
  summary,
  loading,
  error,
  onRetry,
}: {
  row: Pick<WorkoutSessionRow, "live_data" | "zone_snapshot" | "is_demo">;
  summary: SessionSummaryRow | null | undefined;
  loading?: boolean;
  /** the summary query failed: say so and offer a retry instead of "Adding up…" forever */
  error?: boolean;
  onRetry?: () => void;
}) {
  const cutoffs: ZoneCutoffs | null = row.zone_snapshot?.cutoffs ?? null;
  let body: React.ReactNode;
  if (!row.live_data) body = <p className="text-subhead text-text-2">{ZONE_COPY.noLiveData}</p>;
  else if (error && !summary)
    body = (
      <>
        <p className="text-subhead text-text-2">{SUMMARY_COPY.loadFailed}</p>
        {onRetry && (
          <DButton variant="outline" size="md" className="mt-3" onClick={onRetry}>
            {SUMMARY_COPY.tryAgain}
          </DButton>
        )}
      </>
    );
  else if (loading || !summary || summary.hr_status === "pending")
    body = <p className="text-subhead text-text-2">{SUMMARY_COPY.finalizing}</p>;
  else if (!cutoffs)
    // Samples may well exist; without confirmed zones all time is Unmeasured (never guessed).
    body = (
      <>
        <p className="mb-3 text-subhead text-text-2">{SUMMARY_COPY.zonesNotSet}</p>
        <ZoneBreakdown
          zoneMs={summary.zone_ms}
          unmeasuredMs={summary.unmeasured_ms}
          cutoffs={null}
        />
        <Link
          to="/profile/zones"
          className={cn(dButton({ variant: "outline", size: "md" }), "mt-3 w-full")}
        >
          {ZONE_COPY.setUp}
        </Link>
      </>
    );
  else if (summary.measured_ms === 0)
    body = (
      <>
        <p className="mb-3 text-subhead text-text-2">{ZONE_COPY.noSamples}</p>
        <ZoneBreakdown
          zoneMs={summary.zone_ms}
          unmeasuredMs={summary.unmeasured_ms}
          cutoffs={cutoffs}
        />
      </>
    );
  else
    body = (
      <>
        <ZoneBreakdown
          zoneMs={summary.zone_ms}
          unmeasuredMs={summary.unmeasured_ms}
          cutoffs={cutoffs}
        />
        <p className="mt-2 text-footnote text-text-2">
          Heart-rate coverage {Math.round(Number(summary.coverage) * 100)}%
          {summary.hr_sources_used.length ? ` · via ${summary.hr_sources_used.join(", ")}` : ""}
        </p>
      </>
    );
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>Heart-rate zones</Eyebrow>
        {!row.live_data && <StatusTag kind="neutral">No HR data</StatusTag>}
        {row.is_demo && <StatusTag kind="neutral">Demo data</StatusTag>}
      </div>
      {body}
    </Card>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="min-w-0">
      <p className="font-num text-title1 font-bold tabular leading-tight">{value}</p>
      <p className="text-footnote font-bold uppercase tracking-wider text-text-2">{label}</p>
    </div>
  );
}

export function SummaryView({ row }: { row: WorkoutSessionRow }) {
  const user = useUser();
  const profile = useProfile(user.id);
  // Session times in the timezone the session started in (as detail, Home and Calendar do);
  // the profile timezone only for the notes "Saved h:mm" status.
  const sessionTz = row.start_timezone;
  const tz = profile.data?.timezone ?? row.start_timezone;
  const summary = useSummary(user.id, row.id, row.outcome !== "discarded");

  if (row.outcome === "discarded")
    return (
      <div className="flex flex-col gap-4 py-6">
        <p className="text-headline">{SUMMARY_COPY.discarded}</p>
        <Link to="/" className={dButton({ variant: "primary", size: "lg" })}>
          Home
        </Link>
      </div>
    );

  const c = counts(row);
  const s = summary.data;
  // Until the summary row arrives (or if it fails), active time comes from the row itself.
  const active =
    s?.active_ms ??
    (row.ended_at ? activeMs(engineStateFromRow(row), Date.parse(row.ended_at)) : 0);
  const day = s?.local_date;

  return (
    <div className="flex flex-col gap-3 pb-8">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <OutcomeTag outcome={row.outcome} done={c.done} total={c.total} />
          {row.started_at && row.ended_at && (
            <span className="text-subhead text-text-2">
              {formatClock(row.started_at, sessionTz)}–{formatClock(row.ended_at, sessionTz)}
            </span>
          )}
        </div>
        <h2 className="mt-2 break-words text-title2 font-bold">{row.snapshot.name}</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric value={formatDuration(active)} label="Active" />
          <Metric value={c.done} label="Sets done" />
          {c.skipped > 0 && <Metric value={c.skipped} label="Skipped" />}
          {c.notReached > 0 && <Metric value={c.notReached} label="Not reached" />}
        </div>
        {s && (
          <p className="mt-3 text-footnote text-text-2">
            Active excludes pauses · Elapsed {formatDuration(s.elapsed_ms)}
            {s.paused_ms > 5_000 ? ` · Paused ${formatDuration(s.paused_ms)} (not counted)` : ""}
          </p>
        )}
      </Card>
      <ZonesCard
        row={row}
        summary={s}
        loading={summary.isLoading}
        error={summary.isError}
        onRetry={() => void summary.refetch()}
      />
      <Card>
        <NotesEditor sessionId={row.id} userId={user.id} timeZone={tz} />
      </Card>
      <Link
        to="/calendar"
        search={day ? { day } : {}}
        className={cn(dButton({ variant: "primary", size: "lg" }), "mt-2")}
      >
        {SUMMARY_COPY.done}
      </Link>
      <p className="text-center text-footnote text-text-2">{SUMMARY_COPY.saved}</p>
    </div>
  );
}
