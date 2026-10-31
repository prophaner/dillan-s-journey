import { cn } from "@/lib/utils";

/** "dillan" wordmark (design/v1/prototype/brand/dillan-wordmark.svg) drawn in currentColor; the dot is Spot. */
export function Wordmark({
  height = 32,
  className,
  title = "Dillan",
}: {
  height?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 10 146 54"
      height={height}
      width={(height * 146) / 54}
      role="img"
      aria-label={title}
      className={cn("shrink-0 text-text", className)}
    >
      <path
        d="M28 17V57M28 46a11 11 0 1 1 -22 0a11 11 0 1 1 22 0M41 35V57M53 17V57M65 17V57M102 35V57M102 46a11 11 0 1 1 -22 0a11 11 0 1 1 22 0M115 57V46a11 11 0 0 1 22 0V57"
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={41} cy={22.5} r={4.6} className="fill-spot" />
    </svg>
  );
}
