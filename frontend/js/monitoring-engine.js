/* ==========================================================================
   Monitoring engine — keeps Live Monitoring running on EVERY page

   Why this exists: the app is a multi-page site, so each navigation is a
   brand-new page load and any setInterval started by one page dies with it.
   Before this file, detection only ran while the Live Monitoring page was
   open. Now the timer, the fake detection generator and the on/off flag
   live here, this script is loaded on every protected page, and it picks
   the simulation back up the moment a page loads.

   How "keeps running across pages" actually works:
     - On/off state lives in sessionStorage (per tab, like the detection log).
     - The time the NEXT detection is due is also saved. A page load takes a
       moment, so on load the engine generates any detections that came due
       while the page was changing, stamped with the time they were due —
       the log has no gap. It's capped (MAX_CATCH_UP) so a tab left asleep
       for an hour doesn't dump hundreds of rows when it wakes up.
     - Whenever detections are added it fires a `ucms:detections` event on
       `window`; pages listen via MonitoringEngine.onDetections() and
       re-render themselves. `ucms:monitoring-state` fires on start/stop.

   Not covered (by design / browser limits): the webcam is page-bound — the
   browser releases it on navigation, and only the Live Monitoring page
   re-attaches it. Detection itself is fake either way (see
   generateDetection() — that's the function to change for odds/timing).
   ========================================================================== */

