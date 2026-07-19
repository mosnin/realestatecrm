"""Headless (cloud) browser-control runtime — the SECOND executor for the
SAME closed action allow-list defined in `lib/browser-control/protocol.ts`
(`BrowserActionInput` -> `BrowserActionResult`). The extension track
(`extension/lib/executor.js`) drives the realtor's OWN logged-in browser via
Chrome's debugger protocol; this module drives a cloud-hosted, logged-out
Playwright browser for public research. Both consume the SAME `BrowserAction`
queue and protocol — only `BrowserSession.source` ('extension' | 'headless')
and who executes the action differ. Every action's SEMANTICS here are meant
to match `executeAction` in `extension/lib/executor.js` action-for-action —
read that file first if you're changing behavior here.

Two independent pieces:

  1. `execute_action(action, page, *, sleep=None) -> dict` — a PURE async
     function that turns one `BrowserActionInput`-shaped dict into a
     `BrowserActionResult`-shaped dict by driving an injected `page` object.
     `page` is duck-typed to the Playwright `async_api.Page` surface
     (`.goto`, `.locator(selector)`, `.mouse`, `.keyboard`, `.evaluate`,
     `.screenshot`, `.url`, `.title()`) — this module does NOT import
     `playwright` to implement it, so it is unit-testable with a plain fake
     object and has zero import-time dependency on the package being
     installed. NEVER raises: every branch is wrapped so a bad selector, a
     navigation timeout, or an unexpected page state resolves to
     `{"ok": False, "error": ...}` instead of propagating.

  2. `poll_and_execute(...)` — the cloud worker loop: long-polls Chippi's
     headless poll endpoint for the next queued action, executes it against
     a real (or injected-fake) browser page, and reports the result back
     (with a throttled screenshot frame), honoring a server-issued `stop`.
     Takes `http_post` and `browser_factory` as injected dependencies so the
     whole loop is unit-testable with NO real network and NO real browser.

── Deploy dependency (FLAG for the integrator) ──────────────────────────────
`agent/pyproject.toml` does NOT currently list `playwright` (checked:
2026-07-19 — only `openai-agents`, `openai`, `httpx`, etc.). The
`execute_action` pure function has no import-time dependency on it (the page
object is always injected), so THIS FILE imports fine either way. But the
DEFAULT `browser_factory` used by `poll_and_execute` when none is injected
lazy-imports `playwright.async_api` at call time and raises a clear
`RuntimeError` if it's missing. Running real headless sessions requires:
  - adding `"playwright>=1.45,<2"` to `agent/pyproject.toml` dependencies
  - running `playwright install --with-deps chromium` on the Modal image
    (extend the `image` in `agent/modal_app.py` — NOT done by this change)
See the "Modal wiring (NOT wired in)" comment block at the bottom of this
file for the shape of that integration.

── Server contract this module assumes (Track B builds it) ─────────────────
  POST {base_url}/api/browser-control/headless/poll
    Headers: Authorization: Bearer {AGENT_INTERNAL_SECRET}
             (mirrors the existing internal-secret convention used by
             agent/tools/streaming.py and agent/tools/plugins.py — NOT the
             per-user extension bearer token from pair/redeem, since a
             headless worker is an internal Chippi service, not a paired
             user device.)
    Body:    {"sessionId": str, "completed"?: {"actionId": str, "result":
              BrowserActionResult}, "frame"?: {"image": str, "pageUrl"?:
              str, "pageTitle"?: str}}  -- same shape as protocol.ts's
              PollBody, minus the extension-only `killed` field.
    Returns: {"action": {"id": str, "sessionId": str, "input":
              BrowserActionInput} | null, "stop": bool}  -- same shape as
              protocol.ts's PollResponse.
"""

from __future__ import annotations

import asyncio
import base64
import ipaddress
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlparse

import httpx

# ── shared constants (mirror extension/lib/executor.js) ────────────────────

# Keys the `press` action is allowed to send — mirrors PressAction's z.enum
# in protocol.ts exactly. A closed allow-list independent of the schema
# validation upstream (defense in depth): even if a malformed action slipped
# past protocol validation, this module still refuses anything outside it.
ALLOWED_KEYS = frozenset(
    {"Enter", "Tab", "Escape", "Backspace", "ArrowDown", "ArrowUp"}
)

DEFAULT_SCROLL_DY = 400
NAVIGATE_TIMEOUT_MS = 15_000
SELECTOR_TIMEOUT_MS = 5_000
SCREENSHOT_QUALITY = 40

