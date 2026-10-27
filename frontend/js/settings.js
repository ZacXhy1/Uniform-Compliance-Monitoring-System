/* ==========================================================================
   Settings store + live application (Phase 7)
   Owner: Dean

   Preferences persist to localStorage (unlike the sessionStorage-backed
   detection log, these are meant to survive closing the tab) and are
   applied to <html> as data-attributes that global.css reacts to.

   Loaded in <head> on every page, right after auth.js, so the saved
   theme/density apply before the page paints — no flash of the wrong
   theme when navigating between pages.
   ========================================================================== */

const SETTINGS_STORAGE_KEY = 'ucms_settings';

const DEFAULT_SETTINGS = {
  theme: 'light',        // 'light' | 'dark'
  compactView: false,    // true = tighter spacing in tables/cards/layout
  notifications: true,   // true = demo detection alerts are "on"
  refreshInterval: 4,    // seconds between simulated detections (see REFRESH_INTERVAL_OPTIONS)
};

// The choices offered in Settings -> Monitoring -> Refresh Interval.
const REFRESH_INTERVAL_OPTIONS = [2, 4, 8, 15];

/** Returns the current settings, merged with defaults for any key that
 *  isn't in localStorage yet (so adding a new setting later never breaks
 *  an existing saved preferences object). */
function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    // Corrupt or unavailable storage (privacy mode, etc.) — fall through
    // to defaults rather than breaking the page.
  }
  return { ...DEFAULT_SETTINGS };
}

/** Merges `partial` into the stored settings, persists, and immediately
 *  re-applies them to the page. Returns the full updated settings object. */
function saveSettings(partial) {
  const updated = { ...getSettings(), ...partial };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    // Ignore — worst case the preference just won't survive a reload.
  }
  applySettings(updated);
  return updated;
}

/** Restores factory-default settings ("Restore Default Settings" on the
 *  Settings page) and re-applies them. */
function resetSettings() {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch (err) {
    // Ignore.
  }
  applySettings(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}

/** Applies settings to <html> so CSS can react via attribute selectors
 *  (see `[data-theme]` / `[data-density]` in global.css). Safe to call
 *  before <body> exists — only touches the <html> element. */
function applySettings(settings) {
  const s = settings || getSettings();
  document.documentElement.setAttribute('data-theme', s.theme);
  document.documentElement.setAttribute(
    'data-density',
    s.compactView ? 'compact' : 'comfortable',
  );
}

// Apply immediately (this file loads in <head>, before <body> paints) so
// every page reflects the saved theme/density from the very first frame.
applySettings();

window.SETTINGS_STORAGE_KEY = SETTINGS_STORAGE_KEY;
window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
window.REFRESH_INTERVAL_OPTIONS = REFRESH_INTERVAL_OPTIONS;
window.getSettings = getSettings;
window.saveSettings = saveSettings;
window.resetSettings = resetSettings;
window.applySettings = applySettings;
