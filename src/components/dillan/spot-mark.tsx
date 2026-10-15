import { cn } from "@/lib/utils";

/** The Spot: a dot (you) held just above a cradle (Dillan). */
export function SpotMark({
  size = 24,
  className,
  animate = false,
  title,
}: {
  size?: number;
  className?: string;
  animate?: boolean;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M13 31a19 19 0 0 0 38 0" fill="none" stroke="currentColor" strokeWidth={7} strokeLinecap="round" />
      <circle cx={32} cy={27} r={7.5} className={cn("fill-spot", animate && "animate-spot-drop")} />
    </svg>
  );
}
