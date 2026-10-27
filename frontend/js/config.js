/* ==========================================================================
   Runtime config — decides between LIVE mode and DEMO mode.

   LIVE: the dashboard talks to the FastAPI backend (camera feed, RFID/button
         checks, results stored in Supabase). This is the default when the
         site is served by the backend, e.g. http://localhost:8000.
   DEMO: the original frontend-only simulation (fake detections in the
         browser). This is the default on GitHub Pages and for file:// opens.

   Override from the browser console, then reload:
     localStorage.setItem('ucms_api_base', 'http://192.168.1.50:8000') // live, remote server
     localStorage.setItem('ucms_api_base', 'demo')                     // force demo mode
     localStorage.removeItem('ucms_api_base')                          // back to automatic

   Loaded in <head> on every page, before anything that reads UCMS_CONFIG.
   ========================================================================== */
(function () {
  var saved = null;
  try { saved = localStorage.getItem('ucms_api_base'); } catch (err) { /* storage blocked */ }

  var onPages = /github\.io$/.test(location.hostname);
  var onFile = location.protocol === 'file:';
  var live;
  var base = '';

  if (saved === 'demo') {
    live = false;
  } else if (saved) {
    live = true;
    base = saved.replace(/\/+$/, '');
  } else {
    live = !(onPages || onFile);   // same origin as the backend
  }

  function apiUrl(path) { return base + path; }

  function wsUrl() {
    if (base) return base.replace(/^http/, 'ws') + '/ws';
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  window.UCMS_CONFIG = { live: live, apiBase: base, apiUrl: apiUrl, wsUrl: wsUrl };
})();
