/* Storage adapter. Source build: Web Storage with in-memory fallback so the prototype
   survives reloads (needed to demo "reload never ends the workout" and notes retention).
   The hosted preview build swaps this file for the memory-only version (see ../deploy). */
const mem = new Map();
let backing = null;
try { const t = '__dillan_probe__'; window.localStorage.setItem(t, '1'); window.localStorage.removeItem(t); backing = window.localStorage; } catch (e) { backing = null; }
export const persistent = !!backing;
export function getItem(k) { return backing ? backing.getItem(k) : (mem.has(k) ? mem.get(k) : null); }
export function setItem(k, v) { if (backing) backing.setItem(k, v); else mem.set(k, String(v)); }