# document.querySelectorAll target for read_dom's interactive-element scan —
# identical to extension/lib/executor.js's READ_DOM_SELECTOR.
_READ_DOM_SELECTOR = "[role], button, a, input, select, textarea, [aria-label], [tabindex]"

# Same interactive-element extraction as extension/lib/executor.js's
# doReadDom, translated verbatim so both runtimes report the same shape.
_READ_DOM_JS = (
    "(() => { "
    'const text = document.body ? document.body.innerText : ""; '
    "const isVisible = (el) => { "
    "const r = el.getBoundingClientRect(); "
    "if (r.width <= 0 || r.height <= 0) return false; "
    "const style = window.getComputedStyle(el); "
    'return style.visibility !== "hidden" && style.display !== "none"; }; '
    "const labelFor = (el) => { "
    "if (el.labels && el.labels.length) { "
    'return Array.from(el.labels).map((l) => (l.innerText || "").trim())'
    '.filter(Boolean).join(" "); } '
    'return ""; }; '
    f"const nodes = Array.from(document.querySelectorAll({_READ_DOM_SELECTOR!r}))"
    ".filter(isVisible).slice(0, 80); "
    "const roles = nodes.map((el) => { "
    'const explicitRole = el.getAttribute("role"); '
    'const isLink = el.tagName === "A"; '
    'const hasHref = isLink && el.hasAttribute("href"); '
    "const kind = explicitRole || "
    '(isLink && !hasHref ? "link (no href — interactive)" : el.tagName.toLowerCase()); '
    "const name = (labelFor(el) || el.getAttribute(\"aria-label\") || "
    '(el.innerText || "").trim() || el.getAttribute("placeholder") || '
    'el.getAttribute("value") || "").trim().slice(0, 60); '
    "return name ? `${kind}: ${name}` : kind; "
    "}); "
    "return { text, roles }; })()"
)


def _default_sleep(seconds: float) -> Awaitable[None]:
    return asyncio.sleep(seconds)


# ── SSRF guard for headless `navigate` ──────────────────────────────────────
#
# `enqueueAction` (lib/browser-control/session.ts) already runs
# `assertPublicHttpUrl` once, server-side, before an action is even queued.
# But that check happens on the Chippi web server; the actual outbound fetch
# for a headless session happens later — up to ACTION_TTL_SECONDS (120s), per
# protocol.ts — on THIS Modal worker, a different machine/network. A domain
# with a very short DNS TTL can pass the enqueue-time check while resolving
# to a private/internal/metadata address by the time this worker actually
# navigates (classic TOCTOU / DNS-rebinding). Re-checking immediately before
# `page.goto` closes that window down to "right before the real fetch"
# instead of leaving it open for the full TTL. This mirrors
# `isPrivateAddress` in lib/browser-proxy.ts; kept as a single self-contained
# helper here (not imported from anywhere) since this module has zero
# runtime dependency on the Next.js app.
#
# `resolve_addr` is injected (mirrors `sleep`/`http_post`/`browser_factory`)
# so tests never need a real DNS lookup or network access — only the
# production default (`_default_resolve_addr`) touches the network.
ResolveAddr = Callable[[str], Awaitable[list[str]]]

# CGNAT / shared address space — not flagged by ipaddress's built-in checks.
_CGNAT_NET = ipaddress.ip_network("100.64.0.0/10")


async def _default_resolve_addr(host: str) -> list[str]:
    loop = asyncio.get_event_loop()
    infos = await loop.getaddrinfo(host, None)
    return [info[4][0] for info in infos]


def _is_private_address(addr: str) -> bool:
    """True when `addr` (a literal IPv4/IPv6 address) is not publicly
    routable — private/loopback/link-local/multicast/reserved/unspecified,
    including the IPv4-mapped IPv6 form (::ffff:10.0.0.1)."""
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return True  # not a parseable literal — fail closed
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return _is_private_address(str(ip.ipv4_mapped))
    # CGNAT / shared address space (100.64.0.0/10) is NOT flagged by
    # ipaddress.is_private et al., but lib/browser-proxy.ts's isPrivateAddress
    # blocks it — mirror that here so a carrier-NAT / internal target can't
    # slip through the headless SSRF re-check.
    if isinstance(ip, ipaddress.IPv4Address) and ip in _CGNAT_NET:
        return True
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def _assert_public_http_url(url: str | None, resolve_addr: ResolveAddr) -> None:
    """Raises `ValueError` unless `url` is an http(s) URL whose host resolves
    ONLY to public addresses right now. See the module-level comment above
    for why this re-checks a URL the server already validated once."""
    parsed = urlparse(url or "")
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http(s) URLs can be opened.")
    host = (parsed.hostname or "").strip()
    if not host or host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
        raise ValueError("That address is not reachable from here.")

    try:
        ipaddress.ip_address(host)
        is_literal = True
    except ValueError:
        is_literal = False

    if is_literal:
        if _is_private_address(host):
            raise ValueError("That address is not reachable from here.")
        return

    try:
        addrs = await resolve_addr(host)
    except Exception as exc:
        raise ValueError(f"Couldn't resolve {host}.") from exc
    if not addrs or any(_is_private_address(a) for a in addrs):
        raise ValueError("That address is not reachable from here.")


