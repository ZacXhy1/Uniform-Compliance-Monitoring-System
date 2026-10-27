/* ==========================================================================
   Settings — page logic
   Owner: Dean (Phase 7)

   Reads/writes preferences via js/settings.js (getSettings, saveSettings,
   resetSettings — loaded in <head> on every page so theme/density apply
   app-wide, not just here). This file is only responsible for the form
   UI and for the demo data reset action.
   ========================================================================== */

const isLive = Boolean(window.UCMS_CONFIG && window.UCMS_CONFIG.live);

function renderSettingsForm() {
  const settings = getSettings();
  const root = document.getElementById('settings-root');

  const username = typeof DEMO_USERNAME === 'string' ? DEMO_USERNAME : 'admin';
  const intervalOptions = (window.REFRESH_INTERVAL_OPTIONS || [2, 4, 8, 15])
    .map((sec) => `<option value="${sec}" ${Number(settings.refreshInterval) === sec ? 'selected' : ''}>Every ${sec} seconds</option>`)
    .join('');

  root.innerHTML = `
    <div class="card settings-section profile-card">
      <div class="profile-avatar" aria-hidden="true">D</div>
      <div class="profile-info">
        <div class="profile-name">Demo User <span class="profile-badge">Demo account</span></div>
        <div class="profile-role">Administrator</div>
        <dl class="profile-details">
          <div><dt>Username</dt><dd>${username}</dd></div>
          <div><dt>Institution</dt><dd>Consolatrix College of Toledo City Inc.</dd></div>
          <div><dt>Checkpoint</dt><dd>${CAMERA_LOCATION}</dd></div>
        </dl>
      </div>
    </div>

    <div class="card settings-section">
      <h2>Appearance</h2>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>Dark Mode</strong>
          <p class="form-hint">Switch the dashboard to a dark color scheme.</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="setting-theme" ${settings.theme === 'dark' ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="card settings-section">
      <h2>Display</h2>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>Compact View</strong>
          <p class="form-hint">Reduce spacing in cards and tables to fit more on screen.</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="setting-compact" ${settings.compactView ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="card settings-section">
      <h2>Notifications</h2>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>Detection Alerts</strong>
          <p class="form-hint">Show an alert when a new violation is detected.</p>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="setting-notifications" ${settings.notifications ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-row settings-row--action">
        <p class="form-hint" id="notification-test-hint">
          ${settings.notifications
            ? 'Alerts are on — send a sample to see how it looks.'
            : 'Alerts are off. Turn them on to send a sample.'}
        </p>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          id="test-notification-btn"
          ${settings.notifications ? '' : 'disabled'}
        >
          Send Test Alert
        </button>
      </div>
    </div>

    ${isLive ? '' : `<div class="card settings-section">
      <h2>Monitoring</h2>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>Refresh Interval</strong>
          <p class="form-hint">How often Live Monitoring simulates a new detection.</p>
        </div>
        <select class="select" id="setting-refresh-interval" aria-label="Refresh interval">
          ${intervalOptions}
        </select>
      </div>
    </div>`}

    <div class="card settings-section">
      <h2>${isLive ? 'Data' : 'Demo Data'}</h2>
      <p class="form-hint">
        ${isLive
          ? 'Detections are stored by the backend and loaded from it. Manual review changes you make here are kept in this browser tab only. Resetting clears those local changes and reloads the saved results.'
          : 'This is a frontend-only demo build — detections live in this browser tab\'s session only, and preferences live in this browser. Use these controls to reset either one back to a clean state.'}
      </p>
      <div class="settings-actions">
        <button type="button" class="btn btn-secondary" id="reset-detections-btn">Reset Detection Data</button>
        <button type="button" class="btn btn-secondary" id="restore-defaults-btn">Restore Default Settings</button>
      </div>
    </div>
  `;

  wireSettingsForm();

  // Only the first draw plays the entrance animation (see components.css).
  if (!root.dataset.timer) {
    root.dataset.timer = '1';
    setTimeout(() => { root.dataset.drawn = '1'; }, 1000);
  }
}

function wireSettingsForm() {
  document.getElementById('setting-theme').addEventListener('change', (event) => {
    saveSettings({ theme: event.target.checked ? 'dark' : 'light' });
    showToast('Theme updated.');
  });

  document.getElementById('setting-compact').addEventListener('change', (event) => {
    saveSettings({ compactView: event.target.checked });
    showToast('Display preference updated.');
  });

  document.getElementById('setting-notifications').addEventListener('change', (event) => {
    saveSettings({ notifications: event.target.checked });
    renderSettingsForm();
    showToast(event.target.checked ? 'Detection alerts turned on.' : 'Detection alerts turned off.');
  });

  const intervalSelect = document.getElementById('setting-refresh-interval');
  if (intervalSelect) intervalSelect.addEventListener('change', (event) => {
    const seconds = Number(event.target.value);
    saveSettings({ refreshInterval: seconds });
    MonitoringEngine.applyIntervalChange(); // takes effect now if monitoring is running
    showToast(`Refresh interval set to every ${seconds} seconds.`);
  });

  document.getElementById('test-notification-btn').addEventListener('click', () => {
    showToast('Sample alert: a new student was flagged — not in uniform (Main Gate).', 'warning');
  });

  document.getElementById('reset-detections-btn').addEventListener('click', () => {
    confirmAction(
      'Reset detection data?',
      'This clears every detection generated this session and restores the original demo dataset. This cannot be undone.',
      () => {
        resetSessionDetections();
        if (isLive) LiveAPI.syncLogs();
        showToast(isLive ? 'Reloaded saved results from the server.' : 'Detection data reset.');
      },
    );
  });

  document.getElementById('restore-defaults-btn').addEventListener('click', () => {
    confirmAction(
      'Restore default settings?',
      'This resets theme, display, notification, and monitoring preferences back to their defaults. If Live Monitoring is running, it switches back to the default interval.',
      () => {
        resetSettings();
        MonitoringEngine.applyIntervalChange();
        renderSettingsForm();
        showToast('Settings restored to defaults.');
      },
    );
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initShell('settings', 'Settings');
  renderSettingsForm();
});
