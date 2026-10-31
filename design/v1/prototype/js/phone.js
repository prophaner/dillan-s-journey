/* Phone / desktop web screens (S01–S15). Rendering = HTML strings; behavior = actions map. */
import * as S from './store.js';
import { esc, icons, avatar, statusChip, metricsPanel, zoneBar, zoneLegend, qr, dialog, sheet, btn, progressRing, sessionStatusChip, exampleTag } from './ui.js';

const DEV = 'phone';
export const drafts = {};            // in-memory editor drafts keyed by device
const ui = { modal: null, codeInput: '', resendAt: 0, notesStatus: {}, editSet: null, authError: '' };
export const phoneUI = ui;

/* ---------- shell ---------- */
function shell({ title, back = null, content, nav = null, right = '', bigTitle = false, modal = '' }) {
  const u = S.activeUser(DEV);
  const side = nav ? `<nav class="sidenav" aria-label="Primary">
      <div class="brandline"><img src="brand/dillan-wordmark.svg" alt="Dillan"></div>
      ${navBtn('home', 'Home', nav)}${navBtn('program', 'Program', nav)}${navBtn('calendar', 'Calendar', nav)}
      <div class="spacer"></div>${navBtn('account', 'Profile', nav, icons.profile)}
    </nav>` : '';
  const bottom = nav ? `<nav class="bottomnav" aria-label="Primary">${navBtn('home', 'Home', nav)}${navBtn('program', 'Program', nav)}${navBtn('calendar', 'Calendar', nav)}</nav>` : '';
  return `<div class="app theme-light">
    <div class="app-shell">${side}<div class="main-col">
      <header class="topbar">
        ${back ? `<button class="btn icon ghost" data-action="${esc(back)}" aria-label="Back">${icons.back}</button>` : ''}
        <h1 class="title ${bigTitle ? 'big' : ''}">${esc(title)}</h1>
        ${right}
        ${nav && u ? `<button class="btn icon ghost" data-action="nav" data-to="account" aria-label="Profile and settings">${avatar(u)}</button>` : ''}
      </header>
      <div class="scroll"><div class="pad stack">${content}</div></div>
      ${bottom}
    </div></div>
    ${modal}${toastHtml()}
  </div>`;
}
function navBtn(to, label, cur, icon) { return `<button type="button" data-action="nav" data-to="${to}" ${cur === to ? 'aria-current="page"' : ''}>${icon || icons[to]}<span>${label}</span></button>`; }
function toastHtml() { const t = S.state.toast; return t && S.now() < t.until ? `<div class="toast" role="status">${esc(t.msg)}</div>` : ''; }

/* ---------- S01 Welcome / chooser ---------- */
function welcome() {
  const d = S.device(DEV);
  if (d.remembered.length) return chooser();
  return `<div class="app theme-light"><div class="scroll"><div class="pad stack" style="padding-top:96px;text-align:center">
    <img src="brand/dillan-wordmark.svg" alt="Dillan" style="height:48px;margin:0 auto">
    <p class="muted" style="margin-top:var(--s-6)">Your home-gym workouts, your heart rate on the big screen, your history in one place.</p>
    <div class="stack-sm" style="margin-top:var(--s-10)">
      ${btn('Register', 'auth-start', { kind: 'primary block lg', params: { mode: 'register' } })}
      ${btn('Log in', 'auth-start', { kind: 'secondary block lg', params: { mode: 'login' } })}
    </div>
    <p class="help" style="margin-top:var(--s-8)">Got a code from your TV? ${btn('Approve a TV', 'nav', { kind: 'ghost', params: { to: 'approve' } })}</p>
  </div></div>${toastHtml()}</div>`;
}
function chooser() {
  const d = S.device(DEV);
  const tiles = d.remembered.map(id => S.userById(id)).filter(Boolean).map(u => `<button class="rowcard" data-action="choose-profile" data-user="${u.id}">${avatar(u, 'lg')}<div class="grow"><strong>${esc(u.name)}</strong><div class="meta row" style="gap:6px">${icons.lock} Locked · verify to continue</div></div><span class="chev">${icons.chev}</span></button>`).join('');
  return `<div class="app theme-light"><div class="scroll"><div class="pad stack" style="padding-top:64px">
    <img src="brand/dillan-wordmark.svg" alt="Dillan" style="height:40px">
    <h2 style="margin-top:var(--s-6)">Who's training?</h2>
    <div class="list">${tiles}
      <button class="rowcard" data-action="auth-start" data-mode="login"><span class="avatar lg" style="background:var(--surface-2);color:var(--text-2)">+</span><div class="grow"><strong>Add user</strong><div class="meta">Log in or register another person</div></div><span class="chev">${icons.chev}</span></button>
    </div>
    <p class="help">Profiles on this device show names only. Workouts and health data stay private until you verify.</p>
  </div></div>${modalHtml()}${toastHtml()}</div>`;
}

/* ---------- S02 Register / Log in ---------- */
function auth(r) {
  const step = r.step || 'contact'; const mode = r.mode || 'login';
  const forUser = r.forUserId ? S.userById(r.forUserId) : null;
  let body = '';
  if (step === 'contact') {
    body = `<div class="segmented" role="tablist" aria-label="Contact method">
        <button role="tab" aria-pressed="${(r.method || 'email') === 'email'}" data-action="auth-method" data-method="email">Email</button>
        <button role="tab" aria-pressed="${r.method === 'sms'}" data-action="auth-method" data-method="sms">Text message</button></div>
      <form class="stack" novalidate data-form="auth-contact">
        <div class="field"><label for="contact">${r.method === 'sms' ? 'Mobile number (with country code)' : 'Email address'}</label>
          <input id="contact" class="input ${ui.authError ? 'invalid' : ''}" name="contact" type="${r.method === 'sms' ? 'tel' : 'email'}" inputmode="${r.method === 'sms' ? 'tel' : 'email'}" autocomplete="${r.method === 'sms' ? 'tel' : 'email'}" placeholder="${r.method === 'sms' ? '+1 561 555 0100' : 'you@example.com'}" value="${esc(r.contact || '')}" required>
          <p class="help ${ui.authError ? 'err' : ''}">${esc(ui.authError || (r.method === 'sms' ? 'We only text a code — never marketing.' : 'We send a 6-digit code. No passwords.'))}</p></div>
        <button class="btn primary block lg" type="submit">Send code</button>
      </form>
      <p class="help center">${mode === 'register' ? 'Already have an account?' : 'New here?'} ${btn(mode === 'register' ? 'Log in' : 'Register', 'auth-start', { kind: 'ghost', params: { mode: mode === 'register' ? 'login' : 'register' } })}</p>`;
  } else if (step === 'code') {
    const masked = forUser ? S.maskContact(forUser.contacts[0]) : (r.contact || '');
    const wait = Math.max(0, Math.ceil((ui.resendAt - S.now()) / 1000));
    const digits = (ui.codeInput || '').padEnd(6, ' ').split('');
    body = `<p class="muted">Enter the 6-digit code we sent to <strong>${esc(masked)}</strong>.</p>
      <form class="stack" novalidate data-form="auth-code">
        <label class="sr-only" for="code">6-digit code</label>
        <div class="code-wrap"><div class="code-boxes" aria-hidden="true">${digits.map((c, i) => `<span class="box ${i === (ui.codeInput || '').length ? 'active' : ''}">${esc(c.trim())}</span>`).join('')}</div>
        <input id="code" class="code-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" aria-label="6-digit code" value="${esc(ui.codeInput)}" data-code-input autofocus></div>
        <p class="help ${ui.authError ? 'err' : ''}" aria-live="polite">${esc(ui.authError || 'Codes expire after 10 minutes. In this prototype, any 6 digits work except 000000.')}</p>
        <button class="btn primary block lg" type="submit" ${(ui.codeInput || '').length === 6 ? '' : 'disabled'}>Verify</button>
        ${btn(wait ? `Resend code in ${wait}s` : 'Resend code', 'auth-resend', { kind: 'ghost block', disabled: !!wait })}
      </form>
      ${!forUser ? `<p class="help center">Wrong ${r.method === 'sms' ? 'number' : 'address'}? ${btn('Change it', 'auth-back-contact', { kind: 'ghost' })}</p>` : ''}
      ${forUser && forUser.contacts.length > 1 ? `<p class="help center">${btn(`Use ${forUser.contacts[1].type === 'sms' ? 'text message' : 'email'} instead`, 'auth-alt-contact', { kind: 'ghost' })}</p>` : ''}`;
  } else if (step === 'merge') {
    body = `<div class="banner"><div><strong>We don't recognize ${esc(r.contact)}</strong>Is this a new account, or are you adding a second way to reach an existing one?</div></div>
      ${btn('Create a new account', 'auth-merge', { kind: 'primary block lg', params: { choice: 'new' } })}
      ${btn('Add it to my existing account', 'auth-merge', { kind: 'secondary block lg', params: { choice: 'existing' } })}
      <p class="help">Choosing “existing” asks you to verify the contact already on your account first, so we never split your history into two accounts.</p>`;
  } else if (step === 'profile') {
    body = `<form class="stack" novalidate data-form="auth-profile">
      <div class="field"><label for="dn">Display name</label><input id="dn" class="input" name="name" required maxlength="24" placeholder="What should we call you?" autocomplete="nickname"><p class="help">Shown on the shared TV. No surname needed.</p></div>
      <div class="field"><label for="tz">Timezone</label><select id="tz" class="select" name="tz"><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>Europe/London</option></select><p class="help">Weeks run Monday–Sunday in this timezone.</p></div>
      <div class="field"><span class="label">Units</span><div class="segmented" role="radiogroup"><button type="button" role="radio" aria-pressed="true" data-units="lb" data-action="pick-units">Pounds (lb)</button><button type="button" role="radio" aria-pressed="false" data-units="kg" data-action="pick-units">Kilograms (kg)</button></div></div>
      <button class="btn primary block lg" type="submit">Finish</button></form>`;
  }
  const title = step === 'profile' ? 'About you' : step === 'code' ? 'Check your ' + ((r.method || forUser?.contacts[0].type) === 'sms' ? 'messages' : 'email') : forUser ? `Welcome back, ${forUser.name}` : mode === 'register' ? 'Create your account' : 'Log in';
  return shell({ title, back: step === 'contact' || forUser ? 'auth-cancel' : (step === 'code' ? 'auth-back-contact' : null), content: body, modal: modalHtml() });
}

