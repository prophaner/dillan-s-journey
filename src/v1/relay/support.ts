// Feature detection for the /relay page (h10-design 3 SupportResult, 6 S16) and the exact copy for
// each unsupported case. Only /relay ever touches navigator.bluetooth; every other screen uses
// relayCapable() just to decide whether to offer "Open relay on this device".

import type { SupportResult } from "@/v1/core/hr";

export interface RelayEnv {
  secureContext: boolean;
  hasBluetooth: boolean;
  inIframe: boolean;
  userAgent: string;
  /** navigator.bluetooth.getAvailability, when present */
  getAvailability?: () => Promise<boolean>;
}

export function isIosUa(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));
}

/** Fire TV / Silk: /relay shows only a QR handoff there. */
export function isTvUa(ua: string): boolean {
  return /\bSilk\//.test(ua) || /\bAFT[A-Z0-9]/.test(ua);
}

/** Android WebView (Gmail/Slack previews) and common in-app browsers. */
export function isInAppUa(ua: string): boolean {
  return /; wv\)/.test(ua) || /\b(FBAN|FBAV|Instagram|Line\/|GSA\/|Snapchat|Twitter)/.test(ua);
}

export function detectEnv(): RelayEnv {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const bt = (
    nav as (Navigator & { bluetooth?: { getAvailability?(): Promise<boolean> } }) | undefined
  )?.bluetooth;
  let inIframe = false;
  try {
    inIframe = typeof window !== "undefined" && window.top !== window;
  } catch {
    inIframe = true; // cross-origin parent
  }
  return {
    secureContext: typeof window !== "undefined" ? window.isSecureContext !== false : false,
    hasBluetooth: !!bt,
    inIframe,
    userAgent: nav?.userAgent ?? "",
    ...(bt?.getAvailability ? { getAvailability: () => bt.getAvailability!() } : {}),
  };
}

/** Synchronous part of checkSupport: enough for other screens to decide what to offer. */
export function quickSupport(env: RelayEnv): SupportResult | null {
  if (!env.secureContext) return { ok: false, reason: "insecure_context" };
  if (isInAppUa(env.userAgent)) return { ok: false, reason: "in_app_browser" };
  if (!env.hasBluetooth) return { ok: false, reason: "no_api" };
  return null;
}

export async function checkSupport(env: RelayEnv): Promise<SupportResult> {
  const quick = quickSupport(env);
  if (quick) return quick;
  if (env.getAvailability) {
    try {
      const ok = await env.getAvailability();
      if (!ok) return { ok: false, reason: env.inIframe ? "policy_blocked" : "adapter_off" };
    } catch {
      return { ok: false, reason: "policy_blocked" };
    }
  } else if (env.inIframe) {
    return { ok: false, reason: "policy_blocked" };
  }
  return { ok: true };
}

/** Whether this browser can run the relay (other screens: show "Open relay on this device"). */
export function relayCapable(env: RelayEnv = detectEnv()): boolean {
  return quickSupport(env) === null && !env.inIframe && !isTvUa(env.userAgent);
}

export const SUPPORT_COPY = {
  noApi: (host: string) =>
    `This browser can't connect to Bluetooth sensors. Open ${host}/relay in Chrome on Android, or Chrome or Edge on a computer.`,
  iphone: "iPhones can't relay heart rate from a web page.",
  policyBlocked: "Bluetooth is blocked in this preview. Open the published site in its own tab.",
  inApp: "Open this page in Chrome, not inside another app.",
  insecure: "Bluetooth needs a secure (https) address. Open the published https:// site.",
  adapterOff: "Bluetooth is off or unavailable on this device. Turn it on, then reload this page.",
  tv: (host: string) =>
    `The TV only shows heart rate. Open ${host}/relay in Chrome on an Android phone or a computer.`,
} as const;

/** Lines shown for an unsupported browser (never a dead Connect button, acceptance 41). */
export function unsupportedLines(
  reason: Exclude<SupportResult, { ok: true }>["reason"],
  ua: string,
  host: string,
): string[] {
  switch (reason) {
    case "no_api":
      return isIosUa(ua)
        ? [SUPPORT_COPY.iphone, SUPPORT_COPY.noApi(host)]
        : isTvUa(ua)
          ? [SUPPORT_COPY.tv(host)]
          : [SUPPORT_COPY.noApi(host)];
    case "policy_blocked":
      return [SUPPORT_COPY.policyBlocked];
    case "in_app_browser":
      return [SUPPORT_COPY.inApp];
    case "insecure_context":
      return [SUPPORT_COPY.insecure];
    case "adapter_off":
      return [SUPPORT_COPY.adapterOff];
  }
}