async def _safe_page_info(page: Any) -> dict[str, Any]:
    """Best-effort `{pageUrl, pageTitle}` after an action — never raises."""
    info: dict[str, Any] = {}
    try:
        info["pageUrl"] = page.url
    except Exception:
        pass
    try:
        info["pageTitle"] = await page.title()
    except Exception:
        pass
    return info


# ── per-action handlers ─────────────────────────────────────────────────────


async def _do_navigate(
    action: dict[str, Any], page: Any, resolve_addr: ResolveAddr
) -> dict[str, Any]:
    url = action.get("url")
    try:
        await _assert_public_http_url(url, resolve_addr)
    except ValueError as exc:
        return {"ok": False, "error": f"Navigation blocked: {exc}"}
    try:
        await page.goto(url, wait_until="load", timeout=NAVIGATE_TIMEOUT_MS)
    except Exception as exc:
        return {"ok": False, "error": f"Navigation failed: {exc}"}
    return {"ok": True, "summary": f"Navigated to {url}"}


async def _do_click(action: dict[str, Any], page: Any) -> dict[str, Any]:
    x = action.get("x")
    y = action.get("y")
    selector = action.get("selector")
    if (x is None or y is None) and selector:
        locator = page.locator(selector)
        try:
            await locator.scroll_into_view_if_needed(timeout=SELECTOR_TIMEOUT_MS)
        except Exception:
            return {
                "ok": False,
                "error": (
                    f'No element matches selector "{selector}" — check the selector '
                    "against the page's current DOM (try read_dom) before retrying."
                ),
            }
        try:
            await locator.click(timeout=SELECTOR_TIMEOUT_MS)
        except Exception as exc:
            return {
                "ok": False,
                "error": f'Element "{selector}" was found but could not be clicked: {exc}',
            }
        return {"ok": True, "summary": f'Clicked "{selector}"'}
    if x is None or y is None:
        return {"ok": False, "error": "click requires x/y coordinates or a selector"}
    await page.mouse.click(x, y)
    return {"ok": True, "summary": f"Clicked at ({round(x)}, {round(y)})"}


async def _do_type(action: dict[str, Any], page: Any) -> dict[str, Any]:
    text = action.get("text", "")
    selector = action.get("selector")
    if selector:
        locator = page.locator(selector)
        try:
            await locator.scroll_into_view_if_needed(timeout=SELECTOR_TIMEOUT_MS)
            await locator.click(timeout=SELECTOR_TIMEOUT_MS)
        except Exception:
            return {
                "ok": False,
                "error": (
                    f'No element matches selector "{selector}" — check the selector '
                    "against the page's current DOM (try read_dom) before retrying."
                ),
            }
    await page.keyboard.type(text)
    preview = text if len(text) <= 40 else f"{text[:40]}…"
    return {"ok": True, "summary": f'Typed "{preview}"'}


async def _do_press(action: dict[str, Any], page: Any) -> dict[str, Any]:
    key = action.get("key")
    if key not in ALLOWED_KEYS:
        return {"ok": False, "error": f"Unsupported key: {key}"}
    await page.keyboard.press(key)
    return {"ok": True, "summary": f"Pressed {key}"}


async def _do_scroll(action: dict[str, Any], page: Any) -> dict[str, Any]:
    to_selector = action.get("toSelector")
    if to_selector:
        locator = page.locator(to_selector)
        try:
            await locator.scroll_into_view_if_needed(timeout=SELECTOR_TIMEOUT_MS)
        except Exception:
            return {"ok": False, "error": f"Element not found: {to_selector}"}
        return {"ok": True, "summary": f'Scrolled to "{to_selector}"'}
    dy = action.get("dy")
    if dy is None:
        dy = DEFAULT_SCROLL_DY
    await page.mouse.wheel(0, dy)
    return {"ok": True, "summary": f"Scrolled by {dy}px"}


