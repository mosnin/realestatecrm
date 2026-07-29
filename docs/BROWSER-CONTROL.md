# Browser control

How Chippi drives a browser on a realtor's behalf: the shared protocol, the
two runtimes that implement it, the safety/confirmation model, pairing, and
what's actually verified today versus what still needs a deploy step before
it's real. Cross-checked against the tree on 2026-07-19 (iteration 27); if
a file this doc names has moved, trust the file over this doc and fix the
doc.

## Two executors, one protocol

Every browser action the agent can take is a member of a **closed
allow-list** defined once, in TypeScript, as the single source of truth:

- `lib/browser-control/protocol.ts` — `BrowserActionInput` (a Zod
  discriminated union): `navigate`, `click`, `type`, `press`, `scroll`,
  `read_dom`, `screenshot`, `wait`. Also defines `BrowserActionResult`, the
  wire envelopes (`RedeemPairingBody`, `PollBody`, `PollResponse`,
  `LiveFrame`), and the shared constants (`EXT_TOKEN_PREFIX`,
  `PAIRING_CODE_LENGTH` = 8, `PAIRING_CODE_TTL_SECONDS` = 300,
  `ACTION_TTL_SECONDS` = 120).

There is **no "run arbitrary JS" action** anywhere in the allow-list, on
purpose — every executor below only implements these eight action types and
nothing else.

Two independent runtimes execute that same allow-list against different
browsers, chosen per-task by `resolveBrowserRuntime`
(`lib/browser-control/index.ts`):

| | Extension | Headless |
|---|---|---|
| Drives | The realtor's own logged-in Chrome, via `chrome.debugger` (CDP) | A cloud Playwright Chromium on Modal, logged out |
| Code | `extension/lib/executor.js` (`executeAction`) | `agent/browser_headless.py` (`execute_action`) |
| `BrowserSession.source` | `'extension'` | `'headless'` |
| Needs | The realtor to install + pair the extension | Nothing — auto-starts |
| Use case | Anything needing the realtor's own login (Gmail, an MLS, a client portal) | Public-web research/navigation |
| Visibility | Visible cursor overlay + orange kill-switch button on the real tab, plus Chrome's own debugger infobar | Screenshots pushed back to the oversight panel; no on-screen presence (nothing to look at — it's a cloud browser) |

`agent/browser_headless.py`'s docstring is explicit that the two executors
are meant to match **action-for-action**: "every action's SEMANTICS here are
meant to match `executeAction` in `extension/lib/executor.js` action-for-
action — read that file first if you're changing behavior here." If you
change what `click` or `navigate` does in one, change it in the other, or
the two runtimes silently diverge in what the agent thinks it can rely on.

### Which runtime a task gets

`resolveBrowserRuntime(spaceId, userId, intentText)`
(`lib/browser-control/index.ts`) decides, per call:

1. An already-**connected extension session** always wins — it's the
   realtor's own logged-in browser, so it's always safe to prefer.
2. Otherwise, if `intentText` (the task goal, or a single action's raw
   URL/selector/typed text) reads as needing a login —
   `needsLoggedInBrowser()`'s regex matches `my`, `logged in`, `sign in`,
   `gmail`, `inbox`, `mls`, `portal`, `dashboard`, `account` — the caller
   gets an honest `{ needsExtension: true }` refusal instead of running the
   task un-logged-in in a headless browser. This check runs even against an
   *already-active* headless session, so a login-shaped goal never silently
   reuses an anonymous cloud browser either.
3. Otherwise an active headless session is reused, or a fresh one is
   started (`startHeadlessSession`) for public-web work.

This is deliberately conservative in one direction only: false positives on
the login-intent regex just mean an unnecessary "connect your extension"
ask; a false negative would mean trying a login-only task in an anonymous
browser, silently fail to be logged in, and produce a misleading result —
the failure mode the check exists to prevent.

## The action allow-list, action by action

