/* ==========================================================================
   Live Monitoring — page logic
   Owner: Zachary (Phase 3)

   LIVE mode (default when served by the backend): the feed is the backend's
   annotated MJPEG stream, results arrive over the WebSocket (js/live-api.js)
   and the "Check uniform" button starts a check. The notes below describe the
   original DEMO mode, which is still used on GitHub Pages.

   Camera feed: tries to attach a real webcam via getUserMedia() (see
   tryAttachRealCamera() below) — if the device has no camera, permission
   is denied, or the API is unavailable, it falls back to a simulated
   placeholder view. Either way, this is purely visual.

   Detection: there is no real AI model reading the camera, and it no longer
   runs on this page. The timer and the fake detection generator live in
   js/monitoring-engine.js, which is loaded on EVERY page so monitoring keeps
   going while you browse elsewhere. This page just starts/stops the engine,
   attaches the (purely visual) camera, and re-renders whenever the engine
   announces new detections. generateDetection() in the engine is the
   function to change if the fake odds, timing or confidence need adjusting.
   ========================================================================== */

// Recent Detections always shows the newest 8, newest first. Once 8 are listed,
// each new detection pushes the oldest one off the bottom. (The full session log
// keeps growing, so every stat and the Detections page still count them all.)
const MAX_RECENT_DISPLAY = 8;

// How long a full-screen detection popup stays up (ms). Violations linger longer.
const POPUP_DURATION_MS = 5000;
const POPUP_DURATION_VIOLATION_MS = 8000;
const MAX_VISIBLE_POPUPS = 3;

// Full screen: hide the control bar + cursor after this much mouse inactivity.
const FULLSCREEN_IDLE_MS = 3000;

let cameraStream = null;

const IS_LIVE = Boolean(window.UCMS_CONFIG && window.UCMS_CONFIG.live);

/** LIVE mode: show the backend's annotated camera stream instead of the
 *  browser's own webcam. (The server holds the camera, and only one program
 *  can use it at a time, so getUserMedia() must NOT be used here.) */
function attachLiveFeed() {
  const img = document.getElementById('monitoring-live-feed');
  const placeholder = document.getElementById('monitoring-feed-placeholder');
  const placeholderText = document.getElementById('monitoring-feed-placeholder-text');
  const cameraLabel = document.getElementById('monitoring-feed-camera-label');

  img.onload = () => {
    img.hidden = false;
    placeholder.hidden = true;
    cameraLabel.hidden = false;
  };
  img.onerror = () => {
    img.hidden = true;
    placeholder.hidden = false;
    cameraLabel.hidden = true;
    placeholderText.textContent = 'Cannot reach the camera server. Is the backend running?';
    // Keep retrying while monitoring is on, so the picture returns once the server is back.
    if (MonitoringEngine.isActive()) setTimeout(() => { if (MonitoringEngine.isActive() && img.hidden) attachLiveFeed(); }, 2000);
  };
  img.src = `${LiveAPI.feedUrl()}?t=${Date.now()}`;
}

/** Closing the stream matters: an MJPEG <img> keeps its connection open until src is cleared. */
function detachLiveFeed() {
  const img = document.getElementById('monitoring-live-feed');
  const placeholder = document.getElementById('monitoring-feed-placeholder');
  const placeholderText = document.getElementById('monitoring-feed-placeholder-text');
  const cameraLabel = document.getElementById('monitoring-feed-camera-label');
  if (!img) return;
  img.onload = null;
  img.onerror = null;
  img.removeAttribute('src');
  img.hidden = true;
  placeholder.hidden = false;
  cameraLabel.hidden = true;
  placeholderText.textContent = 'Camera feed stopped. Click Start Monitoring to connect.';
}

