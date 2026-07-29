"""Tests for the headless (cloud) browser-control runtime.

Covers `execute_action` (the pure per-action executor, driven against a FAKE
Playwright-shaped `page` — no real browser, no real playwright import) and
`poll_and_execute` (the worker loop, driven against fake `http_post` +
`browser_factory` — no real network, no real browser).

Run from `agent/` with:

    NEXT_PUBLIC_SUPABASE_URL=stub SUPABASE_SERVICE_ROLE_KEY=stub \\
      python -m pytest tests/test_browser_headless.py -v
"""

from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from typing import Any

os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "stub")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "stub")

_AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AGENT_DIR not in sys.path:
    sys.path.insert(0, _AGENT_DIR)

from browser_headless import (  # noqa: E402
    _headless_action_allowed,
    execute_action,
    poll_and_execute,
)

# pytest-asyncio's asyncio_mode = "auto" (see agent/pyproject.toml) collects
# every `async def test_*` here without needing per-test markers.


# ── fakes ────────────────────────────────────────────────────────────────


class FakeLocator:
    def __init__(self, page: FakePage, selector: str):
        self.page = page
        self.selector = selector

    async def scroll_into_view_if_needed(self, timeout: int | None = None):
        self.page.calls.append(("scroll_into_view_if_needed", self.selector))
        if self.selector in self.page.missing_selectors:
            raise TimeoutError(f"selector not found: {self.selector}")

    async def click(self, timeout: int | None = None):
        self.page.calls.append(("locator_click", self.selector))
        if self.selector in self.page.unclickable_selectors:
            raise TimeoutError(f"not clickable: {self.selector}")

    async def evaluate(self, script):
        self.page.calls.append(("locator_evaluate", self.selector))
        return self.page.target_info


class FakeMouse:
    def __init__(self, page: FakePage):
        self.page = page

    async def click(self, x, y):
        self.page.calls.append(("mouse_click", x, y))

    async def wheel(self, dx, dy):
        self.page.calls.append(("mouse_wheel", dx, dy))


class FakeKeyboard:
    def __init__(self, page: FakePage):
        self.page = page

    async def type(self, text):
        self.page.calls.append(("keyboard_type", text))

    async def press(self, key):
        self.page.calls.append(("keyboard_press", key))


class FakePage:
    """Duck-types the slice of playwright.async_api.Page that
    browser_headless.py drives. `url` is a sync attribute and `title()` is
    an async method, matching the real Playwright API exactly."""

    def __init__(
        self,
        *,
        url: str = "https://example.com/",
        title: str = "Example",
        eval_result: Any = None,
        screenshot_bytes: bytes | None = b"\xff\xd8fakejpeg",
        missing_selectors: tuple[str, ...] = (),
        unclickable_selectors: tuple[str, ...] = (),
        raise_on_goto: Exception | None = None,
        raise_on_screenshot: Exception | None = None,
        raise_on_evaluate: Exception | None = None,
        target_info: dict | None = None,
    ):
        self.url = url
        self._title = title
        self.eval_result = eval_result
        self.screenshot_bytes = screenshot_bytes
        self.missing_selectors = set(missing_selectors)
        self.unclickable_selectors = set(unclickable_selectors)
        self.raise_on_goto = raise_on_goto
        self.raise_on_screenshot = raise_on_screenshot
        self.raise_on_evaluate = raise_on_evaluate
        self.target_info = target_info or {
            "tag": "a",
            "type": "",
            "text": "Continue",
            "hasForm": False,
            "formAction": "",
            "href": "https://public.example.com/next",
            "download": False,
        }
        self.calls: list[tuple] = []
        self.mouse = FakeMouse(self)
        self.keyboard = FakeKeyboard(self)

    def locator(self, selector: str) -> FakeLocator:
        self.calls.append(("locator", selector))
        return FakeLocator(self, selector)

    async def goto(self, url, wait_until=None, timeout=None):
        self.calls.append(("goto", url, wait_until, timeout))
        if self.raise_on_goto:
            raise self.raise_on_goto
        self.url = url

    async def evaluate(self, script):
        self.calls.append(("evaluate",))
        if self.raise_on_evaluate:
            raise self.raise_on_evaluate
        return self.eval_result

    async def screenshot(self, type=None, quality=None):
        self.calls.append(("screenshot", type, quality))
        if self.raise_on_screenshot:
            raise self.raise_on_screenshot
        return self.screenshot_bytes

    async def title(self):
        return self._title


