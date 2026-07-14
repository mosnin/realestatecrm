"""Behavioral tests for notify.notify_space — the completion push helper.

The contract under test: it POSTs the internal notify endpoint with the
AGENT_INTERNAL_SECRET bearer and a capped payload, and it is STRICTLY
best-effort — unconfigured settings, transport failures, and non-2xx
responses all return False without raising (a push can never fail the run
it reports on).
"""

from __future__ import annotations

import pytest

import notify


class _FakeResponse:
    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code


class _FakeClient:
    """Records the POST and returns a canned response."""

    calls: list[dict] = []
    response = _FakeResponse(200)
    raise_exc: Exception | None = None

    def __init__(self, **kwargs) -> None:
        pass

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *args) -> bool:
        return False

    async def post(self, url, json=None, headers=None):
        if _FakeClient.raise_exc is not None:
            raise _FakeClient.raise_exc
        _FakeClient.calls.append({"url": url, "json": json, "headers": headers})
        return _FakeClient.response


@pytest.fixture
def fake_http(monkeypatch):
    _FakeClient.calls = []
    _FakeClient.response = _FakeResponse(200)
    _FakeClient.raise_exc = None
    monkeypatch.setattr(notify.httpx, "AsyncClient", _FakeClient)
    monkeypatch.setattr(notify.settings, "app_url", "https://app.example.com/")
    monkeypatch.setattr(notify.settings, "agent_internal_secret", "secret-123")
    return _FakeClient


@pytest.mark.asyncio
async def test_posts_internal_notify_with_bearer_and_payload(fake_http):
    ok = await notify.notify_space("space-1", "Chippi finished a background task", "Goal — completed")

    assert ok is True
    assert len(fake_http.calls) == 1
    call = fake_http.calls[0]
    # Trailing slash on app_url is normalized away.
    assert call["url"] == "https://app.example.com/api/internal/notify"
    assert call["headers"] == {"Authorization": "Bearer secret-123"}
    assert call["json"] == {
        "spaceId": "space-1",
        "title": "Chippi finished a background task",
        "body": "Goal — completed",
    }


@pytest.mark.asyncio
async def test_includes_url_when_given_and_caps_lengths(fake_http):
    ok = await notify.notify_space("space-1", "T" * 999, "B" * 9999, url="/tasks")

    assert ok is True
    payload = fake_http.calls[0]["json"]
    assert payload["url"] == "/tasks"
    assert len(payload["title"]) == notify.MAX_TITLE
    assert len(payload["body"]) == notify.MAX_BODY


@pytest.mark.asyncio
async def test_unconfigured_settings_skip_without_raising(fake_http, monkeypatch):
    monkeypatch.setattr(notify.settings, "agent_internal_secret", "")
    assert await notify.notify_space("space-1", "t", "b") is False
    assert fake_http.calls == []

    monkeypatch.setattr(notify.settings, "agent_internal_secret", "secret-123")
    monkeypatch.setattr(notify.settings, "app_url", "")
    assert await notify.notify_space("space-1", "t", "b") is False
    assert fake_http.calls == []


@pytest.mark.asyncio
async def test_non_2xx_returns_false_without_raising(fake_http):
    fake_http.response = _FakeResponse(401)
    assert await notify.notify_space("space-1", "t", "b") is False


@pytest.mark.asyncio
async def test_transport_error_is_swallowed(fake_http):
    fake_http.raise_exc = RuntimeError("connection reset")
    # The best-effort contract: never raises, reports False.
    assert await notify.notify_space("space-1", "t", "b") is False
