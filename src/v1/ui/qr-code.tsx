// QR code for phone/desktop screens (S14 relay link, /relay handoff on a TV). Same encoder as the
// TV (src/v1/tv/qr.ts); dark modules on chalk with a quiet zone. The link is always shown as text
// next to it, and a QR never carries a token.

import { useMemo } from "react";
import { encodeQr, qrPath } from "@/v1/tv/qr";
import { cn } from "@/lib/utils";

export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const qr = useMemo(() => encodeQr(value), [value]);
  const n = qr.size + 8;
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label={label}
      className={cn("size-40 shrink-0 rounded-card", className)}
      shapeRendering="crispEdges"
      data-qr-value={value}
    >
      <rect width={n} height={n} className="fill-[var(--chalk)]" />
      <path d={qrPath(qr)} className="fill-[var(--iron)]" />
    </svg>
  );
}

/** https://{host}/relay for this deployment */
export function relayUrl(): { url: string; host: string } {
  if (typeof window === "undefined") return { url: "/relay", host: "" };
  return { url: `${window.location.origin}/relay`, host: window.location.host };
}