class ThrowingLocatorPage(FakePage):
    """A page whose `.locator()` call itself raises — exercises the OUTER
    try/except in execute_action (not the per-action inner try/excepts)."""

    def locator(self, selector: str):
        raise RuntimeError("boom: locator() blew up")


def fake_resolver(mapping: dict[str, list[str]]):
    """Injectable `resolve_addr` — never touches real DNS. Any host not in
    `mapping` raises, mirroring a resolution failure."""

    async def resolve(host: str) -> list[str]:
        if host not in mapping:
            raise OSError(f"no such host: {host}")
        return mapping[host]

    return resolve


PUBLIC_RESOLVER = fake_resolver(
    {
        "example.com": ["93.184.216.34"],
        "nope.invalid": ["93.184.216.34"],
        "x.test": ["93.184.216.34"],
    }
)


# ── execute_action: navigate ────────────────────────────────────────────


async def test_navigate_waits_and_reports_page_info():
    page = FakePage(url="https://example.com/", title="Example Domain")
    result = await execute_action(
        {"type": "navigate", "url": "https://example.com/page"},
        page,
        resolve_addr=PUBLIC_RESOLVER,
    )
    assert result["ok"] is True
    assert "Navigated to https://example.com/page" in result["summary"]
    goto_calls = [c for c in page.calls if c[0] == "goto"]
    assert goto_calls == [("goto", "https://example.com/page", "load", 15_000)]
    # FakePage.goto updates .url in place, matching real Playwright.
    assert result["pageUrl"] == "https://example.com/page"
    assert result["pageTitle"] == "Example Domain"


async def test_navigate_failure_is_error_not_exception():
    page = FakePage(raise_on_goto=RuntimeError("net::ERR_NAME_NOT_RESOLVED"))
    result = await execute_action(
        {"type": "navigate", "url": "https://nope.invalid"}, page, resolve_addr=PUBLIC_RESOLVER
    )
    assert result["ok"] is False
    assert "Navigation failed" in result["error"]


# ── execute_action: navigate SSRF re-check ──────────────────────────────
#
# The Chippi web server already validates a navigate URL once at enqueue
# time (assertPublicHttpUrl in lib/browser-proxy.ts). These tests cover the
# SECOND check this module performs immediately before the real fetch — see
# `_assert_public_http_url`'s module-level comment for why that matters for
# a headless worker specifically (DNS rebinding across the enqueue-to-poll
# gap). No real DNS lookup ever happens here — `resolve_addr` is faked.


async def test_navigate_blocks_url_resolving_to_private_ip():
    page = FakePage()
    resolver = fake_resolver({"internal.example.com": ["10.0.0.5"]})
    result = await execute_action(
        {"type": "navigate", "url": "https://internal.example.com/"},
        page,
        resolve_addr=resolver,
    )
    assert result["ok"] is False
    assert "blocked" in result["error"].lower()
    assert not any(c[0] == "goto" for c in page.calls)  # never reached the browser


async def test_navigate_blocks_url_resolving_to_cloud_metadata_address():
    page = FakePage()
    resolver = fake_resolver({"rebound.example.com": ["169.254.169.254"]})
    result = await execute_action(
        {"type": "navigate", "url": "http://rebound.example.com/latest/meta-data"},
        page,
        resolve_addr=resolver,
    )
    assert result["ok"] is False
    assert not any(c[0] == "goto" for c in page.calls)


