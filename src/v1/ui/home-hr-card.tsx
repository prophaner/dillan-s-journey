// S04 Home "Heart-rate strap" card (phone/desktop, h10-design 6 S04). Home never asks for heart
// rate (no hr_request), so a screen left on Home never keeps the strap streaming.

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { HOME_HR_COPY, homeHrCard, PREFLIGHT_HR_COPY } from "@/v1/core/hr-views";
import { useLiveHeartRate } from "@/v1/session/live-hr";
import { relayCapable } from "@/v1/relay/support";
import { dButton } from "@/components/dillan/button";
import { Eyebrow } from "@/components/dillan/form-pieces";
import { Card } from "@/components/dillan/surfaces";
import { cn } from "@/lib/utils";
import { HealthChip } from "./zone-pieces";

export function HomeHrCard({ userId }: { userId: string }) {
  const hr = useLiveHeartRate(userId);
  const capable = useMemo(() => relayCapable(), []);
  if (!hr.loaded) {
    // A failed read is not "Not set up": say so instead of offering setup.
    if (!hr.error) return null;
    return (
      <Card>
        <Eyebrow>{HOME_HR_COPY.eyebrow}</Eyebrow>
        <p className="mt-2 text-subhead text-text-2">{PREFLIGHT_HR_COPY.readFailed}</p>
      </Card>
    );
  }
  const card = homeHrCard(hr.health, hr.live, hr.sensorRow);
  const action = card.notSetUp
    ? { to: "/profile/zones" as const, label: HOME_HR_COPY.setUp }
    : card.relayOffline && capable
      ? { to: "/relay" as const, label: HOME_HR_COPY.openRelay }
      : { to: "/profile/zones" as const, label: HOME_HR_COPY.settings };
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>{HOME_HR_COPY.eyebrow}</Eyebrow>
        <span className="flex items-center gap-2">
          {hr.health.demo && (
            <span className="rounded-chip border border-text px-2 text-footnote font-bold">
              DEMO
            </span>
          )}
          <HealthChip label={card.chip.label} tone={card.chip.tone} />
        </span>
      </div>
      <p className="mt-2 break-words text-subhead text-text-2">{card.text}</p>
      {card.battery && <p className="mt-1 text-subhead font-bold text-hold">{card.battery}</p>}
      <Link
        to={action.to}
        className={cn(dButton({ variant: "outline", size: "md" }), "mt-3 w-full")}
      >
        {action.label}
      </Link>
    </Card>
  );
}