/* ---------- S03 (phone side): approve a TV ---------- */
function approve(r) {
  const p = S.state.devices.tv.pairing; const u = S.activeUser(DEV);
  const step = r.step || 'code';
  let body;
  if (!u) {
    body = `<div class="banner"><div><strong>Log in first</strong>Approving a TV links it to your account, so we need to know it's you.</div></div>${btn('Log in', 'auth-start', { kind: 'primary block lg', params: { mode: 'login', then: 'approve' } })}${btn('Register', 'auth-start', { kind: 'secondary block lg', params: { mode: 'register', then: 'approve' } })}`;
  } else if (step === 'code') {
    body = `<p class="muted">Type the code shown on the TV screen. Scanning the QR fills it in for you.</p>
      <form class="stack" novalidate data-form="approve-code"><div class="field"><label for="tvcode">TV code</label><input id="tvcode" class="input" name="code" placeholder="DLN-XXXX" value="${esc(p && p.status === 'awaiting' ? p.code : '')}" autocapitalize="characters" required><p class="help ${ui.authError ? 'err' : ''}">${esc(ui.authError || (p && p.status === 'awaiting' ? 'Filled in from the QR code you scanned (simulated). Codes are valid for 5 minutes.' : 'Codes are valid for 5 minutes.'))}</p></div><button class="btn primary block lg" type="submit">Continue</button></form>`;
  } else if (step === 'confirm') {
    const forUser = p?.forUserId ? S.userById(p.forUserId) : null;
    const mismatch = forUser && forUser.id !== u.id;
    body = `<div class="card stack-sm"><span class="eyebrow">This TV</span><h2>${esc(S.state.devices.tv.name)}</h2><p class="muted small">Requested ${p ? S.fmtClock(p.startedAt) : ''} · Code ${esc(p?.code || '')}</p></div>
      ${mismatch ? `<div class="banner warn"><div><strong>This TV is asking to unlock ${esc(forUser.name)}'s profile</strong>You're signed in as ${esc(u.name)}. Approving will sign the TV in as you instead.</div></div>` : ''}
      <p class="muted">Approving signs this TV in as <strong>${esc(u.name)}</strong> and lets it show your workouts and live heart rate until you lock it or it auto-locks.</p>
      ${btn(`Approve as ${esc(u.name)}`, 'approve-confirm', { kind: 'primary block lg' })}
      ${btn("That's not my TV", 'approve-deny', { kind: 'secondary block lg' })}`;
  } else if (step === 'done') {
    body = `<div class="banner ok"><div><strong>TV approved</strong>${esc(S.state.devices.tv.name)} is now signed in as ${esc(u.name)}. You can keep using your phone as a controller.</div></div>${btn('Go to Home', 'nav', { kind: 'primary block lg', params: { to: 'home' } })}`;
  } else if (step === 'denied') {
    body = `<div class="banner"><div><strong>Request denied</strong>The TV was told the request was declined. Nothing was linked.</div></div>${btn('Done', 'nav', { kind: 'secondary block lg', params: { to: 'home' } })}`;
  }
  return shell({ title: 'Approve this TV', back: 'nav-home-or-welcome', content: body });
}

/* ---------- S04 Home ---------- */
function home() {
  const u = S.activeUser(DEV); if (!u) return welcome();
  const p = S.progress(u); const m = S.healthModel(u); const live = S.state.live && S.state.live.userId === u.id ? S.state.live : null;
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxW = Math.max(p.goal, ...p.weeks.map(w => w.count), 1);
  const compare = p.prevSameSessions === p.sessions ? 'Same as this point last week' : p.sessions > p.prevSameSessions ? `${p.sessions - p.prevSameSessions} more than this point last week` : `${p.prevSameSessions - p.sessions} fewer than this point last week`;
  const content = `
    ${live ? `<div class="banner accent"><div><strong>Workout in progress · ${esc(live.workoutName)}</strong>${live.paused ? 'Paused' : 'Running'} · ${S.fmtDur(live.activeMs)} active</div>${btn('Open', 'nav', { kind: 'primary', params: { to: 'dashboard' } })}</div>` : ''}
    ${btn(`${icons.play} Workout Now`, 'workout-now', { kind: 'primary block xl', auto: true })}
    <div class="desktop-cols">
    <div class="card stack">
      <div class="row between"><span class="eyebrow">This week · Mon–Sun</span>${p.total === 0 ? '' : exampleTag()}</div>
      ${p.total === 0 ? `<div class="empty" style="padding:var(--s-6) 0"><div class="mark" style="color:var(--text)">${icons.mark}</div><h3>Your first workout starts your progress.</h3><p class="small" style="margin-top:var(--s-2)">Weekly sessions and active minutes will show here.</p></div>` : `
      <div class="row" style="gap:var(--s-5)">
        <div style="position:relative">${progressRing(p.sessions / p.goal, `${p.sessions} of ${p.goal} sessions`)}<div style="position:absolute;inset:0;display:grid;place-items:center;font-weight:700" class="num">${p.sessions}/${p.goal}</div></div>
        <div class="grow"><strong>${p.sessions} of ${p.goal} sessions</strong><div class="small muted">${compare}</div><div class="small muted">Goal is editable in Profile</div></div>
      </div>
      <div class="row between"><div class="metric"><span class="val num" style="font-size:var(--t-xl)">${p.minutes}</span><span class="unit">active min this week</span></div><div class="metric" style="align-items:flex-end"><span class="val num muted" style="font-size:var(--t-xl)">${p.prevSameMinutes}</span><span class="unit">same point last week</span></div></div>
      <div><span class="eyebrow">Sessions per week · last 4</span>
        <div class="bars" style="margin-top:var(--s-2)">${p.weeks.map(w => `<div class="b ${w.current ? 'cur' : ''}"><i style="height:${Math.max(6, w.count / maxW * 52)}px"></i><span class="num">${w.count}</span></div>`).join('')}</div>
        <p class="help" style="margin-top:var(--s-1)">Current week is in progress (${dow[(new Date().getDay() + 6) % 7]}). Earlier weeks are complete.</p></div>`}
    </div>
    <div class="stack">
      <div class="card stack-sm">
        <div class="row between"><span class="eyebrow">Live data</span>${statusChip(m)}</div>
        <p class="small muted">${esc(m.detail || (u.companion === 'connected' ? 'iPhone companion connected.' : 'Connect the iPhone companion to show heart rate during workouts.'))}</p>
        ${u.companion !== 'connected' || !u.zonesConfirmed ? btn(u.companion !== 'connected' ? 'Set up live data' : 'Set up zones', 'nav', { kind: 'secondary block', params: { to: 'health' } }) : ''}
      </div>
      ${p.recent ? `<button class="rowcard" data-action="open-session" data-id="${p.recent.id}"><div class="grow"><span class="eyebrow">Most recent</span><div><strong>${esc(p.recent.workoutName)}</strong></div><div class="meta">${S.fmtDate(p.recent.startedAt)} · ${S.fmtDur(p.recent.activeMs, { short: true })} · ${p.recent.status === 'completed' ? 'Completed' : 'Ended early'}${p.recent.notes ? ' · ' + icons.note : ''}</div></div><span class="chev">${icons.chev}</span></button>` : ''}
    </div></div>`;
  return shell({ title: `Hi, ${u.name}`, bigTitle: true, nav: 'home', content, modal: modalHtml() });
}

/* ---------- S05 Program library ---------- */
function program() {
  const u = S.activeUser(DEV);
  const list = u.workouts.length ? `<div class="list">${u.workouts.map(w => { const g = S.groupsOf(w.exercises); const sets = S.stepsOf(w.exercises).length; return `<button class="rowcard" data-action="open-editor" data-id="${w.id}"><div class="grow"><strong>${esc(w.name)}</strong><div class="meta">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${sets} sets${g.some(x => x.type === 'superset') ? ' · includes a superset' : ''}</div><div class="meta">${esc(w.exercises.map(e => e.name).join(', '))}</div></div><span class="chev">${icons.chev}</span></button>`; }).join('')}</div>`
    : `<div class="empty"><div class="mark" style="color:var(--text)">${icons.mark}</div><h3>No workouts yet</h3><p class="small" style="margin:var(--s-2) 0 var(--s-5)">A workout is a named list of exercises you can repeat. Build one once, then pick it from the TV whenever you train.</p>${btn('Create your first workout', 'new-workout', { kind: 'primary lg' })}</div>`;
  return shell({ title: 'Program', bigTitle: true, nav: 'program', content: `${u.workouts.length ? btn('+ New workout', 'new-workout', { kind: 'secondary block' }) : ''}${list}`, modal: modalHtml() });
}

