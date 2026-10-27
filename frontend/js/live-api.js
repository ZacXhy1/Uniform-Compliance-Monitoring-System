/* ==========================================================================
   Live API client — connects the dashboard to the FastAPI backend.

   Only active in LIVE mode (see js/config.js). In DEMO mode this file does
   nothing and the simulated engine in js/monitoring-engine.js runs instead.

   What it does
     1. Loads the saved results from GET /api/logs into the session log, so
        every page (Dashboard, Detections, Violations, Reports, Monitoring)
        reads real data through the same getSessionDetections() as before.
     2. Keeps a WebSocket (/ws) open. Each new result is added to the log and
        announced with the same `ucms:detections` event the simulation used,
        so all pages update live without changes.
     3. Exposes LiveAPI.trigger() for the "Check uniform" button, plus the
        server's state (idle / collecting / cooldown) and online/offline.

   Everything backend-specific about field names lives in normalizeEntry().
   If the backend's JSON changes, that is the one function to edit.
   ========================================================================== */
(function () {
  const CFG = window.UCMS_CONFIG || { live: false };
  const OVERRIDES_KEY = 'ucms_overrides';

  const LiveAPI = {
    live: Boolean(CFG.live),
    online: false,
    serverState: 'unknown',
    feedUrl() { return CFG.apiUrl ? CFG.apiUrl('/video_feed') : ''; },
    trigger: async () => ({ ok: false, error: 'demo mode' }),
    syncLogs: async () => {},
  };
  window.LiveAPI = LiveAPI;
  if (!LiveAPI.live) return;

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /* ---------- backend result -> dashboard detection ---------- */

  function statusFrom(raw) {
    const s = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z]/g, '');
    if (s === 'compliant') return 'compliant';
    if (s === 'noncompliant' || s === 'violation') return 'violation';
    return 'pending'; // "retry", "no result", anything unclear -> manual review
  }

  function nameFrom(e) {
    const st = e.student;
    if (e.student_name) return e.student_name;
    if (st && typeof st === 'object' && st.name) return st.name;
    if (typeof st === 'string' && st) return st;
    if (e.name) return e.name;
    return 'Manual check';          // dashboard button, no RFID card
  }

  function confidenceFrom(e) {
    const c = Number(e.confidence);
    if (!Number.isFinite(c) || c <= 0) return null;   // backend did not send one
    return c > 1 ? c / 100 : c;
  }

  /** One backend log row / websocket message -> the shape every page expects. */
  function normalizeEntry(e) {
    const when = e.time || e.created_at || e.timestamp || new Date().toISOString();
    const stamp = String(when).replace(/\D/g, '').slice(0, 14);
    const section = (e.student && e.student.section) || e.section || null;
    return {
      id: e.id != null ? `DTC-${e.id}` : `DTC-${stamp}`,
      label: nameFrom(e),
      section,
      timestamp: when,
      status: statusFrom(e.result != null ? e.result : (e.status != null ? e.status : e.label)),
      confidence: confidenceFrom(e),
      snapshot: e.snapshot || e.snapshot_path || null,
      seconds: e.seconds != null ? e.seconds : (e.capture_to_result_s != null ? e.capture_to_result_s : null),
    };
  }

  /* Staff reviews/corrections are saved only in this browser tab (the backend
     has no endpoint for them), so re-apply them whenever the log reloads. */
  function applyOverrides(list) {
    let overrides = {};
    try { overrides = JSON.parse(sessionStorage.getItem(OVERRIDES_KEY) || '{}'); } catch (err) { /* ignore */ }
    return list.map((d) => (overrides[d.id]
      ? Object.assign({}, d, { status: overrides[d.id], reviewed: true })
      : d));
  }

  /* ---------- REST ---------- */

  async function syncLogs() {
    try {
      const res = await fetch(CFG.apiUrl('/api/logs?limit=200'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      // Backend returns newest first; the pages keep the log oldest first.
      const list = applyOverrides(rows.map(normalizeEntry).reverse());
      saveSessionDetections(list);
      emit('ucms:detections', { detections: [], catchUp: true });
    } catch (err) {
      setOnline(false);
    }
  }

  async function trigger() {
    try {
      const res = await fetch(CFG.apiUrl('/trigger'), { method: 'POST' });
      let body = {};
      try { body = await res.json(); } catch (err) { /* empty body */ }
      if (res.ok) return { ok: true, state: body.state };
      if (res.status === 409) return { ok: false, error: 'A check is already running — wait a moment.' };
      if (res.status === 503) return { ok: false, error: 'The camera is not available on the server.' };
      return { ok: false, error: body.error || `Server error (${res.status}).` };
    } catch (err) {
      return { ok: false, error: 'Cannot reach the camera server.' };
    }
  }

  /* ---------- WebSocket ---------- */

  function setOnline(value) {
    if (LiveAPI.online === value) return;
    LiveAPI.online = value;
    emit('ucms:backend', { online: value });
  }

  function setServerState(state) {
    LiveAPI.serverState = state;
    emit('ucms:server-state', { state });
  }

  function handleMessage(msg) {
    if (msg.type === 'state') {
      setServerState(msg.state);
    } else if (msg.type === 'result') {
      const d = normalizeEntry(msg);
      const list = getSessionDetections();
      if (list.some((x) => x.id === d.id)) return;
      addSessionDetection(d);
      emit('ucms:detections', { detections: [d], catchUp: false });
    } else if (msg.type === 'unregistered') {
      if (typeof showToast === 'function') {
        showToast(`Unregistered RFID card${msg.uid ? ` (${msg.uid})` : ''}.`, 'warning');
      }
    }
  }

  let ws = null;
  let retryMs = 1000;

  function connect() {
    try { ws = new WebSocket(CFG.wsUrl()); } catch (err) { return scheduleRetry(); }
    ws.onopen = () => {
      retryMs = 1000;
      setOnline(true);
      syncLogs();               // catch anything missed while disconnected
    };
    ws.onmessage = (ev) => {
      try { handleMessage(JSON.parse(ev.data)); } catch (err) { /* ignore bad frame */ }
    };
    ws.onclose = () => { setOnline(false); setServerState('unknown'); scheduleRetry(); };
    ws.onerror = () => { try { ws.close(); } catch (err) { /* ignore */ } };
  }

  function scheduleRetry() {
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 10000);
  }

  LiveAPI.trigger = trigger;
  LiveAPI.syncLogs = syncLogs;

  document.addEventListener('DOMContentLoaded', () => {
    syncLogs();
    connect();
  });
})();