/** Check button + status text follow the server's state (idle / collecting / cooldown). */
function updateLiveControls() {
  if (!IS_LIVE) return;
  const state = LiveAPI.serverState;
  const online = LiveAPI.online;
  document.querySelectorAll('.js-check-uniform').forEach((btn) => {
    btn.hidden = false;
    btn.disabled = !online || state !== 'idle';
    btn.textContent = state === 'collecting' ? 'Checking…' : 'Check uniform';
  });

  if (!MonitoringEngine.isActive()) return;
  const text = document.getElementById('monitoring-status-text');
  if (!online) text.textContent = 'Live — backend offline, reconnecting…';
  else if (state === 'collecting') text.textContent = 'Live — checking uniform…';
  else if (state === 'cooldown') text.textContent = 'Live — result recorded';
  else text.textContent = 'Live — waiting for RFID tap or Check button';
}

async function runUniformCheck() {
  const result = await LiveAPI.trigger();
  if (!result.ok) showToast(result.error, 'warning');
}

/**
 * Tries to attach a real webcam to the feed if the browser/device has one
 * and the user grants permission. Falls back to the simulated placeholder
 * on any failure (no camera, permission denied, insecure context, etc.)
 * — this NEVER blocks the detection simulation, which runs identically
 * either way. The video is purely visual; nothing reads pixels from it.
 */
async function tryAttachRealCamera() {
  if (IS_LIVE) { attachLiveFeed(); return; }
  const video = document.getElementById('monitoring-video');
  const placeholder = document.getElementById('monitoring-feed-placeholder');
  const placeholderText = document.getElementById('monitoring-feed-placeholder-text');
  const cameraLabel = document.getElementById('monitoring-feed-camera-label');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return; // API unsupported (old browser, or non-secure context) — stay on placeholder
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = cameraStream;
    video.hidden = false;
    placeholder.hidden = true;
    // Real video is showing — move the "Main Gate Camera Feed" label out of
    // the center (where the placeholder used to have it) into the corner,
    // like a CCTV overlay label, instead of covering the video.
    cameraLabel.hidden = false;
  } catch (err) {
    // No camera, permission denied, or camera in use elsewhere — this is
    // an expected/common outcome, not a bug. Just show the simulated view.
    placeholderText.textContent = 'Main Gate Camera Feed (simulated — no camera detected)';
  }
}

function stopRealCamera() {
  if (IS_LIVE) { detachLiveFeed(); return; }
  const video = document.getElementById('monitoring-video');
  const placeholder = document.getElementById('monitoring-feed-placeholder');
  const cameraLabel = document.getElementById('monitoring-feed-camera-label');

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  video.hidden = true;
  video.srcObject = null;
  placeholder.hidden = false;
  cameraLabel.hidden = true;
}

/** Live clock shown in the feed's top-right corner. Runs continuously,
 *  independent of monitoring state — it's just "what time is it right now." */
function updateFeedClock() {
  const el = document.getElementById('monitoring-feed-datetime');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  });
}

