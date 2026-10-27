/* ==========================================================================
   Mock data — SINGLE SOURCE OF TRUTH for simulated detections.
   Dashboard, Live Monitoring, Detections, Violations, and Reports should
   all read from MOCK_DETECTIONS (and derive stats from it) rather than
   hardcoding their own numbers. No backend — this is a static array that
   simulates what a real detection pipeline would produce.

   SCOPE (important — do not expand without checking with the team):
   - The system only detects whether a person is wearing "School Uniform"
     as a single category. It does NOT distinguish blouse vs. polo,
     pants vs. skirt, or any other sub-type — a detection is simply
     'compliant' (in school uniform) or 'violation' (not in school
     uniform).
   - No ID lace detection. No footwear detection.
   - No student identification of any kind — there is no way for a
     camera to know who someone is, so records use a generic on-screen
     label ("Student 1", "Student 2", ...) rather than a real name or
     student number. Treat these as anonymous, unlinked detection
     events, not student records.
   - Single camera, fixed location: Main Gate. There is only ever one
     checkpoint in this simulation, so records do NOT carry a `location`
     field — don't add one, and don't build location filters/dropdowns
     on Live Monitoring, Detections, Reports, etc. If the project scope
     later adds more cameras, this is the file to revisit.

   Loaded as a plain script (no ES modules) so pages can open via
   file:// or a simple static server without CORS issues. Everything is
   attached to `window` so any page script can read it after this file
   loads first.
   ========================================================================== */

const CAMERA_LOCATION = 'Main Gate';

// status: 'compliant' (wearing school uniform) | 'violation' (not wearing
// school uniform) | 'pending' (detection unclear, needs manual review)
const MOCK_DETECTIONS = [
  {
    id: 'DTC-1001',
    label: 'Student 1',
    timestamp: '2026-08-18T07:12:00',
    status: 'compliant',
    confidence: 0.97,
  },
  {
    id: 'DTC-1002',
    label: 'Student 2',
    timestamp: '2026-08-18T07:15:00',
    status: 'violation',
    confidence: 0.91,
  },
  {
    id: 'DTC-1003',
    label: 'Student 3',
    timestamp: '2026-08-18T09:40:00',
    status: 'violation',
    confidence: 0.88,
  },
  {
    id: 'DTC-1004',
    label: 'Student 4',
    timestamp: '2026-08-18T10:05:00',
    status: 'compliant',
    confidence: 0.95,
  },
  {
    id: 'DTC-1005',
    label: 'Student 5',
    timestamp: '2026-08-18T10:22:00',
    status: 'pending',
    confidence: 0.52,
  },
  {
    id: 'DTC-1006',
    label: 'Student 6',
    timestamp: '2026-08-18T13:01:00',
    status: 'violation',
    confidence: 0.93,
  },
  {
    id: 'DTC-1007',
    label: 'Student 7',
    timestamp: '2026-08-18T13:18:00',
    status: 'compliant',
    confidence: 0.96,
  },
  {
    id: 'DTC-1008',
    label: 'Student 8',
    timestamp: '2026-08-18T13:40:00',
    status: 'violation',
    confidence: 0.89,
  },
];

// Aggregate stats — Dashboard/Reports should compute these FROM
// MOCK_DETECTIONS rather than hardcoding, but a precomputed shape is
// provided here as a reference for what that summary should look like.
function getMockSummaryStats(detections) {
  const data = detections || MOCK_DETECTIONS;
  const total = data.length;
  const compliant = data.filter((d) => d.status === 'compliant').length;
  const violations = data.filter((d) => d.status === 'violation').length;
  const pending = data.filter((d) => d.status === 'pending').length;
  return {
    total,
    compliant,
    violations,
    pending,
    complianceRate: total ? Math.round((compliant / total) * 100) : 0,
  };
}

/* --------------------------------------------------------------------
   Session-persisted detection log.

   A plain in-memory array resets every time the browser loads a new
   page — that's normal for a multi-page site with no backend, but it
   means anything Live Monitoring "detects" would vanish the moment you
   navigate away, and Detections would never see it. sessionStorage
   fixes that: it survives navigation within the same tab, but clears
   when the tab closes — exactly "persist for this session, not
   forever."

   getSessionDetections() is what every page should read from now
   (Live Monitoring, Detections, and eventually Dashboard/Violations/
   Reports) instead of the raw MOCK_DETECTIONS array, so a detection
   generated on one page is immediately visible on every other page
   too, for the rest of that browser session.
   -------------------------------------------------------------------- */

