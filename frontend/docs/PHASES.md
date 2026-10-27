# Phase Plan

The project is built feature-by-feature rather than all at once. Each phase
should be stable and testable before moving to the next.

## Status at a glance

| Phase | Area | Status |
|---|---|---|
| 0 | Prep | Done |
| 1 | Login | Done |
| 2 | Dashboard | Done (includes bar chart and hologram video) |
| 3 | Live Monitoring | Done |
| 4 | Detections | Done (plus manual review, correction, snapshots, pagination, fixed-size table) |
| 5 | Violations | Done |
| 6 | Reports | Done |
| 7 | Settings | Done |
| 8 | Polish | In progress |
| 9 | Final testing & feature freeze | Not started |

## Phase 0 — Prep (no feature code yet)

- Confirm stack, inspect repo, establish folder structure (this scaffold).
- Global styles / design tokens.
- Application shell, sidebar, header.
- All seven page/view files created (can be empty/stubbed).
- Mock detection data structure in `js/data/mock-data.js`.
- Working navigation between pages.
- Confirm Git workflow with the whole team (branching, pulling, commit ownership).

**Deliverable:** an empty but navigable app shell with no real screens built yet — the foundation everyone builds on top of.

**Status: done.**

## Phase 1 — Login

- Login screen UI.
- Demo login state (`localStorage`).
- Login validation (demo-level, not real security).
- Logout.
- Navigation guard behavior (redirect if not "logged in").

**Deliverable:** a working demo login/logout flow that gates access to the rest of the app.

**Status: done.** Demo credentials `admin` / `admin123`; `requireAuth()` guards every protected page.

## Phase 2 — Dashboard

- Dashboard layout.
- Summary/stat cards driven by mock data.
- Recent activity feed.

**Status: done.** Fits one screen on desktop without scrolling (smaller
windows scroll normally). Includes Live Monitoring status, a looping hologram
video with four KPI cards, a compliance donut, a detections-by-status bar chart
(plain CSS), and Recent Activity. Everything reads from
`getSessionDetections()`.

## Phase 3 — Live Monitoring

- Camera simulation.
- Monitoring status.
- Detection simulation.
- Detection result card.
- Recent detection events.

**Deliverable:** the app feels like a live monitoring system despite no real camera/AI.

**Status: done.** Optional real webcam (visual only) with a simulated
fallback, CCTV-style status/clock overlay, detections generated every few
seconds (~60% compliant / 30% violation / 10% pending), a Latest Detection
card with a snapshot frame, and a Recent Detections table.

Monitoring now keeps running on every protected page through
`js/monitoring-engine.js`: the on/off state and next-due time live in
`sessionStorage`, a "Monitoring live" pill shows in the header, other pages
re-render as detections arrive, and new violations raise an alert when
Settings → Detection Alerts is on. See `docs/ARCHITECTURE.md`.

## Phase 4 — Detections

- Data-driven detection table.
- Search, filters, sorting.
- Details modal/view.
- Empty states.

**Deliverable:** personnel can review the complete simulated detection history.

**Status: done.** Beyond the original list:

- **Pagination** — 15 rows per page via the reusable
  `js/components/pagination.js`; returns to page 1 whenever search, filter, or
  sort changes.
- **Manual review of `pending` detections** — a banner counts detections
  awaiting review; the details modal lets personnel confirm a pending
  detection as compliant or a violation (marked `reviewed: true`). Dashboard,
  Violations, and Reports update automatically.
- **Correction of confident results** — the details modal (also on Violations)
  lets personnel switch a compliant or violation result to the other one after
  a confirmation. The record is marked `reviewed: true`.
- **Snapshot frame** — every detection's modal shows an evidence snapshot
  (empty-avatar placeholder for now) so reviewers aren't judging from text
  and numbers alone.
- **Layout fixes** — the "Time" column is now "Date & Time"; the Date & Time,
  Status, and Confidence columns are centered; the table uses a fixed layout
  and fixed row heights (with blank filler rows on short pages) so it does not
  resize between pages; and rows scale with the window height so the table and
  pagination fit the base view without a scrollbar.

## Phase 5 — Violations

- Non-compliant filtering.
- Violation table/cards.
- Violation details.
- Violation summaries over time.

**Deliverable:** personnel can quickly review uniform violations.

**Status: done.** Stats row, by-date summary, search/date filter/sort, and a
details modal (with snapshot frame) reusing the shared modal.

## Phase 6 — Reports

- Compliance statistics.
- Charts.
- Date/filter controls if appropriate.
- Breakdown by time/date (all detections are from the single Main Gate camera).
- Summary report UI.

**Deliverable:** personnel can understand trends in compliance.

**Status: done.** Date filter, stat cards, compliance overview chart, summary
report, and a detections-by-date trend. No PDF/Excel export (out of scope).

## Phase 7 — Settings

- Preferences (theme, notifications, display).
- Demo reset.
- `localStorage` persistence.

**Deliverable:** settings actually affect the frontend where appropriate.

**Status: done.** Theme (light/dark), compact view, and notification
preferences persist in `localStorage`; separate confirm-first resets for
preferences and for detection data.

## Phase 8 — Polish

- Responsive layouts.
- Empty / loading / error states.
- Validation.
- Transitions.
- Consistent spacing & typography.
- Accessibility.
- Mobile usability.
- Cross-page consistency.

**Status: in progress.** Already in place: empty states on Detections and
Violations, toast confirmations, confirm-before-reset dialogs, pagination on
Detections, a responsive sidebar that collapses to icons on small screens,
pagination on Violations, table-row / bar / settings entrance animations, `js/boot.js` to stop content flicker between pages, and `js/settings.js`
loaded in `<head>` on every protected page so the saved theme and compact view
apply everywhere.

Still to check:

- The login page does not load `js/settings.js`, so it always uses the default
  theme. Decide whether that is acceptable.
- Loading states where appropriate, and a full accessibility pass.
- Test layouts at tablet and mobile widths on every page, including the
  Detections table (its row height is tuned for desktop windows).

## Phase 9 — Final testing & feature freeze

Test the complete flow: open app → login → dashboard → live monitoring →
detections → filter detections → violations → reports → settings → refresh
browser (confirm `localStorage` behavior) → logout → confirm protected/demo
pages behave correctly → mobile layout → empty/error states.

After feature freeze, avoid adding large new features unless there's time to
test them properly.