/* ---------- S06 Workout editor ---------- */
function editor(r) {
  const u = S.activeUser(DEV);
  let d = drafts[DEV];
  if (!d || d.id !== (r.workoutId || d.id)) {
    const src = r.workoutId ? u.workouts.find(w => w.id === r.workoutId) : null;
    d = drafts[DEV] = src ? JSON.parse(JSON.stringify(src)) : { id: 'w-' + S.uid(), name: '', exercises: [{ id: S.uid(), name: '', group: null, sets: 3, reps: 10, repsBasis: 'total', weight: null, loadBasis: 'perImplement', rest: 60, instructions: '' }] };
    d._orig = JSON.stringify({ name: d.name, exercises: d.exercises }); d._errors = {}; d._isNew = !src;
  }
  const err = d._errors || {}; const groups = S.groupsOf(d.exercises);
  const dup = u.workouts.some(w => w.id !== d.id && w.name.trim().toLowerCase() === (d.name || '').trim().toLowerCase());
  const exCard = (e, i) => {
    const er = err[e.id] || {}; const g = groups.find(x => x.members.includes(i)); const inSuper = g && g.type === 'superset'; const mi = g ? g.members.indexOf(i) : 0;
    return `<div class="card stack" data-ex="${e.id}" style="${inSuper ? 'border-left:4px solid var(--accent)' : ''}">
      <div class="row between ex-head">
        <span class="eyebrow" style="white-space:nowrap">${inSuper ? `Superset ${g.letter}${mi + 1}` : `Exercise ${i + 1}`}</span>
        <span class="row" style="gap:4px">
          <button class="btn icon ghost" data-action="ex-move" data-id="${e.id}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icons.up}</button>
          <button class="btn icon ghost" data-action="ex-move" data-id="${e.id}" data-dir="1" aria-label="Move down" ${i === d.exercises.length - 1 ? 'disabled' : ''}>${icons.down}</button>
          <button class="btn ghost small" data-action="ex-remove" data-id="${e.id}">Remove</button></span></div>
      <div class="field"><label for="n-${e.id}">Name</label><input id="n-${e.id}" class="input ${er.name ? 'invalid' : ''}" data-field="name" value="${esc(e.name)}" placeholder="e.g. Dumbbell Floor Press">${er.name ? `<p class="help err">${er.name}</p>` : ''}</div>
      <div class="inline">
        <div class="field"><label for="s-${e.id}">${inSuper ? 'Rounds' : 'Sets'}</label><input id="s-${e.id}" class="input num ${er.sets ? 'invalid' : ''}" data-field="sets" type="number" inputmode="numeric" min="1" step="1" value="${esc(e.sets)}">${er.sets ? `<p class="help err">${er.sets}</p>` : ''}</div>
        <div class="field"><label for="r-${e.id}">Reps</label><input id="r-${e.id}" class="input num ${er.reps ? 'invalid' : ''}" data-field="reps" type="number" inputmode="numeric" min="1" step="1" value="${esc(e.reps)}">${er.reps ? `<p class="help err">${er.reps}</p>` : ''}</div></div>
      <div class="field"><span class="label">Reps count</span><div class="segmented"><button type="button" aria-pressed="${e.repsBasis === 'total'}" data-action="ex-set" data-id="${e.id}" data-field="repsBasis" data-value="total">Total</button><button type="button" aria-pressed="${e.repsBasis === 'perSide'}" data-action="ex-set" data-id="${e.id}" data-field="repsBasis" data-value="perSide">Per side</button></div></div>
      <div class="inline">
        <div class="field"><label for="w-${e.id}">Weight (${u.units})</label><input id="w-${e.id}" class="input num ${er.weight ? 'invalid' : ''}" data-field="weight" type="number" inputmode="decimal" min="0" step="0.5" value="${e.weight ?? ''}" placeholder="Bodyweight">${er.weight ? `<p class="help err">${er.weight}</p>` : ''}</div>
        <div class="field"><label for="rest-${e.id}">Rest (sec)</label><input id="rest-${e.id}" class="input num ${er.rest ? 'invalid' : ''}" data-field="rest" type="number" inputmode="numeric" min="0" step="5" value="${e.rest ?? 60}">${er.rest ? `<p class="help err">${er.rest}</p>` : ''}</div></div>
      ${e.weight != null && e.weight !== '' ? `<div class="field"><span class="label">That weight is…</span><div class="segmented"><button type="button" aria-pressed="${e.loadBasis === 'perImplement'}" data-action="ex-set" data-id="${e.id}" data-field="loadBasis" data-value="perImplement">Per implement</button><button type="button" aria-pressed="${e.loadBasis === 'total'}" data-action="ex-set" data-id="${e.id}" data-field="loadBasis" data-value="total">Total load</button></div><p class="help">Per implement = each dumbbell or kettlebell. Total = the full load. So “30 ${u.units}” is never ambiguous.</p></div>` : ''}
      <div class="field"><label for="i-${e.id}">Instructions (optional)</label><textarea id="i-${e.id}" class="textarea" data-field="instructions" style="min-height:64px" placeholder="Shown on screen during this exercise">${esc(e.instructions || '')}</textarea></div>
      ${inSuper && g.members.length > 1 ? `<p class="help">Rest ${esc(d.exercises[g.members[g.members.length - 1]].rest ?? 60)}s after ${g.letter}${g.members.length} each round. ${mi === g.members.length - 1 ? '' : 'Rest fields on earlier members are ignored.'}</p>` : ''}
      ${er.group ? `<p class="help err">${er.group}</p>` : ''}
      <div class="row wrap">${i < d.exercises.length - 1 && !(inSuper && mi < g.members.length - 1) ? btn(inSuper ? 'Add next exercise to this superset' : 'Superset with next exercise', 'ex-group', { kind: 'secondary', params: { id: e.id } }) : ''}${inSuper ? btn('Leave superset', 'ex-ungroup', { kind: 'ghost', params: { id: e.id } }) : ''}</div>
    </div>`;
  };
  const content = `
    <div class="field"><label for="wname">Workout name</label><input id="wname" class="input ${err.name ? 'invalid' : ''}" data-field="wname" value="${esc(d.name)}" placeholder="e.g. Upper Body A" maxlength="48">${err.name ? `<p class="help err">${err.name}</p>` : dup ? `<p class="help">You already have a workout with this name. That's allowed — just make sure you can tell them apart.</p>` : ''}</div>
    ${d.exercises.map(exCard).join('')}
    ${err.exercises ? `<p class="help err">${err.exercises}</p>` : ''}
    ${btn('+ Add exercise', 'ex-add', { kind: 'secondary block' })}
    <div class="divider"></div>
    ${btn('Save workout', 'editor-save', { kind: 'primary block lg' })}
    ${!d._isNew ? btn('Delete workout', 'editor-delete', { kind: 'quiet-danger block' }) : ''}
    <p class="help">Editing or deleting a workout never changes sessions you've already logged.</p>`;
  return shell({ title: d._isNew ? 'New workout' : 'Edit workout', back: 'editor-back', content, modal: modalHtml() });
}

/* ---------- S07 Choose / S08 Preflight ---------- */
function choose() {
  const u = S.activeUser(DEV);
  if (!u.workouts.length) return shell({ title: 'Workout Now', back: 'nav-home', content: `<div class="empty"><div class="mark" style="color:var(--text)">${icons.mark}</div><h3>Create your first workout</h3><p class="small" style="margin:var(--s-2) 0 var(--s-5)">Workout Now needs a saved workout to follow. It takes about two minutes to build one.</p>${btn('Create a workout', 'new-workout', { kind: 'primary lg' })}</div>` });
  return shell({ title: 'Choose a workout', back: 'nav-home', content: `<p class="muted">Nothing starts until you press Start on the next screen.</p><div class="list">${u.workouts.map(w => `<button class="rowcard" data-action="nav" data-to="preflight" data-workout="${w.id}"><div class="grow"><strong>${esc(w.name)}</strong><div class="meta">${S.plural(w.exercises.length, 'exercise')} · ${S.plural(S.stepsOf(w.exercises).length, 'set')}</div><div class="meta">${esc(w.exercises.map(e => e.name).join(' · '))}</div></div><span class="chev">${icons.chev}</span></button>`).join('')}</div>` });
}
function preflight(r) {
  const u = S.activeUser(DEV); const w = u.workouts.find(x => x.id === r.workoutId); if (!w) return choose();
  const m = S.healthModel(u); const ready = m.mode === 'live' && m.freshness === 'live'; const preparing = ['waiting', 'reconnecting'].includes(m.mode);
  const tvOn = S.state.devices.tv.session?.userId === u.id;
  const content = `
    <div class="card stack-sm"><span class="eyebrow">Workout</span><h2>${esc(w.name)}</h2><p class="muted small">${S.groupsOf(w.exercises).map(g => g.type === 'superset' ? `Superset ${g.letter}: ${g.members.map(i => w.exercises[i].name).join(' + ')} × ${g.rounds}` : `${w.exercises[g.members[0]].name} ${g.rounds}×${w.exercises[g.members[0]].reps}`).join(' · ')}</p></div>
    <div class="card stack-sm"><div class="row between"><span class="eyebrow">Training as</span>${tvOn ? '<span class="chip neutral">Also on TV</span>' : ''}</div><div class="row">${avatar(u)}<strong>${esc(u.name)}</strong></div></div>
    <div class="card stack-sm"><div class="row between"><span class="eyebrow">Apple Watch</span>${statusChip(ready ? { tone: 'live', label: 'Live · ready' } : preparing ? { tone: 'warn', label: 'Preparing' } : m.mode === 'not_connected' || u.companion !== 'connected' ? { tone: 'off', label: 'Not configured' } : { tone: 'warn', label: 'Unavailable' })}</div>
      <p class="small muted">${esc(ready ? `Reading ${m.bpm} bpm, ${m.ageSec}s ago.` : m.detail)}</p>${!ready && !preparing ? btn('Open live data setup', 'nav', { kind: 'secondary block', params: { to: 'health' } }) : ''}</div>
    <div class="card stack-sm"><div class="row between"><span class="eyebrow">Heart-rate zones</span>${u.zonesConfirmed ? '<span class="chip ok">Confirmed</span>' : '<span class="chip warn">Not set</span>'}</div><p class="small muted">${u.zonesConfirmed ? `Zone 1 under ${u.zones[0]} · Zone 5 from ${u.zones[3]} bpm.` : 'Without zones you will see BPM only — no zone number or time in zone.'}</p>${!u.zonesConfirmed ? btn('Set up zones', 'nav', { kind: 'secondary block', params: { to: 'zones', back: 'preflight', workout: w.id } }) : ''}</div>
    ${btn(ready ? 'Start' : preparing ? 'Start when ready' : 'Start with live data', 'start-workout', { kind: 'primary block xl', params: { workout: w.id, live: 1 }, disabled: !ready })}
    ${btn('Continue without live data', 'start-workout', { kind: 'secondary block lg', params: { workout: w.id, live: 0 } })}
    <p class="help center">Continuing without live data records sets and time only; the session will say “No heart-rate data”.</p>`;
  return shell({ title: 'Ready?', back: 'nav-choose', content });
}

