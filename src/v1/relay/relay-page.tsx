// S16 Relay (h10-design 6): the only page that touches Bluetooth. Full screen, dark, one column for
// a docked phone/tablet or a laptop. Header names the wearer ("Relaying for {name}") and the
// editable device name; the centre shows BPM and the relay mode; the footer keeps the screen-on
// reminder and the wake-lock state. No workout controls. On a TV it renders only a QR handoff.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { BATTERY_LOW_PCT, type RelayMode } from "@/v1/core/hr";
import { RELAY_COPY, relayModeLabel } from "@/v1/core/hr-views";
import type { DillanApi } from "@/v1/data/api";
import { QrCode, relayUrl } from "@/v1/ui/qr-code";
import { DButton } from "@/components/dillan/button";
import { cn } from "@/lib/utils";
import { RelayController, type RelayView } from "./controller";
import { browserBluetooth, WebBleHrsDriver } from "./driver";
import { detectEnv, isTvUa, unsupportedLines } from "./support";

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function RelayPage({ api, demo }: { api: DillanApi; demo: boolean }) {
  const env = useMemo(() => detectEnv(), []);
  const [ctl, setCtl] = useState<RelayController | null>(null);
  useEffect(() => {
    if (isTvUa(env.userAgent)) return;
    const bt = browserBluetooth();
    const c = new RelayController({
      api,
      driver: new WebBleHrsDriver(bt),
      env,
      storage: safeStorage(),
      canGetDevices: typeof bt?.getDevices === "function",
    });
    setCtl(c);
    void c.start();
    return () => {
      c.dispose();
      setCtl(null);
    };
  }, [api, env]);

  if (isTvUa(env.userAgent)) return <TvHandoff ua={env.userAgent} />;
  if (!ctl) return <Frame>{null}</Frame>;
  return <Relay ctl={ctl} api={api} demo={demo} ua={env.userAgent} />;
}

function Frame({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-bg text-text">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-margin pb-6 pt-[calc(var(--safe-t)+20px)]">
        {children}
      </div>
      {footer}
    </div>
  );
}

function TvHandoff({ ua }: { ua: string }) {
  const { url, host } = relayUrl();
  return (
    <Frame>
      <h1 className="text-title1 font-bold">{RELAY_COPY.title}</h1>
      <div className="mt-8 flex flex-col items-center gap-6 text-center">
        <QrCode value={url} label={`QR code for ${host}/relay`} className="size-64" />
        <p className="text-headline font-bold">{host}/relay</p>
        {unsupportedLines("no_api", ua, host).map((l) => (
          <p key={l} className="text-body text-text-2">
            {l}
          </p>
        ))}
      </div>
    </Frame>
  );
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Relay({
  ctl,
  api,
  demo,
  ua,
}: {
  ctl: RelayController;
  api: DillanApi;
  demo: boolean;
  ua: string;
}) {
  const v = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot, ctl.getSnapshot);
  useTick(1000);
  const [name, setName] = useState<string>("");
  useEffect(() => {
    let on = true;
    if (!v.userId) {
      setName("");
      return;
    }
    void api.profile
      .get()
      .then((p) => on && setName(p.display_name))
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [api, v.userId]);

  // "Leaving stops heart rate on the TV." while connected
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!ctl.shouldWarnOnLeave()) return;
      e.preventDefault();
      e.returnValue = RELAY_COPY.leave;
      return RELAY_COPY.leave;
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [ctl]);

  const { host } = relayUrl();
  const footer = v.support?.ok ? <RelayFooter v={v} ua={ua} /> : null;

  if (!v.support)
    return (
      <Frame>
        <Header v={v} name={name} ctl={ctl} />
      </Frame>
    );

  if (!v.support.ok)
    return (
      <Frame>
        <h1 className="text-title1 font-bold">{RELAY_COPY.title}</h1>
        <div className="mt-6 flex flex-col gap-3" role="status">
          {unsupportedLines(v.support.reason, ua, host).map((l) => (
            <p key={l} className="text-headline">
              {l}
            </p>
          ))}
        </div>
        {v.support.reason === "no_api" && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <QrCode value={relayUrl().url} label={`QR code for ${host}/relay`} />
            <p className="text-subhead text-text-2">{host}/relay</p>
          </div>
        )}
      </Frame>
    );

  return (
    <Frame footer={footer}>
      <Header v={v} name={name} ctl={ctl} />
      <Status v={v} />
      <Notice v={v} />
      <Actions v={v} ctl={ctl} demo={demo} />
      {v.mode === "idle" && !v.signedOut && !v.differentStrap && (
        <ol className="mt-6 flex list-decimal flex-col gap-2 pl-5 text-subhead text-text-2">
          {RELAY_COPY.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
    </Frame>
  );
}

function Header({ v, name, ctl }: { v: RelayView; name: string; ctl: RelayController }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(v.sourceName);
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-title3 font-bold text-text-2">{RELAY_COPY.title}</h1>
      {v.userId && (
        <p className="break-words text-title1 font-bold leading-tight">
          {RELAY_COPY.relayingFor(name || "…")}
        </p>
      )}
      {editing ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setDraft(ctl.rename(draft));
            setEditing(false);
          }}
        >
          <label className="sr-only" htmlFor="relay-name">
            Device name
          </label>
          <input
            id="relay-name"
            autoFocus
            maxLength={60}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 text-body"
          />
          <DButton type="submit" variant="secondary" size="md">
            Save
          </DButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(v.sourceName);
            setEditing(true);
          }}
          className="press inline-flex h-11 w-fit max-w-full items-center gap-2 rounded-chip bg-surface-2 px-4 text-subhead font-bold"
          aria-label={`${RELAY_COPY.thisDevice}: ${v.sourceName}. Rename`}
        >
          <span className="truncate">
            {RELAY_COPY.thisDevice}: {v.sourceName}
          </span>
          <Pencil className="size-4 shrink-0" aria-hidden />
        </button>
      )}
    </header>
  );
}

