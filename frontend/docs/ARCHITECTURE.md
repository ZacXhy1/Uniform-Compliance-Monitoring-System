# Architecture

How the pieces of this frontend-only app fit together. Read this before
touching shared files.

## Big picture

The app is a **multi-page static site**: each screen is its own HTML file in
`pages/`. Every navigation is a full page load, so anything that must survive
navigation (login, settings, the detection log, whether monitoring is running)
is kept in browser storage, not in JavaScript variables.

There are no ES modules or build tools. Scripts are plain `<script>` tags that
attach what they share to `window`, so the pages work from `file://` or any
static server.

## Script load order on a protected page

Order matters, because later scripts use globals defined by earlier ones.

| Order | Script | Purpose |
|---|---|---|
| 1 | `js/auth.js` (head) | `requireAuth()` redirects to login if not logged in |
| 2 | `js/settings.js` (head) | Applies saved theme/density before first paint |
| 3 | `js/boot.js` (head) | Hides page content until page scripts have run, so there is no flicker |
| 4 | `js/components/sidebar.js`, `header.js` | Draw the shell |
| 5 | `js/data/mock-data.js` | Seed data and the session detection log |
| 6 | `js/components/stat-card.js`, `modal.js`, `pagination.js` | Reusable UI (`pagination.js` only on Detections) |
| 7 | `js/app.js` | Shell init, formatters, toast/confirm, snapshot frame, correction helper |
| 8 | `js/monitoring-engine.js` | Background simulated detections |
| 9 | `js/pages/<page>.js` | The page's own rendering |

`pages/login.html` loads only `auth.js` and `pages/login.js`.

## Detection data

Single source of truth: `js/data/mock-data.js`.

A detection looks like this:

```js
{
  id: 'DTC-1001',
  label: 'Student 1',                // anonymous, not a real student
  timestamp: '2026-08-18T07:12:00',
  status: 'compliant',               // 'compliant' | 'violation' | 'pending'
  confidence: 0.97,
  reviewed: true                     // only present after a manual decision
}
```

There is intentionally no `location` field, because there is a single camera
(Main Gate).

Pages must use these functions, never the raw `MOCK_DETECTIONS` array:

| Function | What it does |
|---|---|
| `getSessionDetections()` | Returns the log; seeds it from `MOCK_DETECTIONS` on first use |
| `addSessionDetection(d)` | Appends a detection (used by the monitoring engine) |
| `reviewSessionDetection(id, status)` | Resolves a `pending` detection as compliant or violation |
| `correctSessionDetection(id, status)` | Flips a confident result between compliant and violation |
| `resetSessionDetections()` | Clears the log back to the seed (Settings reset button) |

Both review and correction set `reviewed: true`. Because every page reads the
same log, Dashboard, Violations, and Reports update automatically.

## Live monitoring engine

`js/monitoring-engine.js` runs on every protected page. A normal `setInterval`
would die on each navigation, so the engine instead:

- stores the on/off state and the time the next detection is due in
  `sessionStorage`;
- on each page load, generates any detections that came due during navigation
  (capped so a sleeping tab does not dump hundreds of rows);
- fires `ucms:detections` and `ucms:monitoring-state` events on `window`, which
  pages listen to through `MonitoringEngine.onDetections()` to re-render live.

`generateDetection()` is the function to edit to change the odds. The timing comes
from the saved **Refresh Interval** setting (2/4/8/15 seconds, default 4); the
engine reads it fresh on every tick and `applyIntervalChange()` makes a change apply
immediately (about 60% compliant, 30% violation, 10% pending). The webcam is page-bound: the
browser releases it on navigation and only Live Monitoring re-attaches it.

## Browser storage

| Storage | Key | Owner | Cleared by |
|---|---|---|---|
| `localStorage` | `ucs_demo_logged_in` | `js/auth.js` | Logout |
| `localStorage` | `ucms_settings` | `js/settings.js` | Settings → reset preferences |
| `sessionStorage` | `ucms_session_detections` | `js/data/mock-data.js` | Closing the tab, or Settings → reset detection data |
| `sessionStorage` | `ucms_monitoring_active` | `js/monitoring-engine.js` | Logout (set to `false` when monitoring is stopped) |
| `sessionStorage` | `ucms_monitoring_next_due` | `js/monitoring-engine.js` | Logout, or stopping monitoring |

## Styling

- `css/global.css` — design tokens (colors, spacing, type), resets, the app
  shell layout, and the light/dark themes via `[data-theme]` and compact
  density via `[data-density]` on `<html>`.
- `css/components.css` — shared components (sidebar, header, cards, modal,
  tables, status pills, buttons, pagination).
- `css/pages/*.css` — styles for one screen each.

The Detections table uses `table-layout: fixed` and a row height calculated
from the window height, with blank filler rows on short pages, so the table
keeps the same size across pagination and fits without a page scrollbar.

## Where to change things

| I want to... | Edit |
|---|---|
| Change detection odds | `generateDetection()` in `js/monitoring-engine.js` |
| Change how often detections are simulated | Settings → Monitoring → Refresh Interval (`refreshInterval` / `REFRESH_INTERVAL_OPTIONS` in `js/settings.js`; read by `getIntervalMs()` in the engine) |
| Animate table rows or horizontal bars | `animateTableRows()` / `playOnce()` in `js/app.js`, styles in the Motion section of `css/components.css` |
| Change the seed data | `MOCK_DETECTIONS` in `js/data/mock-data.js` |
| Show a real image/video in the snapshot frame | `renderEvidenceFrame()` in `js/app.js` |
| Change rows per page | `DETECTIONS_PER_PAGE` in `js/pages/detections.js`, `VIOLATIONS_PER_PAGE` in `js/pages/violations.js` |
| Add a setting | `DEFAULT_SETTINGS` in `js/settings.js`, then `js/pages/settings.js` |
| Change the demo credentials | `js/auth.js` |