async def test_navigate_blocks_cgnat_shared_address_space():
    # 100.64.0.0/10 is not flagged by ipaddress's built-ins but must be blocked
    # (mirrors lib/browser-proxy.ts). Both a literal and a DNS-rebound host.
    page = FakePage()
    literal = await execute_action(
        {"type": "navigate", "url": "http://100.64.1.2/x"},
        page,
        resolve_addr=fake_resolver({}),
    )
    assert literal["ok"] is False
    assert not any(c[0] == "goto" for c in page.calls)

    page2 = FakePage()
    rebound = await execute_action(
        {"type": "navigate", "url": "http://carrier-nat.example.com/x"},
        page2,
        resolve_addr=fake_resolver({"carrier-nat.example.com": ["100.100.50.9"]}),
    )
    assert rebound["ok"] is False
    assert not any(c[0] == "goto" for c in page2.calls)


async def test_navigate_blocks_ip_literal_targets_without_dns():
    page = FakePage()
    called = {"n": 0}

    async def resolver_should_not_be_called(host: str) -> list[str]:
        called["n"] += 1
        return ["93.184.216.34"]

    result = await execute_action(
        {"type": "navigate", "url": "http://127.0.0.1:8080/admin"},
        page,
        resolve_addr=resolver_should_not_be_called,
    )
    assert result["ok"] is False
    assert not any(c[0] == "goto" for c in page.calls)
    assert called["n"] == 0  # IP literal — no DNS resolution needed to judge it


async def test_navigate_blocks_non_http_scheme():
    page = FakePage()
    result = await execute_action(
        {"type": "navigate", "url": "file:///etc/passwd"}, page, resolve_addr=PUBLIC_RESOLVER
    )
    assert result["ok"] is False
    assert not any(c[0] == "goto" for c in page.calls)


async def test_navigate_blocks_when_any_resolved_address_is_private():
    # A host with BOTH a public and a private A/AAAA record must be blocked —
    # the browser could pick either one.
    page = FakePage()
    resolver = fake_resolver({"mixed.example.com": ["93.184.216.34", "192.168.1.1"]})
    result = await execute_action(
        {"type": "navigate", "url": "https://mixed.example.com/"},
        page,
        resolve_addr=resolver,
    )
    assert result["ok"] is False
    assert not any(c[0] == "goto" for c in page.calls)


async def test_navigate_allows_public_address():
    page = FakePage()
    resolver = fake_resolver({"public.example.com": ["93.184.216.34"]})
    result = await execute_action(
        {"type": "navigate", "url": "https://public.example.com/"},
        page,
        resolve_addr=resolver,
    )
    assert result["ok"] is True
    assert any(c[0] == "goto" for c in page.calls)


# ── execute_action: click ───────────────────────────────────────────────


async def test_click_selector_scrolls_into_view_then_clicks():
    page = FakePage()
    result = await execute_action({"type": "click", "selector": "#submit"}, page)
    assert result["ok"] is True
    assert page.calls.index(("scroll_into_view_if_needed", "#submit")) < page.calls.index(
        ("locator_click", "#submit")
    )
    assert "#submit" in result["summary"]


async def test_click_coordinates_use_mouse_directly():
    page = FakePage()
    result = await execute_action({"type": "click", "x": 12.4, "y": 30.6}, page)
    assert result["ok"] is True
    assert ("mouse_click", 12.4, 30.6) in page.calls
    assert not any(c[0] == "locator" for c in page.calls)


async def test_click_missing_selector_not_found():
    page = FakePage(missing_selectors=("#ghost",))
    result = await execute_action({"type": "click", "selector": "#ghost"}, page)
    assert result["ok"] is False
    assert "#ghost" in result["error"]
    assert not any(c[0] == "locator_click" for c in page.calls)


async def test_click_without_coords_or_selector_errors():
    page = FakePage()
    result = await execute_action({"type": "click"}, page)
    assert result["ok"] is False
    assert "selector" in result["error"]