const ACTIVE: RelayMode[] = ["live", "demo", "no_contact", "waiting_first", "hidden"];

function Status({ v }: { v: RelayView }) {
  const label = relayModeLabel(v.linkMode, {
    serial: v.sensor?.serial ?? null,
    attempt: v.reconnectAttempt,
    holder: v.holderName,
  });
  const showBpm = ACTIVE.includes(v.linkMode) && v.bpm != null && v.contact !== false;
  const sentAgo =
    v.lastSentLocal != null ? Math.max(0, Math.floor((Date.now() - v.lastSentLocal) / 1000)) : null;
  const sub: string[] = [];
  if (v.sensor && !v.demo) {
    sub.push(v.sensor.serial ? `Polar H10 ${v.sensor.serial}` : v.sensor.name);
    if (v.sensor.batteryPct != null) sub.push(RELAY_COPY.battery(v.sensor.batteryPct));
  }
  if (sentAgo != null && ACTIVE.includes(v.linkMode)) sub.push(RELAY_COPY.lastSent(sentAgo));
  const live = v.linkMode === "live" || v.linkMode === "demo";
  return (
    <section className="mt-8 flex flex-col items-center gap-4 text-center" aria-live="polite">
      <div
        className={cn(
          "grid size-64 max-w-full place-items-center rounded-full border-8",
          live ? "border-steady" : v.linkMode === "no_contact" ? "border-hold" : "border-line",
        )}
      >
        <div className="flex flex-col items-center">
          <span className="font-num text-num-xl font-extrabold leading-none tabular">
            {showBpm ? v.bpm : "––"}
          </span>
          <span className="mt-1 flex items-center gap-2 text-footnote font-bold uppercase tracking-wider text-text-2">
            BPM
            {v.demo && (
              <span className="rounded-chip border border-text px-2 text-footnote font-bold normal-case tracking-normal text-text">
                DEMO
              </span>
            )}
          </span>
        </div>
      </div>
      <p className="text-title3 font-bold">{label}</p>
      {v.linkMode === "superseded" && (
        <p className="text-subhead text-text-2">{RELAY_COPY.supersededRelease}</p>
      )}
      {sub.length > 0 && <p className="text-subhead text-text-2">{sub.join(" · ")}</p>}
      {v.offline && v.pending > 0 && (
        <p className="text-subhead font-bold text-hold">{RELAY_COPY.offline(v.pending)}</p>
      )}
      {v.sensor?.batteryPct != null && v.sensor.batteryPct <= BATTERY_LOW_PCT && !v.demo && (
        <p className="text-subhead font-bold text-hold">
          {RELAY_COPY.batteryLow(v.sensor.batteryPct)}
        </p>
      )}
    </section>
  );
}

function Notice({ v }: { v: RelayView }) {
  const text =
    v.notice === "connect_timeout"
      ? RELAY_COPY.connectTimeout
      : v.notice === "chooser_empty"
        ? RELAY_COPY.chooserEmpty
        : v.notice === "connect_failed"
          ? RELAY_COPY.connectFailed
          : v.notice === "signed_out"
            ? RELAY_COPY.signedOut
            : v.notice === "sensor_forgotten"
              ? RELAY_COPY.forgotten
              : v.notice === "revoked"
                ? RELAY_COPY.revoked
                : null;
  return (
    <>
      {text && (
        <p
          role={v.notice === "chooser_empty" ? undefined : "status"}
          className="mt-6 rounded-card bg-surface-2 p-4 text-subhead"
        >
          {text}
        </p>
      )}
      {v.differentStrap && (
        <p
          role="alert"
          className="mt-6 rounded-card border border-hold bg-hold-tint p-4 text-subhead text-text"
        >
          {RELAY_COPY.differentStrap(
            v.differentStrap.old,
            v.differentStrap.next.serial
              ? `Polar H10 ${v.differentStrap.next.serial}`
              : v.differentStrap.next.name,
          )}
        </p>
      )}
    </>
  );
}

