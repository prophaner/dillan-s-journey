// Zone pill, zone breakdown bars and the heart-rate status chip (design-system "Zone pill",
// "Zone bars", "Status line"). Zone color never appears without "Zone N · range" text.

import type { HealthState } from "@/v1/core/health";
import { formatDuration } from "@/v1/core/timing";
import type { ZoneCutoffs } from "@/v1/core/types";
import { zoneRangeLabel, type ZoneNumber } from "@/v1/core/zones";
import { cn } from "@/lib/utils";

const ZONE_TEXT = ["text-z1", "text-z2", "text-z3", "text-z4", "text-z5"] as const;
const ZONE_TINT = ["bg-z1-tint", "bg-z2-tint", "bg-z3-tint", "bg-z4-tint", "bg-z5-tint"] as const;
const ZONE_FILL = ["bg-z1", "bg-z2", "bg-z3", "bg-z4", "bg-z5"] as const;

export const ZONE_COPY = {
  unknown: "Zone unknown",
  setUp: "Set up zones",
  unmeasured: "Unmeasured",
  caption: "Unmeasured = no fresh reading, paused, or zones not set. Never guessed.",
  noLiveData: "No heart-rate data — you continued without live data.",
  noSamples: "No heart-rate data recorded.",
  allZones: "All zones",
  timeInEach: "Time in each zone",
  timeInZone: "Time in this zone",
} as const;

export function ZonePill({
  zone,
  cutoffs,
  className,
}: {
  zone: ZoneNumber | null;
  /** null: zones were not confirmed for this session */
  cutoffs: ZoneCutoffs | null;
  className?: string;
}) {
  const base =
    "zone-pill inline-flex h-9 max-w-full items-center gap-1.5 rounded-chip px-3 text-subhead font-bold";
  if (!cutoffs)
    return (
      <span className={cn(base, "border border-dashed border-unknown text-text-2", className)}>
        {ZONE_COPY.setUp}
      </span>
    );
  if (zone == null)
    return (
      <span className={cn(base, "bg-zu-tint text-text-2", className)}>{ZONE_COPY.unknown}</span>
    );
  return (
    <span className={cn(base, ZONE_TINT[zone - 1], ZONE_TEXT[zone - 1], className)}>
      <span className={cn("size-2 shrink-0 rounded-full", ZONE_FILL[zone - 1])} aria-hidden />
      <span className="truncate">
        Zone {zone} · <span className="font-medium tabular">{zoneRangeLabel(zone, cutoffs)}</span>
      </span>
    </span>
  );
}

/** Five zones + Unmeasured, each with label, bar and duration. */
export function ZoneBreakdown({
  zoneMs,
  unmeasuredMs,
  cutoffs,
}: {
  zoneMs: readonly number[];
  unmeasuredMs: number;
  cutoffs: ZoneCutoffs | null;
}) {
  const total = Math.max(1, zoneMs.reduce((n, x) => n + x, 0) + unmeasuredMs);
  const rows: Array<{ key: string; label: React.ReactNode; ms: number; fill: string }> = [];
  ([1, 2, 3, 4, 5] as const).forEach((z) =>
    rows.push({
      key: `z${z}`,
      label: (
        <>
          <span className={cn("font-bold", ZONE_TEXT[z - 1])}>Zone {z}</span>{" "}
          <span className="text-text-2">{cutoffs ? zoneRangeLabel(z, cutoffs) : "—"}</span>
        </>
      ),
      ms: zoneMs[z - 1] ?? 0,
      fill: ZONE_FILL[z - 1] as string,
    }),
  );
  rows.push({
    key: "u",
    label: <span className="font-bold text-text-2">{ZONE_COPY.unmeasured}</span>,
    ms: unmeasuredMs,
    fill: "bg-zu",
  });
  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 text-subhead"
          >
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="h-2 overflow-hidden rounded-chip bg-surface-2" aria-hidden>
              <span
                className={cn("block h-full rounded-chip", r.fill)}
                style={{ width: `${(r.ms / total) * 100}%` }}
              />
            </span>
            <span className="font-num tabular text-text">{formatDuration(r.ms)}</span>
          </li>
        ))}
      </ul>
      <p className="text-footnote text-text-2">{ZONE_COPY.caption}</p>
    </div>
  );
}

export type ChipTone = "live" | "warn" | "off";

export function toneOf(h: HealthState): ChipTone {
  if (h.id === "H3_live") return "live";
  if (h.id === "H10_off" || h.id === "H0_not_set_up") return "off";
  return "warn";
}

export function HealthChip({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-chip px-2.5 text-footnote font-bold",
        tone === "live" && "bg-steady-tint text-steady",
        tone === "warn" && "bg-hold-tint text-hold",
        tone === "off" && "bg-surface-2 text-text-2",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "live" ? "bg-steady" : tone === "warn" ? "bg-hold" : "border border-text-3",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
