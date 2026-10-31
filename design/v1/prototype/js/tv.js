/* Television screens (1920×1080, dark, D-pad). Every screen declares its Back behavior in tvBack(). */
import * as S from './store.js';
import { esc, icons, avatar, statusChip, metricsPanel, zoneBar, zoneLegend, qr, dialog, btn, sessionStatusChip, exampleTag } from './ui.js';

const DEV = 'tv';
const ui = { modal: null, calSel: null };
export const tvUI = ui;

function frame({ content, nav = null, modal = '', hideChrome = false, footer = '' }) {
  const u = S.activeUser(DEV); const l = S.state.live;
  const chrome = hideChrome ? '' : `<header class="topbar">
      <img src="brand/dillan-wordmark-reversed.svg" alt="Dillan" style="height:44px;margin-right:var(--s-8)">
      ${nav ? `<nav class="tv-nav" aria-label="Primary">${['home', 'program', 'calendar'].map(n => btn(n[0].toUpperCase() + n.slice(1), 'nav', { kind: 'secondary', params: { to: n }, extra: nav === n ? 'cur' : '', fid: 'nav-' + n }).replace('class="btn', nav === n ? 'aria-current="page" class="btn' : 'class="btn')).join('')}</nav>` : ''}
      <span class="grow"></span>
      ${u ? `<button class="tv-user btn ghost" data-action="nav" data-to="account" data-focus data-fid="user" aria-label="${esc(u.name)}, profile and switch user">${avatar(u)}<span>${esc(u.name)}</span>${l && l.userId === u.id ? '<span class="chip accent">Workout running</span>' : ''}</button>` : ''}
    </header>`;
  return `<div class="app theme-dark">${chrome}${content}${footer}${modal}${toastHtml()}</div>`;
}
function toastHtml() { const t = S.state.toast; return t && S.now() < t.until ? `<div class="toast" role="status">${esc(t.msg)}</div>` : ''; }
const hint = (items) => `<div class="tv-footer"><span>${items.map(([k, v]) => `<kbd>${k}</kbd> ${v}`).join(' &nbsp; ')}</span><span class="faint">Prototype · example data</span></div>`;