function renderResultCard(detection) {
  const mount = document.getElementById('monitoring-result-content');
  if (!mount) return;

  const meta = getStatusPillMeta(detection.status);

  mount.innerHTML = `
    <div class="monitoring-result">
      ${renderEvidenceFrame(detection)}
      <div class="monitoring-result-details">
        <div class="monitoring-result-row">
          <span class="monitoring-result-label">${detection.label}</span>
          <span class="status-pill ${meta.className}">${meta.label}</span>
        </div>
        <div class="monitoring-result-meta">
          <span>${formatTimestamp(detection.timestamp)}</span>
          <span>${formatConfidenceLong(detection)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderRecentDetections() {
  const list = document.getElementById('monitoring-recent-list');
  if (!list) return;

  const allDetections = getSessionDetections();
  if (allDetections.length === 0) {
    list.innerHTML = `<li class="monitoring-recent-empty">No detections yet.</li>`;
    return;
  }

  // Newest first, capped to MAX_RECENT_DISPLAY — the session log itself keeps
  // growing so today's stats stay accurate even once older rows scroll off.
  const recent = [...allDetections].reverse().slice(0, MAX_RECENT_DISPLAY);

  // Two lines per row so every detail (name, status, time, confidence, ID) fits
  // in the narrow side column.
  list.innerHTML = recent.map((d) => {
    const meta = getStatusPillMeta(d.status);
    return `
      <li class="monitoring-recent-item">
        <div class="monitoring-recent-main">
          <span class="monitoring-recent-name">${d.label}</span>
          <span class="status-pill ${meta.className}">${meta.label}</span>
        </div>
        <div class="monitoring-recent-sub">
          <span>${formatTimestamp(d.timestamp)}</span>
          <span>${formatConfidence(d)}</span>
          <span class="monitoring-recent-id" title="${d.id}">${d.id}</span>
        </div>
      </li>
    `;
  }).join('');
}

/** Updates the "Today's Detections / Compliant / Non-Compliant" stat row,
 *  computed from the full session history via getMockSummaryStats()
 *  (see js/data/mock-data.js). */
function renderTodayStats() {
  const stats = getMockSummaryStats(getSessionDetections());
  document.getElementById('today-total-value').textContent = stats.total;
  document.getElementById('today-compliant-value').textContent = stats.compliant;
  document.getElementById('today-violation-value').textContent = stats.violations;
}

function updateStatusIndicator() {
  const isMonitoring = MonitoringEngine.isActive();
  const dot = document.getElementById('monitoring-status-dot');
  const text = document.getElementById('monitoring-status-text');
  const toggleBtns = document.querySelectorAll('.js-monitoring-toggle');
  const feedDot = document.getElementById('monitoring-feed-dot');
  const feedText = document.getElementById('monitoring-feed-status-text');
  const todayStatus = document.getElementById('today-status-value');

  if (isMonitoring) {
    dot.classList.add('is-live');
    text.textContent = 'Live — watching Main Gate';
    toggleBtns.forEach((btn) => { btn.textContent = 'Stop Monitoring'; });

    feedDot.classList.add('is-live');
    feedText.textContent = 'LIVE';

    todayStatus.textContent = 'Monitoring';
  } else {
    dot.classList.remove('is-live');
    text.textContent = 'Idle';
    toggleBtns.forEach((btn) => { btn.textContent = 'Start Monitoring'; });

    feedDot.classList.remove('is-live');
    feedText.textContent = 'IDLE';

    todayStatus.textContent = 'Idle';
  }
  updateLiveControls();
}

/** Re-renders everything that depends on the detection log. Called when the
 *  engine adds detections (whether this page or a previous one started it). */
function renderLatest(detections) {
  const latest = detections && detections.length
    ? detections[detections.length - 1]
    : getSessionDetections().slice(-1)[0];
  if (latest) renderResultCard(latest);
  renderRecentDetections();
  renderTodayStats();
}

/* ==========================================================================
   Full screen + detection popups
   The element that goes full screen is the feed itself (#monitoring-feed), so
   the status chips, the control bar and the popups — all children of it — stay
   visible. Browsers without the Fullscreen API (e.g. iPhone Safari) get a
   "fake" full screen: the feed is pinned over the whole window with CSS.
   ========================================================================== */

function getFeedEl() {
  return document.getElementById('monitoring-feed');
}

function getNativeFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isFeedFullscreen() {
  const feed = getFeedEl();
  return Boolean(feed) && (getNativeFullscreenElement() === feed
    || feed.classList.contains('is-pseudo-fullscreen'));
}

function enterFeedFullscreen() {
  const feed = getFeedEl();
  if (!feed || isFeedFullscreen()) return;

  const request = feed.requestFullscreen || feed.webkitRequestFullscreen;
  if (!request || document.fullscreenEnabled === false) {
    enterPseudoFullscreen();
    return;
  }
  try {
    const result = request.call(feed);
    // Promise-based browsers reject if full screen is blocked (e.g. inside an
    // iframe) — fall back instead of doing nothing.
    if (result && typeof result.catch === 'function') {
      result.catch(() => enterPseudoFullscreen());
    }
  } catch (err) {
    enterPseudoFullscreen();
  }
}

function exitFeedFullscreen() {
  const feed = getFeedEl();
  if (!feed) return;

  if (feed.classList.contains('is-pseudo-fullscreen')) {
    feed.classList.remove('is-pseudo-fullscreen');
    document.body.classList.remove('monitoring-pseudo-fs');
    syncFullscreenState();
  } else if (getNativeFullscreenElement()) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  }
}

function toggleFeedFullscreen() {
  if (isFeedFullscreen()) {
    exitFeedFullscreen();
  } else {
    enterFeedFullscreen();
  }
}

function enterPseudoFullscreen() {
  const feed = getFeedEl();
  if (!feed) return;
  feed.classList.add('is-pseudo-fullscreen');
  document.body.classList.add('monitoring-pseudo-fs');
  syncFullscreenState();
}

let fullscreenIdleTimer = null;

/** Full screen only: fade out the control bar + cursor after a few idle seconds. */
function wakeFullscreenControls() {
  const feed = getFeedEl();
  if (!feed) return;
  feed.classList.remove('is-idle');
  clearTimeout(fullscreenIdleTimer);
  if (isFeedFullscreen()) {
    fullscreenIdleTimer = setTimeout(() => feed.classList.add('is-idle'), FULLSCREEN_IDLE_MS);
  }
}

/** Keeps the UI in step with the real state — also called when the user leaves
 *  full screen with Esc, which the page never sees as a click. */
function syncFullscreenState() {
  const feed = getFeedEl();
  if (!feed) return;

  const active = isFeedFullscreen();
  feed.classList.toggle('is-fullscreen', active);

  document.querySelectorAll('.js-fullscreen-toggle').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(active));
  });
  const corner = document.querySelector('.monitoring-fs-corner');
  if (corner) {
    corner.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
  }

  if (active) {
    wakeFullscreenControls();
  } else {
    clearTimeout(fullscreenIdleTimer);
    feed.classList.remove('is-idle');
    clearDetectionPopups(); // nothing should linger once the feed is back in the page
  }
}

/** Removes a popup with a short fade-out. */
function dismissPopup(popup) {
  if (!popup || popup.classList.contains('is-leaving')) return;
  popup.classList.add('is-leaving');
  setTimeout(() => popup.remove(), 230);
}

function clearDetectionPopups() {
  const mount = document.getElementById('monitoring-popups');
  if (mount) mount.innerHTML = '';
}

/**
 * Pops a detection card over the feed. Only runs in full screen (in the normal
 * view the side panels already show every result). The thumbnail goes through
 * renderEvidenceFrame() like everywhere else, so real snapshots will show up
 * here automatically once they exist.
 */
function showDetectionPopup(detection) {
  const mount = document.getElementById('monitoring-popups');
  if (!mount || !isFeedFullscreen()) return;

  const meta = getStatusPillMeta(detection.status);
  const messages = {
    compliant: 'In uniform',
    violation: 'Not in uniform',
    pending: 'Needs manual review',
  };
  const message = messages[detection.status] || 'Detected';
  const time = new Date(detection.timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  });

  const popup = document.createElement('div');
  popup.className = `monitoring-popup monitoring-popup--${detection.status}`;
  popup.setAttribute('role', 'status');
  popup.title = 'Click to dismiss';
  popup.innerHTML = `
    <div class="monitoring-popup-thumb">${renderEvidenceFrame(detection)}</div>
    <div class="monitoring-popup-body">
      <div class="monitoring-popup-top">
        <strong>${detection.label}</strong>
        <span class="status-pill ${meta.className}">${meta.label}</span>
      </div>
      <div class="monitoring-popup-msg">${message} \u00B7 ${CAMERA_LOCATION}</div>
      <div class="monitoring-popup-meta">${time}${formatConfidenceLong(detection) ? ` \u00B7 ${formatConfidenceLong(detection)}` : ''}</div>
    </div>
  `;
  popup.addEventListener('click', () => dismissPopup(popup));

  // Newest on top; keep the stack short so it never covers the camera.
  mount.prepend(popup);
  const popups = mount.querySelectorAll('.monitoring-popup:not(.is-leaving)');
  for (let i = MAX_VISIBLE_POPUPS; i < popups.length; i += 1) {
    popups[i].remove();
  }

  const lifetime = detection.status === 'violation'
    ? POPUP_DURATION_VIOLATION_MS
    : POPUP_DURATION_MS;
  setTimeout(() => dismissPopup(popup), lifetime);
}

function isTypingTarget(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function startMonitoring() {
  MonitoringEngine.start();   // flips the shared flag, fires the first detection now
  updateStatusIndicator();
  tryAttachRealCamera();      // best-effort; falls back to simulated view on failure
}

function stopMonitoring() {
  MonitoringEngine.stop();
  stopRealCamera();
  clearDetectionPopups();
  updateStatusIndicator();
}

document.addEventListener('DOMContentLoaded', () => {
  initShell('monitoring', 'Live Monitoring');

  renderLatest();
  updateStatusIndicator();

  if (IS_LIVE) {
    document.getElementById('monitoring-feed-placeholder-text').textContent =
      'Main Gate Camera Feed — click Start Monitoring to connect';
    const empty = document.querySelector('#monitoring-result-content .placeholder-block');
    if (empty) {
      empty.textContent = 'No detections yet. Tap an RFID card, or press "Check uniform", to check a student at the Main Gate.';
    }
    document.querySelectorAll('.js-check-uniform').forEach((btn) => btn.addEventListener('click', runUniformCheck));
    window.addEventListener('ucms:server-state', updateLiveControls);
    window.addEventListener('ucms:backend', updateLiveControls);
    updateLiveControls();
  }

  // Clock runs regardless of monitoring state — it's just the current time.
  updateFeedClock();
  setInterval(updateFeedClock, 1000);

  // There are two Start/Stop buttons (below the feed, and in the full-screen
  // control bar) — both do the same thing.
  document.querySelectorAll('.js-monitoring-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (MonitoringEngine.isActive()) {
        stopMonitoring();
      } else {
        startMonitoring();
      }
    });
  });

  // Full screen: buttons, double-click on the feed, and the F key.
  document.querySelectorAll('.js-fullscreen-toggle').forEach((btn) => {
    btn.addEventListener('click', toggleFeedFullscreen);
  });

  const feed = getFeedEl();
  feed.addEventListener('dblclick', toggleFeedFullscreen);
  ['mousemove', 'pointerdown', 'touchstart'].forEach((evt) => {
    feed.addEventListener(evt, wakeFullscreenControls, { passive: true });
  });

  document.addEventListener('fullscreenchange', syncFullscreenState);
  document.addEventListener('webkitfullscreenchange', syncFullscreenState);

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      toggleFeedFullscreen();
    } else if (event.key === 'Escape' && feed.classList.contains('is-pseudo-fullscreen')) {
      exitFeedFullscreen(); // real full screen handles Esc by itself
    } else if (isFeedFullscreen()) {
      wakeFullscreenControls();
    }
  });

  // New detections from the engine (every few seconds while monitoring is on — see Settings → Refresh Interval). In full
  // screen each one also pops up over the feed. After a catch-up burst (a
  // throttled tab waking up) only the newest few are worth showing.
  MonitoringEngine.onDetections(({ detections }) => {
    renderLatest(detections);
    if (isFeedFullscreen() && MonitoringEngine.isActive()) {
      detections.slice(-MAX_VISIBLE_POPUPS).forEach(showDetectionPopup);
    }
  });

  // Release the camera if the user navigates away/closes the tab while
  // monitoring is running, rather than leaving the light on.
  window.addEventListener('beforeunload', stopRealCamera);

  // Monitoring was left running (e.g. started here, then you browsed other
  // pages, which kept detecting in the background) — the engine has already
  // resumed on its own, so all that's left for this page is the camera. A
  // fresh page can't hold the old stream, so the browser may ask for camera
  // permission again (expected).
  if (MonitoringEngine.isActive()) {
    tryAttachRealCamera();
  }
});