/* ---------- S09/S10 Dashboard ---------- */
function dashboard() {
  const u = S.activeUser(DEV); const l = S.state.live;
  if (!l || l.userId !== u.id) return home();
  const st = S.currentStep(); const nx = S.nextStep();
  const ex = st ? l.snapshot[st.exIndex] : null;
  const done = l.cursor, total = l.steps.length;
  const setsFor = (exIndex) => { const e = l.snapshot[exIndex]; return Array.from({ length: e.sets }, (_, i) => { const r = l.sets[S.setKey(exIndex, i)]; const cur = st && st.exIndex === exIndex && st.setIndex === i; return `<div class="setrow ${r ? r.status : ''} ${cur ? 'current' : ''}"><span class="idx num">${r?.status === 'done' ? icons.check : i + 1}</span><div class="vals num">${r ? (r.status === 'done' ? `${r.reps} reps${r.weight != null ? ` · ${r.weight} ${u.units}` : ''}` : 'Skipped') : `${S.fmtReps(e)}${e.weight != null ? ` · ${e.weight} ${u.units}` : ''}`}<small>${r ? (r.status === 'done' ? 'Done' : 'Skipped — not counted as zero reps') : cur ? 'Current set' : 'Up next'}</small></div>${r?.status === 'done' ? `<button class="btn ghost small" data-action="edit-set" data-ex="${exIndex}" data-set="${i}">Edit</button>` : ''}</div>`; }).join(''); };
  const restHtml = l.rest && !l.paused ? (() => { const rem = Math.max(0, l.rest.endsAt - S.now()); const pct = 1 - rem / l.rest.total; return `<div class="card stack-sm" style="border-color:var(--text)"><div class="row between"><span class="eyebrow">Rest</span><span class="small muted">Next: ${st ? esc(l.snapshot[st.exIndex].name) + ' · set ' + (st.setIndex + 1) : 'Finish'}</span></div><div class="row between"><span class="timer num" data-t="rest">${S.fmtDur(rem)}</span>${btn('Skip rest', 'skip-rest', { kind: 'secondary' })}</div><div class="zonebar" style="height:6px"><span style="width:${(pct * 100).toFixed(1)}%;background:var(--text)"></span></div></div>`; })() : '';
  const content = `
    ${metricsPanel(u, { compact: true })}
    ${restHtml}
    ${ex ? `<div class="card stack">
      <div class="row between"><span class="eyebrow">${st.label ? `Superset ${st.label} · round ${st.setIndex + 1} of ${st.superset.rounds}` : `Exercise ${st.exIndex + 1} of ${l.snapshot.length}`}</span><span class="small muted num">${done}/${total} sets</span></div>
      <h2>${esc(ex.name)}</h2>
      <p class="muted">${S.fmtReps(ex)} · ${S.fmtWeight(ex, u.units)}${ex.repsBasis === 'perSide' ? ' · complete both sides' : ''}</p>
      ${ex.instructions ? `<p class="small muted">${esc(ex.instructions)}</p>` : ''}
      <div class="sets">${setsFor(st.exIndex)}</div>
      <div class="inline">${btn('Complete set', 'complete-set', { kind: 'primary lg', disabled: l.paused })}${btn('Skip set', 'skip-set', { kind: 'secondary lg', disabled: l.paused })}</div>
      ${l.cursor > 0 ? btn('Undo last set', 'undo-set', { kind: 'ghost block' }) : ''}
    </div>` : `<div class="card center stack-sm"><h2>All sets done</h2><p class="muted">End the workout to save it and add notes.</p></div>`}
    ${nx && (!st || nx.exIndex !== st.exIndex) ? `<div class="card sunken tight"><span class="eyebrow">Next</span><div><strong>${esc(l.snapshot[nx.exIndex].name)}</strong> <span class="muted small">${S.fmtReps(l.snapshot[nx.exIndex])} · ${S.fmtWeight(l.snapshot[nx.exIndex], u.units)}</span></div></div>` : ''}
    <div class="inline">${btn(l.paused ? icons.play + ' Resume' : icons.pause + ' Pause', l.paused ? 'resume' : 'pause', { kind: 'secondary lg' })}${btn('End', 'end-confirm', { kind: 'quiet-danger lg' })}</div>`;
  const pausedModal = l.paused ? `<div class="scrim" data-modal role="dialog" aria-modal="true" aria-labelledby="pz"><div class="sheet stack">
      <span class="eyebrow">Paused · ${esc(u.name)}</span><h2 id="pz">${esc(l.workoutName)}</h2>
      <div class="row between"><div class="metric"><span class="val num timer paused" style="font-size:var(--t-3xl)">${S.fmtDur(l.activeMs)}</span><span class="unit">Active · frozen</span></div><div class="metric" style="align-items:flex-end"><span class="val num" data-t="bpm">${S.healthModel(u).showBpm ? S.healthModel(u).bpm : '––'}</span><span class="unit">bpm · ${esc(S.healthModel(u).label)}</span></div></div>
      <p class="small muted">Time in zone and rest are not counting while paused.</p>
      <div class="actions">${btn(icons.play + ' Resume', 'resume', { kind: 'primary block lg', auto: true })}${btn('End and save', 'end-confirm', { kind: 'secondary block' })}</div></div></div>` : '';
  return shell({ title: l.workoutName, right: `<span class="chip neutral">${avatar(u)} ${esc(u.name)}</span>`, content, modal: pausedModal || modalHtml() });
}

