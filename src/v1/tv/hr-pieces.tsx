// TV heart-rate pieces (h10-design 6): the full-screen relay QR (S04 card, S08 "Show relay QR")
// and the S09 Heart rate sheet. HR state changes never move focus or open these on their own.

import type { HealthState } from "@/v1/core/health";
import { BATTERY_LOW_PCT, type HrLiveRow, type HrSensorRow } from "@/v1/core/hr";
import { batteryPctOf, strapName } from "@/v1/core/hr-views";
import { formatDuration } from "@/v1/core/timing";
import { useTv } from "./context";
import { TvButton, TvDialog, TvQr } from "./ui";

export const TV_HR_COPY = {
  relayTitle: "Open the heart-rate relay",
  fixLine: (host: string) =>
    `Open ${host}/relay on your Android phone or computer and tap Connect strap.`,
  showQr: "Show relay QR",
  sheetTitle: "Heart rate",
  close: "Close",
} as const;

function origin() {
  return typeof window !== "undefined"
    ? { url: `${window.location.origin}/relay`, host: window.location.host }
    : { url: "/relay", host: "" };
}

export function TvRelayQrDialog() {
  const tv = useTv();
  const { url, host } = origin();
  return (
    <TvDialog
      id="relay_qr"
      title={TV_HR_COPY.relayTitle}
      actions={
        <TvButton focusId="relay-qr-close" autoFocus onPress={() => tv.openModal(null)}>
          {TV_HR_COPY.close}
        </TvButton>
      }
    >
      <div className="flex items-center gap-10">
        <TvQr value={url} label={`QR code for ${host}/relay`} />
        <div className="flex min-w-0 flex-col gap-4">
          <p className="break-all text-tv-lg font-bold text-text">{host}/relay</p>
          <p>{TV_HR_COPY.fixLine(host)}</p>
        </div>
      </div>
    </TvDialog>
  );
}

/** S09 Heart rate sheet: source, strap, battery, last reading, fix line, QR, Close. */
export function TvHrSheet({
  health,
  live,
  sensor,
  userName,
}: {
  health: HealthState;
  live: HrLiveRow | null;
  sensor: HrSensorRow | null;
  userName: string;
}) {
  const tv = useTv();
  const { url, host } = origin();
  const pct = batteryPctOf(live, sensor);
  const strap = strapName(sensor, live);
  return (
    <TvDialog
      id="hr"
      title={TV_HR_COPY.sheetTitle}
      actions={
        <TvButton focusId="hr-close" autoFocus onPress={() => tv.openModal(null)}>
          {TV_HR_COPY.close}
        </TvButton>
      }
    >
      <div className="flex gap-10">
        <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] content-start gap-x-8 gap-y-3">
          <dt>Source</dt>
          <dd className="font-bold text-text">
            {health.via ? `via ${health.via}, for ${userName || "you"}` : "—"}
            {health.demo && (
              <span className="ml-4 rounded-chip border-2 border-text px-3 text-tv-xs font-bold">
                DEMO
              </span>
            )}
          </dd>
          <dt>Strap</dt>
          <dd className="font-bold text-text">{strap ?? "—"}</dd>
          <dt>Battery</dt>
          <dd
            className={
              pct != null && pct <= BATTERY_LOW_PCT ? "font-bold text-hold" : "font-bold text-text"
            }
          >
            {pct != null ? `${pct}%` : "—"}
          </dd>
          <dt>Last reading</dt>
          <dd className="font-bold text-text">
            {health.ageMs != null ? `${formatDuration(health.ageMs)} ago` : "—"}
          </dd>
          <dt>Status</dt>
          <dd>
            <span className="font-bold text-text">{health.label}.</span> {health.detail}
          </dd>
        </dl>
        <div className="flex shrink-0 flex-col items-center gap-3">
          <TvQr value={url} label={`QR code for ${host}/relay`} className="size-40" />
          <span className="text-tv-xs">{host}/relay</span>
        </div>
      </div>
    </TvDialog>
  );
}
