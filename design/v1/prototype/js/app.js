import * as storage from './storage.js';
/* Prototype shell: device frames, event wiring, 1 s tick, TV D-pad, prototype controls. */
import * as S from './store.js';
import { createDpad } from './dpad.js';
import { renderPhone, phoneActions, phoneInput, phoneChange, phoneSubmit, phoneUI } from './phone.js';
import { renderTV, tvActions, tvBack, tvUI } from './tv.js';
import { esc } from './ui.js';
window.__dillan = S; // exposed for prototype controls and QA scripts

const $ = (sel, root = document) => root.querySelector(sel);
const stage = $('#stage');
let layout = storage.getItem('dillan.proto.layout') || 'both';
let phoneWidth = storage.getItem('dillan.proto.phoneWidth') || '390';
let dpad = null;
if (!storage.persistent) { const h = document.querySelector('.proto-hint'); if (h) h.insertAdjacentHTML('beforeend', ' <strong>Hosted preview:</strong> state lives in memory, so a browser reload resets to example data. Download the package to see reload-persistence (workout survives reload, failed notes retained).'); }

/* ---------- Layout ---------- */
function buildStage() {
  stage.className = 'proto-stage layout-' + layout; stage.innerHTML = ''; dpad = null;
  const showPhone = layout !== 'tv'; const showTV = layout !== 'phone';
  if (showPhone) {
    if (phoneWidth === 'desktop') stage.insertAdjacentHTML('beforeend', `<div class="device" id="phone-device"><div class="device-label">Desktop web · 1280 × 800</div><div class="desktop-frame"><div class="browser-bar"><i></i><i></i><i></i><span class="url">dillan.app</span></div><div class="screen" id="phone"></div></div></div>`);
    else stage.insertAdjacentHTML('beforeend', `<div class="device" id="phone-device"><div class="device-label">Mobile web · ${phoneWidth} px</div><div class="phone-frame ${phoneWidth === '320' ? 'w320' : ''}"><div class="screen" id="phone"></div></div></div>`);
  }
  if (showTV) stage.insertAdjacentHTML('beforeend', `<div class="tv-scale" id="tv-scale"><div class="device-label">Fire TV · 1920 × 1080 · use arrow keys, Enter, Backspace</div><div class="tv-frame tv" id="tv-frame"><div class="screen" id="tv"></div></div></div>`);
  fitTV(); renderAll(true);
}
function fitTV() {
  const availH = stage.clientHeight - 120;
  const pd = $('#phone-device');
  let phoneW = 0;
  if (pd) {
    const fr = pd.firstElementChild.nextElementSibling; const w = fr.offsetWidth, h = fr.offsetHeight;
    const ps = Math.min(1, availH / h, (stage.clientWidth - 56) / w);
    fr.style.transform = `scale(${ps})`; fr.style.transformOrigin = 'top left'; pd.style.width = `${w * ps}px`; pd.style.height = `${h * ps}px`; phoneW = w * ps;
  }
  const wrap = $('#tv-scale'); if (!wrap) return;
  const avail = stage.clientWidth - 56 - (layout === 'both' ? phoneW + 48 : 0);
  const scale = Math.min(avail / 1920, availH / 1080, 1);
  $('#tv-frame').style.transform = `scale(${scale})`; wrap.style.width = `${1920 * scale}px`; wrap.style.height = `${1080 * scale}px`;
}
window.addEventListener('resize', fitTV);

/* ---------- Rendering ---------- */
function renderAll(fresh = false) {
  const ph = $('#phone'); const tv = $('#tv');
  if (ph) {
    const active = document.activeElement; const keepId = active && ph.contains(active) ? active.id : null; const selStart = active?.selectionStart;
    ph.innerHTML = renderPhone();
    if (keepId) { const el = document.getElementById(keepId); if (el) { el.focus({ preventScroll: true }); try { if (selStart != null && el.setSelectionRange) el.setSelectionRange(selStart, selStart); } catch (e) { /* non-text input */ } } }
    const auto = ph.querySelector('[autofocus]'); if (auto && !keepId) auto.focus({ preventScroll: true });
  }
  if (tv) {
    const prev = dpad?.current?.getAttribute('data-fid') || null;
    tv.innerHTML = renderTV();
    if (!dpad) dpad = createDpad(tv, { onBack: tvBack });
    dpad.restore(fresh ? null : prev);
  }
  document.body.classList.toggle('reduce-motion', !!S.state.proto.reducedMotion);
  syncDrawer();
}
S.subscribe(() => renderAll());

