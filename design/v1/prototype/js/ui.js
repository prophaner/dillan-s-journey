/* Shared UI helpers & components (HTML string builders). */
import * as S from './store.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = (o) => Object.entries(o).filter(([, v]) => v !== false && v != null).map(([k, v]) => v === true ? k : `${k}="${esc(v)}"`).join(' ');

export const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  program: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M9 5l7 7-7 7"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M5 4h10l4 4v12H5z"/><path d="M8 13h8M8 17h5"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M5 12l5 5 9-10"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M7 5v14l12-7z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  mark: '<svg viewBox="0 0 64 64" role="img" aria-label="Dillan"><path d="M13 31a19 19 0 0 0 38 0" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><circle cx="32" cy="27" r="7.5" fill="#FF5A1F"/></svg>',
};

export function avatar(user, size = '') { return `<span class="avatar ${size} ${user?.avatar || 'av-a'}" aria-hidden="true">${esc((user?.name || '?')[0].toUpperCase())}</span>`; }

export function statusChip(model) {
  const cls = model.tone === 'live' ? 'ok' : model.tone === 'warn' ? 'warn' : 'neutral';
  return `<span class="chip ${cls}"><span class="dot"></span>${esc(model.label)}</span>`;
}

/* Metric block: BPM + freshness, zone pill w/ bounds, time in zone, duration. Used on phone (compact) and TV (panel). */
export function metricsPanel(user, { compact = false, tv = false } = {}) {
  const m = S.healthModel(user); const l = S.live_();
  const zone = m.zone;
  const bpmVal = m.showBpm && m.bpm != null ? m.bpm : '––';
  const stale = m.freshness !== 'live' || m.paused;
  const zoneHtml = !m.zonesReady
    ? `<span class="chip outline">${esc(l && !l.liveData ? 'Zones unavailable' : 'Set up zones to see zone')}</span>`
    : zone ? `<span class="zone-pill z-${zone}"><span class="sw"></span>Zone ${zone} <span class="faint">· ${esc(m.bounds)}</span></span>`
      : `<span class="zone-pill z-u"><span class="sw"></span>${m.paused ? 'Paused' : 'Zone unknown'}</span>`;
  const tiz = l ? (zone ? S.fmtDur(S.timeInCurrentZone()) : S.fmtDur(0)) : '0:00';
  const dur = l ? S.fmtDur(l.activeMs) : '0:00';
  if (compact) {
    return `<div class="card tight" data-metrics>
      <div class="row between">
        <div class="metric ${stale ? 'stale' : ''}"><span class="row" style="gap:6px"><span class="val num" data-t="bpm">${bpmVal}</span><span class="unit">bpm</span></span>
          <span class="status-line ${m.tone}" data-t="status"><span class="dot"></span>${esc(m.label)}</span></div>
        <div class="metric" style="align-items:flex-end"><span class="val num" data-t="dur">${dur}</span><span class="unit">Active</span></div>
      </div>
      <div class="row between" style="margin-top:var(--s-3)">
        <span data-t="zone">${zoneHtml}</span>
        <span class="small muted num" data-t="tiz">${zone ? 'In zone ' + tiz : (l && l.unknownMs ? 'Unmeasured ' + S.fmtDur(l.unknownMs) : '')}</span>
      </div>
    </div>`;
  }
  return `<div class="tv-panel" data-metrics aria-live="polite">
    <div class="metric ${stale ? 'stale' : ''}">
      <span class="eyebrow">Heart rate</span>
      <span class="row" style="gap:var(--s-3);align-items:baseline"><span class="val hero num" data-t="bpm">${bpmVal}</span><span class="unit" style="font-size:var(--t-base)">bpm</span></span>
      <span class="status-line ${m.tone}" style="font-size:var(--t-base)" data-t="status"><span class="dot"></span>${esc(m.label)}</span>
      <span class="small muted" data-t="detail">${esc(m.detail)}</span>
    </div>
    <div class="metric"><span class="eyebrow">Zone</span><span data-t="zone" style="font-size:var(--t-md)">${zoneHtml}</span></div>
    <div class="row between">
      <div class="metric"><span class="eyebrow">In this zone</span><span class="val num" data-t="tiz">${zone ? tiz : '––'}</span></div>
      <div class="metric" style="align-items:flex-end"><span class="eyebrow">Active time</span><span class="val num" data-t="dur">${dur}</span></div>
    </div>
    ${l ? `<div class="stack-sm" style="margin-top:auto"><span class="eyebrow">All zones</span>${zoneBar(l.zoneMs, l.unknownMs)}${zoneLegendCompact(l.zoneMs, l.unknownMs)}</div>` : ''}
  </div>`;
}