async def _do_read_dom(action: dict[str, Any], page: Any) -> dict[str, Any]:
    max_chars = action.get("maxChars") or 12_000
    try:
        value = await page.evaluate(_READ_DOM_JS)
    except Exception:
        value = None
    value = value or {}
    text = value.get("text") or ""
    roles = value.get("roles") or []
    roles_block = f"\n\n[interactive elements]\n{chr(10).join(roles)}" if roles else ""
    full = f"{text}{roles_block}"
    dom = full[:max_chars] if len(full) > max_chars else full
    return {"ok": True, "summary": f"Read page ({len(dom)} chars)", "dom": dom}


async def _do_screenshot(action: dict[str, Any], page: Any) -> dict[str, Any]:
    try:
        data = await page.screenshot(type="jpeg", quality=SCREENSHOT_QUALITY)
    except Exception as exc:
        return {"ok": False, "error": f"Screenshot capture failed: {exc}"}
    if not data:
        return {"ok": False, "error": "Screenshot capture returned no data"}
    encoded = base64.b64encode(data).decode("ascii")
    return {
        "ok": True,
        "summary": "Captured screenshot",
        "screenshot": f"data:image/jpeg;base64,{encoded}",
    }


async def _do_wait(
    action: dict[str, Any], sleep: Callable[[float], Awaitable[None]]
) -> dict[str, Any]:
    ms = action.get("ms", 0)
    await sleep(ms / 1000)
    return {"ok": True, "summary": f"Waited {ms}ms"}


# ── entrypoint ───────────────────────────────────────────────────────────


