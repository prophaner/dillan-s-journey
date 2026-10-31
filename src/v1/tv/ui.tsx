// TV building blocks (design/v1/docs/04-design-system.md "TV", prototype .tv): focusable buttons
// (≥72×72, focus ring from styles.css), panels, the top nav, dialogs, QR and the footer hints.
// Every color/size comes from tokens (text-tv-*, bg-surface, …). No hover states.

import { forwardRef, useMemo, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type { ZoneCutoffs } from "@/v1/core/types";
import { formatDuration } from "@/v1/core/timing";
import { zoneRangeLabel, type ZoneNumber } from "@/v1/core/zones";
import { Wordmark } from "@/components/dillan/wordmark";
import { cn } from "@/lib/utils";
import { encodeQr, qrPath } from "./qr";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface TvButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  focusId: string;
  autoFocus?: boolean;
  variant?: Variant;
  size?: "md" | "lg" | "xl";
  onPress?: () => void;
  icon?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-spot text-on-accent data-[focused]:bg-spot-press disabled:bg-surface-2 disabled:text-text-3",
  secondary:
    "border-2 border-line bg-surface text-text data-[focused]:border-text data-[focused]:bg-text data-[focused]:text-bg",
  ghost: "bg-transparent text-text-2 data-[focused]:bg-surface-2 data-[focused]:text-text",
  // destructive confirms: Iron-like fill with the verb (never red)
  danger: "bg-text text-bg data-[focused]:bg-text-2",
};

const SIZE = {
  md: "min-h-tv-tap px-8 text-tv-base",
  lg: "min-h-[88px] px-10 text-tv-md",
  xl: "min-h-[104px] px-12 text-tv-lg",
};