(function () {
  const DEFAULT_INTERVAL_MS = 4000;
  const MAX_CATCH_UP = 10;
  const ACTIVE_KEY = 'ucms_monitoring_active'; // same key the Monitoring page always used
  const NEXT_DUE_KEY = 'ucms_monitoring_next_due';

  let timer = null;

  /** Time between detections, from Settings -> Monitoring -> Refresh Interval.
   *  Read fresh every time so a change applies without reloading. Falls back
   *  to 4 s if the saved value is missing or not one of the allowed options. */
  function getIntervalMs() {
    if (typeof getSettings !== 'function') return DEFAULT_INTERVAL_MS;
    const seconds = Number(getSettings().refreshInterval);
    const allowed = window.REFRESH_INTERVAL_OPTIONS || [];
    return allowed.includes(seconds) ? seconds * 1000 : DEFAULT_INTERVAL_MS;
  }

  /* ---------- state ---------- */

  function isLive() {
    return Boolean(window.UCMS_CONFIG && window.UCMS_CONFIG.live);
  }

  function isActive() {
    return sessionStorage.getItem(ACTIVE_KEY) === 'true';
  }

  function getNextDue() {
    const value = Number(sessionStorage.getItem(NEXT_DUE_KEY));
    return Number.isFinite(value) && value > 0 ? value : Date.now();
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /* ---------- fake detection ---------- */

  /**
   * Fakes one camera detection. Not real computer vision — picks a random
   * outcome with roughly realistic odds and a matching confidence range,
   * and labels the "student" generically since there is no real
   * identification (see js/data/mock-data.js scope notes).
   * @param {number} number - sequence number for the "Student N" label
   * @param {number} timeMs - the time the detection is stamped with
   */
  function generateDetection(number, timeMs) {
    const roll = Math.random();
    let status;
    if (roll < 0.6) {
      status = 'compliant';
    } else if (roll < 0.9) {
      status = 'violation';
    } else {
      status = 'pending';
    }

    const confidence = status === 'pending'
      ? 0.40 + Math.random() * 0.20   // low confidence -> flagged for review
      : 0.85 + Math.random() * 0.14;  // confident read either way

    return {
      id: `DTC-${timeMs}`,
      label: `Student ${number}`,
      timestamp: new Date(timeMs).toISOString(),
      status,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /* ---------- the tick loop ---------- */

  /**
   * Generates every detection that is due right now (normally exactly one;
   * several after a page change or a throttled background tab), saves them
   * to the session log in one write, announces them, and schedules the next.
   * @param {{ catchUp?: boolean }} [opts]
   */
  function processDue(opts = {}) {
    if (!isActive()) return;
    if (isLive()) return; // LIVE mode: results come from the backend (js/live-api.js), never generated here

    const now = Date.now();
    let due = getNextDue();
    const list = getSessionDetections();
    const usedIds = new Set(list.map((d) => d.id));
    const added = [];

    while (due <= now && added.length < MAX_CATCH_UP) {
      let stamp = due;
      while (usedIds.has(`DTC-${stamp}`)) stamp += 1; // ids must stay unique
      const detection = generateDetection(list.length + added.length + 1, stamp);
      usedIds.add(detection.id);
      added.push(detection);
      due += getIntervalMs();
    }

    // Still behind after hitting the cap (tab was asleep a long time):
    // don't invent more history, just resume on schedule from now.
    if (due <= now) due = now + getIntervalMs();

    sessionStorage.setItem(NEXT_DUE_KEY, String(due));

    if (added.length > 0) {
      saveSessionDetections(list.concat(added));
      emit('ucms:detections', { detections: added, catchUp: Boolean(opts.catchUp) || added.length > 1 });
    }

    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!isActive()) return;
    timer = setTimeout(() => processDue(), Math.max(0, getNextDue() - Date.now()));
  }

  /* ---------- public controls ---------- */

  function start() {
    if (isActive()) return;
    sessionStorage.setItem(ACTIVE_KEY, 'true');
    sessionStorage.setItem(NEXT_DUE_KEY, String(Date.now())); // first one fires immediately
    emit('ucms:monitoring-state', { active: true });
    if (!isLive()) processDue();
  }

  /** Call after the refresh interval setting changes. Pulls the next detection
   *  forward if the new interval is shorter than the time left on the old
   *  one (15 s -> 2 s takes effect within 2 s, not after the old wait). */
  function applyIntervalChange() {
    if (!isActive()) return;
    const soonest = Date.now() + getIntervalMs();
    if (getNextDue() > soonest) sessionStorage.setItem(NEXT_DUE_KEY, String(soonest));
    schedule();
  }

  function stop() {
    sessionStorage.setItem(ACTIVE_KEY, 'false');
    sessionStorage.removeItem(NEXT_DUE_KEY);
    clearTimeout(timer);
    timer = null;
    emit('ucms:monitoring-state', { active: false });
  }

  /** Subscribe to newly added detections. Handler gets `{ detections, catchUp }`. */
  function onDetections(handler) {
    window.addEventListener('ucms:detections', (event) => handler(event.detail));
  }

  /** Subscribe to monitoring being started/stopped. Handler gets `{ active }`. */
  function onStateChange(handler) {
    window.addEventListener('ucms:monitoring-state', (event) => handler(event.detail));
  }

  window.MonitoringEngine = {
    getIntervalMs,
    applyIntervalChange,
    isActive,
    start,
    stop,
    onDetections,
    onStateChange,
  };

  /* ---------- keep it alive across page loads / sleeping tabs ---------- */

  // A page that loads while monitoring is on picks the simulation straight
  // back up (and makes up any ticks missed during the page change).
  document.addEventListener('DOMContentLoaded', () => processDue({ catchUp: true }));

  // Background tabs throttle timers; on return, catch up immediately.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) processDue({ catchUp: true });
  });

  // Back/forward can restore a frozen copy of a page (bfcache) with no scripts
  // re-run: resume, and tell the page to refresh its possibly stale data.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    processDue({ catchUp: true });
    emit('ucms:monitoring-state', { active: isActive() });
    emit('ucms:detections', { detections: [], catchUp: true });
  });

  /* ---------- violation alerts (Settings → "Detection Alerts") ---------- */

  // The Settings page has long had a "show an alert when a new violation is
  // detected" toggle with nothing behind it. Now that detection runs in the
  // background, this is how you find out without staring at Live Monitoring.
  // Skipped on the Monitoring page itself, which already shows every result.
  onDetections(({ detections, catchUp }) => {
    if (typeof showToast !== 'function' || typeof getSettings !== 'function') return;
    if (!getSettings().notifications) return;
    if (/monitoring\.html$/.test(window.location.pathname)) return;

    const violations = detections.filter((d) => d.status === 'violation');
    if (violations.length === 0) return;

    if (catchUp && violations.length > 1) {
      showToast(`${violations.length} new violations detected (${CAMERA_LOCATION}).`, 'warning');
    } else {
      showToast(`New violation: ${violations[violations.length - 1].label} \u2014 not in uniform (${CAMERA_LOCATION}).`, 'warning');
    }
  });
})();