async def test_headless_policy_denies_all_typing_and_keys_before_execution():
    page = FakePage()
    for text in ("email@example.com", "login", "username", "password"):
        allowed, _ = await _headless_action_allowed(
            {"type": "type", "text": text, "selector": "#search"}, page
        )
        assert allowed is False
    for key in ("Enter", "Tab", "Escape", "Backspace", "ArrowDown", "ArrowUp"):
        allowed, _ = await _headless_action_allowed({"type": "press", "key": key}, page)
        assert allowed is False


async def test_headless_policy_only_allows_inspected_safe_public_anchor_and_rewrites_to_navigate():
    page = FakePage(
        target_info={
            "tag": "a",
            "type": "",
            "text": "Continue",
            "hasForm": False,
            "formAction": "",
            "href": "https://public.example.com/next",
            "download": False,
        }
    )
    action = {"type": "click", "selector": "#continue"}
    allowed, _ = await _headless_action_allowed(action, page)
    assert allowed is True
    assert action == {"type": "navigate", "url": "https://public.example.com/next"}
    assert not any(call[0] == "locator_click" for call in page.calls)


async def test_headless_policy_rejects_deceptive_or_non_public_targets():
    bad_targets = [
        {
            "tag": "a",
            "text": "Continue delete",
            "href": "https://public.example.com/",
            "hasForm": False,
            "download": False,
        },
        {
            "tag": "a",
            "text": "Continue",
            "href": "javascript:alert(1)",
            "hasForm": False,
            "download": False,
        },
        {
            "tag": "a",
            "text": "Continue",
            "href": "mailto:a@example.com",
            "hasForm": False,
            "download": False,
        },
        {
            "tag": "a",
            "text": "Continue",
            "href": "data:text/plain,x",
            "hasForm": False,
            "download": False,
        },
        {
            "tag": "a",
            "text": "Continue",
            "href": "https://public.example.com/",
            "hasForm": True,
            "download": False,
        },
        {
            "tag": "a",
            "text": "Continue",
            "href": "https://public.example.com/",
            "hasForm": False,
            "download": True,
        },
        {
            "tag": "button",
            "text": "Continue",
            "href": "https://public.example.com/",
            "hasForm": False,
            "download": False,
        },
    ]
    for target in bad_targets:
        page = FakePage(target_info={"type": "", "formAction": "", **target})
        allowed, _ = await _headless_action_allowed({"type": "click", "selector": "#delete"}, page)
        assert allowed is False


async def test_inspected_link_is_revalidated_before_navigation_fetch():
    """An ordinary-looking anchor can still point at localhost. The policy
    rewrite must pass through execute_action's network boundary before goto."""
    page = FakePage(
        target_info={
            "tag": "a",
            "type": "",
            "text": "Open report",
            "hasForm": False,
            "formAction": "",
            "href": "https://localhost/private",
            "download": False,
        }
    )
    action = {"type": "click", "selector": "#report"}
    allowed, _ = await _headless_action_allowed(action, page)
    assert allowed is True
    result = await execute_action(
        action, page, resolve_addr=fake_resolver({"localhost": ["127.0.0.1"]})
    )
    assert result["ok"] is False
    assert not any(call[0] == "goto" for call in page.calls)


# ── execute_action: type ────────────────────────────────────────────────


async def test_type_focuses_selector_then_types():
    page = FakePage()
    result = await execute_action(
        {"type": "type", "text": "hello world", "selector": "#search"}, page
    )
    assert result["ok"] is True
    assert page.calls.index(("locator_click", "#search")) < page.calls.index(
        ("keyboard_type", "hello world")
    )


async def test_type_without_selector_types_into_focused_element():
    page = FakePage()
    result = await execute_action({"type": "type", "text": "abc"}, page)
    assert result["ok"] is True
    assert ("keyboard_type", "abc") in page.calls
    assert not any(c[0] == "locator" for c in page.calls)


