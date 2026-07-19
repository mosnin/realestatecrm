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
| `background.js` | The control loop: pairing, long-poll, CDP attach/dispatch via `lib/executor.js`, cursor-event mirroring, kill switch, 401 handling, service-worker-restart resilience via `chrome.alarms`. |
| `lib/executor.js` | **Pure** `executeAction(action, cdp, opts)` — the closed allow-list (`navigate`/`click`/`type`/`press`/`scroll`/`read_dom`/`screenshot`/`wait`) mapped to CDP commands. Takes an injected `cdp.send(method, params)` so it has zero `chrome.*` dependency and is unit-tested in plain Node (`tests/lib/extension-executor.test.ts`). There is no "run arbitrary JS" action, on purpose — do not add one. |
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
found, unsupported key, missing click target). That's the logic that has to
be right before it's trusted against a real, logged-in site.

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

## Kill-switch → server semantics (flagged for the server track)

Today the kill switch is 100% client-side: it detaches the debugger and
stops the poll loop, but the *next* `poll` call (if the user hits Resume)
carries no signal that the previous stop was a deliberate user abort vs.
an idle gap. If the server wants to distinguish "user killed this" from
"extension went idle" for auditing/support, consider adding an optional
`killed: true` field to `PollBody` — nothing here depends on it, but it
would be a small, additive, backward-compatible change to `protocol.ts`.
