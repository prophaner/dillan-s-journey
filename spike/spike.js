/* Dillan H10 hardware spike. Plain browser JavaScript, no build step.
   Modes (by URL hash): #home, #relay, #tv, #results. See CHECKLIST.md. */
(function () {
  'use strict';

  // ---------- shared helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  var cfg = window.SPIKE_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey &&
    cfg.supabaseUrl.indexOf('YOUR-PROJECT') === -1 && cfg.supabaseAnonKey.indexOf('YOUR-') === -1);
  var sb = null;
  if (configured && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }

  function uid(prefix) {
    var a = new Uint8Array(6);
    (window.crypto || window.msCrypto).getRandomValues(a);
    var s = '';
    for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return prefix + s;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtClock(ms) {
    if (ms == null || !isFinite(ms)) return '-';
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }
  function fmtSec(ms) { return ms == null || !isFinite(ms) ? '-' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s'; }
  function pct(arr, p) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
    return s[idx];
  }
  function median(arr) { return pct(arr, 50); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function guessDevice() {
    var ua = navigator.userAgent;
    var os = /Android/.test(ua) ? 'Android' : /CrOS/.test(ua) ? 'ChromeOS' : /Windows/.test(ua) ? 'Windows' :
      /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
    var br = /Silk/.test(ua) ? 'Silk' : /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' :
      /Chrome\//.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
    return os + ' ' + br;
  }

  // Server clock: offset = server - local midpoint, from the lowest-RTT calls.
  var clock = { offsetMs: null, rttMs: null };
  function serverNow() { return Date.now() + (clock.offsetMs || 0); }
  function estimateOffset(n) {
    if (!sb) return Promise.reject(new Error('no backend'));
    var results = [];
    function once() {
      var t0 = Date.now();
      return sb.rpc('spike_server_time').then(function (r) {
        var t1 = Date.now();
        if (r.error || !r.data) return; // one bad call doesn't sink the estimate
        results.push({ off: new Date(r.data).getTime() - (t0 + t1) / 2, rtt: t1 - t0 });
      }, function () { /* network error on one call */ });
    }
    var chain = Promise.resolve();
    for (var i = 0; i < (n || 3); i++) chain = chain.then(once);
    return chain.then(function () {
      if (!results.length) throw new Error('spike_server_time failed (check schema.sql and config.js)');
      results.sort(function (a, b) { return a.rtt - b.rtt; });
      var best = results.slice(0, Math.max(1, Math.ceil(results.length / 2)));
      clock.offsetMs = median(best.map(function (x) { return x.off; }));
      clock.rttMs = median(best.map(function (x) { return x.rtt; }));
      return clock.offsetMs;
    });
  }

  // Event uploader shared by relay and TV (batched, bounded, idempotent, never blocks the page).
  function makeEventSink(source, getRunId, getDevice) {
    var queue = [];
    var all = [];
    var flushing = false;
    function push(kind, detail) {
      var ev = { event_id: uid('e-'), run_id: getRunId(), source: source, device: getDevice(), client_at: new Date(serverNow()).toISOString(), kind: kind, detail: detail || {} };
      all.push(ev);
      if (all.length > 5000) all.shift();
      queue.push(ev);
      if (queue.length > 500) queue.shift();
      return ev;
    }
    function flush() {
      if (!sb || flushing || !queue.length) return;
      flushing = true;
      var batch = queue.splice(0, 50);
      // event_id makes a retried batch idempotent
      sb.from('spike_events').upsert(batch, { onConflict: 'event_id', ignoreDuplicates: true }).then(function (r) {
        flushing = false;
        if (r.error) { queue = batch.concat(queue); }
      }, function () { flushing = false; queue = batch.concat(queue); });
    }
    setInterval(flush, 2000);
    return { push: push, flush: flush, all: all, pending: function () { return queue.length; } };
  }

  // Detects the page being frozen or the device sleeping: a 1 s timer that fires late.
  function startSuspendDetector(onSuspend) {
    var last = Date.now();
    setInterval(function () {
      var now = Date.now();
      var late = now - last - 1000;
      if (late > 3000) onSuspend(late, document.visibilityState);
      last = now;
    }, 1000);
  }

  // Wake lock that re-acquires when the page becomes visible again.
  function makeWakeLock(onChange) {
    var sentinel = null;
    var wanted = false;
    var pending = false;
    function request() {
      if (!wanted || sentinel || pending) return;
      if (!('wakeLock' in navigator)) { onChange('unsupported'); return; }
      if (document.visibilityState !== 'visible') return;
      pending = true;
      navigator.wakeLock.request('screen').then(function (s) {
        pending = false;
        sentinel = s;
        onChange('on');
        s.addEventListener('release', function () { sentinel = null; onChange(wanted ? 'released' : 'off'); });
      }, function (e) { pending = false; onChange('failed: ' + (e && e.name)); });
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') request(); });
    return {
      set: function (on) {
        wanted = on;
        if (on) request();
        if (!on && sentinel) { var s = sentinel; sentinel = null; s.release(); onChange('off'); }
      },
      retry: request,
      isOn: function () { return !!sentinel; },
    };
  }

  // ---------- Heart Rate Measurement (0x2A37) parser ----------
  // flags bit0 uint16 HR, bit1 contact detected, bit2 contact supported, bit3 energy expended, bit4 RR present
  function parseHr(dv) {
    var flags = dv.getUint8(0);
    var o = 1;
    var u16 = (flags & 0x01) !== 0;
    var bpmRaw = u16 ? dv.getUint16(o, true) : dv.getUint8(o);
    o += u16 ? 2 : 1;
    var contactSupported = (flags & 0x04) !== 0;
    var contact = contactSupported ? (flags & 0x02) !== 0 : null;
    if (flags & 0x08) o += 2;
    var rr = [];
    if (flags & 0x10) {
      for (; o + 1 < dv.byteLength; o += 2) rr.push(Math.round(dv.getUint16(o, true) * 1000 / 1024));
    }
    var bpm = (contact === false || bpmRaw < 25 || bpmRaw > 250) ? null : bpmRaw;
    return { flags: flags, bpmRaw: bpmRaw, bpm: bpm, contact: contact, rr: rr };
  }

  // ---------- routing ----------
  var started = {};
  function show(mode) {
    ['home', 'relay', 'tv', 'results'].forEach(function (m) { $(m).classList.toggle('hidden', m !== mode); });
    document.body.classList.toggle('tv', mode === 'tv');
    $('config-missing').classList.toggle('hidden', configured || mode === 'home');
    if (!started[mode]) {
      started[mode] = true;
      if (mode === 'relay') startRelay();
      if (mode === 'tv') startTv();
      if (mode === 'results') startResults();
      if (mode === 'home') startHome();
    }
  }
  function route() {
    var m = (location.hash || '#home').slice(1);
    show(['relay', 'tv', 'results'].indexOf(m) >= 0 ? m : 'home');
  }
  window.addEventListener('hashchange', route);

  // ---------- HOME ----------
  function startHome() {
    var btns = Array.prototype.slice.call(document.querySelectorAll('#home [data-go]'));
    btns.forEach(function (b) { b.addEventListener('click', function () { location.hash = '#' + b.getAttribute('data-go'); }); });
    if (btns[0]) btns[0].focus();
    document.addEventListener('keydown', function (e) {
      if ($('home').classList.contains('hidden')) return;
      var i = btns.indexOf(document.activeElement);
      if (e.keyCode === 40 || e.keyCode === 39) { btns[(i + 1 + btns.length) % btns.length].focus(); e.preventDefault(); }
      if (e.keyCode === 38 || e.keyCode === 37) { btns[(i - 1 + btns.length) % btns.length].focus(); e.preventDefault(); }
    });
  }

  // ---------- RELAY ----------
  function startRelay() {
    var runId = lsGet('spike.runId', null);
    var runStarted = Number(lsGet('spike.runStarted', '0'));
    if (!runId || Date.now() - runStarted > 6 * 3600 * 1000) {
      var d = new Date();
      runId = 'run-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
      lsSet('spike.runId', runId);
      lsSet('spike.runStarted', String(Date.now()));
    }
    var streamId = uid('s-');
    var label = lsGet('spike.label', guessDevice());
    $('r-run').textContent = runId;
    $('r-stream').textContent = streamId;
    $('r-label').value = label;
    $('r-label').addEventListener('change', function () { label = $('r-label').value.trim() || guessDevice(); lsSet('spike.label', label); ev('label', { label: label }); });

    var logLines = [];
    var events = makeEventSink('relay', function () { return runId; }, function () { return label; });
    function ev(kind, detail, quiet) {
      events.push(kind, detail);
      if (quiet) return;
      var line = new Date().toLocaleTimeString() + '  ' + kind + (detail && Object.keys(detail).length ? '  ' + JSON.stringify(detail) : '');
      logLines.push(line);
      if (logLines.length > 300) logLines.shift();
      $('r-log').textContent = logLines.slice().reverse().join('\n');
    }

    var st = {
      device: null, char: null, demoTimer: null, demo: false,
      seq: 0, sent: 0, failed: 0, skipped: 0, queue: [], flushing: false,
      lastSource: null, // 'ble' | 'demo': a source switch starts a new stream so Results never mixes them
      lastBeatLocal: null, lastContactFalseLocal: null, lastContact: null, longestGap: 0,
      beats: [],
      attemptId: 0,          // every connect / reconnect attempt gets a token; stale continuations stop
      reconnecting: false, reconnectAttempt: 0, reconnectTimer: null,
      manualDisconnect: false, selfDisconnect: false,
      timing: null, connectTiming: null, sensorName: null, fw: null, battery: null,
    };

    function newStream(reason) {
      streamId = uid('s-');
      st.seq = 0;
      $('r-stream').textContent = streamId;
      ev('new_stream', { streamId: streamId, reason: reason });
    }
    function useSource(src) {
      if (st.lastSource && st.lastSource !== src) newStream('source ' + st.lastSource + ' -> ' + src);
      st.lastSource = src;
    }

    // environment / support
    var env = {
      userAgent: navigator.userAgent, secureContext: window.isSecureContext, inIframe: window.top !== window,
      bluetoothApi: 'bluetooth' in navigator, wakeLockApi: 'wakeLock' in navigator,
      getDevices: !!(navigator.bluetooth && navigator.bluetooth.getDevices),
      onLine: navigator.onLine, viewport: window.innerWidth + 'x' + window.innerHeight, dpr: window.devicePixelRatio,
    };
    function renderEnv(extra) {
      if (extra) Object.keys(extra).forEach(function (k) { env[k] = extra[k]; });
      $('r-env').innerHTML = Object.keys(env).map(function (k) { return '<div><b>' + esc(k) + ':</b> ' + esc(env[k]) + '</div>'; }).join('');
    }
    renderEnv();
    var supportMsg = null;
    if (!env.secureContext) supportMsg = 'This page is not on HTTPS (or localhost), so Bluetooth is unavailable. Open the published https:// address.';
    else if (!env.bluetoothApi) supportMsg = /iPhone|iPad|iPod/.test(navigator.userAgent)
      ? 'iPhones can’t relay heart rate from a web page. Use Chrome on Android, or Chrome/Edge on a computer.'
      : 'This browser can’t connect to Bluetooth sensors. Use Chrome on Android, or Chrome/Edge on a computer.';
    else if (env.inIframe) supportMsg = 'This page is inside a frame (for example the Lovable preview). Bluetooth is usually blocked there. Open the address in its own tab.';
    function showSupport(msg) { $('r-support').textContent = msg; $('r-support').classList.remove('hidden'); }
    if (navigator.bluetooth && navigator.bluetooth.getAvailability) {
      navigator.bluetooth.getAvailability().then(function (ok) {
        renderEnv({ bluetoothAvailable: ok });
        if (!ok) showSupport('Bluetooth reports unavailable: it is off, missing, or blocked by policy. Turn Bluetooth on and reload.');
      }, function (e) { renderEnv({ bluetoothAvailable: 'error ' + (e && e.name) }); });
    }
    if (supportMsg) showSupport(supportMsg);
    ev('page_load', env);

    function isConnected() { return !!(st.device && st.device.gatt && st.device.gatt.connected); }
    function isActive() { return st.demo || isConnected() || st.reconnecting; }

    function setButtons() {
      var canBle = !!navigator.bluetooth && (!supportMsg || env.inIframe); // allow trying in an iframe so the failure is recorded
      var connected = isConnected();
      $('r-connect').disabled = !canBle || connected || st.demo;
      $('r-connect-all').disabled = !canBle || connected || st.demo;
      $('r-reconnect').disabled = !st.device || connected || st.demo;
      $('r-disconnect').disabled = !(connected || st.demo || st.reconnecting);
      $('r-demo').disabled = !st.demo && (connected || st.reconnecting || !sb || clock.offsetMs == null);
      $('r-demo').textContent = st.demo ? 'Stop simulation' : 'Simulate strap (DEMO)';
    }

    // clock: Bluetooth tests don't wait for it; uploads do
    function refreshOffset() {
      return estimateOffset(5).then(function (off) {
        $('r-offset').textContent = (off >= 0 ? '+' : '') + Math.round(off) + ' ms (rtt ' + Math.round(clock.rttMs) + ' ms)';
        ev('clock_offset', { offsetMs: Math.round(off), rttMs: Math.round(clock.rttMs) }, true);
        setButtons();
      }, function (e) {
        $('r-offset').textContent = clock.offsetMs == null ? 'failed, retrying' : $('r-offset').textContent;
        ev('clock_offset_failed', { error: String(e && (e.message || e)) });
        if (clock.offsetMs == null) setTimeout(refreshOffset, 5000);
      });
    }
    setButtons();
    if (sb) {
      refreshOffset();
      setInterval(refreshOffset, 60000);
    } else {
      ev('no_backend', { note: 'config.js not filled; Bluetooth tests work, samples will not upload' });
    }

    var wake = makeWakeLock(function (s) { $('r-wakestate').textContent = s; ev('wake_lock', { state: s }); });
    $('r-wake').addEventListener('change', function () { wake.set($('r-wake').checked && isActive()); });

    // lifecycle logging (test 5)
    document.addEventListener('visibilitychange', function () { ev('visibility', { state: document.visibilityState }); });
    window.addEventListener('pagehide', function (e) { ev('pagehide', { persisted: e.persisted }); events.flush(); });
    document.addEventListener('freeze', function () { ev('freeze', {}); });
    document.addEventListener('resume', function () { ev('resume', {}); });
    window.addEventListener('online', function () { ev('online', {}); });
    window.addEventListener('offline', function () { ev('offline', {}); });
    startSuspendDetector(function (late, vis) { ev('suspended', { lateMs: late, visibility: vis }); });
    window.addEventListener('beforeunload', function (e) {
      if (isActive()) { e.preventDefault(); e.returnValue = 'Leaving stops heart rate on the TV.'; }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-mark]'), function (b) {
      b.addEventListener('click', function () { ev('marker', { what: b.getAttribute('data-mark'), sinceLastBeatMs: st.lastBeatLocal ? Date.now() - st.lastBeatLocal : null }); });
    });

    // ---- samples ----
    function onSample(p, isDemo) {
      var now = Date.now();
      if (st.lastBeatLocal) {
        var gap = now - st.lastBeatLocal;
        if (gap > st.longestGap) st.longestGap = gap;
        if (gap > 2500) ev('gap', { ms: gap, visibility: document.visibilityState });
      } else {
        var t = st.timing;
        ev('first_beat', { bpm: p.bpm, contact: p.contact, flags: p.flags, msSinceAttemptStart: t ? now - t.t0 : null, demo: !!isDemo });
        if (t && !t.firstBeat) { t.firstBeat = now; renderTiming(); }
      }
      st.lastBeatLocal = now;
      st.beats.push(now);
      while (st.beats.length && now - st.beats[0] > 60000) st.beats.shift();
      if (p.contact !== st.lastContact) {
        ev('contact', { contact: p.contact, bpmRaw: p.bpmRaw });
        st.lastContactFalseLocal = p.contact === false ? now : null;
        st.lastContact = p.contact;
      }
      $('r-bpm').textContent = p.bpm == null ? '--' : p.bpm;
      $('r-contact').textContent = p.contact == null ? 'contact: not reported' : (p.contact ? 'contact ✓' : 'contact ✗');
      $('r-contact').className = 'pill ' + (p.contact === false ? 'warn' : 'live');
      if (!sb) { setState(p.contact === false ? 'No skin contact' : 'Reading (no backend)', p.contact === false ? 'warn' : 'live'); return; }
      if (clock.offsetMs == null) { st.skipped++; setState('Clock not synced yet: not uploading', 'warn'); return; }
      setState(p.contact === false ? 'No skin contact' : (isDemo ? 'DEMO sending' : 'Sending'), p.contact === false ? 'warn' : 'live');
      st.queue.push({
        run_id: runId, stream_id: streamId, seq: ++st.seq, device_label: label,
        measured_at: new Date(now + clock.offsetMs).toISOString(),
        bpm: p.bpm, contact: p.contact, rr_ms: p.rr && p.rr.length ? p.rr : null, is_demo: !!isDemo,
      });
      if (st.queue.length > 600) { st.queue.shift(); st.failed++; }
    }
    function flushSamples() {
      if (!sb || st.flushing || !st.queue.length) return;
      st.flushing = true;
      var batch = st.queue.slice(0, 30);
      sb.from('spike_hr').upsert(batch, { onConflict: 'stream_id,seq', ignoreDuplicates: true }).then(function (r) {
        st.flushing = false;
        if (r.error) { st.failed++; ev('upload_error', { error: r.error.message, code: r.error.code }); return; }
        st.queue.splice(0, batch.length);
        st.sent += batch.length;
      }, function (e) { st.flushing = false; st.failed++; ev('upload_error', { error: String(e && e.message) }); });
    }
    setInterval(flushSamples, 1000);

    setInterval(function () {
      var now = Date.now();
      var recent = st.beats.filter(function (t) { return now - t <= 30000; });
      $('r-rate').textContent = recent.length ? (recent.length / 30).toFixed(2) : '-';
      $('r-since').textContent = st.lastBeatLocal ? fmtSec(now - st.lastBeatLocal) : '-';
      $('r-gap').textContent = st.longestGap ? fmtSec(st.longestGap) : '-';
      $('r-sent').textContent = st.sent + ' / ' + st.queue.length + ' / ' + st.failed + (st.skipped ? ' (+' + st.skipped + ' unsynced)' : '');
    }, 500);

    function setState(text, kind) { $('r-state').textContent = text; $('r-state').className = 'pill ' + (kind || 'off'); }
    function renderTiming() {
      var t = st.timing;
      if (!t) return;
      function d(a) { return a ? (a - t.t0) + ' ms' : '-'; }
      $('r-timing').innerHTML =
        (t.auto ? '<div class="muted">Auto-reconnect attempt</div>' : '') +
        '<div>Chooser closed (device picked): ' + (t.auto ? 'n/a' : d(t.picked)) + '</div>' +
        '<div>GATT connected: ' + d(t.gatt) + '</div>' +
        '<div>Heart rate service found: ' + d(t.service) + '</div>' +
        '<div>Notifications started: ' + d(t.notify) + '</div>' +
        '<div>First beat: ' + d(t.firstBeat) + '</div>' +
        (t.error ? '<div class="bad">Error: ' + esc(t.error) + '</div>' : '');
    }

    // ---- Bluetooth ----
    function onHrChanged(e) { onSample(parseHr(e.target.value), false); }

    function cancelAuto() {
      clearTimeout(st.reconnectTimer);
      st.reconnectTimer = null;
      st.reconnecting = false;
    }
    // Disconnect that we caused ourselves (failed attempt cleanup): must not look like a link drop.
    function selfDisconnect() {
      if (!st.device) return;
      st.selfDisconnect = true;
      try { st.device.gatt.disconnect(); } catch (x) { /* ignore */ }
      setTimeout(function () { st.selfDisconnect = false; }, 1000);
    }
    function withTimeout(promise, ms, label) {
      var timer;
      var to = new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error(label + ' timeout (' + ms / 1000 + ' s)')); }, ms); });
      return Promise.race([promise, to]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
    }

    function onDisconnected() {
      if (st.selfDisconnect) { st.selfDisconnect = false; st.char = null; setButtons(); return; }
      var now = Date.now();
      ev('gatt_disconnected', {
        manual: st.manualDisconnect,
        msSinceLastBeat: st.lastBeatLocal ? now - st.lastBeatLocal : null,
        msSinceContactFalse: st.lastContactFalseLocal ? now - st.lastContactFalseLocal : null,
        visibility: document.visibilityState,
      });
      st.char = null;
      $('r-bpm').textContent = '--';
      if (st.manualDisconnect || !$('r-auto').checked) {
        setState(st.manualDisconnect ? 'Disconnected (strap kept for Reconnect)' : 'Strap lost', st.manualDisconnect ? 'off' : 'warn');
        wake.set(false);
      } else {
        setState('Strap lost — reconnecting…', 'warn');
        autoReconnect(); // keeps the wake lock so the screen stays on during test 3
      }
      setButtons();
    }

    // Runs connect -> service -> characteristic -> notifications for one attempt token.
    function setupGatt(device, isReconnect, myAttempt, t) {
      function live() { if (myAttempt !== st.attemptId) throw new Error('stale attempt'); }
      var server;
      return device.gatt.connect().then(function (s) {
        live(); server = s;
        if (t) { t.gatt = Date.now(); renderTiming(); }
        return server.getPrimaryService('heart_rate');
      }).then(function (svc) {
        live();
        if (t) { t.service = Date.now(); renderTiming(); }
        return svc.getCharacteristic('heart_rate_measurement');
      }).then(function (ch) {
        live();
        if (st.char) st.char.removeEventListener('characteristicvaluechanged', onHrChanged);
        ch.removeEventListener('characteristicvaluechanged', onHrChanged);
        ch.addEventListener('characteristicvaluechanged', onHrChanged);
        st.char = ch;
        return ch.startNotifications();
      }).then(function () {
        live();
        if (t) { t.notify = Date.now(); renderTiming(); }
        useSource('ble');
        st.lastBeatLocal = null;       // next beat is logged as first_beat for this connection
        st.lastContact = null;         // contact state restarts with the connection
        st.lastContactFalseLocal = null;
        setState('Waiting for first beat', 'off');
        ev(isReconnect ? 'reconnected' : 'connected', { name: device.name, id: device.id, auto: !!(t && t.auto) });
        wake.set($('r-wake').checked);
        setButtons();
        // optional reads, never fatal
        server.getPrimaryService('battery_service').then(function (s) { return s.getCharacteristic('battery_level'); })
          .then(function (c) { return c.readValue(); })
          .then(function (v) { st.battery = v.getUint8(0); $('r-battery').textContent = 'Battery ' + st.battery + '%'; ev('battery', { pct: st.battery }); })
          .catch(function (e) { $('r-battery').textContent = 'Battery: not readable'; ev('battery_unreadable', { error: e && e.name }); });
        if (!st.fw) {
          server.getPrimaryService('device_information').then(function (s) { return s.getCharacteristic('firmware_revision_string'); })
            .then(function (c) { return c.readValue(); })
            .then(function (v) { st.fw = new TextDecoder().decode(v).replace(/\0+$/, ''); $('r-fw').textContent = 'Firmware ' + st.fw; ev('firmware', { version: st.fw }); })
            .catch(function (e) { $('r-fw').textContent = 'Firmware: read it in Polar Flow'; ev('firmware_unreadable', { error: e && e.name }); });
        }
      });
    }

    function failAttempt(t, e, kind) {
      if (e && e.message === 'stale attempt') return true;
      st.attemptId++;                  // anything still pending from this attempt is now stale
      selfDisconnect();                // aborts a pending connect, never counted as a link drop
      if (t) { t.error = (e && e.name) + ': ' + (e && e.message); renderTiming(); }
      ev(kind, { name: e && e.name, message: e && e.message });
      return false;
    }

    function connect(showAll) {
      cancelAuto();
      st.manualDisconnect = false;
      var myAttempt = ++st.attemptId;
      var t = st.timing = st.connectTiming = { t0: Date.now() };
      renderTiming();
      setState('Choose your strap…', 'off');
      var opts = showAll
        ? { acceptAllDevices: true, optionalServices: ['heart_rate', 'battery_service', 'device_information'] }
        : { filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service', 'device_information'] };
      ev('connect_start', { showAll: !!showAll });
      // requestDevice must run synchronously inside the click handler (user gesture).
      var req;
      try { req = navigator.bluetooth.requestDevice(opts); } catch (e) { req = Promise.reject(e); }
      req.then(function (device) {
        t.picked = Date.now(); renderTiming();
        if (st.device && st.device !== device) st.device.removeEventListener('gattserverdisconnected', onDisconnected);
        st.device = device;
        st.sensorName = device.name || '(no name)';
        $('r-sensor').textContent = st.sensorName;
        var m = /^Polar H10 ([0-9A-F]{8})$/i.exec(device.name || '');
        ev('picked', { name: device.name, serial: m ? m[1] : null, looksLikeH10: !!m });
        device.removeEventListener('gattserverdisconnected', onDisconnected);
        device.addEventListener('gattserverdisconnected', onDisconnected);
        setState('Connecting… accept any pairing prompt', 'off');
        // 45 s leaves time to read and accept an OS pairing prompt (H10 firmware 4.x)
        return withTimeout(setupGatt(device, false, myAttempt, t), 45000, 'connect');
      }).catch(function (e) {
        if (e && e.name === 'NotFoundError') { // chooser cancelled or nothing found
          t.error = e.name + ': ' + e.message; renderTiming();
          setState('No strap picked', 'off');
          ev('connect_failed', { name: e.name, message: e.message });
        } else if (!failAttempt(t, e, 'connect_failed')) {
          setState('Connect failed', 'warn');
        }
        setButtons();
      });
    }

    function autoReconnect() {
      if (st.reconnecting || !st.device) return;
      st.reconnecting = true;
      st.reconnectAttempt = 0;
      function attempt() {
        st.reconnectTimer = null;
        if (!st.reconnecting) return;
        if (st.manualDisconnect || !st.device) { st.reconnecting = false; wake.set(false); setButtons(); return; }
        if (isConnected() && st.char) { st.reconnecting = false; setButtons(); return; }
        st.reconnectAttempt++;
        setState('Strap lost — reconnecting (attempt ' + st.reconnectAttempt + ')', 'warn');
        var myAttempt = ++st.attemptId;
        var t = st.timing = { t0: Date.now(), auto: true };
        withTimeout(setupGatt(st.device, true, myAttempt, t), 20000, 'reconnect').then(function () {
          st.reconnecting = false;
          ev('auto_reconnect_ok', { attempt: st.reconnectAttempt, ms: Date.now() - t.t0, gestureUsed: false });
          setButtons();
        }, function (e) {
          if (failAttempt(t, e, 'auto_reconnect_failed')) return;
          if (!st.reconnecting) return;
          if (st.reconnectAttempt >= 12) {
            st.reconnecting = false;
            wake.set(false);
            setState('Strap lost. Tap Reconnect.', 'warn');
            setButtons();
            return;
          }
          st.reconnectTimer = setTimeout(attempt, Math.min(10000, 1000 * Math.pow(2, st.reconnectAttempt - 1)));
        });
      }
      setButtons();
      attempt();
    }

    $('r-connect').addEventListener('click', function () { connect(false); });
    $('r-connect-all').addEventListener('click', function () { connect(true); });
    $('r-reconnect').addEventListener('click', function () {
      if (!st.device) return;
      cancelAuto();
      st.manualDisconnect = false;
      var myAttempt = ++st.attemptId;
      var t = st.timing = { t0: Date.now() };
      ev('manual_reconnect_start', {});
      setState('Reconnecting…', 'off');
      withTimeout(setupGatt(st.device, true, myAttempt, t), 20000, 'reconnect').then(function () {
        ev('manual_reconnect_ok', { ms: Date.now() - t.t0, chooserShown: false });
      }, function (e) {
        if (failAttempt(t, e, 'manual_reconnect_failed')) return;
        setState('Reconnect failed', 'warn');
        setButtons();
      });
    });
    $('r-disconnect').addEventListener('click', function () {
      if (st.demo) { stopDemo(); return; }
      cancelAuto();
      st.attemptId++;
      st.manualDisconnect = true;
      ev('manual_disconnect', {});
      if (isConnected()) {
        try { st.device.gatt.disconnect(); } catch (e) { /* ignore */ }
      } else {
        setState('Disconnected (strap kept for Reconnect)', 'off');
        wake.set(false);
      }
      setButtons();
    });

    // ---- demo (simulated strap, always labelled DEMO, stored with is_demo = true, own stream) ----
    function stopDemo() {
      clearInterval(st.demoTimer);
      st.demo = false;
      $('r-demo-pill').classList.add('hidden');
      setState('Simulation stopped', 'off');
      $('r-bpm').textContent = '--';
      wake.set(false);
      ev('demo_stop', {});
      setButtons();
    }
    $('r-demo').addEventListener('click', function () {
      if (st.demo) { stopDemo(); return; }
      useSource('demo');
      st.demo = true;
      st.lastBeatLocal = null;
      st.timing = null;
      $('r-demo-pill').classList.remove('hidden');
      ev('demo_start', {});
      var n = 0;
      st.demoTimer = setInterval(function () {
        n++;
        var bpm = Math.round(118 + 28 * Math.sin(n / 40) + (n % 7) - 3);
        onSample({ flags: 0x16, bpmRaw: bpm, bpm: bpm, contact: true, rr: [Math.round(60000 / bpm)] }, true);
      }, 1000);
      wake.set($('r-wake').checked);
      setButtons();
    });

    // ---- export ----
    function summary() {
      return {
        runId: runId, streamId: streamId, device: label, sensor: st.sensorName, firmware: st.fw, battery: st.battery,
        connectTiming: st.connectTiming, lastTiming: st.timing, sent: st.sent, failed: st.failed, unsyncedSkipped: st.skipped,
        queued: st.queue.length, longestGapMs: st.longestGap, clockOffsetMs: clock.offsetMs, env: env,
      };
    }
    $('r-download').addEventListener('click', function () {
      download('dillan-spike-relay-' + runId + '.json', JSON.stringify({ summary: summary(), events: events.all }, null, 2));
    });
    $('r-copy').addEventListener('click', function () {
      var text = JSON.stringify(summary(), null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { ev('copied', {}); }, function () { download('summary.json', text); });
      else download('summary.json', text);
    });
  }

  // ---------- TV ----------
  function startTv() {
    var tvId = uid('tv-');
    var device = guessDevice() + ' ' + (window.screen ? screen.width + 'x' + screen.height : '');
    var currentRun = 'tv-only';
    var events = makeEventSink('tv', function () { return currentRun; }, function () { return device + ' ' + tvId; });
    var latencies = [];    // real samples only: {at, lat, upload, rt}
    var demoN = 0;
    var lastMeasured = {}; // per stream, real samples
    var gaps = [];         // real gaps > 10 s: {at, ms}
    var outageGaps = 0;    // gaps that overlap a TV-side outage (Wi-Fi off, Realtime down): not a test 4 failure
    var outages = [];      // {from, to} in server time
    var outageFrom = null;
    var last = null;       // newest row of any kind (drives the big number)
    var lastReal = null;   // newest real row (drives the open gap)
    var backPop = 0, backKey = 0;
    var lastKeyAt = Date.now();
    var suspCount = 0;
    var rtState = 'connecting';
    var rtJoins = 0;
    var keys = [];

    var env = {
      ua: navigator.userAgent, secure: window.isSecureContext, bluetoothApi: 'bluetooth' in navigator,
      wakeLockApi: 'wakeLock' in navigator, viewport: window.innerWidth + 'x' + window.innerHeight,
      dpr: window.devicePixelRatio, screen: window.screen ? screen.width + 'x' + screen.height : '?',
    };
    $('t-env').innerHTML =
      '<div>bluetooth in navigator: <b>' + env.bluetoothApi + '</b> · wakeLock in navigator: <b>' + env.wakeLockApi + '</b> · HTTPS: <b>' + env.secure + '</b></div>' +
      '<div>Viewport ' + esc(env.viewport) + ' · DPR ' + esc(env.dpr) + ' · screen ' + esc(env.screen) + '</div>' +
      '<div class="tiny" style="word-break:break-all">' + esc(env.ua) + '</div>';
    events.push('tv_load', env);

    function renderBack() { $('t-back').textContent = 'pop ' + backPop + ' · key ' + backKey; }
    function outageStart(why) { if (outageFrom == null) { outageFrom = serverNow(); events.push('tv_outage_start', { why: why }); } }
    function outageEnd() { if (outageFrom != null) { outages.push({ from: outageFrom, to: serverNow() }); events.push('tv_outage_end', { ms: serverNow() - outageFrom }); outageFrom = null; } }
    function overlapsOutage(a, b) {
      if (outageFrom != null && b >= outageFrom) return true;
      return outages.some(function (o) { return a <= o.to && b >= o.from; });
    }

    // Back: a history guard is the primary capture; keydown is the fallback. Counted separately.
    try { history.pushState({ spikeGuard: 1 }, ''); } catch (e) { /* ignore */ }
    window.addEventListener('popstate', function () {
      if ($('tv').classList.contains('hidden')) return;
      backPop++;
      renderBack();
      events.push('back', { via: 'popstate' });
      addKey('Back → popstate');
      try { history.pushState({ spikeGuard: 1 }, ''); } catch (e) { /* ignore */ }
    });
    function addKey(text) {
      keys.unshift(new Date().toLocaleTimeString() + '  ' + text);
      keys = keys.slice(0, 10);
      $('t-keys').innerHTML = keys.map(esc).join('<br>');
    }
    var wake = makeWakeLock(function (s) { $('t-wake').textContent = s; events.push('wake_lock', { state: s }); });
    wake.set(true);
    document.addEventListener('keydown', function (e) {
      if ($('tv').classList.contains('hidden')) return;
      lastKeyAt = Date.now();
      if (!wake.isOn()) wake.retry(); // some browsers only grant it after a user action
      var isBack = e.keyCode === 4 || e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 8;
      if (isBack) { backKey++; renderBack(); }
      addKey('keydown key=' + e.key + ' code=' + e.code + ' keyCode=' + e.keyCode + (isBack ? '  ← Back' : ''));
      events.push('key', { type: 'keydown', key: e.key, code: e.code, keyCode: e.keyCode, back: isBack });
      if ([37, 38, 39, 40, 13, 32].indexOf(e.keyCode) >= 0 || isBack) e.preventDefault();
    });

    startSuspendDetector(function (late, vis) {
      suspCount++;
      $('t-susp').textContent = suspCount + '× (last ' + fmtSec(late) + ')';
      events.push('suspended', { lateMs: late, visibility: vis });
    });
    document.addEventListener('visibilitychange', function () { events.push('visibility', { state: document.visibilityState }); });
    function net(on) { $('t-net').textContent = on ? 'online' : 'OFFLINE'; $('t-net').className = 'metric ' + (on ? 'good' : 'bad'); }
    net(navigator.onLine);
    window.addEventListener('online', function () { net(true); events.push('online', {}); estimateOffset(3).catch(function () {}); if (sb) resync(); });
    window.addEventListener('offline', function () { net(false); events.push('offline', {}); outageStart('offline'); });

    if (!sb) { $('t-rt').textContent = 'not configured'; return; }

    function onRow(row, viaResync) {
      var nowS = serverNow();
      var measured = new Date(row.measured_at).getTime();
      var received = new Date(row.received_at).getTime();
      currentRun = row.run_id || currentRun;
      if (!last || measured >= new Date(last.measured_at).getTime()) last = row;
      if (row.is_demo) { if (!viaResync) demoN++; return; }
      if (!lastReal || measured >= new Date(lastReal.measured_at).getTime()) lastReal = row;
      var prev = lastMeasured[row.stream_id];
      if (!viaResync) {
        latencies.push({ at: nowS, lat: nowS - measured, upload: received - measured, rt: nowS - received });
        if (prev != null && measured - prev > 10000) {
          if (overlapsOutage(prev, measured)) { outageGaps++; events.push('gap_during_tv_outage', { ms: measured - prev, stream: row.stream_id }); }
          else { gaps.push({ at: nowS, ms: measured - prev }); events.push('gap_over_10s', { ms: measured - prev, stream: row.stream_id }); }
        }
      }
      if (prev == null || measured > prev) lastMeasured[row.stream_id] = measured;
    }

    // Latest row on (re)subscribe so the screen is never blank after a reconnect.
    function resync() {
      return sb.from('spike_hr').select('*').order('measured_at', { ascending: false }).limit(1).then(function (r) {
        if (r.data && r.data[0]) onRow(r.data[0], true);
      }, function () { /* ignore */ });
    }

    // Realtime starts whatever the clock does; latency uses offset 0 until the clock succeeds.
    function tryClock() {
      estimateOffset(5).then(function () {
        events.push('clock_offset', { offsetMs: Math.round(clock.offsetMs), rttMs: Math.round(clock.rttMs) });
      }, function (e) {
        events.push('clock_offset_failed', { error: String(e && (e.message || e)) });
        if (clock.offsetMs == null) setTimeout(tryClock, 5000);
      });
    }
    tryClock();
    setInterval(function () { estimateOffset(3).catch(function () {}); }, 60000);
    resync();
    sb.channel('spike-hr-' + tvId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'spike_hr' }, function (payload) { onRow(payload.new, false); })
      .subscribe(function (status, err) {
        if (status === 'SUBSCRIBED') { rtJoins++; outageEnd(); if (rtJoins > 1) resync(); }
        else outageStart('realtime ' + status);
        rtState = status;
        $('t-rt').textContent = status === 'SUBSCRIBED' ? 'subscribed' + (rtJoins > 1 ? ' (rejoined ' + (rtJoins - 1) + '×)' : '') : status.toLowerCase();
        $('t-rt').className = 'metric ' + (status === 'SUBSCRIBED' ? 'good' : 'bad');
        events.push('realtime', { status: status, error: err ? String(err.message || err) : null });
      });

    function openGapMs(nowS) { return lastReal ? nowS - new Date(lastReal.measured_at).getTime() : 0; }

    setInterval(function () {
      var nowS = serverNow();
      $('t-idle').textContent = fmtClock(Date.now() - lastKeyAt);
      if (last) {
        var age = nowS - new Date(last.measured_at).getTime();
        var bpmEl = $('t-bpm');
        var statusEl = $('t-status');
        $('t-demo').classList.toggle('hidden', !last.is_demo);
        bpmEl.style.opacity = 1;
        if (age > 30000) {
          bpmEl.innerHTML = '--<small>BPM</small>'; statusEl.textContent = 'No recent reading'; statusEl.className = 'pill off';
        } else if (last.contact === false) {
          bpmEl.innerHTML = '--<small>BPM</small>'; statusEl.textContent = 'Check strap contact'; statusEl.className = 'pill warn';
        } else if (age <= 10000) {
          bpmEl.innerHTML = esc(last.bpm == null ? '--' : last.bpm) + '<small>BPM</small>';
          statusEl.textContent = last.is_demo ? 'Live · DEMO' : 'Live'; statusEl.className = 'pill live';
        } else {
          bpmEl.innerHTML = esc(last.bpm == null ? '--' : last.bpm) + '<small>BPM</small>'; bpmEl.style.opacity = 0.5;
          statusEl.textContent = 'Delayed'; statusEl.className = 'pill warn';
        }
        $('t-age').textContent = 'Reading ' + fmtSec(age) + ' old' + (last.bpm != null ? ' · last value ' + last.bpm : '');
        $('t-source').textContent = 'via ' + (last.device_label || '?') + ' · ' + last.run_id + (clock.offsetMs == null ? ' · clock not synced' : '');
      }
      while (latencies.length && nowS - latencies[0].at > 600000) latencies.shift();
      while (gaps.length && nowS - gaps[0].at > 600000) gaps.shift();
      var l = latencies.map(function (x) { return x.lat; });
      var p50 = pct(l, 50), p95 = pct(l, 95), mx = l.length ? Math.max.apply(null, l) : null;
      var open = openGapMs(nowS);
      $('t-p50').textContent = fmtSec(p50);
      $('t-p95').textContent = fmtSec(p95);
      $('t-max').textContent = fmtSec(mx);
      $('t-count').textContent = l.length;
      $('t-gaps').textContent = gaps.length + (outageGaps ? ' (+' + outageGaps + ' during TV outage)' : '');
      var longest = gaps.length ? Math.max.apply(null, gaps.map(function (g) { return g.ms; })) : 0;
      $('t-longest').textContent = longest || open > 10000 ? fmtSec(Math.max(longest, open > 10000 ? open : 0)) : '-';
      var v = $('t-verdict');
      if (l.length < 60) { v.textContent = 'Test 4: collecting real samples (' + l.length + '/60)' + (demoN && !l.length ? ' · ' + demoN + ' DEMO samples not counted' : ''); v.className = 'verdict'; }
      else if (open > 10000) { v.textContent = 'Test 4: FAIL so far (no data for ' + fmtSec(open) + ')'; v.className = 'verdict bad'; }
      else if (p95 <= 5000 && gaps.length === 0) { v.textContent = 'Test 4: PASS so far (p95 ' + fmtSec(p95) + ', no gaps)'; v.className = 'verdict good'; }
      else { v.textContent = 'Test 4: FAIL so far (p95 ' + fmtSec(p95) + ', ' + gaps.length + ' gap(s) > 10 s)'; v.className = 'verdict bad'; }
    }, 250);

    setInterval(function () {
      var l = latencies.map(function (x) { return x.lat; });
      if (!l.length && !demoN) return;
      events.push('tv_stats', {
        n: l.length, demoN: demoN, p50: pct(l, 50), p95: pct(l, 95), max: l.length ? Math.max.apply(null, l) : null,
        uploadP95: pct(latencies.map(function (x) { return x.upload; }), 95),
        realtimeP95: pct(latencies.map(function (x) { return x.rt; }), 95),
        gapsOver10s: gaps.length, outageGaps: outageGaps, openGapMs: openGapMs(serverNow()),
        backPop: backPop, backKey: backKey, suspended: suspCount, realtime: rtState, clockOffsetMs: clock.offsetMs,
      });
    }, 60000);
  }

  // ---------- RESULTS ----------
  function startResults() {
    var data = null;
    $('x-load').addEventListener('click', load);
    $('x-kind').addEventListener('change', renderEvents);
    $('x-csv').addEventListener('click', function () {
      if (!data) return;
      var cols = ['run_id', 'stream_id', 'seq', 'device_label', 'measured_at', 'received_at', 'bpm', 'contact', 'rr_ms', 'is_demo'];
      var lines = [cols.join(',')].concat(data.samples.map(function (r) {
        return cols.map(function (c) { var v = r[c]; if (Array.isArray(v)) v = v.join(' '); return v == null ? '' : '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
      }));
      download('dillan-spike-samples.csv', lines.join('\n'), 'text/csv');
    });
    $('x-json').addEventListener('click', function () { if (data) download('dillan-spike-all.json', JSON.stringify(data, null, 2)); });

    function fetchAll(table, sinceIso, orderCol) {
      var out = [];
      function page(from) {
        // id breaks ties so offset paging never skips or repeats rows
        return sb.from(table).select('*').gte(orderCol, sinceIso).order(orderCol, { ascending: true }).order('id', { ascending: true })
          .range(from, from + 999).then(function (r) {
            if (r.error) throw r.error;
            out = out.concat(r.data);
            if (r.data.length === 1000 && out.length < 50000) return page(from + 1000);
            return out;
          });
      }
      return page(0);
    }

    function load() {
      if (!sb) { $('x-status').textContent = 'config.js is not filled in.'; return; }
      var mins = Math.max(5, Number($('x-since').value) || 180);
      var since = new Date(Date.now() - mins * 60000).toISOString();
      $('x-status').textContent = 'Loading…';
      Promise.all([fetchAll('spike_hr', since, 'measured_at'), fetchAll('spike_events', since, 'at')]).then(function (res) {
        var seen = {};
        var evs = res[1].filter(function (e) { if (!e.event_id) return true; if (seen[e.event_id]) return false; seen[e.event_id] = 1; return true; });
        evs.forEach(function (e) { e.detail = e.detail || {}; });
        data = { samples: res[0], events: evs, loadedAt: new Date().toISOString(), lookbackMinutes: mins };
        $('x-status').textContent = res[0].length + ' samples, ' + evs.length + ' events.';
        $('x-csv').disabled = $('x-json').disabled = false;
        render();
      }, function (e) { $('x-status').textContent = 'Load failed: ' + (e && e.message); });
    }

    function t(e) { return new Date(e.client_at || e.at).getTime(); }

    function render() {
      // streams: demo and real rows never share a group
      var byStream = {};
      data.samples.forEach(function (r) {
        var key = r.stream_id + (r.is_demo ? '|demo' : '');
        (byStream[key] = byStream[key] || []).push(r);
      });
      var rows = Object.keys(byStream).map(function (k) {
        var s = byStream[k];
        var times = s.map(function (r) { return new Date(r.measured_at).getTime(); });
        var gapsArr = [];
        // best contiguous run (split at gaps > 2.5 s): what Test 1 is judged on
        var segN = 1, segStart = times[0], bestN = 1, bestSec = 0;
        for (var i = 1; i < s.length; i++) {
          var g = times[i] - times[i - 1];
          gapsArr.push(g);
          if (g > 2500) { segN = 1; segStart = times[i]; } else { segN++; }
          var segSec = (times[i] - segStart) / 1000;
          if (segN > bestN) { bestN = segN; bestSec = segSec; }
        }
        var up = s.map(function (r) { return new Date(r.received_at).getTime() - new Date(r.measured_at).getTime(); });
        return {
          run: s[0].run_id, device: s[0].device_label, demo: !!s[0].is_demo, n: s.length,
          minutes: (times[times.length - 1] - times[0]) / 60000,
          bestN: bestN, bestRate: bestN > 1 ? (bestN - 1) / Math.max(1, bestSec) : 0,
          gaps2: gapsArr.filter(function (g) { return g > 2500; }).length, gaps10: gapsArr.filter(function (g) { return g > 10000; }).length,
          longest: gapsArr.length ? Math.max.apply(null, gapsArr) : 0,
          noContact: s.filter(function (r) { return r.contact === false; }).length,
          up50: pct(up, 50), up95: pct(up, 95), start: s[0].measured_at,
        };
      });
      $('x-streams').innerHTML = rows.length ? '<table><tr><th>Run</th><th>Device</th><th>Start</th><th>Samples</th><th>Minutes</th><th>Best run</th><th>Gaps &gt;2.5 s</th><th>Gaps &gt;10 s</th><th>Longest gap</th><th>No contact</th><th>Upload p50 / p95</th></tr>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.run) + (r.demo ? ' <span class="pill demo">DEMO</span>' : '') + '</td><td>' + esc(r.device) + '</td><td class="num">' + esc(new Date(r.start).toLocaleTimeString()) +
            '</td><td class="num">' + r.n + '</td><td class="num">' + r.minutes.toFixed(1) + '</td><td class="num">' + r.bestN + ' at ' + r.bestRate.toFixed(2) + '/s' +
            '</td><td class="num">' + r.gaps2 + '</td><td class="num ' + (r.gaps10 ? 'bad' : '') + '">' + r.gaps10 + '</td><td class="num">' + fmtSec(r.longest) +
            '</td><td class="num">' + r.noContact + '</td><td class="num">' + fmtSec(r.up50) + ' / ' + fmtSec(r.up95) + '</td></tr>';
        }).join('') + '</table>' : '<p class="muted">No samples in this window.</p>';

      var ev = data.events;
      var tv = ev.filter(function (e) { return e.kind === 'tv_stats'; });
      $('x-tv').innerHTML = tv.length ? '<table><tr><th>Time</th><th>TV</th><th>Real n</th><th>Demo n</th><th>p50</th><th>p95</th><th>max</th><th>Upload p95</th><th>Realtime p95</th><th>Gaps &gt;10 s</th><th>Open gap</th><th>Back pop / key</th><th>Suspended</th></tr>' +
        tv.slice(-30).map(function (e) {
          var d = e.detail;
          return '<tr><td class="num">' + esc(new Date(e.at).toLocaleTimeString()) + '</td><td class="tiny">' + esc(e.device) + '</td><td class="num">' + esc(d.n) + '</td><td class="num">' + esc(d.demoN) +
            '</td><td class="num">' + fmtSec(d.p50) + '</td><td class="num ' + (d.p95 > 5000 ? 'bad' : 'good') + '">' + fmtSec(d.p95) + '</td><td class="num">' + fmtSec(d.max) +
            '</td><td class="num">' + fmtSec(d.uploadP95) + '</td><td class="num">' + fmtSec(d.realtimeP95) + '</td><td class="num">' + esc(d.gapsOver10s) + (d.outageGaps ? ' (+' + esc(d.outageGaps) + ' outage)' : '') +
            '</td><td class="num">' + fmtSec(d.openGapMs) + '</td><td class="num">' + esc(d.backPop) + ' / ' + esc(d.backKey) + '</td><td class="num">' + esc(d.suspended) + '</td></tr>';
        }).join('') + '</table>' : '<p class="muted">No TV stats yet. The TV viewer uploads a snapshot every minute once samples arrive.</p>';

      // ---- verdicts ----
      function has(k) { return ev.some(function (e) { return e.kind === k; }); }
      var real = rows.filter(function (r) { return !r.demo; });
      var picked = ev.filter(function (e) { return e.kind === 'picked'; }).map(function (e) { return e.detail.name; });
      var fw = ev.filter(function (e) { return e.kind === 'firmware'; }).map(function (e) { return e.detail.version; });
      // an H10 notifies about once a second; well above that means duplicated listeners, not a healthy strap
      var t1 = real.length ? real.some(function (r) { return r.bestN >= 60 && r.bestRate >= 0.8 && r.bestRate <= 1.5; }) : (has('connect_failed') ? false : null);

      // Test 2: the first non-manual link drop after the latest "strap unclipped" marker
      var unclip = ev.filter(function (e) { return e.kind === 'marker' && e.detail.what === 'strap_unclipped'; }).pop();
      var drop = unclip ? ev.filter(function (e) { return e.kind === 'gatt_disconnected' && !e.detail.manual && t(e) >= t(unclip); })[0] : null;
      var contactBefore = drop ? ev.filter(function (e) { return e.kind === 'contact' && e.source === 'relay' && t(e) <= t(drop) && t(e) >= t(unclip) - 120000; }).pop() : null;
      var t2 = !unclip ? null : !drop ? false : (contactBefore && contactBefore.detail.contact === false);
      var t2text = !unclip ? 'tap "Strap unclipped" when you unclip the pod' : !drop ? 'no link drop recorded after unclipping' :
        'link dropped ' + fmtSec(t(drop) - t(unclip)) + ' after unclipping' + (drop.detail.msSinceContactFalse != null ? ', ' + fmtSec(drop.detail.msSinceContactFalse) + ' after contact was lost' : ', contact was not reported lost first');

      var autoOk = has('auto_reconnect_ok'), manualOk = has('manual_reconnect_ok');
      var t3 = autoOk || manualOk ? true : (has('auto_reconnect_failed') || has('manual_reconnect_failed') ? false : null);

      // Test 4: any snapshot that covers about 9+ minutes of real data with no open gap
      var full = tv.filter(function (e) { return e.detail.n >= 540; });
      var pass4 = full.filter(function (e) { return e.detail.p95 <= 5000 && e.detail.gapsOver10s === 0 && !(e.detail.openGapMs > 10000); });
      var t4 = full.length ? pass4.length > 0 : null;
      var shown4 = pass4[0] || full[full.length - 1];

      var popBacks = ev.filter(function (e) { return e.kind === 'back'; }).length;
      var keyBacks = ev.filter(function (e) { return e.kind === 'key' && e.detail.back; }).length;
      var tvLoad = ev.filter(function (e) { return e.kind === 'tv_load'; }).pop();
      function line(ok, text) { return '<div>' + (ok === true ? '<b class="good">PASS</b>' : ok === false ? '<b class="bad">FAIL</b>' : '<b class="muted">CHECK</b>') + ' · ' + text + '</div>'; }
      $('x-verdicts').innerHTML =
        line(t1, 'Test 1 · strap streams at about 1/s for 60+ samples in a row' + (picked.length ? ' (picked: ' + esc(picked.join(', ')) + ')' : '') + (fw.length ? ' · firmware ' + esc(fw[fw.length - 1]) : ' · firmware not read, take it from Polar Flow')) +
        line(t2, 'Test 2 · ' + esc(t2text)) +
        line(t3, 'Test 3 · reconnect without the chooser: ' + (autoOk ? 'auto-reconnect worked (best case)' : manualOk ? 'Reconnect button worked, auto did not' : 'not observed')) +
        line(t4, 'Test 4 · TV p95 ≤ 5 s and no gap > 10 s over about 10 minutes of real data' + (shown4 ? ' (snapshot ' + esc(new Date(shown4.at).toLocaleTimeString()) + ': p95 ' + fmtSec(shown4.detail.p95) + ', ' + esc(shown4.detail.gapsOver10s) + ' gaps)' : ' (no full 10-minute snapshot yet)')) +
        line(null, 'Test 5 · relay screen/background: ' + ev.filter(function (e) { return e.source === 'relay' && (e.kind === 'gap' || e.kind === 'suspended'); }).length + ' relay gaps/suspends recorded. Read the events below next to your markers.') +
        line(null, 'Test 6 · Silk: ' + (tvLoad ? 'bluetooth=' + esc(tvLoad.detail.bluetoothApi) + ', wakeLock=' + esc(tvLoad.detail.wakeLockApi) + ', HTTPS=' + esc(tvLoad.detail.secure) : 'no TV loaded') +
          ', Back captured via popstate ' + popBacks + '×, via key ' + keyBacks + '×. Record whether Back ever exited Silk.');

      var kinds = {};
      ev.forEach(function (e) { kinds[e.kind] = 1; });
      $('x-kind').innerHTML = '<option value="">All kinds</option>' + Object.keys(kinds).sort().map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
      renderEvents();
    }

    function renderEvents() {
      if (!data) return;
      var k = $('x-kind').value;
      var list = data.events.filter(function (e) { return !k || e.kind === k; });
      $('x-events').innerHTML = '<table><tr><th>Time</th><th>Source</th><th>Kind</th><th>Detail</th></tr>' +
        list.slice(-1500).map(function (e) {
          return '<tr><td class="num">' + esc(new Date(e.client_at || e.at).toLocaleTimeString()) + '</td><td>' + esc(e.source) + '<div class="tiny muted">' + esc(e.device) + '</div></td><td>' + esc(e.kind) +
            '</td><td class="tiny" style="word-break:break-all">' + esc(JSON.stringify(e.detail)) + '</td></tr>';
        }).join('') + '</table>';
    }
  }

  route();
})();