/* ---------- S11 Summary ---------- */
function summary(r) {
  const u = S.activeUser(DEV); const s = S.sessionById(u.id, r.sessionId); if (!s) return home();
  const done = s.sets.filter(x => x.status === 'done').length, skipped = s.sets.filter(x => x.status === 'skipped').length, nr = s.sets.filter(x => x.status === 'not_reached').length;
  const content = `
    <div class="card stack-sm"><div class="row between">${sessionStatusChip(s)}<span class="small muted">${S.fmtClock(s.startedAt)}–${S.fmtClock(s.endedAt)}</span></div><h2>${esc(s.workoutName)}</h2>
      <div class="row" style="gap:var(--s-6);margin-top:var(--s-2)"><div class="metric"><span class="val num">${S.fmtDur(s.activeMs)}</span><span class="unit">Active</span></div><div class="metric"><span class="val num">${done}</span><span class="unit">Sets done</span></div>${skipped ? `<div class="metric"><span class="val num">${skipped}</span><span class="unit">Skipped</span></div>` : ''}${nr ? `<div class="metric"><span class="val num">${nr}</span><span class="unit">Not reached</span></div>` : ''}</div>
      ${s.pausedMs > 5000 ? `<p class="help">Paused for ${S.fmtDur(s.pausedMs, { short: true })} (not counted).</p>` : ''}</div>
    <div class="card stack-sm"><span class="eyebrow">Heart-rate zones</span>${s.liveData ? `${zoneBar(s.zoneMs, s.unknownMs)}${zoneLegend(s.zoneMs, s.unknownMs, u)}<p class="help">Unmeasured = no fresh reading, paused, or zones not set. Never guessed.</p>` : `<p class="muted">No heart-rate data — you continued without live data.</p>`}</div>
    ${notesCard(s)}
    ${btn('Done', 'nav', { kind: 'primary block lg', params: { to: 'calendar', day: S.dayKey(s.startedAt) } })}
    <p class="help center">Saved automatically. You can edit notes any time from Calendar.</p>`;
  return shell({ title: 'Workout saved', content });
}
function notesCard(s) {
  const pending = S.state.devices.phone.pendingNotes; const hasPending = pending && pending.id === s.id && pending.value !== (s.notes || '');
  if (hasPending && !ui.notesStatus[s.id]) ui.notesStatus[s.id] = 'error';
  const st = ui.notesStatus[s.id] || (s.notes ? 'saved' : 'idle'); const value = hasPending && st === 'error' ? pending.value : (s.notes || '');
  const label = { idle: '', typing: 'Unsaved changes', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[st];
  return `<div class="card stack-sm"><div class="row between"><label class="eyebrow" for="notes-${s.id}">Session notes</label><span class="small ${st === 'error' ? 'muted' : 'faint'}" data-notes-status aria-live="polite">${label}</span></div>
    <textarea id="notes-${s.id}" class="textarea" data-notes="${s.id}" placeholder="How did it go? Anything to change next time?">${esc(value)}</textarea>
    <p class="help" data-notes-help ${st === 'error' ? '' : 'hidden'}>Couldn’t reach Dillan. Your note is kept on this phone and will be saved automatically when the connection returns.</p>
    ${st === 'error' ? btn('Retry now', 'notes-retry', { kind: 'secondary', params: { id: s.id } }) : ''}</div>`;
}

/* ---------- S12 Calendar / S13 Session detail ---------- */
function calendar(r) {
  const u = S.activeUser(DEV);
  const month = r.month || S.monthKey(S.now()); const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1); const startDow = (first.getDay() + 6) % 7; const days = new Date(y, mo, 0).getDate();
  const byDay = {}; u.sessions.forEach(s => { (byDay[S.dayKey(s.startedAt)] ||= []).push(s); });
  const todayKey = S.dayKey(S.now()); const sel = r.day || (month === S.monthKey(S.now()) ? todayKey : null);
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<span></span>');
  for (let d = 1; d <= days; d++) { const k = `${month}-${String(d).padStart(2, '0')}`; const list = byDay[k] || []; cells.push(`<button class="day ${k === todayKey ? 'today' : ''} ${k === sel ? 'selected' : ''}" data-action="cal-day" data-day="${k}" aria-label="${k}${list.length ? `, ${list.length} session${list.length > 1 ? 's' : ''}` : ''}" aria-pressed="${k === sel}"><span class="num">${d}</span><span class="marks">${list.slice(0, 3).map(s => `<i class="${s.status === 'completed' ? '' : 'partial'}"></i>`).join('')}</span></button>`); }
  const prev = new Date(y, mo - 2, 1), next = new Date(y, mo, 1);
  const selList = sel ? (byDay[sel] || []) : [];
  const content = `
    <div class="card stack-sm">
      <div class="row between"><button class="btn icon ghost" data-action="cal-month" data-month="${S.monthKey(prev)}" aria-label="Previous month">${icons.back}</button><h3>${first.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3><button class="btn icon ghost" data-action="cal-month" data-month="${S.monthKey(next)}" aria-label="Next month" ${next > new Date() ? 'disabled' : ''}>${icons.chev}</button></div>
      <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="dow">${d}</span>`).join('')}${cells.join('')}</div>
      <p class="help">● completed · ○ ended early. Only past sessions appear; there is no scheduling.</p></div>
    <div class="stack-sm"><span class="eyebrow">${sel ? new Date(sel + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a day'}</span>
      ${selList.length ? `<div class="list">${selList.sort((a, b) => a.startedAt - b.startedAt).map(s => `<button class="rowcard" data-action="open-session" data-id="${s.id}"><div class="grow"><strong>${esc(s.workoutName)}</strong><div class="meta">${S.fmtClock(s.startedAt)} · ${S.fmtDur(s.activeMs, { short: true })} · ${s.status === 'completed' ? 'Completed' : 'Ended early'}${s.liveData ? '' : ' · No HR data'}</div></div>${s.notes ? `<span class="chip neutral" aria-label="Has notes">${icons.note}</span>` : ''}<span class="chev">${icons.chev}</span></button>`).join('')}</div>` : `<p class="muted">${u.sessions.length ? 'No sessions on this day.' : 'Your saved workouts will appear here.'}</p>`}</div>`;
  return shell({ title: 'Calendar', bigTitle: true, nav: 'calendar', content, modal: modalHtml() });
}
function sessionDetail(r) {
  const u = S.activeUser(DEV); const s = S.sessionById(u.id, r.sessionId); if (!s) return calendar({});
  const byEx = {}; s.sets.forEach(x => (byEx[x.exIndex] ||= []).push(x));
  const content = `
    <div class="card stack-sm"><div class="row between">${sessionStatusChip(s)}${s.liveData ? '' : '<span class="chip neutral">No HR data</span>'}</div><h2>${esc(s.workoutName)}</h2><p class="muted small">${S.fmtDate(s.startedAt, { year: 'numeric' })} · ${S.fmtClock(s.startedAt)}–${S.fmtClock(s.endedAt)} · ${S.fmtDur(s.activeMs, { short: true })} active</p><p class="help">Snapshot of the workout as it was that day. Editing the template later doesn't change this.</p></div>
    <div class="card stack"><span class="eyebrow">Sets</span>${s.snapshot.map((e, i) => `<div class="stack-sm"><strong>${esc(e.name)}</strong><span class="small muted">Prescribed: ${e.sets} × ${S.fmtReps(e)} · ${S.fmtWeight(e, u.units)}</span><div class="sets">${(byEx[i] || []).map(x => `<div class="setrow ${x.status === 'done' ? 'done' : x.status}"><span class="idx num">${x.status === 'done' ? icons.check : x.setIndex + 1}</span><div class="vals num">${x.status === 'done' ? `${x.reps} reps${x.weight != null ? ` · ${x.weight} ${u.units}` : ''}` : x.status === 'skipped' ? 'Skipped' : 'Not reached'}</div></div>`).join('')}</div></div>`).join('')}</div>
    <div class="card stack-sm"><span class="eyebrow">Heart-rate zones</span>${s.liveData ? `${zoneBar(s.zoneMs, s.unknownMs)}${zoneLegend(s.zoneMs, s.unknownMs, u)}` : '<p class="muted">You continued without live data for this session.</p>'}</div>
    ${notesCard(s)}`;
  return shell({ title: 'Session', back: 'nav-calendar-back', content, modal: modalHtml() });
}

/* ---------- S14 Health & zones ---------- */
function health() {
  const u = S.activeUser(DEV); const m = S.healthModel(u);
  const content = `
    <div class="card stack-sm"><div class="row between"><span class="eyebrow">iPhone companion</span>${statusChip(u.companion === 'connected' ? m : { tone: 'off', label: 'Not connected' })}</div>
      <p class="small muted">Live heart rate comes from your Apple Watch through the Dillan iPhone app. The website and TV only display what the iPhone app shares.</p>
      ${u.companion === 'connected' ? `<p class="small muted">${esc(m.detail)}</p>${btn('Disconnect companion', 'companion-disconnect', { kind: 'secondary block' })}` : `<ol class="small muted" style="padding-left:1.2em;margin:0;display:grid;gap:6px"><li>Install Dillan on your iPhone and sign in with the same account.</li><li>Allow heart-rate reading in Apple Health when asked. Dillan reads heart rate only.</li><li>Start workouts from Dillan — the Watch session begins with your Dillan workout. Dillan does not pick up Apple Workouts you start separately.</li><li>Keep the iPhone app in the foreground during training until background delivery has been verified on your devices.</li></ol>${btn('I’ve installed the iPhone app', 'companion-connect', { kind: 'primary block' })}`}
      <p class="help">If no data arrives, we'll say “No data available”. Apple does not tell apps whether read access was declined, so we won't claim that either.</p></div>
    <div class="card stack-sm"><div class="row between"><span class="eyebrow">Heart-rate zones</span>${u.zonesConfirmed ? '<span class="chip ok">Confirmed</span>' : '<span class="chip warn">Not set</span>'}</div>
      ${u.zonesConfirmed ? `<div class="zone-rows">${[1, 2, 3, 4, 5].map(z => `<span class="lab z-${z}" style="background:none;padding:0">Zone ${z}</span><span></span><span class="t num">${S.zoneBounds(u, z)} bpm</span>`).join('')}</div>` : '<p class="small muted">Zones are five BPM ranges you define. Until you confirm them, Dillan shows BPM only and never guesses a zone.</p>'}
      ${btn(u.zonesConfirmed ? 'Edit zones' : 'Set up zones', 'nav', { kind: u.zonesConfirmed ? 'secondary block' : 'primary block', params: { to: 'zones' } })}
      <p class="help">These are Dillan's zones, not imported from Apple. Zone numbers describe a range — they are not a fitness or medical score.</p></div>`;
  return shell({ title: 'Live data', back: 'nav-account', content, modal: modalHtml() });
}
function zones(r) {
  const u = S.activeUser(DEV); const z = ui.zoneDraft || (ui.zoneDraft = (u.zones || [114, 133, 152, 171]).slice());
  const errs = []; for (let i = 0; i < 4; i++) { if (!(z[i] > 40 && z[i] < 240)) errs[i] = 'Enter a BPM between 40 and 240.'; else if (i > 0 && z[i] <= z[i - 1]) errs[i] = 'Must be higher than the previous boundary.'; }
  const content = `
    <p class="muted">Enter four increasing boundaries. Zone 1 is everything below the first number; Zone 5 is everything from the fourth number up.</p>
    ${!u.zones ? '<div class="banner"><div><strong>Suggested starting values</strong>These are generic placeholders, not a recommendation. Edit them to match the ranges you already use.</div></div>' : ''}
    <form class="stack" novalidate data-form="zones">
      ${[0, 1, 2, 3].map(i => `<div class="field"><label for="z${i}">Zone ${i + 1} → Zone ${i + 2} boundary (bpm)</label><input id="z${i}" class="input num ${errs[i] ? 'invalid' : ''}" type="number" inputmode="numeric" min="40" max="240" data-zone="${i}" value="${z[i]}">${errs[i] ? `<p class="help err">${errs[i]}</p>` : ''}</div>`).join('')}
      <div class="card sunken tight stack-sm"><span class="eyebrow">Preview</span><div class="zone-rows">${[1, 2, 3, 4, 5].map(k => `<span class="lab z-${k}" style="background:none;padding:0">Zone ${k}</span><span></span><span class="t num">${[`Under ${z[0]}`, `${z[0]}–${z[1] - 1}`, `${z[1]}–${z[2] - 1}`, `${z[2]}–${z[3] - 1}`, `${z[3]}+`][k - 1]}</span>`).join('')}</div></div>
      <button class="btn primary block lg" type="submit" ${errs.some(Boolean) ? 'disabled' : ''}>Confirm zones</button></form>`;
  return shell({ title: 'Heart-rate zones', back: r.back === 'preflight' ? 'nav-preflight-back' : 'nav-health', content });
}

/* ---------- S15 Account & devices ---------- */
function account() {
  const u = S.activeUser(DEV); const tv = S.state.devices.tv; const m = S.healthModel(u);
  const content = `
    <div class="card row">${avatar(u, 'lg')}<div class="grow"><strong>${esc(u.name)}</strong><div class="small muted">${u.contacts.map(c => esc(S.maskContact(c))).join(' · ')}</div><div class="small muted">${esc(u.tz)}</div></div></div>
    <div class="card stack">
      <div class="field"><span class="label">Units</span><div class="segmented"><button type="button" aria-pressed="${u.units === 'lb'}" data-action="set-units" data-units="lb">Pounds (lb)</button><button type="button" aria-pressed="${u.units === 'kg'}" data-action="set-units" data-units="kg">Kilograms (kg)</button></div></div>
      <div class="field"><span class="label">Weekly goal</span><div class="row"><div class="stepper"><button type="button" data-action="goal" data-d="-1" aria-label="Decrease goal" ${u.weeklyGoal <= 1 ? 'disabled' : ''}>−</button><span class="val num">${u.weeklyGoal}</span><button type="button" data-action="goal" data-d="1" aria-label="Increase goal" ${u.weeklyGoal >= 14 ? 'disabled' : ''}>+</button></div><span class="small muted">sessions per week</span></div></div>
    </div>
    <button class="rowcard" data-action="nav" data-to="health"><div class="grow"><strong>Apple Health & live data</strong><div class="meta">${esc(u.companion === 'connected' ? m.label : 'Not connected')} · Zones ${u.zonesConfirmed ? 'confirmed' : 'not set'}</div></div><span class="chev">${icons.chev}</span></button>
    <div class="card stack-sm"><span class="eyebrow">Devices signed in as you</span>
      <div class="rowcard" style="padding:var(--s-3)"><div class="grow"><strong>This phone</strong><div class="meta">Active now</div></div></div>
      ${tv.authorized.includes(u.id) ? `<div class="rowcard" style="padding:var(--s-3)"><div class="grow"><strong>${esc(tv.name)}</strong><div class="meta">${tv.session?.userId === u.id ? 'Signed in now' : 'Approved · locked'}</div></div>${btn('Remove', 'tv-remove', { kind: 'ghost small' })}</div>` : `<p class="small muted">No TV approved yet. Start on the TV, then enter its code.</p>`}
      ${btn('Approve a TV', 'nav', { kind: 'secondary block', params: { to: 'approve' } })}</div>
    <div class="card stack-sm">
      ${btn('Switch user', 'switch-user', { kind: 'secondary block' })}
      ${btn('Log out', 'logout', { kind: 'quiet-danger block' })}
      <p class="help">Log out ends this phone's session. Your name can stay on the chooser (locked) or be removed from this device.</p></div>
    <p class="help center">Dillan V1 · Prototype build</p>`;
  return shell({ title: 'Profile', back: 'nav-home', nav: 'account', content, modal: modalHtml() });
}

/* ---------- Modals ---------- */
function modalHtml() {
  const mdl = ui.modal; if (!mdl) return '';
  const u = S.activeUser(DEV);
  switch (mdl.type) {
    case 'end-confirm': return dialog({ id: 'end', title: 'End this workout?', body: 'We’ll save what you’ve done so far and stop collecting heart rate. You can add notes on the next screen.', actions: btn('Keep going', 'modal-close', { kind: 'secondary block', auto: true }) + btn('End and save', 'end-workout', { kind: 'primary block' }) });
    case 'editor-discard': return dialog({ id: 'disc', title: 'Discard changes?', body: 'This workout has unsaved edits.', actions: btn('Keep editing', 'modal-close', { kind: 'secondary block', auto: true }) + btn('Discard changes', 'editor-discard', { kind: 'quiet-danger block' }) });
    case 'editor-delete': return dialog({ id: 'del', title: `Delete “${mdl.name}”?`, body: 'It disappears from Program. Sessions you already logged with it stay in Calendar exactly as recorded.', actions: btn('Cancel', 'modal-close', { kind: 'secondary block', auto: true }) + btn('Delete workout', 'editor-delete-confirm', { kind: 'danger block' }) });
    case 'workout-running': return dialog({ id: 'run', title: 'A workout is running', body: `${esc(u?.name || '')}'s “${esc(S.state.live?.workoutName || '')}” is still in progress. End it first so nothing is lost.`, actions: btn('Cancel', 'modal-close', { kind: 'secondary block', auto: true }) + btn('End and save, then continue', 'end-then-continue', { kind: 'primary block', params: { then: mdl.then } }) });
    case 'logout': return sheet({ id: 'lo', title: 'Log out of this phone?', body: `<p class="muted">Your session on this phone ends. Choose whether to keep your name on the chooser.</p><div class="actions">${btn('Log out, keep my name here', 'logout-confirm', { kind: 'primary block', params: { forget: 0 } })}${btn('Log out and remove from this device', 'logout-confirm', { kind: 'secondary block', params: { forget: 1 } })}${btn('Cancel', 'modal-close', { kind: 'ghost block' })}</div>` });
    case 'remove-tv': return dialog({ id: 'rtv', title: `Remove ${esc(S.state.devices.tv.name)}?`, body: 'The TV is signed out of your account immediately and your profile is removed from its chooser.', actions: btn('Cancel', 'modal-close', { kind: 'secondary block', auto: true }) + btn('Remove TV', 'tv-remove-confirm', { kind: 'primary block' }) });
    case 'edit-set': { const l = S.state.live; const ex = l.snapshot[mdl.exIndex]; const r = l.sets[S.setKey(mdl.exIndex, mdl.setIndex)]; return sheet({ id: 'es', title: `${esc(ex.name)} · set ${mdl.setIndex + 1}`, body: `<form class="stack" novalidate data-form="edit-set"><div class="inline"><div class="field"><label for="er">Reps${ex.repsBasis === 'perSide' ? ' (per side)' : ''}</label><input id="er" class="input num" name="reps" type="number" min="0" value="${r.reps ?? ''}"></div><div class="field"><label for="ew">Weight (${u.units})</label><input id="ew" class="input num" name="weight" type="number" min="0" step="0.5" value="${r.weight ?? ''}" placeholder="Bodyweight"></div></div><p class="help">Changes apply to this session only, not the saved workout.</p><div class="actions"><button class="btn primary block" type="submit">Save set</button>${btn('Cancel', 'modal-close', { kind: 'ghost block' })}</div></form>` }); }
    case 'lock-notice': return dialog({ id: 'lk', title: 'Locked for privacy', body: 'This device was idle for 15 minutes, so it locked. Verify to continue.', actions: btn('OK', 'modal-close', { kind: 'primary block', auto: true }) });
  }
  return '';
}

/* ---------- Router ---------- */
export function renderPhone() {
  const d = S.device(DEV); const r = d.route; const u = S.activeUser(DEV);
  if (d.clearing) return `<div class="app theme-light"><div class="empty" style="margin:auto"><div class="spinner" style="margin:0 auto"></div><p class="small" style="margin-top:var(--s-3)">Switching…</p></div></div>`;
  const pub = ['welcome', 'chooser', 'auth', 'approve'];
  if (!u && !pub.includes(r.name)) return welcome();
  if (r.name !== 'editor') drafts[DEV] = null;
  if (r.name !== 'zones') ui.zoneDraft = null;
  const tvp = S.state.devices.tv.pairing;
  const pairBanner = (u && tvp && tvp.status === 'awaiting' && r.name !== 'approve' && r.name !== 'dashboard')
    ? `<div class="banner accent pair-banner" role="status"><div><strong>${esc(S.state.devices.tv.name)} is asking to sign in</strong>Code ${esc(tvp.code)} · tap Review to approve or decline. (Stands in for scanning the TV's QR code.)</div>${btn('Review', 'nav', { kind: 'primary', params: { to: 'approve' } })}</div>`
    : '';
  const withBanner = html => pairBanner ? html.replace('<div class="scroll"><div class="pad stack">', `<div class="scroll"><div class="pad stack">${pairBanner}`) : html;
  switch (r.name) {
    case 'welcome': return welcome(); case 'chooser': return chooser(); case 'auth': return auth(r); case 'approve': return approve(r);
    case 'home': return withBanner(home()); case 'program': return withBanner(program()); case 'editor': return withBanner(editor(r)); case 'choose': return withBanner(choose()); case 'preflight': return withBanner(preflight(r));
    case 'dashboard': return dashboard(); case 'summary': return withBanner(summary(r)); case 'calendar': return withBanner(calendar(r)); case 'session': return withBanner(sessionDetail(r));
    case 'health': return withBanner(health()); case 'zones': return withBanner(zones(r)); case 'account': return withBanner(account());
  }
  return home();
}

/* ---------- Actions ---------- */
const go = (name, params) => S.navigate(DEV, name, params);
function requireNoWorkout(then) { const l = S.state.live; const u = S.activeUser(DEV); if (l && u && l.userId === u.id) { ui.modal = { type: 'workout-running', then }; S.commit('modal'); return false; } return true; }
export const phoneActions = {
  nav(ds) { const p = {}; if (ds.workout) p.workoutId = ds.workout; if (ds.day) { p.day = ds.day; p.month = ds.day.slice(0, 7); } if (ds.back) p.back = ds.back; ui.modal = null; go(ds.to, p); },
  'nav-home'() { go('home'); }, 'nav-choose'() { go('choose'); }, 'nav-account'() { go('account'); }, 'nav-health'() { go('health'); },
  'nav-home-or-welcome'() { go(S.activeUser(DEV) ? 'home' : 'welcome'); },
  'nav-calendar-back'() { const r = S.route(DEV); const s = S.sessionById(S.activeUser(DEV).id, r.sessionId); go('calendar', s ? { day: S.dayKey(s.startedAt), month: S.monthKey(s.startedAt) } : {}); },
  'nav-preflight-back'() { const r = S.route(DEV); go('preflight', { workoutId: r.workoutId }); },
  'modal-close'() { ui.modal = null; S.commit('modal'); },
  /* auth */
  'auth-start'(ds) { ui.authError = ''; ui.codeInput = ''; go('auth', { mode: ds.mode, step: 'contact', method: 'email', then: ds.then || null }); },
  'auth-method'(ds) { const r = S.route(DEV); ui.authError = ''; go('auth', Object.assign({}, r, { method: ds.method })); },
  'auth-cancel'() { ui.authError = ''; const d = S.device(DEV); go(d.remembered.length ? 'chooser' : 'welcome'); },
  'auth-back-contact'() { const r = S.route(DEV); ui.codeInput = ''; ui.authError = ''; go('auth', Object.assign({}, r, { step: 'contact' })); },
  'auth-alt-contact'() { const r = S.route(DEV); const u = S.userById(r.forUserId); ui.codeInput = ''; ui.authError = ''; ui.resendAt = S.now() + 30000; S.toast(`Code sent to ${S.maskContact(u.contacts[1])}`); go('auth', Object.assign({}, r, { method: u.contacts[1].type, altContact: 1 })); },
  'auth-resend'() { ui.resendAt = S.now() + 30000; S.toast('New code sent'); S.commit('ui'); },
  'auth-merge'(ds) { const r = S.route(DEV); if (ds.choice === 'new') go('auth', Object.assign({}, r, { step: 'profile' })); else { ui.authError = 'Log in with the contact already on your account; you can add this one afterwards in Profile.'; go('auth', { mode: 'login', step: 'contact', method: 'email' }); } },
  'choose-profile'(ds) { const u = S.userById(ds.user); ui.codeInput = ''; ui.authError = ''; ui.resendAt = S.now() + 30000; S.toast(`Code sent to ${S.maskContact(u.contacts[0])}`); go('auth', { mode: 'login', step: 'code', forUserId: u.id, method: u.contacts[0].type }); },
  'pick-units'(ds, el) { el.closest('.segmented').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === el)); },
  /* approve TV */
  'approve-confirm'() { const u = S.activeUser(DEV); const out = S.state.proto.approvalOutcome; S.update(s => { if (out === 'deny') S.resolvePairing('denied'); else if (out === 'expire') { s.devices.tv.pairing.status = 'expired'; } else S.resolvePairing('approved', u.id); }, 'pair'); go('approve', { step: out === 'approve' ? 'done' : 'denied' }); if (out === 'expire') S.toast('That code has expired. Ask the TV for a new one.'); },
  'approve-deny'() { S.update(() => S.resolvePairing('denied'), 'pair'); go('approve', { step: 'denied' }); },
  /* home */
  'workout-now'() { const l = S.state.live; const u = S.activeUser(DEV); if (l && l.userId === u.id) go('dashboard'); else go(u.workouts.length ? 'choose' : 'choose'); },
  'open-session'(ds) { go('session', { sessionId: ds.id }); },
  /* program */
  'new-workout'() { drafts[DEV] = null; go('editor', { workoutId: null }); },
  'open-editor'(ds) { drafts[DEV] = null; go('editor', { workoutId: ds.id }); },
  'ex-add'() { const d = drafts[DEV]; d.exercises.push({ id: S.uid(), name: '', group: null, sets: 3, reps: 10, repsBasis: 'total', weight: null, loadBasis: 'perImplement', rest: 60, instructions: '' }); S.commit('draft'); setTimeout(() => { const el = document.querySelector(`[data-ex="${d.exercises.at(-1).id}"] input`); el && el.focus(); }, 30); },
  'ex-remove'(ds) { const d = drafts[DEV]; d.exercises = d.exercises.filter(e => e.id !== ds.id); fixGroups(d); S.commit('draft'); },
  'ex-move'(ds) { const d = drafts[DEV]; const i = d.exercises.findIndex(e => e.id === ds.id); const j = i + Number(ds.dir); if (j < 0 || j >= d.exercises.length) return; [d.exercises[i], d.exercises[j]] = [d.exercises[j], d.exercises[i]]; fixGroups(d); S.commit('draft'); },
  'ex-set'(ds) { const d = drafts[DEV]; const e = d.exercises.find(x => x.id === ds.id); e[ds.field] = ds.value; S.commit('draft'); },
  'ex-group'(ds) { const d = drafts[DEV]; const i = d.exercises.findIndex(e => e.id === ds.id); const letter = d.exercises[i].group || nextLetter(d); d.exercises[i].group = letter; d.exercises[i + 1].group = letter; d.exercises[i + 1].sets = d.exercises[i].sets; S.commit('draft'); },
  'ex-ungroup'(ds) { const d = drafts[DEV]; const e = d.exercises.find(x => x.id === ds.id); e.group = null; fixGroups(d); S.commit('draft'); },
  'editor-save'() { const d = drafts[DEV]; const u = S.activeUser(DEV); normalizeDraft(d); const errs = S.validateWorkout(d); d._errors = errs; if (Object.keys(errs).length) { S.commit('draft'); S.toast('Fix the highlighted fields to save.'); setTimeout(() => document.querySelector('.input.invalid')?.focus(), 30); return; } const w = { id: d.id, name: d.name.trim(), exercises: d.exercises.map(e => ({ ...e })), createdAt: d.createdAt }; S.update(() => S.saveWorkout(u.id, w), 'save'); drafts[DEV] = null; S.toast('Workout saved'); go('program'); },
  'editor-back'() { const d = drafts[DEV]; if (d && JSON.stringify({ name: d.name, exercises: d.exercises }) !== d._orig) { ui.modal = { type: 'editor-discard' }; S.commit('modal'); return; } drafts[DEV] = null; go('program'); },
  'editor-discard'() { ui.modal = null; drafts[DEV] = null; go('program'); },
  'editor-delete'() { ui.modal = { type: 'editor-delete', name: drafts[DEV].name }; S.commit('modal'); },
  'editor-delete-confirm'() { const d = drafts[DEV]; ui.modal = null; S.update(() => S.deleteWorkout(S.activeUser(DEV).id, d.id), 'delete'); drafts[DEV] = null; S.toast('Workout deleted'); go('program'); },
  /* training */
  'start-workout'(ds) { const u = S.activeUser(DEV); S.update(() => S.startWorkout(u.id, ds.workout, { liveData: ds.live === '1' }), 'start'); go('dashboard'); },
  'complete-set'() { S.update(() => S.completeSet(), 'set'); },
  'skip-set'() { S.update(() => S.skipSet(), 'set'); },
  'undo-set'() { S.update(() => S.undoLastSet(), 'set'); },
  'skip-rest'() { S.update(() => S.skipRest(), 'rest'); },
  'edit-set'(ds) { ui.modal = { type: 'edit-set', exIndex: +ds.ex, setIndex: +ds.set }; S.commit('modal'); },
  pause() { S.update(() => S.pauseWorkout(), 'pause'); },
  resume() { ui.modal = null; S.update(() => S.resumeWorkout(), 'resume'); },
  'end-confirm'() { ui.modal = { type: 'end-confirm' }; S.commit('modal'); },
  'end-workout'() { ui.modal = null; S.update(() => S.endWorkout(), 'end'); },
  'end-then-continue'(ds) { ui.modal = null; S.update(() => S.endWorkout(), 'end'); setTimeout(() => phoneActions[ds.then] && phoneActions[ds.then]({}), 50); },
  'notes-retry'(ds) { saveNotes(ds.id, document.querySelector(`[data-notes="${ds.id}"]`)?.value ?? '', true); },
  /* calendar */
  'cal-month'(ds) { go('calendar', { month: ds.month }); },
  'cal-day'(ds) { go('calendar', { month: ds.day.slice(0, 7), day: ds.day }); },
  /* health */
  'companion-connect'() { S.update(s => { S.activeUser(DEV).companion = 'connected'; s.sensor.mode = 'waiting'; s.sensor.modeSince = S.now(); }, 'companion'); S.toast('Companion linked. Waiting for the first reading…'); },
  'companion-disconnect'() { S.update(s => { S.activeUser(DEV).companion = 'not_connected'; s.sensor.mode = 'not_connected'; s.sensor.bpm = null; s.sensor.lastReadingAt = 0; }, 'companion'); },
  /* account */
  'set-units'(ds) { S.update(() => { S.activeUser(DEV).units = ds.units; }, 'units'); },
  goal(ds) { S.update(() => { const u = S.activeUser(DEV); u.weeklyGoal = Math.min(14, Math.max(1, u.weeklyGoal + Number(ds.d))); }, 'goal'); },
  'tv-remove'() { ui.modal = { type: 'remove-tv' }; S.commit('modal'); },
  'tv-remove-confirm'() { ui.modal = null; const u = S.activeUser(DEV); S.update(s => { S.removeProfile('tv', u.id); if (s.devices.tv.session?.userId === u.id) S.lockDevice('tv'); }, 'tv'); S.toast('TV removed'); },
  'switch-user'() { if (!requireNoWorkout('switch-user')) return; ui.modal = null; S.update(s => { const d = s.devices.phone; d.session = null; d.clearing = true; }, 'switch'); setTimeout(() => S.update(s => { s.devices.phone.clearing = false; s.devices.phone.route = { name: 'chooser' }; }, 'switch'), 450); },
  logout() { if (!requireNoWorkout('logout')) return; ui.modal = { type: 'logout' }; S.commit('modal'); },
  'logout-confirm'(ds) { ui.modal = null; S.update(() => S.logOut(DEV, { forget: ds.forget === '1' }), 'logout'); },
};
function nextLetter(d) { const used = new Set(d.exercises.map(e => e.group).filter(Boolean)); for (const c of 'ABCDEFGH') if (!used.has(c)) return c; return 'Z'; }
function fixGroups(d) { /* a group letter that no longer has 2 adjacent members is dropped */ const g = S.groupsOf(d.exercises); g.forEach(x => { if (x.letter && x.members.length < 2) d.exercises[x.members[0]].group = null; }); }
function normalizeDraft(d) { d.exercises.forEach(e => { e.sets = e.sets === '' ? '' : +e.sets; e.reps = e.reps === '' ? '' : +e.reps; e.weight = e.weight === '' || e.weight == null ? null : +e.weight; e.rest = e.rest === '' || e.rest == null ? 60 : +e.rest; }); S.groupsOf(d.exercises).forEach(g => { if (g.type === 'superset') g.members.forEach(i => { d.exercises[i].sets = d.exercises[g.members[0]].sets; }); }); }