async def test_type_truncates_preview_in_summary():
    page = FakePage()
    long_text = "x" * 100
    result = await execute_action({"type": "type", "text": long_text}, page)
    assert result["ok"] is True
    assert "…" in result["summary"]
    assert len(result["summary"]) < 100


# ── execute_action: press ───────────────────────────────────────────────


async def test_press_allowed_key():
    page = FakePage()
    result = await execute_action({"type": "press", "key": "Enter"}, page)
    assert result["ok"] is True
    assert ("keyboard_press", "Enter") in page.calls


async def test_press_disallowed_key_is_error_not_exception():
    page = FakePage()
    result = await execute_action({"type": "press", "key": "F5"}, page)
    assert result["ok"] is False
    assert "F5" in result["error"]
    assert not any(c[0] == "keyboard_press" for c in page.calls)


# ── execute_action: scroll ──────────────────────────────────────────────


async def test_scroll_by_delta_uses_mouse_wheel():
    page = FakePage()
    result = await execute_action({"type": "scroll", "dy": 250}, page)
    assert result["ok"] is True
    assert ("mouse_wheel", 0, 250) in page.calls


async def test_scroll_default_delta_when_unspecified():
    page = FakePage()
    result = await execute_action({"type": "scroll"}, page)
    assert result["ok"] is True
    assert ("mouse_wheel", 0, 400) in page.calls


async def test_scroll_to_selector():
    page = FakePage()
    result = await execute_action({"type": "scroll", "toSelector": "#footer"}, page)
    assert result["ok"] is True
    assert ("scroll_into_view_if_needed", "#footer") in page.calls


async def test_scroll_to_missing_selector_errors():
    page = FakePage(missing_selectors=("#ghost",))
    result = await execute_action({"type": "scroll", "toSelector": "#ghost"}, page)
    assert result["ok"] is False
    assert "#ghost" in result["error"]


# ── execute_action: read_dom ────────────────────────────────────────────


async def test_read_dom_truncates_to_max_chars():
    page = FakePage(eval_result={"text": "a" * 1000, "roles": ["button: Go"]})
    result = await execute_action({"type": "read_dom", "maxChars": 50}, page)
    assert result["ok"] is True
    assert len(result["dom"]) == 50


async def test_read_dom_includes_interactive_elements_block():
    page = FakePage(eval_result={"text": "hello", "roles": ["button: Submit", "link: Home"]})
    result = await execute_action({"type": "read_dom", "maxChars": 12_000}, page)
    assert "[interactive elements]" in result["dom"]
    assert "button: Submit" in result["dom"]


async def test_read_dom_evaluate_failure_yields_empty_dom_not_exception():
    page = FakePage(raise_on_evaluate=RuntimeError("context destroyed"))
    result = await execute_action({"type": "read_dom", "maxChars": 12_000}, page)
    assert result["ok"] is True
    assert result["dom"] == ""


# ── execute_action: screenshot ──────────────────────────────────────────


async def test_screenshot_returns_data_url():
    page = FakePage(screenshot_bytes=b"\xff\xd8binarydata")
    result = await execute_action({"type": "screenshot"}, page)
    assert result["ok"] is True
    assert result["screenshot"].startswith("data:image/jpeg;base64,")


async def test_screenshot_no_data_is_error():
    page = FakePage(screenshot_bytes=None)
    result = await execute_action({"type": "screenshot"}, page)
    assert result["ok"] is False
    assert "no data" in result["error"]


async def test_screenshot_raising_is_caught():
    page = FakePage(raise_on_screenshot=RuntimeError("target closed"))
    result = await execute_action({"type": "screenshot"}, page)
    assert result["ok"] is False
    assert "target closed" in result["error"]


# ── execute_action: wait ────────────────────────────────────────────────


async def test_wait_sleeps_ms_converted_to_seconds():
    page = FakePage()
    recorded = []

    async def fake_sleep(seconds):
        recorded.append(seconds)

    result = await execute_action({"type": "wait", "ms": 250}, page, sleep=fake_sleep)
    assert result["ok"] is True
    assert recorded == [0.25]
    assert "250ms" in result["summary"]


