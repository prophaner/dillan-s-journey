import * as storage from './storage.js';
/* Dillan V1 prototype — state, persistence, and the workout engine.
   Everything here is prototype logic; see docs/05-developer-handoff.md for the production rules it demonstrates. */

const KEY = 'dillan.v1.prototype';
const listeners = new Set();
export const now = () => Date.now();
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- Seed data (synthetic, labeled as examples in the UI) ---------------- */
function exercise(o) {
  return Object.assign({ id: uid(), name: '', group: null, sets: 3, reps: 10, repsBasis: 'total', weight: null, loadBasis: 'perImplement', rest: 60, instructions: '' }, o);
}
function seedWorkouts() {
  return [
    { id: 'w-upper-a', name: 'Upper Body A', createdAt: now() - 86400000 * 40, updatedAt: now() - 86400000 * 3, exercises: [
      exercise({ id: 'e1', name: 'Dumbbell Floor Press', sets: 3, reps: 10, repsBasis: 'total', weight: 30, loadBasis: 'perImplement', rest: 60, instructions: 'Elbows at 45°. Pause briefly when the upper arm touches the floor.' }),
      exercise({ id: 'e2', name: 'One-arm Row', sets: 3, reps: 10, repsBasis: 'perSide', weight: 30, loadBasis: 'perImplement', rest: 60, instructions: 'Brace on the bench. Pull to the hip, not the shoulder.' }),
      exercise({ id: 'e3', name: 'Half-kneeling Press', group: 'A', sets: 3, reps: 8, repsBasis: 'perSide', weight: 20, loadBasis: 'perImplement', rest: 90 }),
      exercise({ id: 'e4', name: 'Band Pull-apart', group: 'A', sets: 3, reps: 15, repsBasis: 'total', weight: null, rest: 90, instructions: 'Light band. Squeeze shoulder blades together.' }),
    ] },
    { id: 'w-lower-a', name: 'Lower Body A', createdAt: now() - 86400000 * 38, updatedAt: now() - 86400000 * 10, exercises: [
      exercise({ name: 'Goblet Squat', sets: 4, reps: 8, weight: 40, loadBasis: 'total', rest: 90 }),
      exercise({ name: 'Romanian Deadlift', sets: 3, reps: 10, weight: 35, loadBasis: 'perImplement', rest: 90 }),
      exercise({ name: 'Reverse Lunge', sets: 3, reps: 8, repsBasis: 'perSide', weight: 20, loadBasis: 'perImplement', rest: 60 }),
    ] },
    { id: 'w-pull-core', name: 'Pull + Core', createdAt: now() - 86400000 * 20, updatedAt: now() - 86400000 * 20, exercises: [
      exercise({ name: 'Pull-up', sets: 4, reps: 6, weight: null, rest: 120 }),
      exercise({ name: 'Dead Bug', sets: 3, reps: 10, repsBasis: 'perSide', weight: null, rest: 45 }),
    ] },
  ];
}
function fakeSession(user, workout, daysAgo, hour, opts = {}) {
  const start = new Date(); start.setHours(hour, 12, 0, 0); start.setDate(start.getDate() - daysAgo);
  const startedAt = start.getTime();
  const activeMs = (opts.minutes ?? 38) * 60000;
  const sets = [];
  let reached = 0; const total = workout.exercises.reduce((n, e) => n + e.sets, 0);
  const stopAt = opts.stopAt ?? total;
  workout.exercises.forEach((e, ei) => {
    for (let s = 0; s < e.sets; s++) {
      reached++;
      const status = reached > stopAt ? 'not_reached' : (opts.skip && opts.skip.includes(reached) ? 'skipped' : 'done');
      sets.push({ exId: e.id, exName: e.name, exIndex: ei, setIndex: s, status, reps: status === 'done' ? e.reps : null, weight: e.weight, repsBasis: e.repsBasis, loadBasis: e.loadBasis, group: e.group });
    }
  });
  const zoneMs = opts.live === false ? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } : { 1: activeMs * .12, 2: activeMs * .38, 3: activeMs * .30, 4: activeMs * .10, 5: 0 };
  const unknownMs = opts.live === false ? activeMs : activeMs * .10;
  return {
    id: uid(), userId: user.id, workoutId: workout.id, workoutName: workout.name, snapshot: JSON.parse(JSON.stringify(workout.exercises)),
    startedAt, endedAt: startedAt + activeMs + (opts.pausedMs ?? 0), activeMs, pausedMs: opts.pausedMs ?? 0,
    status: stopAt >= total ? 'completed' : 'ended_early', sets, zoneMs, unknownMs, liveData: opts.live !== false,
    notes: opts.notes ?? '', notesUpdatedAt: opts.notes ? startedAt + activeMs + 60000 : null,
  };
}
export function seedState(mode = 'example') {
  const luis = { id: 'u-luis', name: 'Luis', avatar: 'av-a', contacts: [{ type: 'email', value: 'luis.ramos@example.com', verified: true }, { type: 'sms', value: '+1 561 555 0142', verified: true }], tz: 'America/New_York', units: 'lb', weeklyGoal: 3, zones: [114, 133, 152, 171], zonesConfirmed: true, companion: 'connected', workouts: [], sessions: [] };
  const maya = { id: 'u-maya', name: 'Maya', avatar: 'av-b', contacts: [{ type: 'sms', value: '+1 561 555 0199', verified: true }], tz: 'America/New_York', units: 'kg', weeklyGoal: 2, zones: null, zonesConfirmed: false, companion: 'not_connected', workouts: [], sessions: [] };
  if (mode === 'example') {
    luis.workouts = seedWorkouts();
    const [ua, la, pc] = luis.workouts;
    luis.sessions = [
      fakeSession(luis, ua, 2, 7, { minutes: 41, notes: 'Floor press felt strong. Rows: left side lagging a bit.\nTry 32.5 next time.' }),
      fakeSession(luis, la, 4, 18, { minutes: 36 }),
      fakeSession(luis, pc, 6, 7, { minutes: 22, stopAt: 4, notes: 'Cut it short — shoulder pinch on pull-ups.' }),
      fakeSession(luis, ua, 9, 7, { minutes: 40, live: false, notes: 'Watch was dead. No heart-rate data for this one.' }),
      fakeSession(luis, la, 11, 18, { minutes: 39 }),
      fakeSession(luis, pc, 13, 7, { minutes: 24 }),
      fakeSession(luis, ua, 16, 7, { minutes: 42, skip: [8] }),
      fakeSession(luis, la, 18, 18, { minutes: 35 }),
      fakeSession(luis, ua, 23, 7, { minutes: 38 }),
      fakeSession(luis, pc, 25, 7, { minutes: 21 }),
      fakeSession(luis, la, 27, 18, { minutes: 37, notes: 'New goblet squat weight: 40 total.' }),
    ];
    maya.workouts = [{ id: 'w-maya-1', name: 'Full Body', createdAt: now() - 86400000 * 5, updatedAt: now() - 86400000 * 5, exercises: [exercise({ name: 'Kettlebell Swing', sets: 5, reps: 12, weight: 16, loadBasis: 'total', rest: 60 }), exercise({ name: 'Push-up', sets: 3, reps: 10, weight: null })] }];
    maya.sessions = [fakeSession(maya, maya.workouts[0], 3, 19, { minutes: 27, live: false, notes: 'First one. Swings felt good.' })];
  }
  const users = mode === 'example' ? [luis, maya] : [];
  return {
    version: 1,
    users,
    devices: {
      phone: { id: 'phone', kind: 'phone', name: 'iPhone', session: mode === 'example' ? { userId: 'u-luis', unlockedAt: now() } : null, remembered: mode === 'example' ? ['u-luis'] : [], route: { name: mode === 'example' ? 'home' : 'welcome' }, lastActivityAt: now(), draft: null, pendingNotes: null },
      tv: { id: 'tv', kind: 'tv', name: 'Living Room Fire TV', session: null, remembered: mode === 'example' ? ['u-luis', 'u-maya'] : [], authorized: mode === 'example' ? ['u-luis', 'u-maya'] : [], route: { name: mode === 'example' ? 'chooser' : 'welcome' }, lastActivityAt: now(), pairing: null },
    },
    live: null,
    sensor: { mode: mode === 'example' ? 'live' : 'not_connected', bpm: mode === 'example' ? 96 : null, lastReadingAt: mode === 'example' ? now() - 1500 : 0, target: 96 },
    proto: { failSave: false, approvalOutcome: 'approve', reducedMotion: false, calendarMonth: null },
    toast: null,
  };
}

