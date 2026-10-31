# DISCLONER STUDIO

> **Precision Discord server migration, continuous mirroring and resumable jobs.**

Discloner Studio is a self-hosted control room for moving a Discord server — or keeping two of them in
sync — without losing structure, permissions or history. It is built for administrators who want an
auditable, interruptible copy rather than a one-shot script they have to babysit.

```
     ┌──────────────┐        ┌────────────────────┐        ┌──────────────┐
     │    SOURCE    │───────▶│  DISCLONER STUDIO  │───────▶│    TARGET    │
     │    guild     │  read  │  jobs · queue · UI │  write │    guild     │
     └──────────────┘        └────────────────────┘        └──────────────┘
```

---

## ⚠️ Read this before you start

- **This tool authenticates as a user account.** It uses `discord.js-selfbot-v13` with a *user token*,
  which is **against Discord's Terms of Service**. Accounts used this way can be permanently disabled.
  Use a throwaway account, on servers you own, with your eyes open.
- **It can delete things.** *Clean target server* purges existing channels and custom roles on the
  target. There is a confirmation dialog, and the operation is never replayed by a resume — but it is
  still destructive.
- **It is a credential-accepting UI.** By default it binds to `0.0.0.0:3000`. If the host is reachable
  from an untrusted network, set `HOST=127.0.0.1` (recommended) or put it behind an authenticating
  reverse proxy with TLS. Never expose it to the public internet as-is.

---

## Features

### Migration modes

| Mode | What it does | When to use it |
| --- | --- | --- |
| **One-shot clone** | Copies roles, categories, channels, permission overwrites, branding, emojis, stickers, webhooks and (optionally) recent messages, then stops. | A straight migration. |
| **Continuous mirror** | Keeps a long-lived gateway session open and forwards new messages (plus optional edits, deletions and structure changes) into the target in near real time. | Parallel/dual-running servers, archives, staging. |

Both modes share the same engine, the same checkpoint format and the same UI.

### Resumable jobs

Every stage writes a checkpoint: current stage, progress, completed stages, created role/channel maps
and per-channel message cursors. If the process restarts, the browser reloads or the socket drops, the
job can be resumed from the last good stage instead of starting over.

- Checkpoints are written atomically (`tmp` + `rename`) to `.discloner/state/` by default.
- A checkpoint **never** contains a token, a webhook URL or message content — only IDs, stage names and counters.
- Resuming requires the one-time `resumeKey` issued when the job started, so another tab cannot hijack it.
- Cleanup of the target is deliberately non-replayable: a resume never re-deletes anything.

### Multi-job queue

- Concurrent execution with a configurable ceiling (`MAX_CONCURRENT_JOBS`, default **2**).
- Priority bands — `high`, `normal`, `low` — FIFO inside each band.
- Visible position and estimated wait, derived from observed job durations.
- Cancel one job, or drain the whole queue.

### Error handling

Failures are classified before they reach the UI:

- **Recoverable** (rate limits, timeouts, transient gateway errors) — retried with exponential backoff
  and jitter; if it still fails, the job is offered as resumable.
- **Fatal** (bad token, missing permissions, invalid IDs) — surfaced immediately with a recovery action,
  no pointless retries.
- **Skip-and-continue** — a single unwritable channel or role does not abort the whole migration.

### Interface

- **Three-step workflow** — Token → Source & Target → Clone — that reflects real form state.
- **Live pipeline** — stage pill, four-phase pipeline, percentage bar with sheen, per-stage item counts,
  and an ETA derived from elapsed progress.
- **Activity console** — severity filters with live counts, search, clipboard export, and empty states
  that distinguish *"nothing has happened yet"* from *"your filter hides everything"*.
- **Quiet by default** — advanced options live behind an accordion; the primary action is the only
  filled button on the page.
- **Mobile-first** — stacked routing cards, a pinned action in the thumb zone, safe-area padding,
  horizontally scrolling filter chips.
- **Accessible** — WCAG AA contrast in both themes, visible focus rings, focus-trapped dialogs,
  skip link, `aria-live` announcements, and every animation collapses under `prefers-reduced-motion`.

### Security model

- **Credentials stay in memory.** The token lives in the job's closure; it is never persisted. The
  browser keeps it in memory too, unless you explicitly enable *Remember token on this device* (which
  stores it **unencrypted** in `localStorage` — the UI says so).