# ── execute_action: unknown type / hard failures ────────────────────────


async def test_unknown_action_type_is_error_not_exception():
    page = FakePage()
    result = await execute_action({"type": "eval_arbitrary_js"}, page)
    assert result["ok"] is False
    assert "Unsupported action type" in result["error"]


async def test_throwing_page_is_caught_into_error_result():
    page = ThrowingLocatorPage()
    result = await execute_action({"type": "click", "selector": "#x"}, page)
    assert result["ok"] is False
    assert "boom" in result["error"]


async def test_page_info_failure_does_not_break_result():
    class BrokenTitlePage(FakePage):
        async def title(self):
            raise RuntimeError("page closed")

    page = BrokenTitlePage()
    result = await execute_action({"type": "wait", "ms": 0}, page, sleep=lambda s: _noop())
    assert result["ok"] is True
    assert "pageTitle" not in result
    assert result["pageUrl"] == page.url


async def _noop():
    return None


# ── poll_and_execute: worker loop ───────────────────────────────────────


class FakeHttpPost:
    """Records every call and replays a scripted sequence of poll
    responses, FIFO. Once the script is exhausted it returns stop=True so a
    test bug (forgetting to script a stop) fails fast instead of hanging."""

    def __init__(self, responses: list[dict[str, Any]]):
        self.responses = list(responses)
        self.call_log: list[tuple[str, dict, dict]] = []

    async def __call__(self, url, json_body, headers):
        self.call_log.append((url, json_body, headers))
        if not self.responses:
            return {"action": None, "stop": True}
        return self.responses.pop(0)


def make_fake_browser_factory(page: FakePage):
    opened = {"enter": 0, "exit": 0}

    @asynccontextmanager
    async def factory():
        opened["enter"] += 1
        try:
            yield page
        finally:
            opened["exit"] += 1

    factory.opened = opened  # type: ignore[attr-defined]
    return factory


async def test_poll_and_execute_runs_actions_in_fifo_order():
    page = FakePage()
    action_1 = {"type": "navigate", "url": "https://x.test/1"}
    # Coordinate clicks are deliberately unavailable to the anonymous public
    # research worker; a harmless wait still exercises FIFO dispatch.
    action_2 = {"type": "wait", "ms": 1}
    http_post = FakeHttpPost(
        [
            {"action": {"id": "a1", "sessionId": "s1", "input": action_1}, "stop": False},
            {"action": {"id": "a2", "sessionId": "s1", "input": action_2}, "stop": False},
            {"action": None, "stop": True},
        ]
    )
    factory = make_fake_browser_factory(page)

    summary = await poll_and_execute(
        "https://app.test",
        "secret-123",
        "s1",
        http_post=http_post,
        browser_factory=factory,
        sleep=lambda s: _noop(),
        resolve_addr=PUBLIC_RESOLVER,
    )

    assert summary == {"stopped_reason": "stop", "actions_executed": 2}
    goto_index = next(i for i, c in enumerate(page.calls) if c[0] == "goto")
    assert goto_index >= 0  # a1 executed before the second FIFO response
    assert factory.opened == {"enter": 1, "exit": 1}  # browser opened once, closed once


async def test_poll_and_execute_reports_blocked_navigate_instead_of_fetching():
    """A DNS-rebound navigate action (looked legit when enqueued, resolves
    to a private address by the time this worker actually polls it) must be
    reported back to the server as a failed result — never silently
    dropped, and never actually fetched."""
    page = FakePage()
    action = {"type": "navigate", "url": "https://rebound.example.com/"}
    http_post = FakeHttpPost(
        [
            {"action": {"id": "a1", "sessionId": "s1", "input": action}, "stop": False},
            {"action": None, "stop": True},
        ]
    )
    factory = make_fake_browser_factory(page)
    resolver = fake_resolver({"rebound.example.com": ["10.1.2.3"]})

    summary = await poll_and_execute(
        "https://app.test",
        "secret",
        "s1",
        http_post=http_post,
        browser_factory=factory,
        sleep=lambda s: _noop(),
        resolve_addr=resolver,
    )

    assert summary["actions_executed"] == 1
    assert not any(c[0] == "goto" for c in page.calls)
    _, second_body, _ = http_post.call_log[1]
    assert second_body["completed"]["actionId"] == "a1"
    assert second_body["completed"]["result"]["ok"] is False
    assert "blocked" in second_body["completed"]["result"]["error"].lower()


