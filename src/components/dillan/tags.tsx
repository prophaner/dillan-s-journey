import type { ReactNode } from "react";
import { Check, CircleAlert, Clock, Circle, CircleDot, Sparkles, Flag, Loader } from "lucide-react";
import { cn } from "@/lib/utils";

export type TagKind = "done" | "waiting" | "priority" | "neutral" | "unknown" | "guess" | "failed" | "reviewing";

const tagStyles: Record<TagKind, string> = {
  done: "bg-steady-tint text-steady",
  waiting: "bg-hold-tint text-hold",
  priority: "bg-spot-tint text-spot-ink",
  neutral: "bg-surface-2 text-text-2",
  unknown: "bg-transparent text-text-3 border border-dashed border-unknown",
  guess: "bg-transparent text-text-2 border border-dotted border-text-3",
  failed: "bg-hold-tint text-text",
  reviewing: "bg-surface-2 text-text-2",
};

const tagIcons: Record<TagKind, ReactNode> = {
  done: <Check className="size-3.5" aria-hidden />,
  waiting: <Clock className="size-3.5" aria-hidden />,
  priority: <Flag className="size-3.5" aria-hidden />,
  neutral: <Circle className="size-3" aria-hidden />,
  unknown: null,
  guess: <Sparkles className="size-3.5" aria-hidden />,
  failed: <CircleAlert className="size-3.5" aria-hidden />,
  reviewing: <Loader className="size-3.5" aria-hidden />,
};

/** Always icon + word. Never color alone. */
export function StatusTag({
  kind,
  children,
  icon,
  className,
}: {
  kind: TagKind;
  children: ReactNode;
  icon?: ReactNode | false;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-chip px-2.5 text-footnote font-bold",
        tagStyles[kind],
        className,
      )}
    >
      {icon === false ? null : (icon ?? tagIcons[kind])}
      {children}
    </span>
  );
}

/** Unknown is "—" with a dashed "Not yet known" tag, never 0. */
export function UnknownValue({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="font-num text-text-3" aria-hidden>
        —
      </span>
      <StatusTag kind="unknown">Not yet known</StatusTag>
    </span>
  );
}

export function ValueOrUnknown({ value, unit }: { value: number | null | undefined; unit?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <UnknownValue />;
  return (
    <span className="font-num tabular">
      {value}
      {unit ? <span className="ml-0.5 text-text-2">{unit}</span> : null}
    </span>
  );
}

export type SaveStateKind = "synced" | "local" | "failed";

/** Three words only. "Synced" only after server acknowledgement. No spinner. */
export function SaveState({
  state,
  count,
  onRetry,
  className,
}: {
  state: SaveStateKind;
  count?: number;
  onRetry?: () => void;
  className?: string;
}) {
  const label =
    state === "synced" ? "Synced" : state === "local" ? "Saved on this device" : "Didn't sync";
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-1.5 text-footnote font-medium text-text-2", className)}
    >
      {state === "synced" && <span className="size-2 rounded-full bg-steady" aria-hidden />}
      {state === "local" && <CircleDot className="size-3.5 text-text-3" aria-hidden />}
      {state === "failed" && <CircleAlert className="size-3.5 text-hold" aria-hidden />}
      <span>
        {label}
        {state !== "synced" && count ? ` · ${count}` : ""}
      </span>
      {state === "failed" && onRetry && (
        <button type="button" onClick={onRetry} className="ml-1 font-bold text-text underline">
          Retry
        </button>
      )}
    </span>
  );
}

export function Chip({
  selected,
  children,
  icon,
  small,
  className,
  ...rest
}: {
  selected?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  small?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "press inline-flex items-center gap-1.5 rounded-chip border px-3.5 font-medium",
        small ? "h-[30px] text-footnote" : "h-9 text-subhead",
        selected ? "border-text bg-text text-bg" : "border-line bg-surface text-text",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function DemoLabel({ className }: { className?: string }) {
  return (
    <StatusTag kind="neutral" icon={<Sparkles className="size-3.5" aria-hidden />} className={className}>
      Demo data
    </StatusTag>
  );
}