/* 1 s tick: engine + targeted DOM patches so inputs keep focus during workouts. */
setInterval(() => {
  const changed = S.tick();
  if (S.state.toast && S.now() >= S.state.toast.until) { S.state.toast = null; renderAll(); return; }
  const l = S.state.live;
  if (l || changed) {
    // Rest ended or sensor mode auto-advanced → structural change; otherwise patch values.
    const needsFull = patchLive() === false;
    if (needsFull) renderAll();
  }
  const pair = document.querySelector('[data-t="pair-left"]'); if (pair) { const p = S.state.devices.tv.pairing; if (p) { const left = Math.max(0, Math.ceil((p.expiresAt - S.now()) / 1000)); pair.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; } }
}, 1000);
let lastStructure = '';
function patchLive() {
  const l = S.state.live;
  const structure = l ? `${l.cursor}|${!!l.rest}|${l.paused}|${S.state.sensor.mode}|${S.freshness()}|${l.currentZone}|${(S.healthModel(S.userById(l.userId)).zonesReady)}` : `${S.state.sensor.mode}|${S.freshness()}`;
  if (structure !== lastStructure) { lastStructure = structure; return false; }
  if (!l) return true;
  const u = S.userById(l.userId); const m = S.healthModel(u);
  document.querySelectorAll('[data-t="bpm"]').forEach(el => el.textContent = m.showBpm && m.bpm != null ? m.bpm : '––');
  document.querySelectorAll('[data-t="dur"]').forEach(el => el.textContent = S.fmtDur(l.activeMs));
  document.querySelectorAll('[data-t="tiz"]').forEach(el => { const inTV = el.closest('.tv-panel'); el.textContent = l.currentZone ? (inTV ? S.fmtDur(S.timeInCurrentZone()) : 'In zone ' + S.fmtDur(S.timeInCurrentZone())) : (inTV ? '––' : (l.unknownMs ? 'Unmeasured ' + S.fmtDur(l.unknownMs) : '')); });
  document.querySelectorAll('[data-t="rest"]').forEach(el => el.textContent = S.fmtDur(l.rest ? Math.max(0, l.rest.endsAt - S.now()) : 0));
  document.querySelectorAll('[data-t="detail"]').forEach(el => el.textContent = m.detail);
  document.querySelectorAll('[data-t="status"]').forEach(el => { el.className = `status-line ${m.tone}`; el.innerHTML = `<span class="dot"></span>${esc(m.label)}`; });
  return true;
}

/* ---------- Events ---------- */
function wire(rootSel, actions, onInput, onChange, onSubmit) {
  document.addEventListener('click', e => {
    const root = $(rootSel); if (!root || !root.contains(e.target)) return;
    const el = e.target.closest('[data-action]'); if (!el || el.disabled) return;
    S.touch(rootSel === '#tv' ? 'tv' : 'phone');
    const fn = actions[el.dataset.action]; if (fn) fn(el.dataset, el); else console.warn('No action', el.dataset.action);
  });
  if (onInput) document.addEventListener('input', e => { const root = $(rootSel); if (root && root.contains(e.target)) onInput(e); });
  if (onChange) document.addEventListener('change', e => { const root = $(rootSel); if (root && root.contains(e.target)) onChange(e); });
  if (onSubmit) document.addEventListener('submit', e => { const root = $(rootSel); if (root && root.contains(e.target)) onSubmit(e); });
}
wire('#phone', phoneActions, phoneInput, phoneChange, phoneSubmit);
wire('#tv', tvActions);
document.addEventListener('keydown', e => {
  const tv = $('#tv'); if (!tv || !dpad) return;
  const inPhone = $('#phone')?.contains(document.activeElement) && document.activeElement !== document.body;
  if (inPhone) return;                      // keyboard belongs to phone while a phone field is focused
  if (e.target.closest && e.target.closest('.proto-drawer, .proto-bar')) return;
  if (dpad.onKey(e)) S.touch('tv');
});
// Tapping the TV with the mouse also moves D-pad focus so mouse users can follow along.
document.addEventListener('click', e => { const w = e.target.closest && e.target.closest('.code-wrap'); if (w) w.querySelector('input')?.focus(); });
document.addEventListener('mousedown', e => { const tv = $('#tv'); if (tv && tv.contains(e.target)) { const f = e.target.closest('[data-focus]'); if (f && dpad) dpad.setFocus(f); document.activeElement?.blur(); } });

