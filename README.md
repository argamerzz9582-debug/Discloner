# Discord Server Cloner & Migration Studio

A modern, high-reliability Discord server migration and synchronization platform powered by Node.js, Express, and Socket.IO.

## Overview

Discord Server Cloner allows administrators to clone Discord servers — synchronizing role hierarchies, channels, permission overwrites, server branding, and recent message histories via Webhooks with granular real-time telemetry.

---

## Features

- **Full Guild Replication**:
  - **Server Profile**: Name, icon (dynamic 4096px), and server banner.
  - **Role Hierarchy**: Replicates roles, colors, hoist settings, mentionable flags, and bitfield permissions while preserving position order.
  - **Categories & Channels**: Creates categories and child channels (text, voice, announcements) with identical topics, NSFW flags, and bitrate.
  - **Permission Overwrites**: Remaps role IDs and applies channel-level privacy and permission overrides.
  - **Chat Logs & Media**: Synchronizes recent messages and attachments using Discord webhooks with matching usernames and avatars.
- **Granular Stage Telemetry**: Real-time progress bar with item counts, active stage pills, and live elapsed timer.
- **Interactive Activity Console**:
  - Real-time structured log streaming (timestamps, status badges, contextual metadata).
  - Client-side severity filters (`All`, `Info`, `Success`, `Warnings`, `Errors`) with **live per-severity counts**.
  - Search query filtering by channel, role name, or message.
  - Explicit empty states that distinguish "nothing has happened yet" from "your filter hides everything".
  - One-click log export / clipboard copy and auto-scroll control.
- **Interface & Accessibility**:
  - **Stateful workflow stepper** — the Token → Source & Target → Clone tracker reflects real form state instead of being decorative.
  - **Keyboard first**: `Ctrl`/`Cmd` + `Enter` starts a migration, `Esc` dismisses the top-most dialog, dialogs trap focus and restore it to the trigger, and a skip link jumps straight to the workspace.
  - **Responsive action dock**: on tablet/mobile the primary CTA stays pinned within thumb reach, and the header navigation becomes a scrollable row instead of disappearing.
  - **Theme that remembers**: the saved light/dark choice is honoured on reload, with the OS preference used on a first visit (applied before first paint, so there is no flash).
  - **Motion with intent**: progress sheen, counter bumps and dialog entrances all collapse under `prefers-reduced-motion`.
  - Tuned dark-mode text contrast (muted text now clears WCAG AA) and a single consistent `:focus-visible` ring.
- **Security & Privacy**:
  - **Memory-only credentials by default**: the Discord token is never written to disk unless you explicitly flip *Remember token on this device* (off by default, with an inline warning).
  - **Exact-value + pattern token redaction**: any accepted credential is registered with the logger and scrubbed from every log line, error detail, and socket payload — even if it does not match Discord's usual token shape.
  - **Start/preflight throttling**: both operations authenticate the account, so they are rate limited (5 starts/min per IP, 12 preflights/min, plus per-connection cooldowns) to protect the token from accidental retry storms.
  - **Job ownership**: cancelling a job requires the owning socket or the one-time job capability token issued at start — another browser tab or client cannot abort your migration.
  - **Strict CSP & security headers**: no inline scripts (`'unsafe-inline'` is confined to styles), `nosniff`, `no-referrer`, and `no-store` on API responses.
  - **Graceful shutdown**: `SIGINT`/`SIGTERM` signal running jobs and let the Discord client close through the normal teardown path instead of orphaning gateway sessions.
  - Destructive operation confirmation modal before target server clearing.

---

## Prerequisites

- **Node.js**: `v18.0.0` or later
- **Discord User Token**: credential for an account with access to the source server and `Administrator` / `Manage Channels` / `Manage Roles` / `Manage Webhooks` on the target server.

> ⚠️ **Account risk**: Discloner authenticates with a user token via `discord.js-selfbot-v13`. Automating a user account ("self-botting") is against Discord's Terms of Service and can get the account permanently disabled. Use a throwaway account on servers you own.