export function zoneBar(zoneMs, unknownMs) {
  const total = Object.values(zoneMs).reduce((a, b) => a + b, 0) + unknownMs || 1;
  const seg = (k, v) => v > 0 ? `<span class="b${k}" style="width:${(v / total * 100).toFixed(2)}%" title="Zone ${k}"></span>` : '';
  return `<div class="zonebar" role="img" aria-label="Time in each zone">${[1, 2, 3, 4, 5].map(k => seg(k, zoneMs[k])).join('')}${unknownMs > 0 ? `<span class="bu" style="width:${(unknownMs / total * 100).toFixed(2)}%" title="Unmeasured"></span>` : ''}</div>`;
}
export function zoneLegendCompact(zoneMs, unknownMs) {
  return `<div class="zone-compact">${[1, 2, 3, 4, 5].map(k => `<div><span class="lab z-${k}">Z${k}</span><span class="num">${S.fmtDur(zoneMs[k])}</span></div>`).join('')}<div><span class="lab z-u">Unmeasured</span><span class="num">${S.fmtDur(unknownMs)}</span></div></div>`;
}
export function zoneLegend(zoneMs, unknownMs, user, compact = false) {
  const total = Object.values(zoneMs).reduce((a, b) => a + b, 0) + unknownMs || 1;
  const row = (lab, v, cls, bounds) => `<span class="lab ${cls}" style="background:none;padding:0">${lab}${bounds ? ` <span class="faint" style="font-weight:500">${esc(bounds)}</span>` : ''}</span><span class="bar"><i class="${cls}" style="width:${(v / total * 100).toFixed(1)}%;background:currentColor"></i></span><span class="t num">${S.fmtDur(v)}</span>`;
  return `<div class="zone-rows">${[1, 2, 3, 4, 5].map(k => row(`Zone ${k}`, zoneMs[k], `z-${k}`, compact ? '' : S.zoneBounds(user, k))).join('')}${row('Unmeasured', unknownMs, 'z-u', '')}</div>`;
}

/* Deterministic pseudo-QR: a visual stand-in. The production QR encodes the approval URL. */
export function qr(seed) {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const n = 21; let cells = '';
  const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#1A1A18"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#FFFDF8"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#1A1A18"/>`;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if ((x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8)) continue;
    h = (h * 1103515245 + 12345) >>> 0; if ((h >> 16) & 1) cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="#1A1A18"/>`;
  }
  return `<div class="qr" role="img" aria-label="QR code for ${esc(seed)}"><svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}${cells}</svg></div>`;
}

export function dialog({ title, body, actions, tv = false, id = 'dlg' }) {
  return `<div class="scrim" data-modal data-dialog="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
    <div class="dialog"><h2 id="${id}-t">${esc(title)}</h2><p class="muted">${body}</p><div class="actions">${actions}</div></div></div>`;
}
export function sheet({ title, body, id = 'sheet' }) {
  return `<div class="scrim" data-modal data-dialog="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-t"><div class="sheet"><h2 id="${id}-t">${esc(title)}</h2>${body}</div></div>`;
}
export function btn(label, action, { kind = '', extra = '', focus = true, auto = false, fid = '', disabled = false, params = {} } = {}) {
  const data = Object.entries(params).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button type="button" class="btn ${kind} ${extra}" data-action="${esc(action)}" ${data} ${focus ? 'data-focus' : ''} ${auto ? 'data-autofocus' : ''} ${fid ? `data-fid="${esc(fid)}"` : ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
}
export function progressRing(pct, label) {
  const r = 30, c = 2 * Math.PI * r; const off = c * (1 - Math.min(1, pct));
  return `<svg class="progress-ring" viewBox="0 0 72 72" role="img" aria-label="${esc(label)}"><circle class="track" cx="36" cy="36" r="${r}"/><circle class="fill" cx="36" cy="36" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>`;
}
export function sessionStatusChip(s) {
  if (s.status === 'completed') return `<span class="chip ok">Completed</span>`;
  const done = s.sets.filter(x => x.status !== 'not_reached').length;
  return `<span class="chip neutral">Ended early · ${done} of ${s.sets.length} sets</span>`;
}
export const exampleTag = () => `<span class="chip neutral example-tag" style="font-weight:500">Example data</span>`;
