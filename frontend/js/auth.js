/* ==========================================================================
   Demo authentication (Phase 1)
   Owner: Earl

   IMPORTANT: this is NOT real authentication. There is no backend, no
   password hashing, no session management — just a localStorage flag and
   a hardcoded demo credential pair. It exists so the rest of the app has
   something to gate access on. Never present this as production-grade
   security, in the UI or out loud.

   Loaded in <head> (before <body>) on every page so requireAuth() can run
   before any protected content paints.
   ========================================================================== */

const AUTH_STORAGE_KEY = 'ucs_demo_logged_in';
const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'admin123';

/** Returns true if the demo "logged in" flag is set. */
function isLoggedIn() {
  return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
}

/**
 * Checks demo credentials (hardcoded — see note above). On success, sets
 * the login flag in localStorage and returns true; otherwise returns false
 * and leaves the flag untouched.
 */
function login(username, password) {
  if (username === DEMO_USERNAME && password === DEMO_PASSWORD) {
    localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    return true;
  }
  return false;
}

/** Clears the demo login flag and sends the user back to the login page. */
function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  // Background monitoring (js/monitoring-engine.js) must not outlive the
  // login. Raw key strings: this file loads before the engine.
  sessionStorage.removeItem('ucms_monitoring_active');
  sessionStorage.removeItem('ucms_monitoring_next_due');
  window.location.href = 'login.html';
}

/**
 * Nav guard for protected pages. Call this synchronously in <head> (not
 * inside DOMContentLoaded) so an unauthenticated visitor is redirected
 * before the protected page's body ever renders.
 */
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
  }
}