async def execute_action(
    action: dict[str, Any],
    page: Any,
    *,
    sleep: Callable[[float], Awaitable[None]] | None = None,
    resolve_addr: ResolveAddr | None = None,
) -> dict[str, Any]:
    """Execute one `BrowserActionInput`-shaped dict against `page`.

    Returns a `BrowserActionResult`-shaped dict:
    `{ok, summary?, dom?, screenshot?, pageUrl?, pageTitle?, error?}`.
    NEVER raises — every action branch, and the page-info lookup after it,
    is wrapped so a driver failure always resolves to `{"ok": False,
    "error": ...}` rather than propagating out of the worker loop.

    `resolve_addr` is only consulted by `navigate` (the one action type that
    performs an outbound fetch to an attacker-influenced host) — see
    `_assert_public_http_url`. Defaults to real DNS resolution; tests inject
    a fake so this function never touches the network.
    """
    sleep_fn = sleep or _default_sleep
    resolve_fn = resolve_addr or _default_resolve_addr
    action_type = action.get("type")

    try:
        if action_type == "navigate":
            result = await _do_navigate(action, page, resolve_fn)
        elif action_type == "click":
            result = await _do_click(action, page)
        elif action_type == "type":
            result = await _do_type(action, page)
        elif action_type == "press":
            result = await _do_press(action, page)
        elif action_type == "scroll":
            result = await _do_scroll(action, page)
        elif action_type == "read_dom":
            result = await _do_read_dom(action, page)
        elif action_type == "screenshot":
            result = await _do_screenshot(action, page)
        elif action_type == "wait":
            result = await _do_wait(action, sleep_fn)
        else:
            return {"ok": False, "error": f"Unsupported action type: {action_type}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc) or repr(exc)}

    info = await _safe_page_info(page)
    return {**result, **info}


# ── headless worker loop ────────────────────────────────────────────────────

# Injected transport: (url, json_body, headers) -> parsed JSON response body.
HttpPost = Callable[[str, dict[str, Any], dict[str, str]], Awaitable[dict[str, Any]]]

IDLE_POLL_DELAY_S = 1.5
ERROR_POLL_DELAY_S = 4.0


async def _default_http_post(
    url: str, json_body: dict[str, Any], headers: dict[str, str]
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=json_body, headers=headers)
        resp.raise_for_status()
        return resp.json()


@asynccontextmanager
async def _default_browser_factory():
    """Launches a real headless Chromium page via Playwright.

    Lazy-imports `playwright.async_api` so importing this MODULE never
    requires the package to be installed — only calling `poll_and_execute`
    with no injected `browser_factory` does. See the module docstring's
    "Deploy dependency" section.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise RuntimeError(
            "playwright is not installed. The headless browser worker needs "
            "the 'playwright' package plus `playwright install chromium` on "
            "the Modal image — see agent/browser_headless.py's module "
            "docstring. Pass an explicit `browser_factory=` to bypass this "
            "default (e.g. in tests)."
        ) from exc
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            try:
                yield page
            finally:
                await page.close()
        finally:
            await browser.close()


async def _capture_frame(page: Any) -> dict[str, Any] | None:
    """Best-effort live frame for the poll body's `frame` field — never
    raises; a failed capture just means this poll rides without one."""
    result = await _do_screenshot({}, page)
    if not result.get("ok"):
        return None
    frame: dict[str, Any] = {"image": result["screenshot"]}
    info = await _safe_page_info(page)
    if "pageUrl" in info:
        frame["pageUrl"] = info["pageUrl"]
    if "pageTitle" in info:
        frame["pageTitle"] = info["pageTitle"]
    return frame


async def poll_and_execute(
    base_url: str,
    internal_secret: str,
    session_id: str,
    *,
    http_post: HttpPost | None = None,
    browser_factory: Callable[[], Any] | None = None,
    sleep: Callable[[float], Awaitable[None]] | None = None,
    resolve_addr: ResolveAddr | None = None,
    idle_delay_s: float = IDLE_POLL_DELAY_S,
    error_delay_s: float = ERROR_POLL_DELAY_S,
    max_iterations: int | None = None,
) -> dict[str, Any]:
    """Long-poll `{base_url}/api/browser-control/headless/poll` for the next
    queued action on `session_id`, execute it against a browser `page`, and
    report the result back — repeating FIFO, in the order actions were
    dispatched, until the server says `stop` or `max_iterations` is hit.

    `http_post`, `browser_factory`, and `resolve_addr` are injected so this
    loop is fully unit-testable with no real network and no real browser:
    supply fakes and the defaults (real HTTP via httpx, real Playwright
    Chromium, real DNS resolution for the navigate SSRF re-check) are never
    touched. `max_iterations` is a safety valve for tests (and a sane
    ceiling for a runaway server) — production callers can leave it unset
    and rely on the server's `stop` signal.

    Never raises out of the polling body: a poll transport error is treated
    like a transient hiccup (bounded retry via `error_delay_s` /
    `max_iterations`, never a crash) and always reported in the return
    value's `stopped_reason` rather than propagating.

    Returns `{"stopped_reason": str, "actions_executed": int}`.
    """
    post = http_post or _default_http_post
    factory = browser_factory or _default_browser_factory
    sleep_fn = sleep or _default_sleep

    poll_url = f"{base_url.rstrip('/')}/api/browser-control/headless/poll"
    headers = {
        "Authorization": f"Bearer {internal_secret}",
        "Content-Type": "application/json",
    }

    actions_executed = 0
    stop_reason = "max_iterations"
    completed: dict[str, Any] | None = None
    frame: dict[str, Any] | None = None
    iterations = 0

    async with factory() as page:
        while True:
            iterations += 1
            if max_iterations is not None and iterations > max_iterations:
                stop_reason = "max_iterations"
                break

            body: dict[str, Any] = {"sessionId": session_id}
            if completed is not None:
                body["completed"] = completed
            if frame is not None:
                body["frame"] = frame
            completed = None
            frame = None

            try:
                poll = await post(poll_url, body, headers)
            except Exception as exc:
                stop_reason = f"poll_error: {exc}"
                await sleep_fn(error_delay_s)
                continue

            if poll.get("stop"):
                stop_reason = "stop"
                break

            action = poll.get("action")
            if not action:
                stop_reason = "idle"
                await sleep_fn(idle_delay_s)
                continue

            action_input = action.get("input") or {}
            result = await execute_action(
                action_input, page, sleep=sleep_fn, resolve_addr=resolve_addr
            )
            actions_executed += 1
            completed = {"actionId": action.get("id"), "result": result}
            frame = await _capture_frame(page)

    return {"stopped_reason": stop_reason, "actions_executed": actions_executed}


# ── Modal wiring (NOT wired in — deploy/integrator step) ───────────────────
#
# This module is deliberately NOT imported by agent/modal_app.py. Wiring a
# headless session into Modal needs, at minimum:
#
#   1. Extending `image` in modal_app.py with the playwright dependency and
#      browser install:
#
#        headless_image = image.pip_install("playwright>=1.45,<2").run_commands(
#            "playwright install --with-deps chromium"
#        )
#
#   2. An @app.function bound to that image that runs one session to
#      completion (or until `stop`):
#
#        @app.function(image=headless_image, timeout=900, secrets=[...])
#        async def run_headless_browser_session(session_id: str) -> dict:
#            from browser_headless import poll_and_execute
#            from config import settings
#            return await poll_and_execute(
#                base_url=settings.app_url,
#                internal_secret=settings.agent_internal_secret,
#                session_id=session_id,
#            )
#
#   3. Something on the Chippi side (Track B / integrator) that spawns it —
#      e.g. `run_headless_browser_session.spawn(session_id)` — when a
#      BrowserSession is created with `source = 'headless'`.
#
# None of the above is implemented here; this file only provides the pure
# executor + the injectable worker loop that such a function would call.