const SESSION_STORAGE_KEY = 'ucms_session_detections';

// LIVE mode: staff reviews/corrections only exist in this browser tab (the
// backend has no endpoint for them), so they are remembered here and
// re-applied each time the log is reloaded from the server (js/live-api.js).
const OVERRIDES_KEY = 'ucms_overrides';

function rememberOverride(id, status) {
  try {
    const all = JSON.parse(sessionStorage.getItem(OVERRIDES_KEY) || '{}');
    all[id] = status;
    sessionStorage.setItem(OVERRIDES_KEY, JSON.stringify(all));
  } catch (err) {
    // Ignore — the review still applies until the next reload from the server.
  }
}

/** Returns the current session's detection log, seeding it from
 *  MOCK_DETECTIONS the first time it's ever called in a session. */
function getSessionDetections() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    // sessionStorage unavailable (privacy mode, etc.) — fall through to
    // the static seed below rather than breaking the page.
  }
  // LIVE mode starts empty: real results are loaded from the backend (js/live-api.js).
  const live = window.UCMS_CONFIG && window.UCMS_CONFIG.live;
  const seed = live ? [] : [...MOCK_DETECTIONS];
  saveSessionDetections(seed);
  return seed;
}

/** Overwrites the whole session detection log. */
function saveSessionDetections(list) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    // Ignore — worst case, state just won't persist across pages.
  }
}

/** Appends one detection to the session log and persists it. Returns
 *  the updated array. */
function addSessionDetection(detection) {
  const list = getSessionDetections();
  list.push(detection);
  saveSessionDetections(list);
  return list;
}

/** Manual review of a 'pending' detection: a staff member decides whether
 *  the unclear detection was actually compliant or a violation. Updates
 *  the status in the session log and marks the record `reviewed: true`
 *  so the UI can show it was resolved by a person, not the "AI".
 *  Because every page reads getSessionDetections(), Dashboard, Violations
 *  and Reports all reflect the decision automatically.
 *  Returns the updated detection, or null if it wasn't found/pending. */
function reviewSessionDetection(id, newStatus) {
  if (newStatus !== 'compliant' && newStatus !== 'violation') return null;
  const list = getSessionDetections();
  const detection = list.find((d) => d.id === id);
  if (!detection || detection.status !== 'pending') return null;
  detection.status = newStatus;
  detection.reviewed = true;
  saveSessionDetections(list);
  rememberOverride(id, newStatus);
  return detection;
}

/** Manual CORRECTION of a confident detection: the system labelled someone
 *  'compliant' or 'violation' with high confidence (so it never went to
 *  pending review) but a staff member can see it got it wrong. Flips the
 *  status to the other value and marks the record `reviewed: true` — same
 *  flag reviewSessionDetection() uses, meaning "a person decided this".
 *  Every page reads getSessionDetections(), so Dashboard, Violations and
 *  Reports all update automatically.
 *  Returns the updated detection, or null if it wasn't found or the
 *  change isn't a valid compliant <-> violation switch. */
function correctSessionDetection(id, newStatus) {
  if (newStatus !== 'compliant' && newStatus !== 'violation') return null;
  const list = getSessionDetections();
  const detection = list.find((d) => d.id === id);
  if (!detection) return null;
  if (detection.status !== 'compliant' && detection.status !== 'violation') return null;
  if (detection.status === newStatus) return null;
  detection.status = newStatus;
  detection.reviewed = true;
  saveSessionDetections(list);
  rememberOverride(id, newStatus);
  return detection;
}

/** Clears the session log back to the static seed. Not wired to any UI
 *  yet — Settings (Phase 7) can call this for a "reset demo data" action. */
function resetSessionDetections() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(OVERRIDES_KEY);
}

window.CAMERA_LOCATION = CAMERA_LOCATION;
window.MOCK_DETECTIONS = MOCK_DETECTIONS;
window.getMockSummaryStats = getMockSummaryStats;
window.getSessionDetections = getSessionDetections;
window.saveSessionDetections = saveSessionDetections;
window.addSessionDetection = addSessionDetection;
window.resetSessionDetections = resetSessionDetections;
window.reviewSessionDetection = reviewSessionDetection;
window.correctSessionDetection = correctSessionDetection;
