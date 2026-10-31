# Contributing to Discloner Studio

Thanks for taking the time. This project handles credentials and deletes things by design, so a little
process goes a long way.

---

## Getting set up

```bash
git clone https://github.com/argamerzz9582-debug/Discloner.git
cd Discloner
npm install
npm test          # should be green before you change anything
npm run dev       # restarts on file change
```

Open <http://localhost:3000>. You do **not** need a real Discord token to work on the UI — the client
tests use a fake transport, and the dashboard renders fully without one.

Requirements: **Node.js 20+**.

---

## Project layout

| Path | What lives there |
| --- | --- |
| `server.js` | Express + Socket.IO surface. REST routes, socket handlers, lifecycle. |
| `services/` | All server logic. One concern per file. |
| `services/reliability/` | Error taxonomy, retry/backoff, rate limiter. |
| `utils/logger.js` | Structured logging and secret redaction. |
| `public/js/core/` | Framework-free helpers: DOM, store, i18n, formatting. |
| `public/js/services/` | `api` (REST), `storage` (localStorage), `JobClient` (the **only** Socket.IO code). |
| `public/js/managers/` | One class per UI concern. |
| `public/js/ui/` | Toasts and the guided tour. |
| `public/styles/` | Token, base, component, panel, console, modal, responsive layers. |
| `tests/` | `node:test` suites. `client.test.js` boots the real module graph in jsdom. |

---

## Conventions

### JavaScript

- **ES modules only.** `"type": "module"` is set; do not add CommonJS.
- **JSDoc on exported functions.** The project is not TypeScript, but types belong in comments. Add
  `@param` / `@returns` to anything a reader would otherwise have to reverse-engineer.
- **No new runtime dependencies** without discussion. `express`, `socket.io` and
  `discord.js-selfbot-v13` are the whole production surface — keep it that way.
- **No frontend framework.** ES modules and direct DOM writes are deliberate. If you reach for a
  virtual DOM, open an issue first.

### The frontend

- **`JobClient` is the only module that may call `socket.on` / `socket.emit`.** Everything else
  subscribes to `client.on(...)`. This keeps the transport swappable and the tests hermetic.
- **State lives in `JobController`.** New UI state goes through the explicit machine in
  `public/js/managers/jobController.js`; add the transition to `TRANSITIONS` so illegal moves are
  rejected rather than silently applied.
- **Every user-facing string goes through `t()`** from `core/i18n.js`. Missing keys fall back to the key
  itself, which makes omissions obvious without breaking the UI.
- **Guard DOM writes.** `byId()` returns `null` when an element is absent; the jsdom suites depend on
  this.

### Accessibility (required, not optional)

Every UI change must be:

- **Mobile-first.** Write the small-screen layout first, then enhance with `min-width` queries. Targets
  are at least 44×44 CSS pixels.
- **WCAG AA.** 4.5:1 for body text, 3:1 for large text and UI borders, in *both* themes.
- **Keyboard operable.** Visible `:focus-visible` ring, logical tab order, `Esc` closes overlays, focus
  is trapped inside dialogs and restored to the trigger on close.
- **Motion-safe.** Any new animation must collapse under `@media (prefers-reduced-motion: reduce)`.
- **Announced.** Dynamic status changes go through `aria-live` regions (`role="status"` for polite,
  `role="alert"` for errors) — do not rely on colour alone.

### CSS

- Use the tokens in `styles/tokens.css`. No hard-coded hex values in component files.
- No `!important` except for the `.hidden` utility.
- Respect the existing elevation language: raised = interactive, inset = recessed/well, flat = calm.

---

## Tests

```bash
npm test                 # everything
npm run test:watch       # keep it running
node --test tests/client.test.js            # one file
node --test --test-name-pattern="queue" tests/client.test.js
npm run lint             # node --check sweep
```

What to add:

| Change | Test to write |
| --- | --- |
| New service or helper | A `node:test` file next to the existing ones, no network, no real Discord client |
| New UI behaviour | A case in `tests/client.test.js`; boot with a fake socket via `bootDashboard()` |
| Bug fix | A regression test that fails before the fix |
| New config variable | A case in `tests/config.test.js` covering the default, valid and invalid values |

**Never** write a real token, webhook URL or guild ID into a test. GitHub's push protection will reject
token-shaped literals, and you should not have one in a checkout anyway. Build fixtures at runtime:

```js
const fakeToken = ['a'.repeat(24), 'bbbbbb', 'c'.repeat(26)].join('.');
```

---

## Pull requests

1. Branch from `main`.
2. Keep the diff focused — one concern per PR.
3. `npm test` and `npm run lint` must pass.
4. Describe **what changed and why**, plus anything a reviewer should check by hand (layout, motion).
5. Update `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.
6. If you touch the security surface (token handling, job ownership, rate limits, CSP), say so
   explicitly in the PR body.

### Commit messages

```
<area>: <imperative summary>

Body explaining the why, if it is not obvious.
```

Areas: `server`, `jobs`, `mirror`, `clone`, `ui`, `a11y`, `docs`, `docker`, `tests`, `deps`.

---

## Reporting bugs

Use the issue template if present; otherwise include the version (`/api/health` returns it), the exact
steps, expected vs actual, and any console output **with tokens redacted**. Security issues go to
[`SECURITY.md`](SECURITY.md) instead — please do not file them publicly.

---

## Scope reminder

This project authenticates with a **user token**, which violates Discord's Terms of Service. That is a
deliberate, documented decision by the maintainers, not an oversight. PRs that add official bot/application
OAuth flows are out of scope; PRs that harden the existing token model are very welcome.
