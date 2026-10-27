/* ==========================================================================
   Dashboard — page logic
   Owner: Paul (Phase 2)

   Reads from getSessionDetections() (js/data/mock-data.js), not the raw
   MOCK_DETECTIONS array, so anything Live Monitoring (Phase 3) generates
   this session shows up here too — see PROJECT_BRIEF.md Section 6/28.
   ========================================================================== */

// Rows rendered into Recent Activity. On desktop the card is sized to the screen
// and CSS shows only as many of these as fit (see css/pages/dashboard.css).
const DASHBOARD_MAX_RECENT = 8;

/** Renders the four KPI cards (stacked in a column beside the hero video) via the shared renderStatCard()
 *  (js/components/stat-card.js), using its optional color tone so
 *  compliant/violation values stand out at a glance. */
function renderSummaryCards(stats) {
  const mount = document.getElementById('dashboard-summary-cards');
  if (!mount) return;

  renderKpiCards(mount, [
    { value: stats.total, label: 'Total Detections' },
    { value: stats.compliant, label: 'Compliant', tone: 'success' },
    { value: stats.violations, label: 'Violations', tone: 'danger' },
    { value: stats.complianceRate, suffix: '%', label: 'Compliance Rate', tone: 'primary' },
  ]);
}

/** Reflects whether Live Monitoring is currently active, per
 *  PROJECT_BRIEF.md Section 12 ("Monitoring status ... if feasible"). */
function renderMonitoringStatus() {
  const dot = document.getElementById('dashboard-monitoring-dot');
  const text = document.getElementById('dashboard-monitoring-text');
  const isActive = MonitoringEngine.isActive();

  dot.classList.toggle('is-live', isActive);
  text.textContent = isActive
    ? 'Live Monitoring is active \u2014 watching Main Gate'
    : 'Live Monitoring is idle';
}

/**
 * Compliant / violation / pending donut, built with a CSS conic-gradient
 * rather than a charting library (PROJECT_BRIEF.md Section 25). The center
 * label shows the overall compliance rate.
 */
function renderComplianceChart(stats) {
  const donut = document.getElementById('dashboard-donut');
  const legend = document.getElementById('dashboard-donut-legend');
  const centerLabel = document.getElementById('dashboard-donut-center');
  if (!donut) return;

  setDonut(donut, stats);
  animateNumber(centerLabel, stats.complianceRate, { suffix: '%' });

  legend.innerHTML = `
    <div class="dashboard-legend-row">
      <span class="dashboard-legend-dot dashboard-legend-dot--success"></span>
      <span>Compliant</span>
      <span class="dashboard-legend-count">${stats.compliant}</span>
    </div>
    <div class="dashboard-legend-row">
      <span class="dashboard-legend-dot dashboard-legend-dot--danger"></span>
      <span>Violation</span>
      <span class="dashboard-legend-count">${stats.violations}</span>
    </div>
    <div class="dashboard-legend-row">
      <span class="dashboard-legend-dot dashboard-legend-dot--warning"></span>
      <span>Pending Review</span>
      <span class="dashboard-legend-count">${stats.pending}</span>
    </div>
  `;
}

/** Vertical bar chart (compliant / violation / pending counts), plain CSS
 *  like the donut — no charting library. */
function renderStatusBarChart(stats) {
  const chart = document.getElementById('dashboard-bar-chart');
  if (!chart) return;

  const bars = [
    { label: 'Compliant', value: stats.compliant, tone: 'success' },
    { label: 'Violation', value: stats.violations, tone: 'danger' },
    { label: 'Pending', value: stats.pending, tone: 'warning' },
  ];

  chart.setAttribute('aria-label', 'Bar chart of detections by status: '
    + bars.map((b) => `${b.label} ${b.value}`).join(', '));
  renderAnimatedBars(chart, bars, {
    col: 'bar-chart-col', value: 'bar-chart-value', track: 'bar-chart-track',
    bar: 'bar-chart-bar', label: 'bar-chart-label',
  });
}

/** Latest detections, newest first, capped to DASHBOARD_MAX_RECENT — same
 *  pattern as Monitoring's "Recent Detections" table. */
function renderRecentActivity(allDetections) {
  const body = document.getElementById('dashboard-recent-body');
  if (!body) return;

  if (allDetections.length === 0) {
    body.innerHTML = `<tr><td colspan="4">No detections yet.</td></tr>`;
    return;
  }

  const recent = [...allDetections].reverse().slice(0, DASHBOARD_MAX_RECENT);

  body.innerHTML = recent.map((d) => {
    const meta = getStatusPillMeta(d.status);
    return `
      <tr data-id="${d.id}">
        <td>${d.label}</td>
        <td class="col-center">${formatTimestamp(d.timestamp)}</td>
        <td class="col-center"><span class="status-pill ${meta.className}">${meta.label}</span></td>
        <td class="col-center">${formatConfidence(d)}</td>
      </tr>
    `;
  }).join('');

  // First draw fades the rows in; later live refreshes only flash the new one.
  animateTableRows(body);
}

/**
 * Decorative hologram video in the hero row. It should always be running while
 * the dashboard is on screen, with no way for the user to stop or scrub it:
 *   - the <video> has no `controls`, ignores pointer events, and the card's
 *     right-click menu (which offers Pause / Show controls) is suppressed;
 *   - if anything pauses it anyway (media keys, the browser, etc.) it resumes;
 *   - it's restarted when the tab becomes visible again, and, if the browser
 *     blocked autoplay (e.g. battery saver), on the first interaction.
 * The only time it stops is when the browser itself suspends a hidden tab.
 */
function initHeroVideo() {
  const video = document.getElementById('dashboard-hero-video');
  const frame = document.getElementById('dashboard-hero-frame');
  if (!video) return;

  // Set via property too: the attribute alone isn't honoured everywhere, and
  // autoplay is only allowed for muted video.
  video.muted = true;
  video.controls = false;

  const play = () => {
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
  };

  video.addEventListener('pause', () => {
    if (!document.hidden) play();
  });
  video.addEventListener('ratechange', () => {
    if (video.playbackRate !== 1) video.playbackRate = 1;
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) play();
  });

  if (frame) frame.addEventListener('contextmenu', (e) => e.preventDefault());

  const kickstart = () => {
    play();
    ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
      document.removeEventListener(evt, kickstart));
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
    document.addEventListener(evt, kickstart, { passive: true }));

  play();
}

/** Re-reads the shared detection log and redraws every live section. */
function refreshDashboard() {
  const allDetections = getSessionDetections();
  const stats = getMockSummaryStats(allDetections);

  renderMonitoringStatus();
  renderSummaryCards(stats);
  renderComplianceChart(stats);
  renderStatusBarChart(stats);
  renderRecentActivity(allDetections);
}

document.addEventListener('DOMContentLoaded', () => {
  initShell('dashboard', 'Dashboard');
  initHeroVideo();

  refreshDashboard();

  // Monitoring keeps running while you're on this page (see
  // js/monitoring-engine.js): refresh the numbers as detections arrive, and
  // the status banner if it's started/stopped from somewhere else.
  MonitoringEngine.onDetections(refreshDashboard);
  MonitoringEngine.onStateChange(renderMonitoringStatus);
});
