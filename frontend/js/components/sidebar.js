/* ==========================================================================
   Sidebar component
   Usage (in each page's own <script> at the bottom):
     renderSidebar('dashboard');
   The string passed in must match a `key` below so the right link gets
   the `is-active` class.
   ========================================================================== */

const SIDEBAR_LINKS = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>' },
  { key: 'monitoring', label: 'Live Monitoring', href: 'monitoring.html', icon: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>' },
  { key: 'detections', label: 'Detections', href: 'detections.html', icon: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>' },
  { key: 'violations', label: 'Violations', href: 'violations.html', icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>' },
  { key: 'reports', label: 'Reports', href: 'reports.html', icon: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>' },
  { key: 'settings', label: 'Settings', href: 'settings.html', icon: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>' },
];

function renderSidebar(activeKey) {
  const mount = document.getElementById('sidebar');
  if (!mount) return;

  // Pages render the sidebar early (inline, right after the mount point) so it
  // is there on the very first paint. initShell() calls this again later —
  // skip the redraw so nothing blinks or restarts its animation.
  if (mount.dataset.rendered === activeKey) return;

  const links = SIDEBAR_LINKS.map((link) => {
    const activeClass = link.key === activeKey ? ' is-active' : '';
    return `
      <a class="sidebar-link${activeClass}" href="${link.href}">
        <span class="sidebar-link-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${link.icon}</svg></span>
        <span class="sidebar-link-text">${link.label}</span>
      </a>`;
  }).join('');

  mount.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-brand-mark"></span>
        <span class="sidebar-brand-text">
          Uniform Compliance
          <span>Consolatrix College</span>
        </span>
      </div>
      <nav class="sidebar-nav">${links}</nav>
      <div class="sidebar-footer">${window.UCMS_CONFIG && window.UCMS_CONFIG.live ? 'Live system &middot; Main Gate' : 'Demo build &middot; no real data'}</div>
    </aside>
  `;
  mount.dataset.rendered = activeKey;
}