- **Exact-value redaction.** Any accepted token is registered with the logger and scrubbed from every
  log line, error detail and socket payload, even if it does not match Discord's token shape.
- **Job capability tokens.** Controlling a job requires the owning socket *or* the 24-byte capability
  token issued at start.
- **Rate limiting.** Starts and preflights are throttled per IP and per socket because both
  authenticate the account.
- **Strict CSP.** `script-src 'self'`, no inline scripts, `nosniff`, `no-referrer`, `no-store` on API
  responses.
- **No outbound telemetry** unless you set both `FEATURE_TELEMETRY=true` and `TELEMETRY_OPT_IN=true`
  *and* provide an endpoint. See `SECURITY.md`.

---

## Quick start

```bash
git clone https://github.com/argamerzz9582-debug/Discloner.git
cd Discloner
npm install
npm start
```

Open <http://localhost:3000>.

Requirements: **Node.js 20+** and a Discord account that can see the source server and administer the
target server (`Manage Channels`, `Manage Roles`, `Manage Webhooks`, ideally `Administrator`).

### Docker

```bash
docker compose up --build        # http://localhost:3000
```

Or without Compose:

```bash
docker build -t discloner:3.0.0 .
docker run --rm -p 127.0.0.1:3000:3000 -v discloner-state:/data discloner:3.0.0
```

The image is multi-stage (no build tooling in the final layer), runs as an unprivileged user, is
read-only with a `tmpfs` for `/tmp`, and ships a `HEALTHCHECK` wired to `/api/health`.

---

## Configuration

Everything is optional; copy `.env.example` to `.env` to override.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind address. **Use `127.0.0.1`** unless behind a proxy. |
| `ALLOWED_ORIGINS` | *unset* | Comma-separated CORS/Socket.IO allowlist. Unset = same-origin only. `*` is accepted but warned about. |
| `MAX_CONCURRENT_JOBS` | `2` | 1–5. |
| `MAX_QUEUED_JOBS` | `20` | 1–200. |
| `MAX_MIRROR_SESSIONS` | `1` | 1–5. Each mirror holds a gateway connection. |
| `PERSIST_JOBS` | `true` | Disable for fully ephemeral jobs (resume becomes unavailable). |
| `JOB_STATE_DIR` | `.discloner/state` | Checkpoint directory. |
| `STATE_RETENTION_DAYS` | `7` | 0–90. Older checkpoints are pruned on boot. |
| `LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` · `silent`. |
| `LOG_FORMAT` | `pretty` (`json` in production) | Structured logging sink format. |
| `FEATURE_CONTINUOUS_MIRROR` | `true` | Feature flag. |
| `FEATURE_MULTI_JOB` | `true` | Feature flag. |
| `FEATURE_RESUME` | `true` | Feature flag. |
| `FEATURE_TELEMETRY` | `false` | Feature flag. |
| `TELEMETRY_OPT_IN` | `false` | Must also be true for any remote send. |
| `TELEMETRY_ENDPOINT` | *unset* | Collector URL. |
| `SHUTDOWN_GRACE_MS` | `8000` | Grace period for Discord teardown. |
| `NODE_ENV` | `development` | `production` enables strict config validation and JSON logs. |

Invalid values are clamped or rejected with an explicit message at boot. In production a bad value
**fails the boot** instead of silently degrading.

---

## Architecture

