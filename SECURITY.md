# Security Policy

Discloner Studio handles a **high-value credential** (a Discord user token) and performs **destructive
writes** against a guild. Treat it like a database admin tool: run it on a host you control, and do not
expose it to the internet.

---

## Supported versions

| Version | Supported |
| --- | --- |
| 3.x | ✅ |
| 2.x | ⚠️ security fixes only |
| < 2.0 | ❌ |

---

## Reporting a vulnerability

Please **do not** open a public issue for anything that could expose tokens, bypass job ownership, or
let an unauthenticated client trigger a job.

Report privately via GitHub Security Advisories:

> Repository → **Security** tab → **Report a vulnerability**

Include:

1. Affected version / commit.
2. Reproduction steps or a proof-of-concept.
3. Impact — specifically, whether a token can be read, a job controlled, or data corrupted.
4. Whether you want to be credited.

**Acknowledgement:** within 72 hours. **Target fix:** 14 days for critical issues, 30 days for others.
We will coordinate disclosure with you and credit you in `CHANGELOG.md` unless you ask otherwise.

### Out of scope

- Discord account bans caused by self-bot usage. This is a documented, inherent risk of the approach —
  see "Threat model" below.
- Vulnerabilities that require an attacker to already have code execution on the host.
- Missing hardening headers on a deployment that overrides them at the proxy.
- Self-XSS that requires pasting an attacker's payload into your own console.

---

## Threat model

### What we protect

| Asset | Exposure | Mitigation |
| --- | --- | --- |
| Discord user token | Browser → server over HTTP(S); held for the job's lifetime | Never persisted server-side; memory-only in the browser unless explicitly opted in; exact-value redaction in every log sink |
| Job control | Any client that can reach the socket | Socket ownership **or** a 24-byte capability token issued at start |
| Guild structure | Read from source, written to target | Requires an authenticated account with real permissions; no privilege escalation |
| Checkpoint state | On disk under `JOB_STATE_DIR` | Field allowlist — no tokens, no webhook URLs, no message content |

### What we explicitly do **not** protect against

- **An attacker on the same machine.** The token is in process memory and, if you opt in, in
  `localStorage`. Local code execution is game over.
- **A malicious reverse proxy.** Terminate TLS at a proxy you control; the app cannot verify it is not
  being MITM'd.
- **Discord-side detection.** Self-botting is detectable by Discord and violates their ToS. No amount
  of application hardening changes that.

---

## Hardening checklist

Before exposing an instance to anything other than `localhost`:

- [ ] `HOST=127.0.0.1` (default documentation recommendation), or a reverse proxy that enforces auth.
- [ ] TLS terminated in front of the app; `ALLOWED_ORIGINS` set to the exact external origin.
- [ ] `NODE_ENV=production` — enables strict config validation (boot fails on invalid values) and JSON logs.
- [ ] `FEATURE_TELEMETRY=false` unless you genuinely want counters.
- [ ] `TELEMETRY_OPT_IN=false` (and no `TELEMETRY_ENDPOINT`) unless you have read the allowlist.
- [ ] `JOB_STATE_DIR` on a volume with restricted permissions (contains server IDs).
- [ ] Log shipping configured; logs are already redacted but still contain guild IDs.
- [ ] `MAX_MIRROR_SESSIONS=1` unless you know why you need more.
- [ ] Container deployed with `read_only: true`, `no-new-privileges`, and `cap_drop: ALL` (both are in
      the provided `docker-compose.yml`).
- [ ] A throwaway Discord account, on servers you own, for anything you care about.

---

## Security design notes

### Credential handling

1. The token arrives over Socket.IO or REST, in a JSON body capped at `HTTP_GUARD.maxBodySize`.
2. The payload is validated (shape, length, no whitespace) **before** any Discord call.
3. `registerSecret(token)` is called immediately, so the logger scrubs that exact string from every
   subsequent log line, error detail and socket payload — even if it does not match Discord's token
   pattern.
4. The token lives in the job's closure. `jobStore.js` persists an allowlisted field set; the token is
   not in it. `getJobSnapshot()` never includes it.
5. On completion, cancellation or shutdown the Discord client is destroyed and the closure released.

### Browser-side handling

- Default: memory only. The input is cleared on reload.
- Opt-in: *Remember token on this device* writes the raw value to `localStorage` under
  `discloner_saved_user_token`, with a separate `discloner_token_remember_opt_in` flag. **It is not
  encrypted.** The UI states this next to the switch, and clears both keys when the switch is turned off
  or the token field is cleared.
- The token is never placed in a URL, a `fetch` query string, or a log line.

### Rate limiting

Starting a job and running a preflight both authenticate the account, which is the expensive and
detectable operation. Both are limited per IP and per socket:

| Operation | Limit |
| --- | --- |
| `POST /api/jobs` | 5 / 60 s per IP |
| `clone:preflight` | 12 / 60 s per IP, plus a per-socket cooldown |
| `clone:start` | per-socket cooldown to absorb double-clicks |

All limits are in-process; there is no external dependency. Aggregate statistics are exposed at
`/api/health` — counts only, never values.

### Transport & headers

- `Content-Security-Policy: default-src 'self'; script-src 'self'; …` — no inline scripts anywhere,
  including the theme bootstrap (it is an external file for exactly this reason).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- `Cache-Control: no-store` on `/api` responses.
- Socket.IO payloads are capped at 1 MB.

### Resume safety

Resuming requires the `resumeKey` minted at job start. Without it the server refuses, so a second tab
or a different client cannot hijack a checkpointed job. Target cleanup is excluded from replay by
design: a resumed job will never re-run destructive deletion.

### Telemetry

Off by default, at three levels:

1. `FEATURE_TELEMETRY` must be true, **and**
2. `TELEMETRY_OPT_IN` must be true, **and**
3. `TELEMETRY_ENDPOINT` must be set.

Events are an allowlist. Properties are sanitised: keys must match `^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$`,
at most 12 keys, values truncated at 120 characters, arrays reduced to a length, objects dropped.
No IDs, tokens, guild names or message content are ever recorded. Network calls are throttled to once
per 60 seconds with a 5-second timeout, and every failure is swallowed so telemetry can never affect a job.
