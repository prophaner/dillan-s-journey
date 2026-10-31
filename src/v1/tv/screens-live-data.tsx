// S14 Live data, TV version (h10-design 6 S14): read-only strap status, the relay devices list and
// the relay QR. Up and Down move through the rows (the focus engine scrolls them into view). No
// destructive actions on the TV: Forget strap and Remove relay stay on the phone or computer.

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { batteryPctOf, HOME_HR_COPY, isBatteryLow, S14_COPY, strapName } from "@/v1/core/hr-views";
import { useLiveHeartRate } from "@/v1/session/live-hr";
import { relaySourcesKey } from "@/v1/ui/strap-card";
import { toneOf } from "@/v1/ui/zone-pieces";
import { cn } from "@/lib/utils";
import { useTv } from "./context";
import { TV_HR_COPY } from "./hr-pieces";
import { TvChip, TvNavScreen } from "./screens-main";
import { TV_LOAD_COPY, TvButton, TvEyebrow, TvPanel, TvQr } from "./ui";

export const TV_LIVE_DATA_COPY = {
  title: "Live data",
  manageOnPhone:
    "Forget the strap or remove a relay from your phone or computer: Profile → Live data.",
  notSetUp: "No strap set up yet. Set it up on your phone or computer: Profile → Live data.",
  strap: "Strap",
  battery: "Battery",
  relayingNow: "Relaying now",
  lastReading: "Last reading",
  back: "Back",
} as const;

const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

/** A read-only row the remote can land on (Up/Down scroll the list); OK does nothing. */
function Row({ focusId, children }: { focusId: string; children: React.ReactNode }) {
  return (
    <div
      data-focus=""
      data-focus-id={focusId}
      tabIndex={-1}
      className="rounded-tv-md border-2 border-line bg-surface px-8 py-4 data-[focused]:border-text"
    >
      {children}
    </div>
  );
}

export function TvLiveData() {
  const tv = useTv();
  const uid = tv.user.id;
  const hr = useLiveHeartRate(uid);
  const sources = useQuery({
    queryKey: relaySourcesKey(uid),
    queryFn: () => tv.api.hr.sources(),
    refetchInterval: 30_000,
  });
  const h = hr.health;
  const paired = hr.sensorRow;
  const live = hr.live;
  const name = strapName(paired, live);
  const pct = batteryPctOf(live, paired);
  const ageS = h.ageMs != null ? Math.floor(h.ageMs / 1000) : null;
  const relays = (sources.data ?? []).filter((s) => !s.revoked_at);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const host = typeof window !== "undefined" ? window.location.host : "";

  return (
    <TvNavScreen
      screenKey="live_data"
      nav={null}
      hints={[
        ["▲ ▼", "Scroll"],
        ["Back", "Profile"],
      ]}
    >
      <div className="grid h-full grid-cols-[1.3fr_1fr] gap-12">
        <div className="flex min-h-0 flex-col gap-5 overflow-hidden">
          <h1 className="shrink-0 text-tv-2xl font-bold">{TV_LIVE_DATA_COPY.title}</h1>
          <Row focusId="ld-strap">
            <div className="flex items-center justify-between gap-4">
              <TvEyebrow>{HOME_HR_COPY.eyebrow}</TvEyebrow>
              {hr.loaded && <TvChip label={h.label} tone={toneOf(h)} />}
            </div>
            {!hr.loaded ? (
              <p className="mt-2 text-tv-base text-text-2">{TV_LOAD_COPY.loading}</p>
            ) : !paired ? (
              <p className="mt-2 text-tv-base text-text-2">{TV_LIVE_DATA_COPY.notSetUp}</p>
            ) : (
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-2 text-tv-base">
                <dt className="text-text-2">{TV_LIVE_DATA_COPY.strap}</dt>
                <dd className="truncate font-bold">{name}</dd>
                <dt className="text-text-2">{TV_LIVE_DATA_COPY.battery}</dt>
                <dd className={cn(isBatteryLow(pct) && "font-bold text-hold")}>
                  {pct == null
                    ? "—"
                    : `${pct}%${paired.battery_read_at ? ` (read ${ago(paired.battery_read_at)})` : ""}`}
                </dd>
                <dt className="text-text-2">{TV_LIVE_DATA_COPY.relayingNow}</dt>
                <dd className="truncate">
                  {live ? live.holder_name : "—"}
                  {live?.is_demo && (
                    <span className="ml-3 rounded-chip border-2 border-text px-3 text-tv-xs font-bold">
                      DEMO
                    </span>
                  )}
                </dd>
                <dt className="text-text-2">{TV_LIVE_DATA_COPY.lastReading}</dt>
                <dd>
                  {h.showBpm && h.bpm != null && ageS != null ? `${h.bpm} bpm, ${ageS}s ago` : "—"}
                </dd>
              </dl>
            )}
            {hr.loaded && paired && h.id !== "H3_live" && (
              <p className="mt-2 text-tv-sm text-text-2">{h.detail}</p>
            )}
          </Row>
          <TvEyebrow className="mt-2">{S14_COPY.relays}</TvEyebrow>
          {sources.isSuccess && relays.length === 0 && (
            <p className="text-tv-base text-text-2">{S14_COPY.noRelays}</p>
          )}
          {sources.isPending && <p className="text-tv-base text-text-2">{TV_LOAD_COPY.loading}</p>}
          <ul className="flex min-h-0 flex-col gap-3 overflow-hidden">
            {relays.map((s) => (
              <li key={s.id}>
                <Row focusId={`ld-relay-${s.id}`}>
                  <p className="truncate text-tv-md font-bold">{s.display_name}</p>
                  <p className="text-tv-sm text-text-2">
                    {s.kind === "demo" ? "Demo relay" : "Web Bluetooth relay"}
                    {s.last_seen_at ? ` · last seen ${ago(s.last_seen_at)}` : ""}
                  </p>
                </Row>
              </li>
            ))}
          </ul>
          <p className="text-tv-sm text-text-2">{TV_LIVE_DATA_COPY.manageOnPhone}</p>
          <div className="flex">
            <TvButton focusId="ld-back" autoFocus onPress={() => tv.go({ name: "profile" })}>
              {TV_LIVE_DATA_COPY.back}
            </TvButton>
          </div>
        </div>
        <TvPanel className="items-center justify-center gap-6 text-center">
          <TvQr value={`${origin}/relay`} label={`QR code for ${host}/relay`} />
          <p className="text-tv-lg font-bold">{host}/relay</p>
          <p className="text-tv-base text-text-2">{TV_HR_COPY.fixLine(host)}</p>
        </TvPanel>
      </div>
    </TvNavScreen>
  );
}