/* ---------------- Store ---------------- */
export let state = load();
function load() {
  try { const raw = storage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s.version === 1) return s; } } catch (e) { /* ignore */ }
  return seedState('example');
}
export function save() { try { storage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function commit(reason = '') { save(); listeners.forEach(fn => fn(reason)); }
export function reset(mode) { state = seedState(mode); commit('reset'); }
export function update(fn, reason) { fn(state); commit(reason); }

/* ---------------- Selectors ---------------- */
export const device = id => state.devices[id];
export const userById = id => state.users.find(u => u.id === id) || null;
export const activeUser = devId => { const d = device(devId); return d.session ? userById(d.session.userId) : null; };
export const route = devId => device(devId).route;
export function maskContact(c) {
  if (!c) return '';
  if (c.type === 'email') { const [l, d] = c.value.split('@'); return l.slice(0, 2) + '•••@' + d.replace(/^[^.]+/, m => m[0] + '•••'); }
  return c.value.replace(/\d(?=.*\d{2})/g, '•').replace(/^•+/, m => c.value.slice(0, m.length)).replace(/^(\+\d)\s?/, '$1 ');
}
export function fmtWeight(ex, units) {
  if (ex.weight == null) return 'Bodyweight';
  const basis = ex.loadBasis === 'perImplement' ? 'per dumbbell' : 'total';
  return `${ex.weight} ${units} ${basis}`;
}
export function fmtReps(ex) { return `${ex.reps} ${ex.repsBasis === 'perSide' ? 'per side' : 'total'}`; }
export function fmtDur(ms, opts = {}) {
  const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (opts.short) return h ? `${h}h ${m}m` : `${m} min`;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(sec).padStart(2, '0');
}
export function fmtClock(ts) { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
export function fmtDate(ts, o = {}) { return new Date(ts).toLocaleDateString([], Object.assign({ weekday: 'short', month: 'short', day: 'numeric' }, o)); }

/* Superset grouping: consecutive exercises sharing a group letter form one superset. */
export function groupsOf(exercises) {
  const out = []; let i = 0;
  while (i < exercises.length) {
    const e = exercises[i];
    if (e.group) { const members = [i]; let j = i + 1; while (j < exercises.length && exercises[j].group === e.group) { members.push(j); j++; } out.push({ type: members.length > 1 ? 'superset' : 'straight', letter: e.group, members, rounds: e.sets, rest: exercises[members[members.length - 1]].rest ?? 60 }); i = j; }
    else { out.push({ type: 'straight', members: [i], rounds: e.sets, rest: e.rest ?? 60 }); i++; }
  }
  return out;
}
/* Ordered steps through a workout: each step is one set of one exercise. */
export function stepsOf(exercises) {
  const steps = [];
  groupsOf(exercises).forEach((g, gi) => {
    for (let r = 0; r < g.rounds; r++) g.members.forEach((exIndex, mi) => steps.push({ exIndex, setIndex: r, groupIndex: gi, lastInRound: mi === g.members.length - 1, rest: g.rest, label: g.type === 'superset' ? `${g.letter}${mi + 1}` : null, superset: g.type === 'superset' ? g : null }));
  });
  return steps;
}
export function validateWorkout(w) {
  const errors = {};
  if (!w.name || !w.name.trim()) errors.name = 'Give this workout a name.';
  if (!w.exercises.length) errors.exercises = 'Add at least one exercise.';
  w.exercises.forEach(e => {
    const er = {};
    if (!e.name || !e.name.trim()) er.name = 'Exercise needs a name.';
    if (!(Number.isInteger(+e.sets) && +e.sets > 0)) er.sets = 'Whole number, 1 or more.';
    if (!(Number.isInteger(+e.reps) && +e.reps > 0)) er.reps = 'Whole number, 1 or more.';
    if (e.weight != null && e.weight !== '' && !(+e.weight > 0)) er.weight = 'Leave blank for bodyweight.';
    if (e.rest != null && e.rest !== '' && !(Number.isInteger(+e.rest) && +e.rest >= 0)) er.rest = 'Seconds, 0 or more.';
    if (Object.keys(er).length) errors[e.id] = er;
  });
  const groups = groupsOf(w.exercises);
  groups.forEach(g => { if (g.letter && g.members.length < 2) { errors[w.exercises[g.members[0]].id] = Object.assign(errors[w.exercises[g.members[0]].id] || {}, { group: 'A superset needs at least two exercises next to each other.' }); } });
  return errors;
}

/* ---------------- Week / progress ---------------- */
export function startOfWeek(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.getTime(); }
export function progress(user) {
  const t = now(); const ws = startOfWeek(t); const prevWs = ws - 7 * 86400000; const elapsed = t - ws;
  const sess = user.sessions.filter(s => s.endedAt);
  const thisWeek = sess.filter(s => s.startedAt >= ws);
  const prevSame = sess.filter(s => s.startedAt >= prevWs && s.startedAt < prevWs + elapsed);
  const prevFull = sess.filter(s => s.startedAt >= prevWs && s.startedAt < ws);
  const weeks = [3, 2, 1, 0].map(k => { const a = ws - k * 7 * 86400000, b = a + 7 * 86400000; return { start: a, count: sess.filter(s => s.startedAt >= a && s.startedAt < b).length, current: k === 0 }; });
  return { goal: user.weeklyGoal, sessions: thisWeek.length, minutes: Math.round(thisWeek.reduce((n, s) => n + s.activeMs, 0) / 60000), prevSameSessions: prevSame.length, prevSameMinutes: Math.round(prevSame.reduce((n, s) => n + s.activeMs, 0) / 60000), prevFullSessions: prevFull.length, weeks, recent: sess.slice().sort((a, b) => b.startedAt - a.startedAt)[0] || null, total: sess.length };
}

/* ---------------- Auth, profiles, devices ---------------- */
export function navigate(devId, name, params = {}) { update(s => { s.devices[devId].route = Object.assign({ name }, params); s.devices[devId].lastActivityAt = now(); }, 'nav'); }
export function touch(devId) { state.devices[devId].lastActivityAt = now(); }
export function findUserByContact(value) {
  const v = value.trim().toLowerCase().replace(/\s|-/g, '');
  return state.users.find(u => u.contacts.some(c => c.value.toLowerCase().replace(/\s|-/g, '') === v)) || null;
}
export function registerUser({ contact, name, tz, units }) {
  const u = { id: 'u-' + uid(), name: name.trim(), avatar: ['av-a', 'av-b', 'av-c', 'av-d'][state.users.length % 4], contacts: [Object.assign({ verified: true }, contact)], tz, units, weeklyGoal: 3, zones: null, zonesConfirmed: false, companion: 'not_connected', workouts: [], sessions: [] };
  state.users.push(u); return u;
}
export function signIn(devId, userId) {
  const d = state.devices[devId];
  d.session = { userId, unlockedAt: now() };
  if (!d.remembered.includes(userId)) d.remembered.push(userId);
  if (d.kind === 'tv' && !d.authorized.includes(userId)) d.authorized.push(userId);
  d.lastActivityAt = now();
}
export function lockDevice(devId) { const d = state.devices[devId]; d.session = null; d.route = { name: d.kind === 'tv' || d.remembered.length ? 'chooser' : 'welcome' }; }
export function logOut(devId, { forget = false } = {}) {
  const d = state.devices[devId]; const uid_ = d.session?.userId;
  if (forget && uid_) { d.remembered = d.remembered.filter(x => x !== uid_); if (d.authorized) d.authorized = d.authorized.filter(x => x !== uid_); }
  d.session = null; d.route = { name: d.remembered.length ? 'chooser' : 'welcome' };
}
export function removeProfile(devId, userId) { const d = state.devices[devId]; d.remembered = d.remembered.filter(x => x !== userId); if (d.authorized) d.authorized = d.authorized.filter(x => x !== userId); }

/* TV pairing. Status: awaiting → approved | denied | expired */
export function startPairing(forUserId = null) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; /* no 0/O/1/I/L: unambiguous when read off a TV */ const code = 'DLN-' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  state.devices.tv.pairing = { code, status: 'awaiting', forUserId, startedAt: now(), expiresAt: now() + 5 * 60000, approvedBy: null };
}
export function resolvePairing(outcome, userId = null) {
  const p = state.devices.tv.pairing; if (!p) return;
  p.status = outcome; p.resolvedAt = now();
  if (outcome === 'approved' && userId) { p.approvedBy = userId; signIn('tv', userId); state.devices.tv.route = { name: 'home' }; }
}

/* ---------------- Workouts ---------------- */
export function saveWorkout(userId, w) {
  const u = userById(userId); const i = u.workouts.findIndex(x => x.id === w.id);
  w.updatedAt = now(); if (i >= 0) u.workouts[i] = w; else { w.createdAt = now(); u.workouts.push(w); }
}
export function deleteWorkout(userId, id) { const u = userById(userId); u.workouts = u.workouts.filter(w => w.id !== id); }

/* ---------------- Live workout engine ---------------- */
export function startWorkout(userId, workoutId, { liveData }) {
  const u = userById(userId); const w = u.workouts.find(x => x.id === workoutId);
  const snapshot = JSON.parse(JSON.stringify(w.exercises));
  state.live = { id: uid(), userId, workoutId, workoutName: w.name, snapshot, steps: stepsOf(snapshot), cursor: 0, startedAt: now(), activeMs: 0, paused: false, pausedAt: null, pausedMs: 0, rest: null, sets: {}, zoneMs: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, unknownMs: 0, lastTickAt: now(), liveData, currentZone: null, zoneEnteredAt: null };
  state.devices.phone.route = state.devices.phone.session?.userId === userId ? { name: 'dashboard' } : state.devices.phone.route;
  state.devices.tv.route = state.devices.tv.session?.userId === userId ? { name: 'dashboard' } : state.devices.tv.route;
}
export const setKey = (exIndex, setIndex) => `${exIndex}-${setIndex}`;
export function currentStep() { const l = state.live; return l ? l.steps[l.cursor] || null : null; }
export function nextStep() { const l = state.live; return l ? l.steps[l.cursor + 1] || null : null; }
export function completeSet({ reps = null, weight = null } = {}) {
  const l = state.live; const st = currentStep(); if (!l || !st || l.paused) return;
  const ex = l.snapshot[st.exIndex];
  l.sets[setKey(st.exIndex, st.setIndex)] = { status: 'done', reps: reps ?? ex.reps, weight: weight ?? ex.weight, at: now() };
  advance(st);
}
export function skipSet() {
  const l = state.live; const st = currentStep(); if (!l || !st || l.paused) return;
  l.sets[setKey(st.exIndex, st.setIndex)] = { status: 'skipped', reps: null, weight: null, at: now() };
  advance(st);
}
export function undoLastSet() {
  const l = state.live; if (!l || l.cursor === 0) return;
  l.cursor -= 1; const st = l.steps[l.cursor]; delete l.sets[setKey(st.exIndex, st.setIndex)]; l.rest = null;
}
export function editSet(exIndex, setIndex, { reps, weight }) { const l = state.live; const k = setKey(exIndex, setIndex); if (l.sets[k]) { l.sets[k].reps = reps; l.sets[k].weight = weight; } }
function advance(st) {
  const l = state.live; l.cursor += 1;
  const hasMore = l.cursor < l.steps.length;
  if (st.lastInRound && hasMore && st.rest > 0) l.rest = { total: st.rest * 1000, endsAt: now() + st.rest * 1000, startedAt: now() };
  else l.rest = null;
}
export function skipRest() { if (state.live) state.live.rest = null; }
export function pauseWorkout() { const l = state.live; if (!l || l.paused) return; l.paused = true; l.pausedAt = now(); }
export function resumeWorkout() {
  const l = state.live; if (!l || !l.paused) return;
  const pausedFor = now() - l.pausedAt; l.pausedMs += pausedFor; if (l.rest) l.rest.endsAt += pausedFor;
  l.paused = false; l.pausedAt = null; l.lastTickAt = now();
}
export function endWorkout() {
  const l = state.live; if (!l) return null;
  if (l.paused) { l.pausedMs += now() - l.pausedAt; }
  const u = userById(l.userId);
  const total = l.steps.length;
  const sets = l.steps.map(st => { const ex = l.snapshot[st.exIndex]; const r = l.sets[setKey(st.exIndex, st.setIndex)]; return { exId: ex.id, exName: ex.name, exIndex: st.exIndex, setIndex: st.setIndex, status: r ? r.status : 'not_reached', reps: r?.reps ?? null, weight: r?.weight ?? null, repsBasis: ex.repsBasis, loadBasis: ex.loadBasis, group: ex.group }; });
  const session = { id: l.id, userId: l.userId, workoutId: l.workoutId, workoutName: l.workoutName, snapshot: l.snapshot, startedAt: l.startedAt, endedAt: now(), activeMs: l.activeMs, pausedMs: l.pausedMs, status: l.cursor >= total ? 'completed' : 'ended_early', sets, zoneMs: l.zoneMs, unknownMs: l.unknownMs, liveData: l.liveData, notes: '', notesUpdatedAt: null, saveState: 'saved' };
  u.sessions.push(session); state.live = null;
  ['phone', 'tv'].forEach(id => { const d = state.devices[id]; if (d.session?.userId === l.userId && d.route.name === 'dashboard') d.route = { name: 'summary', sessionId: session.id }; });
  return session;
}
export function sessionById(userId, id) { const u = userById(userId); return u ? u.sessions.find(s => s.id === id) : null; }

/* ---------------- Sensor simulation & health status ---------------- */
export const FRESH_LIVE_MS = 10000, FRESH_UNAVAILABLE_MS = 30000;
export function setSensorMode(mode) { update(s => { s.sensor.mode = mode; s.sensor.modeSince = now(); if (mode === 'waiting' || mode === 'not_connected' || mode === 'setup_required') { s.sensor.bpm = null; s.sensor.lastReadingAt = 0; } }, 'sensor'); }
export function zoneFor(user, bpm) { if (!user?.zonesConfirmed || !user.zones || bpm == null) return null; const [a, b, c, d] = user.zones; return bpm < a ? 1 : bpm < b ? 2 : bpm < c ? 3 : bpm < d ? 4 : 5; }
export function zoneBounds(user, z) { if (!user?.zones) return ''; const [a, b, c, d] = user.zones; return [`Under ${a}`, `${a}–${b - 1}`, `${b}–${c - 1}`, `${c}–${d - 1}`, `${d}+`][z - 1]; }
export function freshness() {
  const s = state.sensor; if (!s.lastReadingAt) return 'none';
  const age = now() - s.lastReadingAt; return age <= FRESH_LIVE_MS ? 'live' : age <= FRESH_UNAVAILABLE_MS ? 'delayed' : 'unavailable';
}
/* Returns a display model used identically by phone & TV. */
export function healthModel(user) {
  const s = state.sensor; const l = state.live; const f = freshness();
  const m = { mode: s.mode, bpm: s.bpm, freshness: f, zone: null, bounds: '', label: '', detail: '', tone: 'off', showBpm: false, paused: !!l?.paused, zonesReady: !!(user?.zonesConfirmed && user?.zones), ageSec: s.lastReadingAt ? Math.round((now() - s.lastReadingAt) / 1000) : null };
  if (l && !l.liveData) { m.label = 'Live data off'; m.detail = 'You chose to continue without live heart rate.'; return m; }
  if (user && user.companion !== 'connected' && s.mode !== 'live') { m.label = 'Not connected'; m.detail = 'Set up the Dillan iPhone app to see heart rate here.'; return m; }
  switch (s.mode) {
    case 'not_connected': m.label = 'Not connected'; m.detail = 'Open the Dillan iPhone app and connect your Watch.'; break;
    case 'setup_required': m.label = 'Setup required'; m.detail = 'Finish Apple Health access in the iPhone app.'; m.tone = 'warn'; break;
    case 'waiting': m.label = 'Waiting for first reading'; m.detail = 'Connected. Keep the iPhone app open until the first beat arrives.'; m.tone = 'warn'; break;
    case 'disconnected_phone': m.label = 'Disconnected'; m.detail = 'Lost the link to your iPhone. Time in zone is paused as unmeasured.'; m.tone = 'warn'; break;
    case 'disconnected_watch': m.label = 'Disconnected'; m.detail = 'iPhone is connected, but it has lost the Watch. Check the Watch is on your wrist.'; m.tone = 'warn'; break;
    case 'reconnecting': m.label = 'Reconnecting…'; m.detail = 'Trying to reach your iPhone. Last reading shown below.'; m.tone = 'warn'; m.showBpm = f !== 'none' && f !== 'unavailable'; break;
    case 'live': case 'delayed':
      if (f === 'live') { m.label = l?.paused ? 'Paused' : 'Live'; m.tone = l?.paused ? 'off' : 'live'; m.showBpm = true; m.detail = l?.paused ? 'Heart rate still updates, but time in zone is not counting.' : `Updated ${m.ageSec}s ago`; }
      else if (f === 'delayed') { m.label = 'Delayed'; m.tone = 'warn'; m.showBpm = true; m.detail = `Last reading ${m.ageSec}s ago. Counting as unmeasured until it catches up.`; }
      else if (f === 'unavailable') { m.label = 'No recent reading'; m.tone = 'warn'; m.showBpm = false; m.detail = m.ageSec != null ? `Last reading ${fmtDur(m.ageSec * 1000)} ago. Time is being recorded as unmeasured.` : 'No readings yet.'; }
      else { m.label = 'Waiting for first reading'; m.tone = 'warn'; }
      break;
  }
  if (m.showBpm && m.freshness === 'live' && m.zonesReady) { m.zone = zoneFor(user, s.bpm); m.bounds = zoneBounds(user, m.zone); }
  if (l?.paused && m.label !== 'Paused' && m.label !== 'Live data off') { m.detail = `${m.label}. Paused — nothing is being counted right now.`; m.label = 'Paused'; m.tone = 'off'; }
  return m;
}
/* Called each second by the app loop. Simulates the companion feed and advances the engine. */
export function tick() {
  const t = now(); const s = state.sensor; let changed = false;
  // Sensor simulation
  if (s.mode === 'live') {
    if (!s.lastReadingAt || t - s.lastReadingAt >= 2500 + Math.random() * 1500) {
      const l = state.live; const target = !l ? 92 : l.paused ? 100 : l.rest ? 112 : 138;
      s.target = target; const cur = s.bpm ?? target - 10;
      s.bpm = Math.round(cur + (target - cur) * 0.18 + (Math.random() * 6 - 3)); s.lastReadingAt = t; changed = true;
    }
  } else if (s.mode === 'waiting' && t - (s.modeSince || 0) > 6000) { s.mode = 'live'; changed = true; }
  else if (s.mode === 'reconnecting' && t - (s.modeSince || 0) > 8000) { s.mode = 'live'; s.lastReadingAt = t; s.bpm = s.bpm ?? 110; changed = true; }
  // Engine
  const l = state.live;
  if (l && !l.paused) {
    const dt = Math.min(5000, t - l.lastTickAt); l.lastTickAt = t; l.activeMs += dt;
    const u = userById(l.userId); const f = freshness();
    const z = (l.liveData && f === 'live' && s.mode === 'live') ? zoneFor(u, s.bpm) : null;
    if (z) l.zoneMs[z] += dt; else l.unknownMs += dt;
    if (l.currentZone !== z) { l.currentZone = z; l.zoneEnteredAt = t; }
    if (l.rest && t >= l.rest.endsAt) l.rest = null;
    changed = true;
  }
  // TV auto-lock after 15 min outside workout mode
  const tv = state.devices.tv;
  if (tv.session && !state.live && t - tv.lastActivityAt > 15 * 60000) { lockDevice('tv'); changed = true; }
  // Pairing expiry
  const p = tv.pairing; if (p && p.status === 'awaiting' && t > p.expiresAt) { p.status = 'expired'; changed = true; }
  if (changed) save();
  return changed;
}
export function timeInCurrentZone() { const l = state.live; if (!l || l.currentZone == null) return 0; return l.zoneMs[l.currentZone]; }
export function toast(msg, ms = 2600) { update(s => { s.toast = { msg, until: now() + ms }; }, 'toast'); setTimeout(() => { if (state.toast && now() >= state.toast.until - 50) update(s => { s.toast = null; }, 'toast'); }, ms); }
export const live_ = () => state.live;
export const monthKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