export const TvButton = forwardRef<HTMLButtonElement, TvButtonProps>(function TvButton(
  {
    focusId,
    autoFocus,
    variant = "secondary",
    size = "lg",
    onPress,
    icon,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-focus=""
      data-focus-id={focusId}
      {...(autoFocus ? { "data-autofocus": "" } : {})}
      onClick={onPress}
      className={cn(
        "inline-flex min-w-tv-tap select-none items-center whitespace-nowrap justify-center gap-4 rounded-tv-md font-ui font-bold",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function TvEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-tv-xs font-bold uppercase tracking-[0.12em] text-text-2", className)}>
      {children}
    </p>
  );
}

export function TvPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-8 rounded-tv-lg border border-line bg-surface p-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TvCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-tv-lg border border-line bg-surface p-8", className)}>
      {children}
    </div>
  );
}

export function TvAvatar({ name, size = 56 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-spot-tint font-bold text-spot-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export type NavKey = "home" | "program" | "calendar";

/** Top bar: wordmark, Home · Program · Calendar, avatar (Profile). */
export function TvTopBar({
  current,
  name,
  running,
  onNav,
  onProfile,
}: {
  current: NavKey | null;
  name: string;
  running: boolean;
  onNav: (k: NavKey) => void;
  onProfile: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center gap-6 pb-8">
      <Wordmark height={44} className="mr-6" />
      {/* The workout flow (Choose, Preflight) and Profile are modal to the nav (IA "TV"). */}
      {current && (
        <nav aria-label="Primary" className="flex gap-4">
          {(["home", "program", "calendar"] as const).map((k) => (
            <TvButton
              key={k}
              focusId={`nav-${k}`}
              variant="secondary"
              size="md"
              className={cn(
                "min-w-[200px]",
                current === k && "border-text bg-surface-2 data-[focused]:bg-text",
              )}
              aria-current={current === k ? "page" : undefined}
              onPress={() => onNav(k)}
            >
              {k === "home" ? "Home" : k === "program" ? "Program" : "Calendar"}
            </TvButton>
          ))}
        </nav>
      )}
      <span className="flex-1" />
      <TvButton
        focusId="avatar"
        variant="ghost"
        size="md"
        className="gap-4 text-text"
        aria-label={`${name}, profile and switch user`}
        onPress={onProfile}
      >
        <TvAvatar name={name} />
        <span className="max-w-[320px] truncate">{name}</span>
        {running && (
          <span className="rounded-chip bg-spot-tint px-4 py-1 text-tv-xs text-spot-ink">
            Workout running
          </span>
        )}
      </TvButton>
    </header>
  );
}

export function TvHints({ items, right }: { items: Array<[string, string]>; right?: ReactNode }) {
  return (
    <footer className="mt-6 flex shrink-0 items-center justify-between text-tv-sm text-text-3">
      <span className="flex flex-wrap items-center gap-6">
        {items.map(([k, v]) => (
          <span key={k + v} className="flex items-center gap-2">
            <kbd className="rounded-sm bg-surface-2 px-3 py-0.5 font-ui text-text-2">{k}</kbd>
            {v}
          </span>
        ))}
      </span>
      {right}
    </footer>
  );
}

/** Modal dialog: focus is trapped by the engine ([data-modal]); Back closes (= safe action). */
export function TvDialog({
  id,
  title,
  children,
  actions,
}: {
  id: string;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-bg/80"
      data-modal={id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex w-[1080px] flex-col gap-6 rounded-tv-lg border border-line bg-surface p-12">
        <h2 id={`${id}-title`} className="text-tv-xl font-bold leading-tight">
          {title}
        </h2>
        {children && <div className="text-tv-base text-text-2">{children}</div>}
        <div className="mt-4 flex flex-row justify-end gap-4">{actions}</div>
      </div>
    </div>
  );
}

/** QR (dark modules on chalk) with a quiet zone; the typed code is always shown next to it. */
export function TvQr({ value, label }: { value: string; label: string }) {
  const qr = useMemo(() => encodeQr(value), [value]);
  const n = qr.size + 8;
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label={label}
      className="size-tv-qr shrink-0 rounded-tv-lg"
      shapeRendering="crispEdges"
      data-qr-value={value}
    >
      <rect width={n} height={n} className="fill-[var(--chalk)]" />
      <path d={qrPath(qr)} className="fill-[var(--iron)]" />
    </svg>
  );
}

export function LockedTag() {
  return (
    <span className="flex items-center gap-2 text-tv-sm font-medium text-text-3">
      <Lock className="size-5" aria-hidden />
      Locked
    </span>
  );
}

const ZONE_TEXT = ["text-z1", "text-z2", "text-z3", "text-z4", "text-z5"] as const;
const ZONE_TINT = ["bg-z1-tint", "bg-z2-tint", "bg-z3-tint", "bg-z4-tint", "bg-z5-tint"] as const;
const ZONE_FILL = ["bg-z1", "bg-z2", "bg-z3", "bg-z4", "bg-z5"] as const;

/** Zone pill: color never without "Zone N · lo–hi" (acceptance 27). */
export function TvZonePill({
  zone,
  cutoffs,
}: {
  zone: ZoneNumber | null;
  cutoffs: ZoneCutoffs | null;
}) {
  const base =
    "zone-pill inline-flex h-14 items-center gap-3 self-start rounded-chip px-6 text-tv-base font-bold";
  if (!cutoffs)
    return (
      <span className={cn(base, "border-2 border-dashed border-unknown text-text-2")}>
        Set up zones
      </span>
    );
  if (zone == null) return <span className={cn(base, "bg-zu-tint text-text-2")}>Zone unknown</span>;
  return (
    <span className={cn(base, ZONE_TINT[zone - 1], ZONE_TEXT[zone - 1])}>
      <span className={cn("size-4 rounded-full", ZONE_FILL[zone - 1])} aria-hidden />
      Zone {zone} · <span className="font-medium tabular">{zoneRangeLabel(zone, cutoffs)}</span>
    </span>
  );
}

/** Five zones + Unmeasured (labels, bars, durations); no zone color without confirmed zones. */
export function TvZoneBars({
  zoneMs,
  unmeasuredMs,
  cutoffs,
  compact,
}: {
  zoneMs: readonly number[];
  unmeasuredMs: number;
  cutoffs: ZoneCutoffs | null;
  compact?: boolean;
}) {
  const total = Math.max(1, zoneMs.reduce((n, x) => n + x, 0) + unmeasuredMs);
  const rows = ([1, 2, 3, 4, 5] as const).map((z) => ({
    key: `z${z}`,
    label: (
      <>
        <span className={cn("font-bold", cutoffs ? ZONE_TEXT[z - 1] : "text-text-2")}>
          Zone {z}
        </span>{" "}
        <span className="text-text-2">{cutoffs ? zoneRangeLabel(z, cutoffs) : "—"}</span>
      </>
    ),
    ms: zoneMs[z - 1] ?? 0,
    fill: cutoffs ? (ZONE_FILL[z - 1] as string) : "bg-zu",
  }));
  rows.push({
    key: "u",
    label: <span className="font-bold text-text-2">Unmeasured</span>,
    ms: unmeasuredMs,
    fill: "bg-zu",
  });
  return (
    <ul className={cn("flex flex-col", compact ? "gap-2 text-tv-sm" : "gap-4 text-tv-base")}>
      {rows.map((r) => (
        <li
          key={r.key}
          className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-6"
        >
          <span className="min-w-0 truncate">{r.label}</span>
          <span className="h-4 overflow-hidden rounded-chip bg-surface-2" aria-hidden>
            <span
              className={cn("block h-full rounded-chip", r.fill)}
              style={{ width: `${(r.ms / total) * 100}%` }}
            />
          </span>
          <span className="font-num tabular text-text">{formatDuration(r.ms)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// Honest load states: a failed or offline-paused query is never shown as "no data".

export const TV_LOAD_COPY = {
  loading: "Loading…",
  failed: "Couldn't load this. Check the TV's connection, then try again.",
  retry: "Try again",
} as const;

export type LoadView = "loading" | "error" | "ready";

/**
 * loading / error / ready for a react-query result. "error" covers a failed query and one that
 * is paused offline before its first result (isPending, fetchStatus "paused"): both have no data.
 */
export function loadView(q: {
  isPending: boolean;
  isError: boolean;
  fetchStatus: string;
  data?: unknown;
}): LoadView {
  if (q.data !== undefined) return "ready";
  if (q.isError || (q.isPending && q.fetchStatus === "paused")) return "error";
  return q.isPending ? "loading" : "ready";
}

/** Message + focusable Try again (refetch). */
export function TvLoadError({
  focusId,
  autoFocus,
  onRetry,
  className,
}: {
  focusId: string;
  autoFocus?: boolean;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-4", className)} role="alert">
      <p className="text-tv-base text-text-2">{TV_LOAD_COPY.failed}</p>
      <TvButton focusId={focusId} autoFocus={!!autoFocus} size="md" onPress={onRetry}>
        {TV_LOAD_COPY.retry}
      </TvButton>
    </div>
  );
}
