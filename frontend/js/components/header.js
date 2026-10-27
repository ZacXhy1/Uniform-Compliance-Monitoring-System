/* ==========================================================================
   Header component
   Usage: renderHeader('Dashboard');
   User identity is still a static demo label (no real accounts — see
   PROJECT_BRIEF.md Section 8). Logout is real as of Phase 1: it clears the
   demo auth flag via js/auth.js and redirects to login.html.
   ========================================================================== */

function renderHeader(pageTitle) {
  const mount = document.getElementById('header');
  if (!mount) return;

  // Rendered early by an inline script on each page; initShell() calls this
  // again once everything has loaded. Only (re)build the markup the first
  // time, then just make sure the live-monitoring hooks are wired up.
  if (mount.dataset.title !== pageTitle) {
    drawHeader(mount, pageTitle);
  }

  updateHeaderLive();
  // MonitoringEngine loads after this file's first call, so subscribe lazily
  // (once) on whichever call finds it available.
  if (typeof MonitoringEngine !== 'undefined' && !mount.dataset.liveWired) {
    mount.dataset.liveWired = 'true';
    MonitoringEngine.onStateChange(updateHeaderLive);
  }
}

function drawHeader(mount, pageTitle) {
  mount.dataset.title = pageTitle;
  mount.innerHTML = `
    <header class="header">
      <h1 class="header-title">${pageTitle}</h1>
      <div class="header-user">
        <a class="header-live" id="header-live" href="monitoring.html" hidden
           title="Live Monitoring is running \u2014 open it">
          <span class="header-live-dot"></span>
          <span class="header-live-text">Monitoring live</span>
        </a>
        <span class="header-user-avatar">A</span>
        <span>Admin (Demo)</span>
        <button type="button" class="header-logout" id="logoutBtn">Log Out</button>
      </div>
    </header>
  `;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
}

/** Shows the "Monitoring live" pill on every page while Live Monitoring is
 *  running in the background. Hidden on the Monitoring page itself, which
 *  already shows its own LIVE status. */
function updateHeaderLive() {
  const pill = document.getElementById('header-live');
  if (!pill) return;
  // The header is drawn before monitoring-engine.js has loaded, so fall back to
  // reading the same sessionStorage flag the engine uses. That way the pill is
  // already correct on first paint instead of popping in later.
  const isActive = typeof MonitoringEngine !== 'undefined'
    ? MonitoringEngine.isActive()
    : sessionStorage.getItem('ucms_monitoring_active') === 'true';
  const onMonitoringPage = /monitoring\.html$/.test(window.location.pathname);
  pill.hidden = !isActive || onMonitoringPage;
}