function Actions({ v, ctl, demo }: { v: RelayView; ctl: RelayController; demo: boolean }) {
  const big = "mt-6 h-16 text-title3";
  if (v.signedOut)
    return (
      <Link
        to="/auth"
        search={{ redirect: "/relay" }}
        className="press mt-6 inline-flex h-16 w-full items-center justify-center rounded-btn bg-spot text-title3 font-bold text-on-accent"
      >
        {RELAY_COPY.signIn}
      </Link>
    );
  if (v.notice === "revoked")
    return (
      <DButton variant="primary" className={big} onClick={() => ctl.addAgain()}>
        {RELAY_COPY.addAgain}
      </DButton>
    );
  if (v.differentStrap)
    return (
      <div className="mt-6 flex flex-col gap-3">
        <DButton variant="primary" className="h-16 text-title3" onClick={() => ctl.useThisStrap()}>
          {RELAY_COPY.useThisStrap}
        </DButton>
        <DButton variant="outline" onClick={() => ctl.pickAgain()}>
          {RELAY_COPY.pickAgain}
        </DButton>
      </div>
    );
  const demoToggle = demo && (
    <DButton
      variant="outline"
      className="mt-3"
      onClick={() => (v.demo ? ctl.stopDemo() : ctl.startDemo())}
      disabled={
        !v.demo && (!v.clockReady || !["idle", "standby", "sensor_lost"].includes(v.linkMode))
      }
    >
      {v.demo ? RELAY_COPY.stopSimulate : RELAY_COPY.simulate}
    </DButton>
  );
  let main: React.ReactNode = null;
  switch (v.linkMode) {
    case "idle":
    case "choosing":
      main = (
        <>
          <DButton
            variant="primary"
            className={big}
            disabled={!v.clockReady || v.linkMode === "choosing"}
            // pick() runs requestDevice synchronously in this handler (user gesture)
            onClick={() => ctl.connectTap()}
          >
            {RELAY_COPY.connect}
          </DButton>
          <DButton
            variant="quiet"
            size="md"
            className="mt-2"
            disabled={!v.clockReady || v.linkMode === "choosing"}
            onClick={() => ctl.connectTap({ showAll: true })}
          >
            {RELAY_COPY.showAll}
          </DButton>
        </>
      );
      break;
    case "connecting":
      main = (
        <DButton variant="outline" className="mt-6" onClick={() => ctl.cancel()}>
          {RELAY_COPY.cancel}
        </DButton>
      );
      break;
    case "waiting_first":
    case "live":
    case "no_contact":
    case "demo":
      main = (
        <DButton variant="outline" className="mt-6" onClick={() => ctl.disconnectTap()}>
          {RELAY_COPY.disconnect}
        </DButton>
      );
      break;
    case "reconnecting":
      main = (
        <DButton variant="secondary" className="mt-6" onClick={() => ctl.reconnectNow()}>
          {RELAY_COPY.reconnectNow}
        </DButton>
      );
      break;
    case "sensor_lost":
      main = (
        <div className="mt-6 flex flex-col gap-3">
          <DButton
            variant="primary"
            className="h-16 text-title3"
            onClick={() => ctl.reconnectTap()}
          >
            {RELAY_COPY.reconnect}
          </DButton>
          <DButton variant="outline" onClick={() => ctl.connectTap()}>
            {RELAY_COPY.connect}
          </DButton>
        </div>
      );
      break;
    case "standby":
      main = (
        <DButton variant="secondary" className="mt-6" onClick={() => ctl.connectNow()}>
          {RELAY_COPY.connectNow}
        </DButton>
      );
      break;
    case "superseded":
      main = (
        <DButton variant="primary" className={big} onClick={() => ctl.useThisDevice()}>
          {RELAY_COPY.useThisDevice}
        </DButton>
      );
      break;
    default:
      main = null;
  }
  return (
    <div className="flex flex-col">
      {main}
      {demoToggle}
    </div>
  );
}

function RelayFooter({ v, ua }: { v: RelayView; ua: string }) {
  const wake = v.resting
    ? RELAY_COPY.resting
    : v.wake === "on"
      ? RELAY_COPY.wakeOn
      : RELAY_COPY.wakeOff;
  return (
    <footer className="sticky bottom-0 border-t border-line bg-surface px-margin pb-[calc(var(--safe-b)+12px)] pt-3">
      <div className="mx-auto flex max-w-[560px] flex-col gap-1">
        <p className="text-subhead font-bold">{RELAY_COPY.footer}</p>
        <p className="text-footnote text-text-2">{wake}</p>
        {/Android/i.test(ua) && (
          <p className="text-footnote text-text-2">{RELAY_COPY.androidHint}</p>
        )}
      </div>
    </footer>
  );
}