| Action | Fields | Notes |
|---|---|---|
| `navigate` | `url` | Re-validated against the SSRF/public-URL guard (`assertPublicHttpUrl`, `lib/browser-proxy.ts`) both at enqueue (`session.ts`) and, on the headless side, again inside `execute_action` via `resolve_addr` — defense in depth, not "trust the caller validated it." Extension-side `navigate` waits (bounded, ~8s) for `document.readyState === 'complete'`. |
| `click` | `x`/`y` **or** `selector` | Coordinates win when both are present. Selector path scrolls the element into view, re-reads its box, and waits (bounded, ~3s) for visibility before dispatching. |
| `type` | `text` (max 10k chars), optional `selector` | Focuses/clicks the selector first if given; otherwise types into whatever already has focus. |
| `press` | `key` — closed enum: `Enter`, `Tab`, `Escape`, `Backspace`, `ArrowDown`, `ArrowUp` | No arbitrary key names. |
| `scroll` | `dy` or `toSelector` | |
| `read_dom` | `maxChars` (500–40,000, default 12,000) | Bounded text/aria snapshot so a huge page can't blow model context. |
| `screenshot` | — | Viewport only (CDP `Page.captureScreenshot` without `clip`), not the full scrollable page. |
| `wait` | `ms` (0–10,000) | |

CSS selectors do not pierce shadow DOM or cross-origin iframes on either
executor — a real limitation, not a bug to silently work around.

## Safety and confirmation model

Three independent layers, from broadest to narrowest:

1. **Closed allow-list.** The action union above is exhaustive on both
   executors; there is nothing to escalate to because there is no generic
   "run this" primitive.
2. **Approval gate on every `control_browser` call.** The single-action
   tool (`lib/ai-tools/tools/control-browser.ts`) is registered with
   `requiresApproval: true` unconditionally — the realtor sees and confirms
   every action before it runs, full stop, including read-only ones
   (`read_dom`/`screenshot`/`wait`). This tool is deliberately left an
   *orphan* in `toolsets.ts` (not gated behind a keyword pattern), so it is
   always available rather than silently unreachable — see the comment
   there and in `control-browser.ts` for why.
