# Incident Desk

A lightweight, fully static incident-management dashboard for an engineering team.
No framework, no build tooling, no dependencies: HTML + CSS + vanilla JavaScript,
with a small Python build script run through `uv`.

## Build

```sh
uv run python scripts/build.py
```

The build validates the sources (`index.html`, `styles.css`, `app.js`) with
lightweight structural checks, then recreates `dist/` cleanly and copies the
application into it. Any failure exits non-zero with a clear message.

## Preview the production output

```sh
uv run python -m http.server 4173 -d dist
```

Then open http://127.0.0.1:4173. The `dist/` directory is deployable to any
ordinary static site host.

## Features

- Service health dashboard (Operational / Degraded / Partial Outage / Major Outage)
- Incident list with severity, status, start time, latest update, affected services
- Create incidents, add timeline updates, mark monitoring, resolve
- Filter by status and severity; search by title or affected service
- State persisted in `localStorage`; demo data seeded on first launch
- Export all data to JSON; import with structural validation; reset demo data
- Light/dark/system themes, persisted locally
- Keyboard usable, semantic HTML, `prefers-reduced-motion` respected

## Data

All state lives in `localStorage` under the key `incident-desk:v1`.
Imported JSON is validated structurally before it replaces the current state;
malformed or incompatible data is rejected without side effects.

## Files

- `index.html` — application shell
- `styles.css` — styling, themes, responsive layout
- `app.js` — application logic
- `scripts/build.py` — stdlib-only build/validate script
- `dist/` — generated output (created by the build)