async def test_poll_and_execute_sends_secret_and_completed_result():
    page = FakePage()
    wait_action = {"type": "wait", "ms": 0}
    http_post = FakeHttpPost(
        [
            {"action": {"id": "a1", "sessionId": "s1", "input": wait_action}, "stop": False},
            {"action": None, "stop": True},
        ]
    )
    factory = make_fake_browser_factory(page)

    await poll_and_execute(
        "https://app.test/",
        "secret-abc",
        "s1",
        http_post=http_post,
        browser_factory=factory,
        sleep=lambda s: _noop(),
    )

    first_url, first_body, first_headers = http_post.call_log[0]
    assert first_url == "https://app.test/api/browser-control/headless/poll"
    assert first_headers["Authorization"] == "Bearer secret-abc"
    assert first_body["sessionId"] == "s1"
    assert "completed" not in first_body  # nothing finished yet on the first poll

    second_url, second_body, _ = http_post.call_log[1]
    assert second_body["completed"]["actionId"] == "a1"
    assert second_body["completed"]["result"]["ok"] is True
    assert "frame" in second_body  # screenshot captured after the action


async def test_poll_and_execute_stops_without_running_further_actions():
    page = FakePage()
    unreached_action = {"type": "wait", "ms": 0}
    http_post = FakeHttpPost(
        [
            {"action": None, "stop": True},
            {
                "action": {"id": "should-not-run", "sessionId": "s1", "input": unreached_action},
                "stop": False,
            },
        ]
    )
    factory = make_fake_browser_factory(page)

    summary = await poll_and_execute(
        "https://app.test",
        "secret",
        "s1",
        http_post=http_post,
        browser_factory=factory,
        sleep=lambda s: _noop(),
    )

    assert summary["stopped_reason"] == "stop"
    assert summary["actions_executed"] == 0
    assert len(http_post.call_log) == 1  # never polled again after stop


async def test_poll_and_execute_idle_sleeps_and_continues():
    page = FakePage()
    http_post = FakeHttpPost(
        [
            {"action": None, "stop": False},
            {"action": None, "stop": False},
            {"action": None, "stop": True},
        ]
    )
    factory = make_fake_browser_factory(page)
    sleeps: list[float] = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    summary = await poll_and_execute(
        "https://app.test",
        "secret",
        "s1",
        http_post=http_post,
        browser_factory=factory,
        sleep=fake_sleep,
        idle_delay_s=1.5,
    )

    assert summary["stopped_reason"] == "stop"
    assert summary["actions_executed"] == 0
    assert sleeps.count(1.5) == 2  # one idle sleep per null-action poll


async def test_poll_and_execute_retries_transport_errors_and_bounds_via_max_iterations():
    page = FakePage()

    async def always_failing_post(url, body, headers):
        raise ConnectionError("network unreachable")

    factory = make_fake_browser_factory(page)
    sleeps: list[float] = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    summary = await poll_and_execute(
        "https://app.test",
        "secret",
        "s1",
        http_post=always_failing_post,
        browser_factory=factory,
        sleep=fake_sleep,
        error_delay_s=4.0,
        max_consecutive_poll_errors=10,
        max_iterations=3,
    )

    assert summary["stopped_reason"] == "max_iterations"
    assert summary["actions_executed"] == 0
    assert sleeps.count(4.0) == 3
    assert factory.opened == {"enter": 1, "exit": 1}  # browser still cleaned up on bail-out