/* ---------- S01 ---------- */
function welcome() {
  return frame({ hideChrome: true, content: `<div class="empty" style="margin:auto;max-width:960px">
      <img src="brand/dillan-wordmark-reversed.svg" alt="Dillan" style="height:72px;margin:0 auto var(--s-8)">
      <h1>Your workouts, on the big screen.</h1>
      <p class="muted" style="margin:var(--s-4) 0 var(--s-10);font-size:var(--t-md)">Set up this TV from your phone — no typing with the remote. You'll see exercises, sets, and live heart rate here while you train.</p>
      ${btn('Set up this TV', 'pair-start', { kind: 'primary xl', auto: true })}
    </div>`, footer: hint([['OK', 'Select']]) });
}
function chooser() {
  const d = S.device(DEV);
  const tiles = d.remembered.map(id => S.userById(id)).filter(Boolean).map((u, i) => `<button class="tv-tile" data-action="choose-profile" data-user="${u.id}" data-focus ${i === 0 ? 'data-autofocus' : ''} data-fid="p-${u.id}">${avatar(u, 'xl')}<span>${esc(u.name)}</span><span class="lock row" style="gap:8px">${icons.lock} Locked</span></button>`).join('');
  return frame({ hideChrome: true, content: `<div style="margin:auto;text-align:center" class="stack">
      <img src="brand/dillan-wordmark-reversed.svg" alt="Dillan" style="height:56px;margin:0 auto var(--s-6)">
      <h1>Who's training?</h1>
      <p class="muted">Selecting a name sends a verification to that person's phone. Nothing private shows until they approve.</p>
      <div class="tv-chooser" style="margin-top:var(--s-8)">${tiles}
        <button class="tv-tile" data-action="pair-start" data-focus data-fid="add"><span class="avatar xl" style="background:var(--surface-2);color:var(--text-2)">+</span><span>Add user</span><span class="lock">Register or log in</span></button></div>
    </div>`, footer: hint([['OK', 'Select'], ['Back', 'Nothing to go back to']]) });
}
/* ---------- S03 Authorize this TV ---------- */
function pairing() {
  const d = S.device(DEV); const p = d.pairing; const forUser = p?.forUserId ? S.userById(p.forUserId) : null;
  if (!p) return welcome();
  const left = Math.max(0, Math.ceil((p.expiresAt - S.now()) / 1000));
  let status;
  if (p.status === 'awaiting') status = `<div class="row" style="gap:var(--s-3)"><span class="spinner"></span><span>Waiting for approval on your phone…</span></div><p class="small muted">Code expires in <span class="num" data-t="pair-left">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>. We never show the code we send to your inbox or phone here.</p>`;
  else if (p.status === 'approved') status = `<span class="chip ok">Approved</span><p>Signed in as ${esc(S.userById(p.approvedBy)?.name || '')}. Taking you Home…</p>`;
  else if (p.status === 'denied') status = `<span class="chip warn">Request declined</span><p class="muted">The phone said this isn't their TV. Nothing was linked.</p>${btn('Try again', 'pair-start', { kind: 'primary', auto: true })}${btn('Back', 'pair-cancel', { kind: 'secondary' })}`;
  else status = `<span class="chip warn">Code expired</span><p class="muted">Codes last 5 minutes.</p>${btn('Get a new code', 'pair-start', { kind: 'primary', auto: true })}${btn('Back', 'pair-cancel', { kind: 'secondary' })}`;
  return frame({ hideChrome: true, content: `<div class="tv-grid" style="align-items:center;grid-template-columns:1fr 1fr;max-width:1500px;margin:auto">
      <div class="stack">
        <span class="eyebrow">${forUser ? `Unlock ${esc(forUser.name)}` : 'Authorize this TV'}</span>
        <h1>${forUser ? `Approve on ${esc(forUser.name)}'s phone` : 'Scan with your phone'}</h1>
        <p class="muted" style="font-size:var(--t-md)">${forUser ? `We'll send a code to ${esc(S.maskContact(forUser.contacts[0]))} once the link is opened. Approve, and this TV unlocks as ${esc(forUser.name)}.` : 'Open the camera, scan the code, then register or log in on your phone. A scan alone never signs anything in — you confirm the TV by name on your phone.'}</p>
        <div class="card stack-sm" style="margin-top:var(--s-4)"><span class="eyebrow">This TV</span><strong style="font-size:var(--t-md)">${esc(d.name)}</strong><span class="small muted">Shown on your phone when you approve</span></div>
        <div class="stack-sm" style="margin-top:var(--s-4)" aria-live="polite">${status}</div>
        ${p.status === 'awaiting' ? btn('Cancel', 'pair-cancel', { kind: 'secondary', auto: true }) : ''}
        ${p.status === 'awaiting' ? `<p class="small muted proto-only" style="margin-top:var(--s-4);border-top:1px solid var(--line);padding-top:var(--s-3)">Prototype: approve from the phone panel (a banner appears there), or use Prototype controls → “Approve the TV code”.</p>` : ''}
      </div>
      <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:var(--s-6);padding:var(--s-12)">
        ${qr(p.code)}
        <div class="center"><span class="eyebrow">Or go to</span><div style="font-size:var(--t-md);font-weight:700">dillan.app/tv</div><span class="eyebrow" style="margin-top:var(--s-3);display:block">and enter</span><div class="code-big num">${esc(p.code)}</div></div>
      </div></div>`, footer: hint([['Back', 'Cancel pairing']]) });
}
/* ---------- S04 Home ---------- */
function home() {
  const u = S.activeUser(DEV); if (!u) return chooser();
  const p = S.progress(u); const m = S.healthModel(u); const live = S.state.live && S.state.live.userId === u.id ? S.state.live : null;
  const maxW = Math.max(p.goal, ...p.weeks.map(w => w.count), 1);
  return frame({ nav: 'home', content: `<div class="tv-home">
      <div class="stack" style="gap:var(--s-6)">
        <h1 style="font-size:var(--t-3xl)">${live ? 'Workout in progress' : `Hi, ${esc(u.name)}`}</h1>
        ${live ? `<p class="muted" style="font-size:var(--t-md)">${esc(live.workoutName)} · ${live.paused ? 'Paused' : 'Running'} · ${S.fmtDur(live.activeMs)} active</p>${btn('Back to workout', 'nav', { kind: 'primary xl', params: { to: 'dashboard' }, auto: true })}` : btn(icons.play + ' Workout Now', 'workout-now', { kind: 'primary xl', auto: true, fid: 'wn' })}
        <div class="card stack-sm"><div class="row between"><span class="eyebrow">Live data</span>${statusChip(m)}</div><p class="muted">${esc(m.detail || 'iPhone companion connected.')}</p>${u.companion !== 'connected' || !u.zonesConfirmed ? `<p class="small muted">Finish setup on your phone: Profile → Live data.</p>` : ''}</div>
        ${p.recent ? `<button class="rowcard" data-action="open-session" data-id="${p.recent.id}" data-focus data-fid="recent"><div class="grow"><span class="eyebrow">Most recent</span><div style="font-size:var(--t-md);font-weight:700">${esc(p.recent.workoutName)}</div><div class="meta">${S.fmtDate(p.recent.startedAt)} · ${S.fmtDur(p.recent.activeMs, { short: true })} · ${p.recent.status === 'completed' ? 'Completed' : 'Ended early'}${p.recent.notes ? ' · has notes' : ''}</div></div><span class="chev">${icons.chev}</span></button>` : ''}
      </div>
      <div class="tv-panel">
        <div class="row between"><span class="eyebrow">This week · Mon–Sun</span>${p.total ? exampleTag() : ''}</div>
        ${p.total === 0 ? `<div class="empty"><div class="mark" style="color:var(--text)">${icons.mark}</div><h3>Your first workout starts your progress.</h3></div>` : `
        <div class="metric"><span class="val num" style="font-size:var(--t-3xl)">${p.sessions} <span class="muted" style="font-size:var(--t-xl)">of ${p.goal}</span></span><span class="unit">sessions · goal set on phone</span></div>
        <div class="metric"><span class="val num">${p.minutes} <span class="unit" style="font-size:var(--t-sm)">min</span></span><span class="unit">active this week · ${p.prevSameMinutes} by this point last week</span></div>
        <div><span class="eyebrow">Sessions per week · last 4</span><div class="bars" style="height:120px;margin-top:var(--s-3)">${p.weeks.map(w => `<div class="b ${w.current ? 'cur' : ''}"><i style="height:${Math.max(8, w.count / maxW * 90)}px;max-width:80px"></i><span class="num">${w.count}${w.current ? ' · now' : ''}</span></div>`).join('')}</div></div>`}
      </div></div>`, footer: hint([['◀ ▶', 'Move'], ['OK', 'Select'], ['Back', 'Exit app (stays signed in)']]) });
}
/* ---------- S05 Program (view + QR to edit) ---------- */
function program() {
  const u = S.activeUser(DEV);
  return frame({ nav: 'program', content: `<div class="tv-grid">
      <div class="stack"><h1>Program</h1>
        ${u.workouts.length ? `<div class="list">${u.workouts.map((w, i) => `<button class="rowcard" data-action="nav" data-to="preflight" data-workout="${w.id}" data-focus ${i === 0 ? 'data-autofocus' : ''} data-fid="w-${w.id}"><div class="grow"><div style="font-size:var(--t-md);font-weight:700">${esc(w.name)}</div><div class="meta">${S.plural(w.exercises.length, 'exercise')} · ${S.plural(S.stepsOf(w.exercises).length, 'set')} · ${esc(w.exercises.map(e => e.name).join(', '))}</div></div><span class="chev">${icons.chev}</span></button>`).join('')}</div>` : `<div class="empty" style="text-align:left;padding:0"><h2>No workouts yet</h2><p class="muted">Workouts are built on your phone — the remote isn't a good keyboard. Scan to create your first one.</p></div>`}</div>
      <div class="tv-panel" style="align-items:center;text-align:center">${qr('edit-' + u.id)}<div><strong style="font-size:var(--t-md)">Edit on your phone</strong><p class="muted">Scan to open Program on your phone. Changes appear here as soon as you save.</p></div></div></div>`, footer: hint([['OK', 'Preview & start'], ['Back', 'Home']]) });
}
/* ---------- S07 Choose / S08 Preflight ---------- */
function choose() {
  const u = S.activeUser(DEV);
  if (!u.workouts.length) return frame({ content: `<div class="tv-grid" style="align-items:center"><div class="stack"><h1>Create your first workout</h1><p class="muted" style="font-size:var(--t-md)">Workout Now follows a saved workout. Build one on your phone — it takes about two minutes — and it will appear here.</p>${btn('Back to Home', 'nav', { kind: 'secondary', params: { to: 'home' }, auto: true })}</div><div class="tv-panel" style="align-items:center;text-align:center">${qr('edit-' + u.id)}<strong style="font-size:var(--t-md)">Scan to open Program on your phone</strong></div></div>`, footer: hint([['Back', 'Home']]) });
  const sel = ui.chooseSel || u.workouts[0].id; const w = u.workouts.find(x => x.id === sel) || u.workouts[0];
  return frame({ content: `<div class="tv-grid"><div class="stack"><h1>Choose a workout</h1><p class="muted">Nothing starts until you press Start on the next screen.</p>
      <div class="list">${u.workouts.map(x => `<button class="rowcard ${x.id === w.id ? 'selected' : ''}" data-action="choose-select" data-workout="${x.id}" data-focus ${x.id === w.id ? 'data-autofocus' : ''} data-fid="c-${x.id}"><div class="grow"><div style="font-size:var(--t-md);font-weight:700">${esc(x.name)}</div><div class="meta">${S.plural(x.exercises.length, 'exercise')} · ${S.plural(S.stepsOf(x.exercises).length, 'set')}</div></div><span class="chev">${icons.chev}</span></button>`).join('')}</div></div>
      <div class="tv-panel"><span class="eyebrow">Preview</span><h2>${esc(w.name)}</h2><div class="list">${S.groupsOf(w.exercises).map(g => g.type === 'superset' ? `<div class="card sunken tight"><span class="eyebrow">Superset ${g.letter} · ${g.rounds} rounds</span>${g.members.map((i, mi) => `<div>${g.letter}${mi + 1} · ${esc(w.exercises[i].name)} <span class="muted">${S.fmtReps(w.exercises[i])} · ${S.fmtWeight(w.exercises[i], u.units)}</span></div>`).join('')}<div class="small muted">Rest ${g.rest}s after ${g.letter}${g.members.length}</div></div>` : `<div class="card sunken tight"><div>${esc(w.exercises[g.members[0]].name)}</div><div class="muted small">${g.rounds} × ${S.fmtReps(w.exercises[g.members[0]])} · ${S.fmtWeight(w.exercises[g.members[0]], u.units)} · rest ${g.rest}s</div></div>`).join('')}</div></div></div>`, footer: hint([['▲ ▼', 'Preview'], ['OK', 'Continue to readiness check'], ['Back', 'Home']]) });
}
function preflight(r) {
  const u = S.activeUser(DEV); const w = u.workouts.find(x => x.id === r.workoutId); if (!w) return choose();
  const m = S.healthModel(u); const ready = m.mode === 'live' && m.freshness === 'live'; const preparing = ['waiting', 'reconnecting'].includes(m.mode);
  const phoneOn = S.state.devices.phone.session?.userId === u.id;
  return frame({ content: `<div class="tv-grid" style="grid-template-columns:1fr 1fr"><div class="stack">
      <span class="eyebrow">Ready?</span><h1>${esc(w.name)}</h1>
      <div class="row">${avatar(u)}<span style="font-size:var(--t-md);font-weight:700">Training as ${esc(u.name)}</span>${phoneOn ? '<span class="chip neutral">Phone can control</span>' : ''}</div>
      <div class="card stack-sm"><div class="row between"><span class="eyebrow">Apple Watch</span>${statusChip(ready ? { tone: 'live', label: 'Live · ready' } : preparing ? { tone: 'warn', label: 'Preparing' } : (m.mode === 'not_connected' || u.companion !== 'connected') ? { tone: 'off', label: 'Not configured' } : { tone: 'warn', label: 'Unavailable' })}</div><p class="muted">${esc(ready ? `Reading ${m.bpm} bpm, ${m.ageSec}s ago.` : m.detail)}</p></div>
      <div class="card stack-sm"><div class="row between"><span class="eyebrow">Heart-rate zones</span>${u.zonesConfirmed ? '<span class="chip ok">Confirmed</span>' : '<span class="chip warn">Not set</span>'}</div><p class="muted">${u.zonesConfirmed ? `Zone 1 under ${u.zones[0]} · Zone 5 from ${u.zones[3]} bpm.` : 'Set up zones on your phone to see zone and time in zone. Without them you will see BPM only.'}</p></div>
      <div class="tv-controls" style="margin-top:var(--s-4)">${btn(ready ? 'Start' : preparing ? 'Start when ready' : 'Start with live data', 'start-workout', { kind: 'primary xl', params: { workout: w.id, live: 1 }, disabled: !ready, auto: ready, fid: 'start' })}${btn('Continue without live data', 'start-workout', { kind: 'secondary xl', params: { workout: w.id, live: 0 }, auto: !ready, fid: 'nolive' })}</div>
      <p class="small muted">Without live data, the session records sets and time only and will say “No heart-rate data”.</p></div>
      <div class="tv-panel"><span class="eyebrow">Plan</span><div class="list">${S.groupsOf(w.exercises).map(g => g.type === 'superset' ? `<div class="card sunken tight"><span class="eyebrow">Superset ${g.letter} · ${g.rounds} rounds</span>${g.members.map((i, mi) => `<div>${g.letter}${mi + 1} · ${esc(w.exercises[i].name)} <span class="muted">${S.fmtReps(w.exercises[i])} · ${S.fmtWeight(w.exercises[i], u.units)}</span></div>`).join('')}</div>` : `<div class="card sunken tight">${esc(w.exercises[g.members[0]].name)} <span class="muted">${g.rounds} × ${S.fmtReps(w.exercises[g.members[0]])} · ${S.fmtWeight(w.exercises[g.members[0]], u.units)}</span></div>`).join('')}</div></div></div>`, footer: hint([['OK', 'Start'], ['Back', 'Choose a workout']]) });
}
/* ---------- S09 / S10 Dashboard ---------- */
function dashboard() {
  const u = S.activeUser(DEV); const l = S.state.live; if (!l || l.userId !== u.id) return home();
  const st = S.currentStep(); const nx = S.nextStep(); const ex = st ? l.snapshot[st.exIndex] : null;
  const rest = l.rest && !l.paused ? l.rest : null; const rem = rest ? Math.max(0, rest.endsAt - S.now()) : 0;
  const pills = ex ? `<div class="set-pills" role="list" aria-label="Sets">${Array.from({ length: ex.sets }, (_, i) => { const r = l.sets[S.setKey(st.exIndex, i)]; const cur = st.setIndex === i; return `<div role="listitem" class="set-pill ${r ? r.status : ''} ${cur ? 'current' : ''}" aria-label="Set ${i + 1}: ${r ? r.status : cur ? 'current' : 'upcoming'}"><span class="n num">${r?.status === 'done' ? icons.check : i + 1}</span><span class="cap">${r ? (r.status === 'done' ? `${r.reps}${r.weight != null ? ` × ${r.weight}` : ''}` : 'Skipped') : cur ? 'Now' : ''}</span></div>`; }).join('')}</div>` : '';
  const main = `<div class="tv-main">
      <div class="row between"><span class="eyebrow">${st ? (st.label ? `Superset ${st.label} · round ${st.setIndex + 1} of ${st.superset.rounds}` : `Exercise ${st.exIndex + 1} of ${l.snapshot.length}`) : 'Finished'}</span><span class="muted num">${l.cursor}/${l.steps.length} sets</span></div>
      ${rest ? `<div class="card rest-card"><div class="metric"><span class="eyebrow">Rest</span><span class="timer num" data-t="rest">${S.fmtDur(rem)}</span></div><div class="grow"><span class="eyebrow">Next</span><div style="font-size:var(--t-md);font-weight:700">${st ? esc(l.snapshot[st.exIndex].name) : 'Finish'}</div>${st ? `<div class="muted">Set ${st.setIndex + 1} · ${S.fmtReps(l.snapshot[st.exIndex])} · ${S.fmtWeight(l.snapshot[st.exIndex], u.units)}</div>` : ''}</div>${btn('Skip rest', 'skip-rest', { kind: 'secondary lg', auto: true, fid: 'skiprest' })}</div>` : ''}
      ${ex ? `<div class="tv-exercise-name">${esc(ex.name)}</div>
      <p class="muted" style="font-size:var(--t-md)">Set ${st.setIndex + 1} of ${ex.sets} · ${S.fmtReps(ex)} · ${S.fmtWeight(ex, u.units)}${ex.repsBasis === 'perSide' ? ' · complete both sides' : ''}</p>
      ${ex.instructions ? `<p class="muted clamp2">${esc(ex.instructions)}</p>` : ''}
      ${pills}` : `<h1>All sets done</h1><p class="muted" style="font-size:var(--t-md)">End the workout to save it. Add notes on your phone.</p>`}
      ${nx && (!st || nx.exIndex !== st.exIndex) && !rest ? `<div class="card sunken tight"><span class="eyebrow">Next</span><div style="font-size:var(--t-md)"><strong>${esc(l.snapshot[nx.exIndex].name)}</strong> <span class="muted">${S.fmtReps(l.snapshot[nx.exIndex])} · ${S.fmtWeight(l.snapshot[nx.exIndex], u.units)}</span></div></div>` : ''}
      <div class="tv-controls">
        ${ex ? btn(icons.check + ' Complete set', 'complete-set', { kind: 'primary xl', auto: !rest, fid: 'complete', disabled: l.paused }) + btn('Skip set', 'skip-set', { kind: 'secondary xl', fid: 'skip', disabled: l.paused }) : btn('End and save', 'end-confirm', { kind: 'primary xl', auto: true, fid: 'end' })}
        ${btn(icons.pause + ' Pause', 'pause', { kind: 'secondary xl', fid: 'pause' })}${ex ? btn('End', 'end-confirm', { kind: 'quiet-danger xl', fid: 'end' }) : ''}
        ${l.cursor > 0 ? btn('Undo', 'undo-set', { kind: 'ghost xl', fid: 'undo' }) : ''}
      </div></div>`;
  const paused = l.paused ? `<div class="scrim" data-modal role="dialog" aria-modal="true" aria-labelledby="pz"><div class="dialog stack">
      <span class="eyebrow">Paused · ${esc(u.name)}</span><h2 id="pz">${esc(l.workoutName)}</h2>
      <div class="row between"><div class="metric"><span class="timer paused num">${S.fmtDur(l.activeMs)}</span><span class="unit">Active · frozen</span></div><div class="metric" style="align-items:flex-end"><span class="val num" data-t="bpm">${S.healthModel(u).showBpm ? S.healthModel(u).bpm : '––'}</span><span class="unit">bpm · ${esc(S.healthModel(u).label)}</span></div></div>
      <p class="muted">Time in zone and rest are not counting while paused.</p>
      <div class="actions">${btn(icons.play + ' Resume', 'resume', { kind: 'primary xl', auto: true })}${btn('End and save', 'end-confirm', { kind: 'secondary xl' })}${btn('Switch user', 'switch-user', { kind: 'ghost xl' })}</div></div></div>` : '';
  return frame({ content: `<div class="row between" style="margin-bottom:var(--s-6)"><div class="row"><span class="chip neutral">${avatar(u)} ${esc(u.name)}</span><h2 style="font-size:var(--t-lg)">${esc(l.workoutName)}</h2></div><span class="muted num">${S.fmtClock(S.now())}</span></div>
    <div class="tv-grid">${main}${metricsPanel(u, { tv: true })}</div>`, hideChrome: true, modal: modalHtml() || paused, footer: hint([['OK', 'Complete set'], ['◀ ▶', 'Skip / Pause / End'], ['Back', 'Pause (never ends the workout)']]) });
}
/* ---------- S11 Summary ---------- */
function summary(r) {
  const u = S.activeUser(DEV); const s = S.sessionById(u.id, r.sessionId); if (!s) return home();
  const done = s.sets.filter(x => x.status === 'done').length, skipped = s.sets.filter(x => x.status === 'skipped').length, nr = s.sets.filter(x => x.status === 'not_reached').length;
  return frame({ content: `<div class="tv-grid"><div class="stack">
      <div class="row">${sessionStatusChip(s)}<span class="muted">${S.fmtClock(s.startedAt)}–${S.fmtClock(s.endedAt)}</span></div><h1>${esc(s.workoutName)}</h1>
      <div class="row" style="gap:var(--s-10)"><div class="metric"><span class="val num" style="font-size:var(--t-3xl)">${S.fmtDur(s.activeMs)}</span><span class="unit">Active</span></div><div class="metric"><span class="val num" style="font-size:var(--t-3xl)">${done}</span><span class="unit">Sets done</span></div>${skipped ? `<div class="metric"><span class="val num" style="font-size:var(--t-3xl)">${skipped}</span><span class="unit">Skipped</span></div>` : ''}${nr ? `<div class="metric"><span class="val num" style="font-size:var(--t-3xl)">${nr}</span><span class="unit">Not reached</span></div>` : ''}</div>
      <div class="card stack-sm"><span class="eyebrow">Session notes</span><p class="muted">${s.notes ? esc(s.notes) : 'Add notes from your phone — typing with a remote is no fun. Saved automatically.'}</p></div>
      <div class="tv-controls">${btn('Done', 'nav', { kind: 'primary xl', params: { to: 'calendar' }, auto: true })}</div><p class="small muted">Saved automatically.</p></div>
      <div class="tv-panel"><span class="eyebrow">Heart-rate zones</span>${s.liveData ? zoneBar(s.zoneMs, s.unknownMs) + zoneLegend(s.zoneMs, s.unknownMs, u) + '<p class="small muted">Unmeasured = no fresh reading, paused, or zones not set.</p>' : '<p class="muted">No heart-rate data — you continued without live data.</p>'}</div></div>`, footer: hint([['OK', 'Done → Calendar']]) });
}
/* ---------- S12 Calendar / S13 Session ---------- */
function calendar(r) {
  const u = S.activeUser(DEV); const month = r.month || S.monthKey(S.now()); const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1); const startDow = (first.getDay() + 6) % 7; const days = new Date(y, mo, 0).getDate();
  const byDay = {}; u.sessions.forEach(s => (byDay[S.dayKey(s.startedAt)] ||= []).push(s));
  const todayKey = S.dayKey(S.now()); const sel = r.day || (month === S.monthKey(S.now()) ? todayKey : `${month}-01`);
  const cells = []; for (let i = 0; i < startDow; i++) cells.push('<span></span>');
  for (let d = 1; d <= days; d++) { const k = `${month}-${String(d).padStart(2, '0')}`; const list = byDay[k] || []; cells.push(`<button class="day ${k === todayKey ? 'today' : ''} ${k === sel ? 'selected' : ''}" data-action="cal-day" data-day="${k}" data-focus ${k === sel ? 'data-autofocus' : ''} data-fid="d-${k}" aria-label="${k}${list.length ? `, ${list.length} session${list.length > 1 ? 's' : ''}` : ''}"><span class="num">${d}</span><span class="marks">${list.slice(0, 3).map(s => `<i class="${s.status === 'completed' ? '' : 'partial'}"></i>`).join('')}</span></button>`); }
  const prev = new Date(y, mo - 2, 1), next = new Date(y, mo, 1); const selList = (byDay[sel] || []).sort((a, b) => a.startedAt - b.startedAt);
  return frame({ nav: 'calendar', content: `<div class="tv-grid" style="grid-template-columns:1.1fr 1fr">
      <div class="stack"><div class="row between">${btn(icons.back, 'cal-month', { kind: 'icon secondary', params: { month: S.monthKey(prev) }, fid: 'prev' })}<h1 style="font-size:var(--t-xl)">${first.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h1>${btn(icons.chev, 'cal-month', { kind: 'icon secondary', params: { month: S.monthKey(next) }, fid: 'next', disabled: next > new Date() })}</div>
        <div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span class="dow">${d}</span>`).join('')}${cells.join('')}</div><p class="small muted">● completed · ○ ended early · past sessions only</p></div>
      <div class="tv-panel"><span class="eyebrow">${new Date(sel + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        ${selList.length ? `<div class="list">${selList.map(s => `<button class="rowcard" data-action="open-session" data-id="${s.id}" data-focus data-fid="s-${s.id}"><div class="grow"><div style="font-size:var(--t-md);font-weight:700">${esc(s.workoutName)}</div><div class="meta">${S.fmtClock(s.startedAt)} · ${S.fmtDur(s.activeMs, { short: true })} · ${s.status === 'completed' ? 'Completed' : 'Ended early'}${s.liveData ? '' : ' · No HR data'}</div></div>${s.notes ? `<span class="chip neutral">${icons.note} Notes</span>` : ''}<span class="chev">${icons.chev}</span></button>`).join('')}</div>` : `<p class="muted">${u.sessions.length ? 'No sessions on this day.' : 'Your saved workouts will appear here.'}</p>`}</div></div>`, footer: hint([['◀ ▲ ▼ ▶', 'Move between days'], ['OK', 'Open day / session'], ['Back', 'Home']]) });
}
function sessionDetail(r) {
  const u = S.activeUser(DEV); const s = S.sessionById(u.id, r.sessionId); if (!s) return calendar({});
  const byEx = {}; s.sets.forEach(x => (byEx[x.exIndex] ||= []).push(x));
  return frame({ content: `<div class="tv-grid"><div class="stack" style="overflow:auto">
      <div class="row">${sessionStatusChip(s)}${s.liveData ? '' : '<span class="chip neutral">No HR data</span>'}<span class="muted">${S.fmtDate(s.startedAt, { year: 'numeric' })} · ${S.fmtClock(s.startedAt)}–${S.fmtClock(s.endedAt)} · ${S.fmtDur(s.activeMs, { short: true })} active</span></div>
      <h1>${esc(s.workoutName)}</h1>
      <div class="list">${s.snapshot.map((e, i) => `<div class="card sunken tight"><div class="row between"><strong style="font-size:var(--t-md)">${esc(e.name)}</strong><span class="muted">${e.sets} × ${S.fmtReps(e)} · ${S.fmtWeight(e, u.units)}</span></div><div class="row wrap" style="margin-top:var(--s-2)">${(byEx[i] || []).map(x => `<span class="chip ${x.status === 'done' ? 'ok' : 'neutral'}">${x.status === 'done' ? `${x.reps}${x.weight != null ? ` × ${x.weight}` : ''}` : x.status === 'skipped' ? 'Skipped' : 'Not reached'}</span>`).join('')}</div></div>`).join('')}</div>
      <div class="tv-controls">${btn('Back to Calendar', 'nav', { kind: 'secondary lg', params: { to: 'calendar', day: S.dayKey(s.startedAt) }, auto: true })}</div></div>
      <div class="tv-panel" style="overflow:auto"><span class="eyebrow">Heart-rate zones</span>${s.liveData ? zoneBar(s.zoneMs, s.unknownMs) + zoneLegend(s.zoneMs, s.unknownMs, u) : '<p class="muted">You continued without live data.</p>'}<div class="divider"></div><span class="eyebrow">Notes</span><p class="muted" style="white-space:pre-wrap">${s.notes ? esc(s.notes) : 'No notes. Add them from your phone.'}</p></div></div>`, hideChrome: true, footer: hint([['Back', 'Calendar']]) });
}
/* ---------- S15 (TV subset) ---------- */
function account() {
  const u = S.activeUser(DEV); const d = S.device(DEV);
  return frame({ content: `<div class="tv-grid" style="grid-template-columns:1fr 1fr"><div class="stack">
      <div class="row">${avatar(u, 'xl')}<div><h1>${esc(u.name)}</h1><p class="muted">Signed in on ${esc(d.name)} · ${u.units} · goal ${u.weeklyGoal}/week</p></div></div>
      <p class="muted">Units, weekly goal, Apple Health, zones, and contact methods are managed on your phone.</p>
      <div class="list">
        ${btn('Switch user', 'switch-user', { kind: 'secondary xl', auto: true, fid: 'switch' })}
        ${btn('Lock this TV (log out)', 'logout', { kind: 'secondary xl', fid: 'lock' })}
        ${btn('Remove my profile from this TV', 'remove-me', { kind: 'quiet-danger xl', fid: 'remove' })}
      </div>
      <p class="small muted">This TV locks itself after 15 minutes without activity, except during a workout.</p></div>
      <div class="tv-panel" style="align-items:center;text-align:center">${qr('settings-' + u.id)}<strong style="font-size:var(--t-md)">Open settings on your phone</strong></div></div>`, footer: hint([['Back', 'Home']]) });
}
function modalHtml() {
  const m = ui.modal; if (!m) return ''; const u = S.activeUser(DEV);
  switch (m.type) {
    case 'end-confirm': return dialog({ id: 'end', title: 'End this workout?', body: 'We’ll save what you’ve done so far and stop collecting heart rate. Notes can be added on your phone.', actions: btn('Keep going', 'modal-close', { kind: 'secondary xl', auto: true }) + btn('End and save', 'end-workout', { kind: 'primary xl' }) });
    case 'workout-running': return dialog({ id: 'run', title: 'A workout is running', body: `${esc(u?.name || '')}'s “${esc(S.state.live?.workoutName || '')}” is in progress. End it first so nothing is lost.`, actions: btn('Cancel', 'modal-close', { kind: 'secondary xl', auto: true }) + btn('End and save, then continue', 'end-then-continue', { kind: 'primary xl', params: { then: m.then } }) });
    case 'remove-me': return dialog({ id: 'rm', title: 'Remove your profile from this TV?', body: 'This TV signs you out and forgets your name. Your account and history are untouched.', actions: btn('Cancel', 'modal-close', { kind: 'secondary xl', auto: true }) + btn('Remove', 'remove-me-confirm', { kind: 'primary xl' }) });
    case 'logout': return dialog({ id: 'lo', title: 'Lock this TV?', body: 'The TV returns to “Who’s training?”. Your name stays on it, locked, until you remove it.', actions: btn('Cancel', 'modal-close', { kind: 'secondary xl', auto: true }) + btn('Lock TV', 'logout-confirm', { kind: 'primary xl' }) });
  }
  return '';
}
export function renderTV() {
  const d = S.device(DEV); const r = d.route; const u = S.activeUser(DEV);
  if (d.clearing) return `<div class="app theme-dark"><div class="empty" style="margin:auto"><div class="spinner" style="margin:0 auto;width:40px;height:40px"></div><p class="muted" style="margin-top:var(--s-4)">Switching user…</p></div></div>`;
  if (!u && !['welcome', 'chooser', 'pairing'].includes(r.name)) return d.remembered.length ? chooser() : welcome();
  switch (r.name) {
    case 'welcome': return d.remembered.length ? chooser() : welcome(); case 'chooser': return chooser(); case 'pairing': return pairing();
    case 'home': return home(); case 'program': return program(); case 'choose': return choose(); case 'preflight': return preflight(r);
    case 'dashboard': return dashboard(); case 'summary': return summary(r); case 'calendar': return calendar(r); case 'session': return sessionDetail(r); case 'account': return account();
  }
  return home();
}
const go = (name, params) => S.navigate(DEV, name, params);
function requireNoWorkout(then) { const l = S.state.live; const u = S.activeUser(DEV); if (l && u && l.userId === u.id) { ui.modal = { type: 'workout-running', then }; S.commit('modal'); return false; } return true; }
export const tvActions = {
  nav(ds) { const p = {}; if (ds.workout) p.workoutId = ds.workout; if (ds.day) { p.day = ds.day; p.month = ds.day.slice(0, 7); } ui.modal = null; go(ds.to, p); },
  'modal-close'() { ui.modal = null; S.commit('modal'); },
  'pair-start'() { S.update(() => S.startPairing(null), 'pair'); go('pairing'); },
  'pair-cancel'() { S.update(s => { s.devices.tv.pairing = null; }, 'pair'); go(S.device(DEV).remembered.length ? 'chooser' : 'welcome'); },
  'choose-profile'(ds) { S.update(() => S.startPairing(ds.user), 'pair'); go('pairing'); },
  'workout-now'() { const u = S.activeUser(DEV); const l = S.state.live; if (l && l.userId === u.id) go('dashboard'); else go('choose'); },
  'choose-select'(ds) { if (ui.chooseSel === ds.workout) { go('preflight', { workoutId: ds.workout }); return; } ui.chooseSel = ds.workout; S.commit('ui'); },
  'open-session'(ds) { go('session', { sessionId: ds.id }); },
  'start-workout'(ds) { const u = S.activeUser(DEV); S.update(() => S.startWorkout(u.id, ds.workout, { liveData: ds.live === '1' }), 'start'); go('dashboard'); },
  'complete-set'() { S.update(() => S.completeSet(), 'set'); }, 'skip-set'() { S.update(() => S.skipSet(), 'set'); }, 'undo-set'() { S.update(() => S.undoLastSet(), 'set'); }, 'skip-rest'() { S.update(() => S.skipRest(), 'rest'); },
  pause() { S.update(() => S.pauseWorkout(), 'pause'); }, resume() { S.update(() => S.resumeWorkout(), 'resume'); },
  'end-confirm'() { ui.modal = { type: 'end-confirm' }; S.commit('modal'); }, 'end-workout'() { ui.modal = null; S.update(() => S.endWorkout(), 'end'); },
  'end-then-continue'(ds) { ui.modal = null; S.update(() => S.endWorkout(), 'end'); setTimeout(() => tvActions[ds.then] && tvActions[ds.then]({}), 50); },
  'cal-month'(ds) { go('calendar', { month: ds.month }); },
  'cal-day'(ds) { const r = S.route(DEV); if (r.day === ds.day) { const u = S.activeUser(DEV); const list = u.sessions.filter(s => S.dayKey(s.startedAt) === ds.day); if (list.length === 1) { go('session', { sessionId: list[0].id }); return; } } go('calendar', { month: ds.day.slice(0, 7), day: ds.day }); },
  'switch-user'() { if (!requireNoWorkout('switch-user')) return; ui.modal = null; S.update(s => { const d = s.devices.tv; d.session = null; d.clearing = true; }, 'switch'); setTimeout(() => S.update(s => { s.devices.tv.clearing = false; s.devices.tv.route = { name: 'chooser' }; }, 'switch'), 450); },
  logout() { if (!requireNoWorkout('logout')) return; ui.modal = { type: 'logout' }; S.commit('modal'); },
  'logout-confirm'() { ui.modal = null; S.update(() => S.logOut(DEV), 'logout'); },
  'remove-me'() { if (!requireNoWorkout('remove-me')) return; ui.modal = { type: 'remove-me' }; S.commit('modal'); },
  'remove-me-confirm'() { ui.modal = null; S.update(() => S.logOut(DEV, { forget: true }), 'logout'); },
};
/* TV Back button semantics per screen. Never ends a workout. */
export function tvBack() {
  if (ui.modal) { ui.modal = null; S.commit('modal'); return; }
  const r = S.route(DEV); const u = S.activeUser(DEV); const l = S.state.live;
  switch (r.name) {
    case 'pairing': tvActions['pair-cancel'](); return;
    case 'dashboard': if (l && !l.paused) tvActions.pause(); else if (l && l.paused) { /* Back on the paused dialog = stay paused */ } return;
    case 'summary': go('calendar'); return;
    case 'session': { const s = u && S.sessionById(u.id, r.sessionId); go('calendar', s ? { day: S.dayKey(s.startedAt), month: S.monthKey(s.startedAt) } : {}); return; }
    case 'preflight': go('choose'); return;
    case 'choose': case 'program': case 'calendar': case 'account': go('home'); return;
    case 'home': if (l && l.userId === u?.id) { go('dashboard'); return; } S.toast('On Fire TV, Back here exits Dillan. You stay signed in and the TV auto-locks after 15 minutes.'); return;
    default: return;
  }
}
