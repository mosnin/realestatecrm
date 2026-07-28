"""HTTP-level checks for the Python callers of protected internal actions."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest

from config import settings as agent_settings
from integrations import _build_curated_tool
from security.context import AgentContext
from tests._helpers import make_tool_context
from tools import integrations_dispatcher, team, tours

_SECRET = "test-run-policy-secret-with-at-least-32-bytes"
_RUN_ID = "fd73b2c4-afbd-4822-bb81-e01e04c5bcce"


class _Response:
    status_code = 200
    text = '{"ok":true}'

    def json(self) -> dict[str, bool]:
        return {"ok": True}


class _Client:
    calls: list[dict[str, Any]] = []

    def __init__(self, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> _Client:
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def post(
        self,
        url: str,
        json: dict | None = None,
        headers: dict | None = None,
    ) -> _Response:
        self.calls.append({"url": url, "json": json, "headers": headers})
        return _Response()


class _Query:
    def __init__(self, table: str, db: _TourDb) -> None:
        self.table = table
        self.db = db

    def select(self, *_: Any) -> _Query:
        return self

    def eq(self, *_: Any, **__: Any) -> _Query:
        return self

    def in_(self, *_: Any, **__: Any) -> _Query:
        return self

    def order(self, *_: Any, **__: Any) -> _Query:
        return self

    def limit(self, *_: Any, **__: Any) -> _Query:
        return self

    def insert(self, row: dict[str, Any]) -> _Query:
        self.db.inserts.append((self.table, row))
        return self

    async def execute(self) -> Any:
        if self.table == "IntegrationConnection":
            return SimpleNamespace(data=[{"userId": "user-1", "toolkit": "googlecalendar"}])
        return SimpleNamespace(data=[])


class _TourDb:
    def __init__(self) -> None:
        self.inserts: list[tuple[str, dict[str, Any]]] = []

    def table(self, name: str) -> _Query:
        return _Query(name, self)


@pytest.fixture
def internal_http(monkeypatch: pytest.MonkeyPatch) -> type[_Client]:
    _Client.calls = []
    monkeypatch.setenv("AGENT_RUN_POLICY_SECRET", _SECRET)
    for module in (integrations_dispatcher, team):
        monkeypatch.setattr(module.httpx, "AsyncClient", _Client)
        monkeypatch.setattr(module.settings, "app_url", "https://app.example.com")
        monkeypatch.setattr(module.settings, "agent_internal_secret", "internal-secret")
    return _Client


def _context(*, mode: str = "interactive") -> AgentContext:
    return AgentContext(
        space_id="space-1",
        space_name="Workspace",
        daily_token_budget=100,
        run_id=_RUN_ID,
        run_policy_run_id=_RUN_ID,
        user_id="user-1",
        run_mode=mode,
    )


def _grant_claims(header: str) -> dict[str, Any]:
    payload = header.split(".", 1)[0]
    padded = payload + "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(padded))


@pytest.mark.asyncio
async def test_dispatcher_emits_a_read_only_grant_for_a_reviewed_read(internal_http: type[_Client]):
    context = _context()
    args = json.dumps({"slug": "GMAIL_FETCH_EMAILS", "arguments_json": "{}"})
    result = await integrations_dispatcher.call_integration_tool.on_invoke_tool(
        make_tool_context(context, "call_integration_tool", args), args
    )

    assert json.loads(result) == {"ok": True}
    headers = internal_http.calls[0]["headers"]
    assert headers["Authorization"] == "Bearer internal-secret"
    assert headers["x-chippy-run-policy"].count(".") == 1


@pytest.mark.asyncio
async def test_dispatcher_denies_unattended_unknown_write_without_an_http_call(
    internal_http: type[_Client],
):
    context = _context(mode="unattended")
    args = json.dumps({"slug": "GMAIL_SEND_EMAIL", "arguments_json": "{}"})
    result = await integrations_dispatcher.call_integration_tool.on_invoke_tool(
        make_tool_context(context, "call_integration_tool", args), args
    )

    assert json.loads(result)["code"] == "RUN_POLICY_DENIED"
    assert internal_http.calls == []


@pytest.mark.asyncio
async def test_team_message_emits_a_team_only_grant(internal_http: type[_Client]):
    context = _context()
    args = json.dumps({"recipient": "Alex", "message": "Please review the draft."})
    result = await team.message_teammate.on_invoke_tool(
        make_tool_context(context, "message_teammate", args), args
    )

    assert result["sent"] is True
    headers = internal_http.calls[0]["headers"]
    assert headers["Authorization"] == "Bearer internal-secret"
    assert headers["x-chippy-run-policy"].count(".") == 1


@pytest.mark.asyncio
async def test_curated_closure_emits_only_the_reviewed_read_grant(internal_http: type[_Client]):
    context = _context()
    tool = _build_curated_tool(
        slug="GMAIL_FETCH_EMAILS",
        name="gmail_fetch_emails",
        description="Fetch mail",
        parameters={},
        toolkit="gmail",
        space_id="space-1",
        user_id="user-1",
        base_url="https://app.example.com",
        secret="internal-secret",
    )
    args = "{}"
    result = await tool.on_invoke_tool(make_tool_context(context, tool.name, args), args)

    assert json.loads(result) == {"ok": True}
    claims = _grant_claims(internal_http.calls[0]["headers"]["x-chippy-run-policy"])
    assert claims["capabilities"] == ["integration:read"]


@pytest.mark.asyncio
async def test_curated_closure_blocks_unattended_write_before_http(internal_http: type[_Client]):
    context = _context(mode="unattended")
    tool = _build_curated_tool(
        slug="GMAIL_SEND_EMAIL",
        name="gmail_send_email",
        description="Send mail",
        parameters={},
        toolkit="gmail",
        space_id="space-1",
        user_id="user-1",
        base_url="https://app.example.com",
        secret="internal-secret",
    )
    result = await tool.on_invoke_tool(make_tool_context(context, tool.name, "{}"), "{}")

    assert json.loads(result)["code"] == "RUN_POLICY_DENIED"
    assert internal_http.calls == []


@pytest.mark.asyncio
async def test_tour_calendar_mirror_grant_is_write_only_and_unattended_skips_http(
    internal_http: type[_Client], monkeypatch: pytest.MonkeyPatch
):
    db = _TourDb()

    async def fake_supabase() -> _TourDb:
        return db

    monkeypatch.setattr(tours, "supabase", fake_supabase)
    monkeypatch.setattr(tours.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(agent_settings, "app_url", "https://app.example.com")
    monkeypatch.setattr(agent_settings, "agent_internal_secret", "internal-secret")
    starts = datetime.now(UTC) + timedelta(hours=1)
    shared = {
        "space_id": "space-1",
        "tour_id": "tour-1",
        "guest_name": "Guest",
        "guest_email": "guest@example.com",
        "starts": starts,
        "ends": starts + timedelta(minutes=30),
        "property_address": "123 Main St",
        "notes": None,
    }

    await tours._write_tour_through_to_external_calendar(**shared, run_context=_context())
    claims = _grant_claims(internal_http.calls[0]["headers"]["x-chippy-run-policy"])
    assert claims["capabilities"] == ["integration:write"]

    internal_http.calls.clear()
    await tours._write_tour_through_to_external_calendar(
        **shared, run_context=_context(mode="unattended")
    )
    assert internal_http.calls == []
    assert any(table == "CalendarEventMirror" for table, _ in db.inserts)