async def test_poll_and_execute_stops_after_short_consecutive_transport_error_threshold():
    """A broken control plane must not consume the worker's 15-minute budget."""
    page = FakePage()
    polls = {"count": 0}

    async def always_failing_post(url, body, headers):
        polls["count"] += 1
        raise ConnectionError("network unreachable")

    sleeps: list[float] = []

    async def fake_sleep(seconds):
        sleeps.append(seconds)

    summary = await poll_and_execute(
        "https://app.test",
        "secret",
        "s1",
        http_post=always_failing_post,
        browser_factory=make_fake_browser_factory(page),
        sleep=fake_sleep,
        error_delay_s=0.01,
        max_consecutive_poll_errors=3,
    )

    assert summary == {"stopped_reason": "poll_error_threshold", "actions_executed": 0}
    assert polls["count"] == 3
    assert sleeps == [0.01, 0.01]


async def test_poll_and_execute_stop_cancels_an_inflight_action_without_late_completion():
    """Stop must win over a 15-second navigation/wait action within the
    active heartbeat interval; the cancelled action is never completed."""
    page = FakePage()
    action_started = asyncio.Event()
    action_cancelled = asyncio.Event()

    async def long_action_sleep(seconds):
        action_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            action_cancelled.set()
            raise

    http_post = FakeHttpPost(
        [
            {
                "action": {"id": "a1", "sessionId": "s1", "input": {"type": "wait", "ms": 15_000}},
                "stop": False,
            },
            {"action": None, "stop": True},
        ]
    )

    summary = await poll_and_execute(
        "https://app.test",
        "secret",
        "s1",
        worker_lease_token="lease-1",
        http_post=http_post,
        browser_factory=make_fake_browser_factory(page),
        sleep=long_action_sleep,
        active_action_poll_interval_s=0.001,
    )

    assert action_started.is_set()
    assert action_cancelled.is_set()
    assert summary == {"stopped_reason": "stop", "actions_executed": 0}
    assert len(http_post.call_log) == 2
    assert all(body["sessionId"] == "s1" for _, body, _ in http_post.call_log)
    assert all(body["workerLeaseToken"] == "lease-1" for _, body, _ in http_post.call_log)
    assert "completed" not in http_post.call_log[1][1]


async def test_poll_and_execute_completes_action_normally_while_heartbeat_is_enabled():
    """The cancellation watchdog is inert for a normal fast action."""
    page = FakePage()
    http_post = FakeHttpPost(
        [
            {
                "action": {"id": "a1", "sessionId": "s1", "input": {"type": "wait", "ms": 0}},
                "stop": False,
            },
            {"action": None, "stop": True},
        ]
    )

    summary = await poll_and_execute(
        "https://app.test",
        "secret",
        "s1",
        http_post=http_post,
        browser_factory=make_fake_browser_factory(page),
        sleep=lambda _seconds: _noop(),
        active_action_poll_interval_s=0.001,
    )

    assert summary == {"stopped_reason": "stop", "actions_executed": 1}
    assert http_post.call_log[1][1]["completed"]["actionId"] == "a1"


async def test_poll_and_execute_max_iterations_caps_a_never_stopping_server():
    page = FakePage()
    call_count = {"n": 0}

    async def always_action_post(url, body, headers):
        call_count["n"] += 1
        action_input = {"type": "wait", "ms": 0}
        return {
            "action": {"id": f"a{call_count['n']}", "sessionId": "s1", "input": action_input},
            "stop": False,
        }

    factory = make_fake_browser_factory(page)

    summary = await poll_and_execute(
        "https://app.test",
        "secret",
        "s1",
        http_post=always_action_post,
        browser_factory=factory,
        sleep=lambda s: _noop(),
        max_iterations=5,
    )

    assert summary["stopped_reason"] == "max_iterations"
    assert summary["actions_executed"] == 5