/* ---------- Forms & inputs ---------- */
export function phoneInput(e) {
  const t = e.target;
  if (t.matches('[data-code-input]')) { ui.codeInput = t.value.replace(/\D/g, '').slice(0, 6); ui.authError = ''; const boxes = t.closest('form').querySelectorAll('.box'); boxes.forEach((b, i) => { b.textContent = ui.codeInput[i] || ''; b.classList.toggle('active', i === ui.codeInput.length); }); t.closest('form').querySelector('button[type=submit]').disabled = ui.codeInput.length !== 6; const hp = t.closest('form').querySelector('p.help.err'); if (hp) { hp.classList.remove('err'); hp.textContent = 'Codes expire after 10 minutes. In this prototype, any 6 digits work except 000000.'; } return; }
  if (t.matches('[data-field]')) { const d = drafts[DEV]; if (!d) return; if (t.dataset.field === 'wname') { d.name = t.value; return; } const ex = d.exercises.find(x => x.id === t.closest('[data-ex]').dataset.ex); if (!ex) return; ex[t.dataset.field] = t.value; if (t.dataset.field === 'weight') { /* reveal/hide load basis on blur */ } return; }
  if (t.matches('[data-zone]')) { ui.zoneDraft[+t.dataset.zone] = t.value === '' ? NaN : +t.value; S.commit('zones'); setTimeout(() => { const el = document.getElementById(t.id); if (el) { el.focus(); } }, 0); return; }
  if (t.matches('[data-notes]')) { const id = t.dataset.notes; ui.notesStatus[id] = 'typing'; setNotesStatus(id); clearTimeout(ui.notesTimer); ui.notesTimer = setTimeout(() => saveNotes(id, t.value), 800); }
}
export function phoneChange(e) { const t = e.target; if (t.matches('[data-field="weight"]')) { S.commit('draft'); } }
function setNotesStatus(id) { const el = document.querySelector(`[data-notes="${id}"]`)?.closest('.card')?.querySelector('[data-notes-status]'); if (!el) return; el.textContent = { typing: 'Unsaved changes', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[ui.notesStatus[id]] || ''; const card = el.closest('.card'); const help = card.querySelector('[data-notes-help]'); if (help) help.hidden = ui.notesStatus[id] !== 'error'; }
function saveNotes(id, value, force = false) {
  ui.notesStatus[id] = 'saving'; setNotesStatus(id);
  setTimeout(() => {
    if (S.state.proto.failSave && !force) { ui.notesStatus[id] = 'error'; setNotesStatus(id); S.state.devices.phone.pendingNotes = { id, value }; S.save(); const card = document.querySelector(`[data-notes="${id}"]`)?.closest('.card'); if (card && !card.querySelector('[data-action="notes-retry"]')) card.insertAdjacentHTML('beforeend', btn('Retry now', 'notes-retry', { kind: 'secondary', params: { id } })); return; }
    const u = S.activeUser(DEV); const s = u && S.sessionById(u.id, id); if (s) { s.notes = value; s.notesUpdatedAt = S.now(); } if (S.state.devices.phone.pendingNotes?.id === id) S.state.devices.phone.pendingNotes = null; S.save();
    ui.notesStatus[id] = 'saved'; setNotesStatus(id); document.querySelector(`[data-action="notes-retry"]`)?.remove();
  }, 500);
}
export function phoneSubmit(e) {
  e.preventDefault(); const f = e.target; const kind = f.dataset.form; const fd = new FormData(f); const r = S.route(DEV);
  if (kind === 'auth-contact') {
    const contact = (fd.get('contact') || '').trim(); const method = r.method || 'email';
    if (method === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) { ui.authError = 'That doesn’t look like an email address.'; S.commit('ui'); return; }
    if (method === 'sms' && !/^\+\d[\d\s-]{7,}$/.test(contact)) { ui.authError = 'Include the country code, e.g. +1 561 555 0100.'; S.commit('ui'); return; }
    const existing = S.findUserByContact(contact);
    if (r.mode === 'register' && existing) { ui.authError = ''; S.toast('You already have an account — we sent a login code.'); }
    if (r.mode === 'login' && !existing) { go('auth', Object.assign({}, r, { contact, step: 'merge' })); return; }
    ui.authError = ''; ui.codeInput = ''; ui.resendAt = S.now() + 30000; go('auth', Object.assign({}, r, { contact, step: 'code', existingId: existing?.id || null }));
  }
  if (kind === 'auth-code') {
    if (ui.codeInput === '000000') { ui.authError = 'That code didn’t match. Check the latest message or resend.'; ui.codeInput = ''; S.commit('ui'); setTimeout(() => document.getElementById('code')?.focus(), 0); return; }
    const existing = r.forUserId ? S.userById(r.forUserId) : (r.existingId ? S.userById(r.existingId) : S.findUserByContact(r.contact || ''));
    if (existing) { S.update(() => { S.signIn(DEV, existing.id); }, 'signin'); ui.codeInput = ''; go(r.then || 'home'); return; }
    go('auth', Object.assign({}, r, { step: 'profile' }));
  }
  if (kind === 'auth-profile') {
    const units = f.querySelector('[data-units][aria-pressed="true"]')?.dataset.units || 'lb';
    S.update(() => { const u = S.registerUser({ contact: { type: r.method || 'email', value: r.contact }, name: fd.get('name'), tz: fd.get('tz'), units }); S.signIn(DEV, u.id); }, 'register'); go(r.then || 'home');
  }
  if (kind === 'approve-code') {
    const code = (fd.get('code') || '').trim().toUpperCase(); const p = S.state.devices.tv.pairing;
    if (!p || p.code !== code) { ui.authError = 'We don’t recognize that code. Check the TV and try again.'; S.commit('ui'); return; }
    if (p.status === 'expired' || S.now() > p.expiresAt) { ui.authError = 'That code has expired. Ask the TV for a new one.'; S.commit('ui'); return; }
    if (p.status !== 'awaiting') { ui.authError = 'That code was already used.'; S.commit('ui'); return; }
    ui.authError = ''; go('approve', { step: 'confirm' });
  }
  if (kind === 'zones') { const z = ui.zoneDraft.slice(); S.update(() => { const u = S.activeUser(DEV); u.zones = z; u.zonesConfirmed = true; }, 'zones'); ui.zoneDraft = null; S.toast('Zones confirmed'); go(r.back === 'preflight' ? 'preflight' : 'health', r.back === 'preflight' ? { workoutId: r.workoutId } : {}); }
  if (kind === 'edit-set') { const m = ui.modal; const reps = fd.get('reps') === '' ? null : +fd.get('reps'); const weight = fd.get('weight') === '' ? null : +fd.get('weight'); ui.modal = null; S.update(() => S.editSet(m.exIndex, m.setIndex, { reps, weight }), 'set'); }
}
export function phoneBack() { /* browser back maps to the visible Back control; never ends a workout */ const b = document.querySelector('#phone [data-action][aria-label="Back"]'); if (b) b.click(); }
