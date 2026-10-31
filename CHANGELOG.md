# Changelog

All notable changes to Discloner Studio are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.0] — 2026-10-31

The "Studio" release. Two new job modes, a resumable job engine, a priority queue, a rewritten
frontend, and a deployment story. The one-shot clone flow is unchanged in behaviour.

### Added

- **Continuous mirror mode.** A long-lived gateway session forwards new messages, and optionally
  edits, deletions and channel/role structure changes, into the target. Includes echo protection
  (bounded dedupe window), debounced structure sync, and per-session statistics.
- **Resumable jobs.** Stage-level checkpoints (stage, progress, completed stages, role/category/channel
  maps, per-channel message cursors) written atomically to disk. Resume from the last good stage after
  a crash, restart or reconnect, guarded by a one-time `resumeKey`.
- **Job pause/resume.** Cooperative pause gates before each stage and inside the long-running
  channel/message loops.
- **Multi-job queue.** Priority bands (`high`/`normal`/`low`), configurable concurrency, queue
  position, ETA from observed durations, per-job cancel and queue drain.
- **Feature flags.** `continuousMirror`, `multiJobQueue`, `resumableJobs`, `telemetry` — overridable
  via `FEATURE_*` environment variables and reflected in `/api/features`.
- **Environment configuration layer** (`services/config.js`) with typed parsing, clamping, warnings and
  a strict mode that fails the boot in production instead of silently degrading.
- **Structured logging** (`utils/logger.js`): levels, child loggers with context, pretty and JSON
  sinks, and exact-value credential redaction preserved from 2.x.
- **Opt-in telemetry** (`services/telemetry.js`): allowlisted event names, sanitised properties,
  60-second throttle, 5-second timeout, and no network activity unless the flag, the opt-in and an
  endpoint are all present.
- **Modular frontend.** `public/script.js` is gone; the client is ES modules under `public/js/`:
  `TokenManager`, `ServerSelector`, `ConfigPanel`, `ProgressTracker`, `ActivityConsole`, `ThemeManager`,
  `JobController`, `QueueView`, `JobClient` (the only module that touches Socket.IO), plus `core/` and
  `ui/` helpers. No framework, no build step.
- **Explicit client state machine** (`idle → preflight → starting → queued → running → paused →
  completed/failed/cancelled`) with illegal transitions ignored rather than thrown.
- **UI overhaul.** New hero and workflow stepper, mode switch, four-phase pipeline visualisation,
  quieter secondary actions with advanced configuration behind an accordion, sticky activity console,
  job queue panel, recoverable-vs-fatal recovery panel, and premium empty states.
- **Split stylesheet.** The 3,800-line `public/style.css` is replaced by `public/styles/` with
  token, base, component, panel, console, modal and responsive layers.
- **i18n foundation.** Every user-facing string routes through `t()` with an English catalogue.
- **Docker.** Multi-stage `Dockerfile` (non-root, read-only, `tini`, `HEALTHCHECK` on `/api/health`),
  hardened `docker-compose.yml`, and `.dockerignore`.
- **Tooling.** `npm run lint` (`node --check` sweep), `npm run dev` (watch mode), `npm run test:watch`,
  and jsdom promoted to a dev dependency so the browser-behaviour tests always run.
- **Docs.** Rewritten `README.md`, this changelog, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`.

### Changed

- `POST /api/jobs` is the canonical start endpoint; `POST /api/jobs/start` remains as a compatibility
  alias, as do the `start_clone` and `job:start` socket events.
- Job snapshots now include `mode`, `priority`, `queuePosition`, `estimatedWaitMs` and mirror stats.
- `GET /api/health` reports version, uptime, active jobs, queue depth and telemetry state.
- The default bind address remains `0.0.0.0`, but the documentation now recommends `127.0.0.1`.
- Message history remains **off** by default, and attachments remain gated behind it.

### Fixed

- The activity console's Save/Reset toolbar was clipped by a collapsed drawer (`max-height: 0`).
- The theme choice was overwritten with `light` on every page load.
- The primary CTA was nested inside the setup card, breaking the layout on narrow viewports.
- A resumed job could replay target cleanup; cleanup is now explicitly non-replayable.

### Security

- Checkpoints exclude credentials and webhook URLs by construction (allowlist of persisted fields).
- Resume and control operations require the capability key in addition to socket ownership.
- Same strict CSP, `nosniff`, `no-referrer` and `no-store` headers as 2.x; no inline scripts added.

### Migration from 2.x

- No data migration needed. Environment variables are additive; existing `PORT`/`HOST`/`ALLOWED_ORIGINS`
  behave identically.
- `.discloner/state/` is created on first run and is git-ignored.
- `public/script.js` and `public/style.css` were removed. Custom forks that patched them should port to
  `public/js/` and `public/styles/`.

---

## [2.3.0] — 2026-10-31

### Fixed

- Unclosed `#messageSettingsDrawer` hid the Save/Reset configuration toolbar inside a `max-height: 0`
  drawer, making preferences impossible to save.
- `initTheme()` overwrote a saved theme with `'light'` on every page load, so dark mode never persisted.

### Changed

- Activity console gained live per-severity counts, explicit empty states that distinguish "nothing
  happened yet" from "filters hide everything", and improved search.
- Workflow stepper now reflects real form state.
- Keyboard support: `Ctrl`/`Cmd` + `Enter` starts a migration; `Esc` dismisses the top-most dialog;
  dialogs trap focus and restore it to their trigger.
- Mobile: the primary action stays in the thumb zone; the header navigation scrolls horizontally.
- Reduced-motion support for progress sheen, counter bumps and dialog entrances; dark-mode muted text
  lifted to WCAG AA.

### Added

- `tests/uiDom.test.js` — jsdom suite for dashboard structure and client behaviour.

---

## [2.2.0] — 2026-10-30

### Added

- Job capability tokens: controlling a job requires socket ownership or the one-time token.
- Per-IP and per-socket rate limits for preflight and start, since both authenticate the account.
- Graceful shutdown on `SIGINT`/`SIGTERM`.

### Changed

- Tokens are memory-only by default; browser persistence is an explicit opt-in.
- Logger performs exact-value redaction of any registered credential.

---

## [2.1.0] — 2026-10-29

### Added

- Rate-limit aware operation executor with exponential backoff and jitter.
- Error taxonomy separating recoverable from fatal failures.
- Skip-and-continue behaviour for individual channels and roles.

---

## [2.0.0] — 2026-10-28

### Added

- Neumorphic design system with light and dark themes.
- Staged cloning pipeline with live progress, item counts and elapsed timer.
- Preflight checks for both guilds before a migration starts.