3. **In-loop safety classification for the autonomous multi-step tool.**
   `browser_task` (`lib/ai-tools/tools/browser-task.ts`) runs its own
   bounded observe → decide → act loop and does **not** ask for approval on
   every single step (that would defeat the point of a multi-step tool).
   Instead, `classifyActionSafety(action): 'safe' | 'needs_confirm'`
   (exported from `browser-task.ts`, shared with `control-browser.ts` so
   the two tools never disagree about what's sensitive) flags any action
   that submits a form (`press: Enter` in a form context), could spend
   money, or sends/publishes something. A `needs_confirm` verdict **pauses
   the loop** and returns a confirmation request instead of executing — the
   realtor has to say "go ahead" in a fresh chat turn before that one step
   runs. The loop never auto-executes across that boundary.

Every terminal state either tool can end in gets its own honest,
plain-language message (CLAUDE.md non-negotiable #5 — no fabricated
success): `needs_extension`, `no_session`, `blocked_url`, `budget_exhausted`,
`needs_confirm`, timeout, error, done. In particular `no_session` and
`blocked_url` never imply the action ran.

## Pairing and token flow

1. **Code issue** (Clerk-authed, in-app): `POST /api/browser-control/pair/code`
   → `issuePairingCode()` (`lib/browser-control/auth.ts`) mints an 8-char
   code from an unambiguous alphabet (no `0`/`O`/`1`/`I`/`L`), stores only
   its SHA-256 hash (`BrowserPairingCode.codeHash`) with a 5-minute TTL, and
   returns the raw code once. Rate-limited to 10 codes / 10 min per user.
2. **Code redeem** (extension side, no Clerk session):
   `POST /api/browser-control/pair/redeem` → `redeemPairingCode()` looks up
   the code by hash, checks it's unexpired and unredeemed, then claims it
   with a **conditional `UPDATE ... WHERE "redeemedAt" IS NULL`** so two
   concurrent redeems of the same code can't both succeed. On success it
   mints a bearer token (`mintExtToken()`: `chippi_ext_<48 hex chars>`,
   mirroring the `app/api/mcp-keys` key-hygiene pattern), inserts a
   `BrowserLink` row storing only the token's SHA-256 hash plus a display
   prefix, and returns the raw token **once** — same "shown once, hashed
   forever after" contract as MCP API keys.
3. **Authenticated polling**: the extension calls
   `POST /api/browser-control/poll` with `Authorization: Bearer <token>`.
   `verifyExtToken()` hashes the presented token and looks it up by hash
   (never by raw value) against `BrowserLink`, rejecting revoked links.
   `lastUsedAt` updates best-effort and never fails the auth check.
4. **Revoke / kill**: `DELETE /api/browser-control/link/[id]` (Clerk-authed)
   revokes the link and ends its active sessions — the extension's next
   poll 401s and it tears itself down. `POST /link/[id]/rotate` reissues a
   token **in place** on the same link (for "I think my token leaked" without
   re-pairing from scratch): the old raw token simply stops matching, same
   effect as revoke, but existing session/queue state survives. Neither of
   these needs the realtor to re-type a pairing code.

Token/pairing-code lookups are, necessarily, looked up **by hash, not by
`spaceId`** — the hash match *is* the identity check that produces the
scope, so these are the codebase's sanctioned `.unscoped(...)` call sites
(`lib/supabase-guard.ts`'s documented escape hatch), each annotated with why.
Every other browser-control query — sessions, actions, frames — is scoped
by the `(spaceId, userId)` resolved from that authenticated identity.

## Security model summary

- **Tenant scoping**: every session/action/frame read or write goes through
  `(spaceId, userId)` derived from either the Clerk session (app-side routes)
  or the verified extension token / `AGENT_INTERNAL_SECRET` (device/worker
  routes) — never from request body input. The service-role Supabase client
  bypasses RLS; the `.eq(...)` calls are the actual boundary (CLAUDE.md #3).
- **Token hygiene**: pairing codes and bearer tokens are stored as SHA-256
  hashes only; raw values are returned exactly once, at mint/redeem time,
  and never again.
- **SSRF guard on `navigate`**: `assertPublicHttpUrl` (`lib/browser-proxy.ts`)
  rejects internal/private targets before an action is enqueued, and the
  headless executor re-checks the resolved address again inside
  `execute_action` — a URL that passed the app-side check can't reach a
  private address purely because DNS answered differently by the time the
  cloud worker resolved it.
- **Two-runtime honesty boundary**: a headless (logged-out) session is never
  substituted for a login-shaped goal (`needsLoggedInBrowser`) — see
  "Which runtime a task gets" above. This is a product-honesty guarantee as
  much as a security one: it prevents Chippi from quietly attempting
  something it cannot actually do and reporting a misleading result.
- **Headless worker auth**: `agent/browser_headless.py`'s poll loop
  authenticates to `POST /api/browser-control/headless/poll` with
  `Authorization: Bearer <CHIPPI_BROWSER_WORKER_SECRET>`, a dedicated
  browser-worker secret rather than the per-user extension token or broad
  agent-service credentials. The worker is an internal Chippi service, not a
  paired user device.
- **Kill switch is local-first**: the extension's kill switch detaches
  `chrome.debugger` and hides its UI **immediately and locally**, independent
  of network state, then separately reports `killed: true` on its next poll
  so the server also ends the session — a realtor can always stop the
  extension even if the network is down. See "Kill switch → server
  semantics" in `extension/README.md` for the exact flag lifecycle.
- **Rate limiting**: pairing-code issuance (10/10min/user) and headless
  session starts (30/60s/user) are rate-limited against enumeration/churn
  abuse. Research status and frame reads are each capped at 90/min/user; the
  internal headless poll is capped at 120/min/session and rejects bodies over
  1 MB. The former allows a live oversight panel while still bounding abuse.
- **`chrome.debugger`'s own visibility**: Chrome shows its native
  "`<Extension>` is debugging this browser" infobar for the whole time the
  debugger is attached — this cannot be suppressed and is not something
  Chippi's own on-page banner replaces (see `extension/README.md`).

## What's verified vs. what's deploy-gated

**Verified (unit-tested, behavioral):**
- The extension executor: `tests/lib/extension-executor.test.ts` drives
  `extension/lib/executor.js` with a fake `cdp.send` recorder — exact CDP
  calls per action type, truncation, error paths, the bounded
  navigate/click waits.
- The headless executor: `execute_action` in `agent/browser_headless.py` is
  a pure function against a duck-typed Playwright `Page`, unit-tested with
  a fake page — no real network, no real browser required for that layer.
  `poll_and_execute`'s loop is unit-tested with injected `http_post` /
  `browser_factory` fakes.
- Pairing, token auth, session/queue plumbing, and the API routes
  (`lib/browser-control/*.ts`, `app/api/browser-control/**`) — behavioral
  route-handler tests per this repo's testing policy (CLAUDE.md: no
  `readFileSync`-source-grep tests).

**Deploy-gated or not yet verified against real infrastructure, listed in
ascending order of "how badly this blocks the feature":**

1. **Migrations not applied to prod.** `supabase/migrations/20260901000000`
   through `20260903000000` (browser-control tables + frames + headless
   source column) must be applied via the `docs/RELEASE.md` workflow before
   any of this can run against production. See the "Activation checklist"
   in `docs/RELEASE.md`.
2. **The Research Workspace worker is wired but not activated.**
   `agent/browser_modal_app.py` is a dedicated least-privilege Modal app with
   a Playwright image, bounded worker function, and launch endpoint. The web app
   obtains a fenced lease before launch, and
   `POST /api/browser-control/headless/start` starts or reuses that worker.
   This remains feature-off until the new lease migration, an isolated Modal
   staging app, its dedicated two-value secret, and a tenant allowlist are
   configured and verified.
3. **An authenticated staging Research Workspace journey** — launch, first
   heartbeat, live frame, multi-source result, reload, and Stop — has not yet
   been completed. Passing unit tests and a Modal launch response are not
   evidence that the customer journey works.
4. **A real Chrome pairing round-trip** — loading the unpacked extension,
   generating a code in the app, redeeming it, and watching a real poll
   loop execute a real CDP action — has not been done end-to-end.
5. **`chrome.debugger` behavior on real navigations** (cross-origin infobar
   timing) and **MV3 service-worker suspend/resume** under real Chrome's
   lifecycle — the `chrome.alarms` heartbeat in `background.js` is a
   best-effort mitigation, not a guarantee.
6. **Chrome Web Store review** for the `debugger` + `<all_urls>` permission
   combination has not been submitted.

See `extension/README.md`'s "What's unit-tested vs. what isn't" section for
the extension-specific detail behind points 4–6.

## Related files

| Path | Role |
|---|---|
| `lib/browser-control/protocol.ts` | The shared contract — types, schemas, constants. |
| `lib/browser-control/auth.ts` | Pairing code + bearer token issue/verify/rotate/revoke. |
| `lib/browser-control/session.ts` | Session/queue lifecycle, `enqueueAction`/`awaitActionResult`, staleness detection. |
| `lib/browser-control/index.ts` | Barrel + `resolveBrowserRuntime` (extension-vs-headless routing) + `needsLoggedInBrowser`. |
| `extension/lib/executor.js` | The extension-side pure CDP executor. |
| `agent/browser_headless.py` | The headless-side pure Playwright executor + fenced poll/cancellation loop. |
| `lib/ai-tools/tools/control-browser.ts` | Single-action agent tool, always-approve. |
| `lib/ai-tools/tools/browser-task.ts` | Multi-step agent tool, `classifyActionSafety` gate. |
| `app/api/browser-control/**` | Pairing, poll, frame, status, link, headless start/stop/poll routes. |
| `app/s/[slug]/settings/browser-control/` | The settings UI — pairing, connected devices, live session status. |
| `supabase/migrations/2026090{1,2,3}*` | Schema: link/pairing/session/action tables, frame + heartbeat columns, headless source support. |
| `extension/README.md` | Extension-specific load/pair/permissions detail. |
