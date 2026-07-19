# Chippi Browser Control (Chrome extension)

Lets the Chippi chat agent drive a realtor's own logged-in Chrome tab —
navigate, click, type, scroll, read the page, and screenshot it — with a
visible cursor overlay and a one-click kill switch. Manifest V3, vanilla
JS, **no build step**: load the `extension/` folder directly.

## Loading it unpacked

1. `chrome://extensions`
2. Enable **Developer mode** (top right).
3. **Load unpacked** → select the `extension/` directory in this repo.
4. Pin the Chippi icon to the toolbar (optional but recommended).

Reload from `chrome://extensions` after any edit to `background.js`,
`content-script.js`, `lib/executor.js`, or `manifest.json` — the popup
(`popup.html`/`popup.js`) reloads on its own each time you open it.

## Pairing flow

1. In the Chippi web app, the realtor generates a short-lived (5 minute),
   8-character pairing code (`PAIRING_CODE_LENGTH` /
   `PAIRING_CODE_TTL_SECONDS` in `lib/browser-control/protocol.ts`).
2. They open the extension popup, paste the code, click **Connect**.
3. The extension `POST`s the code to `{baseUrl}/api/browser-control/pair/redeem`
   and stores the returned bearer token in `chrome.storage.local` — **only**
   the token is stored client-side; the server should only ever persist a
   hash of it (see "Server contract assumptions" below, mirrors
   `app/api/mcp-keys/route.ts`'s `chippi_ext_<hex>` / sha256 pattern).
4. Once paired, the background service worker starts long-polling
   `{baseUrl}/api/browser-control/poll` with `Authorization: Bearer <token>`.
   When the agent enqueues an action, the next poll response carries it; the
   extension executes it against the active tab via `chrome.debugger` (CDP)
   and reports the result on the *following* poll.
5. **Disconnect** (popup) clears the token and stops the loop entirely.
   **Stop Chippi** (the on-page kill-switch button, or the popup's Stop
   button while engaged) detaches the debugger and halts execution
   immediately without un-pairing — click **Resume** in the popup to
   continue.

## The chrome.debugger banner (read this before demoing)

Attaching `chrome.debugger` makes Chrome show its own
**"`<Extension>` is debugging this browser"** infobar — this is a Chrome
platform behavior, not something Chippi can suppress or skip, and it's
honest: the tab genuinely is under CDP control. It reappears on every new
top-level navigation the debugger is attached across. Chippi's own banner
("Chippi is controlling this tab", `content-script.js`) is deliberately
*in addition to* Chrome's, not a replacement — never hide or contradict
Chrome's native indicator.

`chrome.debugger` also cannot attach to internal `chrome://`,
`chrome-extension://`, or the Chrome Web Store pages — actions targeting
those will fail with a CDP error surfaced as `{ ok: false, error }`.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest: `debugger`/`activeTab`/`storage`/`scripting`/`tabs` permissions, `<all_urls>` host permission, module service worker, top-frame-only content script. |
| `background.js` | The control loop: pairing, long-poll, CDP attach/dispatch via `lib/executor.js`, cursor-event mirroring, kill switch (local + reported to the server via `PollBody.killed`), 401 handling, service-worker-restart resilience via `chrome.alarms`, and a throttled screencast (`PollBody.frame`) of the pinned tab. |
| `lib/executor.js` | **Pure** `executeAction(action, cdp, opts)` — the closed allow-list (`navigate`/`click`/`type`/`press`/`scroll`/`read_dom`/`screenshot`/`wait`) mapped to CDP commands. Takes an injected `cdp.send(method, params)` so it has zero `chrome.*` dependency and is unit-tested in plain Node (`tests/lib/extension-executor.test.ts`). `navigate` waits (bounded, ~8s) for `document.readyState === 'complete'` before returning; `click`/`type` scroll their selector into view and re-read its box before dispatch, and `click` additionally waits (bounded, ~3s) for it to become visible; not-found/not-visible errors are actionable (name the selector, suggest `read_dom`). There is no "run arbitrary JS" action, on purpose — do not add one. |
| `content-script.js` | Renders (only while a session is active) the top banner, the animated cursor-dot overlay, and the floating orange kill-switch button. Never shows anything unless `background.js` explicitly activates it for that tab. |
| `popup.html` / `popup.js` | Pairing form, connection status, disconnect, resume-after-kill-switch, server URL setting. |
| `icons/` | Generated placeholder icons (Chippi orange `#F25A00`, simple cursor glyph) — swap for final brand assets before shipping. |

## Server contract assumptions (owned by the server track)

This extension was built against the wire shapes in
`lib/browser-control/protocol.ts` (`RedeemPairingBody`, `PollBody`,
`PollResponse`, `BrowserActionInput`, `BrowserActionResult`), which is the
one thing shared across tracks. Two response shapes protocol.ts does *not*
pin down were assumed here and should be confirmed against the actual
route handlers:

- `POST /api/browser-control/pair/redeem` → assumed to return
  `{ token: string, label?: string }` (raw bearer token, once).
- `POST /api/browser-control/poll` → `PollResponse` as specified
  (`{ action: { id, sessionId, input } | null, stop: boolean }`).

If the real routes differ, only `redeemPairingCode()` and the response
handling inside `runPollLoop()` in `background.js` need to change — the
executor and UI are shape-agnostic beyond that.

## What's unit-tested vs. what isn't

`tests/lib/extension-executor.test.ts` drives `lib/executor.js` with a fake
`cdp.send` recorder and asserts the exact CDP methods/params for every
action type, plus truncation (`read_dom`) and error paths (selector not
found, unsupported key, missing click target). It also covers the
bounded-wait logic added for real-page robustness — `navigate` polling
`document.readyState` (via an injected fake `sleep`, so the test asserts
attempt-count-bounded behavior deterministically instead of waiting out a
real ~8s timeout) until `'complete'` and returning the post-load
`pageUrl`/`pageTitle`, and `click` scrolling its selector into view (asserted
via CDP call order) before dispatching any mouse event. That's the logic
that has to be right before it's trusted against a real, logged-in site.
`background.js`'s screencast and kill-switch-report wiring are `chrome.*`-only
and are NOT unit-tested — see "Not unit-covered" below.

**Not unit-covered — needs real-Chrome verification by whoever integrates
this end-to-end:**
- Actually loading the unpacked extension and completing a real pairing
  round-trip against a running Chippi server.
- `chrome.debugger` attach/detach behavior on real navigations, especially
  cross-origin navigations and Chrome's native debugging infobar timing.
- Service-worker suspend/resume behavior under Chrome's real MV3 lifecycle
  (the `chrome.alarms` heartbeat here is a best-effort mitigation, not a
  guarantee — Chrome can still terminate a service worker mid-`await` on a
  long-poll `fetch`, and the *next* alarm tick, up to ~24s later, resumes
  it; a truly gapless long-poll would need the server to reply/timeout well
  under that window).
- Real selector resolution / `getBoundingClientRect` against production
  sites with iframes, shadow DOM, or scroll-driven virtualization — CSS
  selectors don't pierce shadow DOM or cross-origin iframes, which is a
  real limitation of the current `click`/`type`/`scroll(toSelector)`
  implementation.
- Screenshot size/latency at `quality: 60` JPEG on very tall pages — CDP's
  `Page.captureScreenshot` without a `clip` captures the viewport, not the
  full scrollable page; confirm that's the intended behavior for the
  `screenshot` action before shipping.
- Chrome Web Store review: the `debugger` permission requires a clear
  justification in the store listing (draft: "Chippi Browser Control uses
  the debugger permission solely to let a realtor's own AI assistant
  perform on-screen actions — click, type, navigate, read — in a tab the
  realtor explicitly pairs and can stop at any time via the visible kill
  switch; no other tab or window is ever touched."); expect an extended
  review cycle for `debugger` + `<all_urls>`. `activeTab`/`scripting` are
  requested but not currently exercised by any code path here — drop them
  from the manifest if the eventual design doesn't need them, since
  Web Store review favors the narrowest permission set that actually maps
  to used code paths.

## Kill switch → server semantics

The kill switch acts locally and INSTANTLY (detach the debugger, hide the
banner/cursor/button) regardless of network state — a realtor must be able
to stop Chippi even if the poll request is slow or fails. Separately,
`activateKillSwitch()` sets an in-memory `killedPending` flag and wakes the
poll loop's current sleep (if it's idling) so the *very next* `poll` call
carries `PollBody.killed = true`, telling the server to end the session too
— not just go quiet locally. The flag is only cleared once a poll carrying
it actually succeeds (`res.ok`); a failed request retries with `killed`
still pending on the *following* poll rather than silently dropping it.

## Screencast (`PollBody.frame`)

While a session has a tab pinned, `background.js` captures a small
low-quality (`quality: 40`) JPEG via `Page.captureScreenshot` on a ~1.5s
timer, plus once immediately after every action completes, and attaches the
most recent one as `PollBody.frame` (`{ image, pageUrl, pageTitle }`) on
every poll so the Chippi oversight panel can show roughly what the agent is
looking at. An in-flight guard means a slow capture is skipped rather than
piled up behind the previous one; the frame is never captured (and never
sent) when there is no pinned session tab, and is cleared the moment the
session ends, the tab is lost, or the kill switch fires.

**Not unit-covered — needs real-Chrome verification:**
- Screencast timer accuracy / frame cadence when the MV3 service worker is
  suspended and resumed mid-session — `setInterval` timers do not survive a
  service-worker restart, so a suspended-then-woken worker restarts the
  cadence from whenever the next action or `chrome.alarms` heartbeat fires,
  not from a persisted schedule. Confirm this doesn't produce noticeably
  stale frames in practice.
- Actual JPEG payload size at `quality: 40` on high-DPI / very large tabs —
  confirm it stays comfortably under the poll body's practical size budget.
- The kill-switch wake-loop timing (`wakeLoop()` cutting short an in-progress
  idle/error `sleep()`) under real Chrome's fetch/timer scheduling — verified
  logically here, not against a live poll endpoint.
