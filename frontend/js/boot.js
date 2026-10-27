/* ==========================================================================
   Page boot — prevents the flicker when navigating between pages.

   Every page is a separate HTML file, so each navigation loads a fresh
   document. The sidebar/header are drawn by an inline script at the top of
   the page, but the page's own content (stat cards, tables, charts) is only
   filled in by js/pages/*.js on DOMContentLoaded. Without this file the
   browser paints the empty cards first and then the content pops in.

   This script (loaded in <head>) hides .app-content until the page scripts
   have run, then reveals it on the next frame. See `html.is-booting` in
   css/global.css.
   ========================================================================== */
(function () {
  var root = document.documentElement;
  root.classList.add('is-booting');

  function reveal() {
    root.classList.remove('is-booting');
    // Starts the page entrance animation (css/components.css) at the moment the
    // content becomes visible, so it is never played while still hidden.
    root.classList.add('page-ready');
  }

  // All DOMContentLoaded handlers (including each page's renderer) run in one
  // task; rAF fires after that task, right before the next paint.
  document.addEventListener('DOMContentLoaded', function () {
    requestAnimationFrame(reveal);
  });

  // Safety net: never leave a page blank if a script throws or never loads.
  setTimeout(reveal, 2000);
})();
