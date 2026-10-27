# Team Ownership

Ownership maps roughly to the approved project presentation. Everyone should
still review each other's work and understand the shared architecture — this
just marks who leads each area to avoid two people editing the same files at
once.

| Area | Owner | Primary files |
|---|---|---|
| Login / Auth UI | Earl | `pages/login.*`, `js/pages/login.js` |
| Dashboard & Reports | Paul | `pages/dashboard.*`, `pages/reports.*` |
| Live Monitoring & Detections | Zachary | `pages/monitoring.*`, `pages/detections.*` |
| Violations, Settings & UI Polish | Dean | `pages/violations.*`, `pages/settings.*` |

## Shared files (coordinate before editing)

- `index.html`
- `js/app.js`
- `js/auth.js`
- `js/boot.js`
- `js/settings.js`
- `js/monitoring-engine.js`
- `js/data/mock-data.js`
- `css/global.css`
- `css/components.css`
- `js/components/`
- `.github/workflows/static.yml` (pushing to `main` redeploys GitHub Pages)

## Ground rules

- `git pull` before starting work.
- Don't push over someone else's in-progress files.
- Push commits under your own GitHub account — don't commit work on someone
  else's behalf.
- Keep shared files (especially `mock-data.js`) as a single source of truth;
  don't fork the dataset per page.
