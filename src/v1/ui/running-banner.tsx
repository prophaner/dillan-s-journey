// "Workout running · Back to workout" (handoff §5 Home copy, F6 recovery). Shown on tab screens
// whenever the user has an unfinished session; reload/Back never ends it.

import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { activeMs, formatDuration } from "@/v1/core/timing";
import { engineStateFromRow } from "@/v1/core/types";
import { useCurrentSession } from "@/v1/data/queries";
import { useNow } from "@/v1/session/use-session";
import { useUser } from "./user-context";
import { dButton } from "@/components/dillan/button";
import { cn } from "@/lib/utils";

export const RUNNING_COPY = { title: "Workout running", action: "Back to workout" } as const;

export function RunningBanner({ className }: { className?: string }) {
  const user = useUser();
  const { data: row } = useCurrentSession(user.id);
  const now = useNow();
  if (!row) return null;
  const s = engineStateFromRow(row);
  const status =
    row.state === "paused"
      ? `Paused · ${formatDuration(activeMs(s, now))} active`
      : row.state === "preparing"
        ? "Not started yet"
        : `${formatDuration(activeMs(s, now))} active`;
  return (
    // Not a live region: the active time ticks every second and must not be re-announced.
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-card border-[1.5px] border-text bg-surface p-4",
        className,
      )}
    >
      <div className="min-w-0 flex-[1_1_11rem]">
        <p className="text-headline font-bold">
          {RUNNING_COPY.title} · <span className="break-words">{row.snapshot.name}</span>
        </p>
        <p className="mt-0.5 text-subhead tabular text-text-2" aria-live="off">
          {status}
        </p>
      </div>
      <Link
        to="/session/$id"
        params={{ id: row.id }}
        className={cn(dButton({ variant: "primary", size: "md" }), "shrink-0")}
      >
        <Play className="size-4 fill-current" aria-hidden />
        {RUNNING_COPY.action}
      </Link>
    </div>
  );
}
