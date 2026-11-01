// The relay's identity on this device (h10-design 3/5.1): hr_sources.id kept in localStorage
// 'dillan.relayId' (fallback: a per-load uuid when storage is blocked), its editable display name
// and the platform guessed from the user agent. No user data is stored here.

import { newId } from "@/v1/data/api";

export const RELAY_ID_KEY = "dillan.relayId";
export const RELAY_NAME_KEY = "dillan.relayName";
/** the BluetoothDevice.id last picked here (getDevices() restore) */
export const RELAY_DEVICE_KEY = "dillan.relayDevice";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

export type RelayPlatform = "android" | "windows" | "macos" | "chromeos" | "linux" | "other";

export function platformOf(ua: string): RelayPlatform {
  if (/Android/i.test(ua)) return "android";
  if (/CrOS/.test(ua)) return "chromeos";
  if (/Windows/.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macos";
  if (/Linux/.test(ua)) return "linux";
  return "other";
}

/** 'Android phone', 'Android tablet', 'Edge on Windows', 'Chrome on Mac', 'Chromebook' … */
export function defaultRelayName(ua: string): string {
  const p = platformOf(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : "Chrome";
  switch (p) {
    case "android":
      return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
    case "chromeos":
      return "Chromebook";
    case "windows":
      return `${browser} on Windows`;
    case "macos":
      return `${browser} on Mac`;
    case "linux":
      return `${browser} on Linux`;
    default:
      return "Relay";
  }
}

function read(store: Store, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(store: Store, key: string, v: string | null) {
  try {
    if (v == null) store?.removeItem(key);
    else store?.setItem(key, v);
  } catch {
    /* storage blocked: the value lives for this page load only */
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** hr_sources.id for this device: kept across loads; a new one when missing or malformed. */
export function relaySourceId(store: Store): string {
  const v = read(store, RELAY_ID_KEY);
  if (v && UUID.test(v)) return v;
  const id = newId();
  write(store, RELAY_ID_KEY, id);
  return id;
}

/** "Add it again" after Remove: a new source id replaces dillan.relayId. */
export function remintSourceId(store: Store): string {
  const id = newId();
  write(store, RELAY_ID_KEY, id);
  return id;
}

export function relayName(store: Store, ua: string): string {
  const v = read(store, RELAY_NAME_KEY)?.trim();
  return v ? v.slice(0, 60) : defaultRelayName(ua);
}

export function setRelayName(store: Store, name: string): string {
  const v = name.trim().slice(0, 60);
  write(store, RELAY_NAME_KEY, v || null);
  return v;
}

export function savedDeviceId(store: Store): string | null {
  return read(store, RELAY_DEVICE_KEY);
}

export function saveDeviceId(store: Store, id: string | null) {
  write(store, RELAY_DEVICE_KEY, id);
}