```
├── server.js                  # Express + Socket.IO entrypoint, REST + socket surface
├── services/
│   ├── config.js              # Typed env parsing, validation, strict mode
│   ├── featureFlags.js        # Runtime feature flags
│   ├── jobManager.js          # Lifecycle, queue pump, checkpoints, ownership
│   ├── jobQueue.js            # Priority queue, positions, ETA estimation
│   ├── jobStore.js            # Atomic, credential-free persistence + retention
│   ├── mirrorService.js       # Gateway adapter, echo protection, structure sync
│   ├── cloneService.js        # The 16-stage cloning pipeline (resumable)
│   ├── discordService.js      # Client creation, auth, teardown
│   ├── preflightService.js    # Permission + resource checks before start
│   ├── validationService.js   # Snowflake & payload validation, option clamping
│   ├── httpGuard.js           # Rate limits and per-socket cooldowns
│   ├── configContract.js      # Shared defaults, limits, APP_VERSION
│   ├── telemetry.js           # Opt-in, allowlisted event counters
│   └── reliability/           # Error taxonomy, backoff, retry, rate limiter
├── utils/logger.js            # Structured logging + exact-value redaction
├── public/
│   ├── index.html             # Dashboard shell
│   ├── theme-bootstrap.js     # Pre-paint theme (keeps CSP inline-free)
│   ├── styles/                # tokens · base · components · panels · console · modals · responsive
│   └── js/
│       ├── main.js            # Boot + wiring
│       ├── core/              # dom, store, i18n, format helpers
│       ├── services/          # api, storage, JobClient (the only Socket.IO code)
│       ├── managers/          # TokenManager, ServerSelector, ConfigPanel,
│       │                      #   ProgressTracker, ActivityConsole, ThemeManager,
│       │                      #   JobController (state machine), QueueView
│       └── ui/                # toasts, guided tour
├── tests/                     # node:test suites (unit + jsdom client tests)
├── scripts/check-syntax.mjs   # `npm run lint`
├── Dockerfile                 # Multi-stage production image
└── docker-compose.yml         # Single-host deployment, hardened defaults
```

### Client state machine

```
idle ──start──▶ preflight ──ok──▶ starting ──▶ queued ──▶ running
                  │                                       │  ▲
                  └──cancel──▶ idle         pause ────────┘  │
                                             resume ─────────┘
running ──▶ stopping ──▶ cancelled
running ──▶ completed | failed ──resume──▶ running
```

Illegal transitions are ignored rather than thrown, so a duplicated or out-of-order socket frame can
never corrupt the UI.

### API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, version, queue depth, telemetry status (Docker healthcheck). |
| `GET` | `/api/features` | Enabled feature flags. |
| `POST` | `/api/jobs` | Start a job (`mode`, `userToken`, `sourceId`, `targetId`, `options`, `priority`). |
| `GET` | `/api/jobs` · `/api/jobs/active` · `/api/jobs/:id` | List, find active, inspect one. |
| `GET` | `/api/jobs/resumable` | Jobs with a usable checkpoint. |
| `POST` | `/api/jobs/:id/cancel` · `/pause` · `/resume` | Job control (capability token required). |
| `GET` | `/api/queue` | Queue snapshot with positions and ETA. |
| `GET` | `/api/telemetry/status` | Local telemetry counters (never remote data). |

Socket events: `job:subscribe`, `jobs:subscribe`, `job:query_active`, `clone:preflight`,
`clone:start`, `clone:cancel`, `job:pause`, `job:resume`, `job:restart`, and the server-side
`job:state`, `clone:stage`, `clone:progress`, `clone:log`, `job:checkpoint`, `mirror:stats`,
`queue:state`, `system:shutdown`.

---

## Testing

```bash
npm test          # node:test — unit + jsdom client suites
npm run lint      # node --check sweep across every JS file
```

Suites cover configuration parsing, queue ordering and ETA, checkpoint storage, mirror event
forwarding, error classification, rate limiting, job ownership, the full clone pipeline and the whole
client module graph (15 browser-behaviour tests in jsdom with a fake transport).

`npm run test:watch` keeps the suite running while you work.

---

## Deployment notes

- **Bind to loopback.** `HOST=127.0.0.1` plus a reverse proxy that terminates TLS and authenticates.
- **One mirror per guild.** Each mirror session holds a gateway connection; `MAX_MIRROR_SESSIONS`
  defaults to 1 to stay well inside Discord's limits.
- **Checkpoints are state.** Mount `JOB_STATE_DIR` on a volume you back up — that is what makes resume
  work across restarts. It contains no credentials, but it does contain server IDs.
- **Logs are JSON in production.** Ship them to your aggregator; secrets are already redacted.
- **Graceful shutdown.** `SIGTERM` cancels in-flight jobs, checkpoints them, and waits up to
  `SHUTDOWN_GRACE_MS` before exiting. Docker's `stop_grace_period` is set to 20s to match.

---

## Documentation

- [`CHANGELOG.md`](CHANGELOG.md) — version history and migration notes
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup, conventions, test expectations
- [`SECURITY.md`](SECURITY.md) — threat model, disclosure policy, hardening checklist

---

## License

MIT. See `LICENSE` if present in the repository, otherwise treat the above as the intended terms.

**Discloner is not affiliated with, endorsed by, or supported by Discord Inc.** Use it only on servers
you own or are explicitly authorised to administer.