---

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/abdulrehman958280-max/cloner.git
   cd cloner
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the application**:
   ```bash
   npm start
   ```

4. **Open in browser**:
   Navigate to `http://localhost:3000`.

---

## Running Automated Tests

Run the built-in test suite:
```bash
npm test
```

The `tests/uiDom.test.js` suite asserts dashboard structure and client-side behaviour. It needs
no new dependency by default and simply skips; install jsdom to enable it:

```bash
npm install --no-save jsdom && npm test
```

---

## Configuration & Environment Variables

Copy `.env.example` to `.env` if you need non-default settings:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. Invalid values fall back to the default and are reported at boot. |
| `HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` to restrict the dashboard to this machine. |
| `ALLOWED_ORIGINS` | *unset* | Comma-separated Socket.IO origin allowlist. Unset means **same-origin only** (what the bundled dashboard needs). `*` is still accepted but logs an insecure-policy warning at boot. |

```env
PORT=3000
HOST=127.0.0.1
# ALLOWED_ORIGINS=https://cloner.example.com
```

### Runtime guards

| Guard | Default | Purpose |
| --- | --- | --- |
| `POST /api/jobs/start` | 5 / 60s per IP | Each start opens a Discord gateway session. Invalid payloads are rejected before consuming budget. |
| `clone:preflight` | 12 / 60s per IP + 4s per socket | Preflight also authenticates, so double-clicks are debounced. |
| `clone:start` | 3s per socket | Prevents retry storms after an instant failure. |
| Job capability | per job | 24-byte random token required (alongside socket ownership) to cancel. |

All guards are in-process and need no extra services. Statistics are surfaced (aggregate only, never secrets) at `GET /api/health`.

---

## Architecture

```
├── public/
│   ├── index.html         # Modern responsive dashboard interface
│   ├── theme-bootstrap.js # Pre-paint theme application (keeps CSP inline-free)
│   ├── script.js          # Client-side Socket.IO & telemetry UI engine
│   └── style.css          # Design system & responsive styles
├── services/
│   ├── cloneService.js    # Multi-stage cloning pipeline & guild syncer
│   ├── discordService.js  # Discord client lifecycle & session management
│   ├── jobManager.js      # Background jobs, ownership capabilities, stale-job sweeper
│   ├── preflightService.js# Credential/permission/resource preflight checks
│   ├── httpGuard.js       # Rate limiting & per-socket cooldowns
│   ├── configContract.js  # Single source of truth for defaults & limits
│   └── validationService.js # Discord snowflake & payload validator
├── utils/
│   └── logger.js          # Structured logging & exact-value token redaction
├── tests/
│   ├── logger.test.js         # Sanitization & log formatting tests
│   ├── loggerSecrets.test.js  # Exact-value credential redaction
│   ├── httpGuard.test.js      # Rate limiter & cooldown behaviour
│   ├── jobOwnership.test.js   # Job capability & cancellation authorization
│   ├── uiDom.test.js          # Dashboard structure & behaviour (optional jsdom)
│   └── validation.test.js     # Input validation & option clamp tests
├── server.js              # Express HTTP & Socket.IO server entrypoint
└── package.json
```

---

## Security Considerations

- **Discord Terms of Service**: Automating user accounts (self-bots) violates Discord's Terms of Service and may result in account termination. Always use test or developer accounts on servers you own or have explicit authorization to administer.
- **Token Security**: Tokens are held in server memory for the duration of a job and are never persisted by the backend. The browser keeps them in memory by default; persistence is an explicit opt-in and stores the value unencrypted in `localStorage`. Browsers previously used by older builds are scrubbed automatically on first load unless you opt in.
- **Deployment**: Run Discloner on a machine you control. Binding to `0.0.0.0` (the default) exposes an interface that accepts account credentials — set `HOST=127.0.0.1` or put it behind an authenticating reverse proxy if the host is reachable from an untrusted network.
- **Logs**: Error messages are sanitized before they reach the browser, and unknown `/api` routes return JSON instead of stack traces.
