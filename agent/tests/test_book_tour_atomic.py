"""Modal book_tour must go through book_tour_atomic — never a raw Tour insert.

The TS schedule_tour / public book paths already use the RPC. A raw insert
here was the leftover double-book hole: two agents (or agent + guest) could
land overlapping tours in the same room.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import pytest

os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "stub")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "stub")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from security.context import AgentContext  # noqa: E402
from tests._helpers import disable_tool_error_wrapper, make_tool_context  # noqa: E402
from tools import tours as tours_mod  # noqa: E402


class _FakeResult:
    def __init__(self, data: Any = None) -> None:
        self.data = data


class _FakeRpc:
    def __init__(self, owner: "_FakeDb", function: str, params: dict[str, Any]) -> None:
        self._owner = owner
        self.function = function
        self.params = params

    async def execute(self) -> _FakeResult:
        self._owner.rpc_calls.append({"function": self.function, "params": self.params})
        return self._owner.rpc_result


class _FakeQuery:
    def __init__(self, table: str, owner: "_FakeDb") -> None:
        self._table = table
        self._owner = owner
        self._op = "select"

    def select(self, *a: Any) -> "_FakeQuery":
        self._op = "select"
        return self

    def insert(self, payload: Any) -> "_FakeQuery":
        self._op = "insert"
        self._owner.inserts.append({"table": self._table, "payload": payload})
        return self

    def eq(self, *a: Any) -> "_FakeQuery":
        return self

    def maybe_single(self) -> "_FakeQuery":
        return self

    async def execute(self) -> _FakeResult:
        if self._table == "Contact" and self._op == "select":
            return _FakeResult(
                data={"id": "c1", "name": "Sam", "email": "sam@example.com", "phone": None}
            )
        return _FakeResult(data=None)


class _FakeDb:
    def __init__(self) -> None:
        self.rpc_calls: list[dict[str, Any]] = []
        self.inserts: list[dict[str, Any]] = []
        self.rpc_result = _FakeResult(data=[{"book_tour_atomic": "tour-id"}])

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(name, self)

    def rpc(self, function: str, params: dict[str, Any] | None = None) -> _FakeRpc:
        return _FakeRpc(self, function, params or {})


@pytest.fixture(autouse=True)
def _disable_failure() -> Any:
    undo = disable_tool_error_wrapper(tours_mod.book_tour)
    yield
    undo()


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeDb:
    fake = _FakeDb()

    async def _supabase() -> _FakeDb:
        return fake

    monkeypatch.setattr(tours_mod, "supabase", _supabase)

    async def _noop_write(*_a: Any, **_k: Any) -> None:
        return None

    monkeypatch.setattr(tours_mod, "_write_tour_through_to_external_calendar", _noop_write)

    async def _noop_event(*_a: Any, **_k: Any) -> None:
        return None

    monkeypatch.setattr(tours_mod, "publish_event", _noop_event)
    monkeypatch.setattr(tours_mod, "persist_log", _noop_event)
    return fake


def _ctx() -> AgentContext:
    return AgentContext(
        space_id="s_1",
        space_name="Jane Realty",
        daily_token_budget=10_000,
        run_id="run-test",
        user_id="u_1",
    )


async def _invoke(args: dict[str, Any]) -> Any:
    args_json = json.dumps(args)
    out = await tours_mod.book_tour.on_invoke_tool(
        make_tool_context(_ctx(), "book_tour", args_json),
        args_json,
    )
    if isinstance(out, str):
        try:
            return json.loads(out)
        except (json.JSONDecodeError, ValueError):
            return out
    return out


@pytest.mark.asyncio
async def test_book_tour_uses_atomic_rpc_not_raw_insert(fake_db: _FakeDb) -> None:
    out = await _invoke(
        {
            "contact_id": "c1",
            "starts_at": "2026-12-01T18:00:00Z",
            "duration_minutes": 30,
        }
    )
    assert out.get("ok") is True
    assert fake_db.rpc_calls, "book_tour must call book_tour_atomic"
    assert fake_db.rpc_calls[0]["function"] == "book_tour_atomic"
    assert fake_db.rpc_calls[0]["params"]["p_space_id"] == "s_1"
    assert fake_db.rpc_calls[0]["params"]["p_contact_id"] == "c1"
    assert not any(row["table"] == "Tour" for row in fake_db.inserts)


@pytest.mark.asyncio
async def test_book_tour_conflict_does_not_write_calendar(fake_db: _FakeDb) -> None:
    fake_db.rpc_result = _FakeResult(data=[{"book_tour_atomic": None}])
    out = await _invoke(
        {
            "contact_id": "c1",
            "starts_at": "2026-12-01T18:00:00Z",
        }
    )
    assert "overlap" in (out.get("error") or "").lower() or "slot" in (out.get("error") or "").lower()
    assert not any(row["table"] == "Tour" for row in fake_db.inserts)