/* ---------- Prototype chrome ---------- */
$('#layout').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; layout = b.dataset.layout; storage.setItem('dillan.proto.layout', layout); [...$('#layout').children].forEach(x => x.setAttribute('aria-pressed', x === b)); buildStage(); });
$('#pwidth').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; phoneWidth = b.dataset.w; storage.setItem('dillan.proto.phoneWidth', phoneWidth); [...$('#pwidth').children].forEach(x => x.setAttribute('aria-pressed', x === b)); buildStage(); });
[...$('#layout').children].forEach(x => x.setAttribute('aria-pressed', x.dataset.layout === layout));
[...$('#pwidth').children].forEach(x => x.setAttribute('aria-pressed', x.dataset.w === phoneWidth));
$('#toggle-drawer').addEventListener('click', () => $('#drawer').classList.toggle('open'));
function syncDrawer() {
  const s = S.state; $('#sensor-mode').value = s.sensor.mode; $('#fail-save').checked = s.proto.failSave; $('#approval').value = s.proto.approvalOutcome; $('#reduced').checked = !!s.proto.reducedMotion;
  $('#sensor-now').textContent = `${s.sensor.bpm ?? '––'} bpm · ${S.freshness()}${s.sensor.lastReadingAt ? ` · ${Math.round((S.now() - s.sensor.lastReadingAt) / 1000)}s ago` : ''}`;
}
$('#sensor-mode').addEventListener('change', e => S.setSensorMode(e.target.value));
$('#fail-save').addEventListener('change', e => S.update(s => { s.proto.failSave = e.target.checked; }, 'proto'));
$('#approval').addEventListener('change', e => S.update(s => { s.proto.approvalOutcome = e.target.value; }, 'proto'));
$('#reduced').addEventListener('change', e => S.update(s => { s.proto.reducedMotion = e.target.checked; }, 'proto'));
$('#approve-pair').addEventListener('click', () => { const p = S.state.devices.tv.pairing; if (!p || p.status !== 'awaiting') { S.toast('No TV code is waiting. Select a profile or Get started on the TV first.'); return; } const who = S.activeUser('phone') || (p.forUserId && S.userById(p.forUserId)) || S.userById('u-luis') || S.state.users[0]; S.update(() => S.resolvePairing('approved', who.id), 'pair'); S.toast(`Approved as ${who.name} (simulated phone approval).`); });
$('#expire-pair').addEventListener('click', () => S.update(s => { if (s.devices.tv.pairing) s.devices.tv.pairing.expiresAt = S.now() - 1; }, 'proto'));
$('#idle-tv').addEventListener('click', () => S.update(s => { s.devices.tv.lastActivityAt = S.now() - 16 * 60000; }, 'proto'));
$('#age-reading').addEventListener('click', () => S.update(s => { if (s.sensor.lastReadingAt) s.sensor.lastReadingAt -= 12000; s.sensor.mode = 'delayed'; s.sensor.modeSince = S.now(); }, 'proto'));
$('#reset-example').addEventListener('click', () => { phoneUI.modal = null; tvUI.modal = null; S.reset('example'); buildStage(); });
$('#reset-empty').addEventListener('click', () => { phoneUI.modal = null; tvUI.modal = null; S.reset('empty'); buildStage(); });
$('#jump').addEventListener('change', e => { const [dev, name, extra] = e.target.value.split(':'); if (!name) return;
  if (dev === 'tv' && !S.activeUser('tv') && name !== 'chooser') { const who = S.activeUser('phone') || S.userById('u-luis') || S.state.users[0]; if (who) { S.update(s => { S.signIn('tv', who.id); if (s.devices.tv.pairing) s.devices.tv.pairing = null; }, 'proto'); S.toast(`Prototype shortcut: signed the TV in as ${who.name} to show this screen.`); } }
  const u = S.activeUser(dev); const p = {}; if (extra === 'firstWorkout' && u?.workouts[0]) p.workoutId = u.workouts[0].id; if (extra === 'recent' && u?.sessions[0]) p.sessionId = u.sessions.slice().sort((a, b) => b.startedAt - a.startedAt)[0].id; S.navigate(dev, name, p); e.target.value = ''; });
setInterval(syncDrawer, 1000);

buildStage();
