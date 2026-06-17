"""Tests for the agent's delete tools + the renter-lead (leadType) mapping.

Two invariants are defended here:

  1. APPROVAL IS MANDATORY. The autonomous runtime (modal_app.py →
     Runner.run_streamed) does not consume the SDK's interrupt/approval
     channel, so the delete tools enforce a two-step `confirmed` gate instead
     (the same pattern broker offboard_member uses). The FIRST call — without
     confirmed=True — must perform NO delete and return requires_confirmation.
     Only the SECOND call (confirmed=True) issues the DB delete. This makes an
     unprompted, single-call delete impossible.

  2. RENTER LEAD MAPS CORRECTLY. update_contact(lead_type='renter') must write
     Contact.leadType='rental' (the lead CATEGORY column), NOT the pipeline
     stage column — and passing a category into new_pipeline_type must return a
     clear, corrective error rather than the bare stage enum.

Harness mirrors tests/test_broker_tools.py: a fake supabase client patched
onto each tool module, tools invoked through FunctionTool.on_invoke_tool.

Run from `agent/` with:

    NEXT_PUBLIC_SUPABASE_URL=stub SUPABASE_SERVICE_ROLE_KEY=stub \\
      python -m pytest tests/test_delete_tools.py -v
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

from agents.tool_context import ToolContext  # noqa: E402
from agents.usage import Usage  # noqa: E402

from security.context import AgentContext  # noqa: E402
from tools import contacts as contacts_mod  # noqa: E402
from tools import deals as deals_mod  # noqa: E402
from tools import deletion as deletion_mod  # noqa: E402
from tools import properties as properties_mod  # noqa: E402
from tools import tours as tours_mod  # noqa: E402

# ── Fake supabase (trimmed from test_broker_tools.py) ─────────────────────────


class _FakeResult:
    def __init__(self, data: Any = None, count: int | None = None) -> None:
        self.data = data
        self.count = count


class _FakeQuery:
    def __init__(self, table_name: str, owner: _FakeSupabase) -> None:
        self._table_name = table_name
        self._owner = owner
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self._op = "select"
        self._payload: Any = None

    def _record(self, name: str, *args: Any) -> _FakeQuery:
        self.calls.append((name, args))
        return self

    def select(self, *a: Any) -> _FakeQuery:
        self._op = "select"
        return self._record("select", *a)

    def insert(self, payload: Any) -> _FakeQuery:
        self._op = "insert"
        self._payload = payload
        return self._record("insert", payload)

    def update(self, payload: Any) -> _FakeQuery:
        self._op = "update"
        self._payload = payload
        return self._record("update", payload)

    def delete(self) -> _FakeQuery:
        self._op = "delete"
        return self._record("delete")

    def eq(self, *a: Any) -> _FakeQuery:
        return self._record("eq", *a)

    def maybe_single(self) -> _FakeQuery:
        return self._record("maybe_single")

    def order(self, *a: Any, **k: Any) -> _FakeQuery:
        return self._record("order", *a)

    def limit(self, *a: Any) -> _FakeQuery:
        return self._record("limit", *a)

    async def execute(self) -> _FakeResult:
        self._owner.log.append({
            "table": self._table_name,
            "op": self._op,
            "payload": self._payload,
            "chain": list(self.calls),
        })
        return self._owner.next_result(self._table_name, self._op)


class _FakeSupabase:
    def __init__(self) -> None:
        self.log: list[dict[str, Any]] = []
        self._by_key: dict[tuple[str, str], list[_FakeResult]] = {}

    def set_for(self, table: str, op: str, *results: _FakeResult) -> None:
        self._by_key.setdefault((table, op), []).extend(results)

    def next_result(self, table: str, op: str) -> _FakeResult:
        key_results = self._by_key.get((table, op))
        if key_results:
            return key_results.pop(0)
        if op in ("insert", "update", "delete"):
            return _FakeResult(data=None)
        return _FakeResult(data=[])

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(name, self)

    def ops(self) -> list[str]:
        return [entry["op"] for entry in self.log]


# ── Fixtures ──────────────────────────────────────────────────────────────────


_DELETE_TOOLS = {
    "delete_contact": contacts_mod.delete_contact,
    "delete_deal": deals_mod.delete_deal,
    "delete_property": properties_mod.delete_property,
    "delete_tour": tours_mod.delete_tour,
}

_ALL_GATED = list(_DELETE_TOOLS.values())


@pytest.fixture(autouse=True)
def _disable_failure_handlers(monkeypatch: pytest.MonkeyPatch) -> None:
    for tool in [*_ALL_GATED, contacts_mod.update_contact, contacts_mod.create_contact]:
        monkeypatch.setattr(tool, "_failure_error_function", None, raising=False)
        monkeypatch.setattr(tool, "_use_default_failure_error_function", False, raising=False)


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeSupabase:
    fake = _FakeSupabase()

    async def _fake_supabase() -> _FakeSupabase:
        return fake

    # The delete tools call supabase() in their OWN module (for the lookup)
    # and the executor calls it in tools.deletion. Patch both.
    for mod in (contacts_mod, deals_mod, properties_mod, tours_mod, deletion_mod):
        monkeypatch.setattr(mod, "supabase", _fake_supabase)
    return fake


def _ctx() -> AgentContext:
    return AgentContext(
        space_id="s_1",
        space_name="Jane Realty",
        daily_token_budget=10_000,
        run_id="run-test",
        user_id="u_1",
    )


def _contact_row(lead_type: str = "buyer", name: str = "Orlando Miller") -> dict[str, Any]:
    """A minimal Contact select row for update_contact's existence check."""
    return {"id": "c1", "name": name, "type": "QUALIFICATION", "leadType": lead_type}


def _tool_ctx(agent_ctx: AgentContext, tool_name: str, args_json: str) -> ToolContext:
    # ToolContext's constructor has gained/lost fields across openai-agents
    # 0.0.x point releases (older builds lack tool_name/tool_arguments). Pass
    # only the kwargs the installed signature accepts so this test runs on both
    # the CI-pinned SDK and a contributor's local one.
    import inspect

    candidate: dict[str, Any] = {
        "context": agent_ctx,
        "usage": Usage(),
        "tool_name": tool_name,
        "tool_call_id": f"call_{tool_name}",
        "tool_arguments": args_json,
    }
    accepted = set(inspect.signature(ToolContext.__init__).parameters)
    kwargs = {k: v for k, v in candidate.items() if k in accepted}
    return ToolContext(**kwargs)


async def _invoke(tool: Any, agent_ctx: AgentContext, args: dict[str, Any]) -> Any:
    args_json = json.dumps(args)
    out = await tool.on_invoke_tool(_tool_ctx(agent_ctx, tool.name, args_json), args_json)
    # Tools return dicts; the SDK may hand us back the dict directly.
    if isinstance(out, str):
        try:
            return json.loads(out)
        except (json.JSONDecodeError, ValueError):
            return out
    return out


# ── 1. Two-step confirmation: the first call NEVER deletes ────────────────────

_FIRST_CALL_ARGS = {
    "delete_contact": {"contact_id": "c1", "reason": "duplicate"},
    "delete_deal": {"deal_id": "d1", "reason": "duplicate"},
    "delete_property": {"property_id": "p1", "reason": "duplicate"},
    "delete_tour": {"tour_id": "t1", "reason": "duplicate"},
}

_LOOKUP_TABLE = {
    "delete_contact": ("Contact", {"id": "c1", "name": "Orlando Miller"}),
    "delete_deal": ("Deal", {"id": "d1", "title": "123 Main"}),
    "delete_property": ("Property", {"id": "p1", "address": "123 Main"}),
    "delete_tour": ("Tour", {"id": "t1", "guestName": "Sam", "contactId": "c9"}),
}


@pytest.mark.parametrize("tool_name", list(_DELETE_TOOLS))
@pytest.mark.asyncio
async def test_first_call_requires_confirmation_and_does_not_delete(
    tool_name: str, fake_db: _FakeSupabase
) -> None:
    """Without confirmed=True the tool returns requires_confirmation and issues
    NO delete — the row is untouched."""
    tool = _DELETE_TOOLS[tool_name]
    table, row = _LOOKUP_TABLE[tool_name]
    fake_db.set_for(table, "select", _FakeResult(data=row))

    out = await _invoke(tool, _ctx(), _FIRST_CALL_ARGS[tool_name])

    assert out.get("requires_confirmation") is True
    assert out.get("ok") is False
    # The load-bearing assertion: NO delete op was issued on the first call.
    assert "delete" not in fake_db.ops()


@pytest.mark.parametrize("tool_name", list(_DELETE_TOOLS))
@pytest.mark.asyncio
async def test_second_call_with_confirmed_deletes(
    tool_name: str, fake_db: _FakeSupabase
) -> None:
    """With confirmed=True the tool issues exactly one delete and reports ok."""
    tool = _DELETE_TOOLS[tool_name]
    table, row = _LOOKUP_TABLE[tool_name]
    fake_db.set_for(table, "select", _FakeResult(data=row))

    args = {**_FIRST_CALL_ARGS[tool_name], "confirmed": True}
    out = await _invoke(tool, _ctx(), args)

    assert out.get("ok") is True
    assert out.get("action") == "deleted"
    assert fake_db.ops().count("delete") == 1


@pytest.mark.parametrize("tool_name", list(_DELETE_TOOLS))
@pytest.mark.asyncio
async def test_missing_record_returns_error_not_confirmation(
    tool_name: str, fake_db: _FakeSupabase
) -> None:
    """A non-existent / cross-space id errors out before any confirm/delete."""
    tool = _DELETE_TOOLS[tool_name]
    table, _ = _LOOKUP_TABLE[tool_name]
    fake_db.set_for(table, "select", _FakeResult(data=None))

    args = {**_FIRST_CALL_ARGS[tool_name], "confirmed": True}
    out = await _invoke(tool, _ctx(), args)

    assert "error" in out
    assert "delete" not in fake_db.ops()


# ── 2. Renter-lead mapping (TASK 2) ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_contact_renter_sets_leadtype_rental(fake_db: _FakeSupabase) -> None:
    """'renter' → Contact.leadType='rental' via the update payload, NOT the
    pipeline stage column."""
    fake_db.set_for("Contact", "select", _FakeResult(data=_contact_row("buyer")))

    out = await _invoke(
        contacts_mod.update_contact,
        _ctx(),
        {"contact_id": "c1", "reason": "wants to rent", "lead_type": "renter"},
    )

    assert out.get("ok") is True
    update_payloads = [e["payload"] for e in fake_db.log if e["op"] == "update"]
    assert update_payloads, "expected an UPDATE on Contact"
    assert update_payloads[0].get("leadType") == "rental"
    # It must NOT have touched the pipeline stage column.
    assert "type" not in update_payloads[0]


@pytest.mark.parametrize(
    ("spoken", "expected"),
    [("renter", "rental"), ("rental", "rental"), ("buyer", "buyer"), ("seller", "seller")],
)
@pytest.mark.asyncio
async def test_update_contact_lead_type_aliases(
    spoken: str, expected: str, fake_db: _FakeSupabase
) -> None:
    # Seed a CURRENT leadType different from the expected one so the update
    # actually fires (the tool skips a no-op same-value change).
    current = "seller" if expected != "seller" else "buyer"
    fake_db.set_for("Contact", "select", _FakeResult(data=_contact_row(current)))
    out = await _invoke(
        contacts_mod.update_contact,
        _ctx(),
        {"contact_id": "c1", "reason": "categorize", "lead_type": spoken},
    )
    assert out.get("ok") is True
    update_payloads = [e["payload"] for e in fake_db.log if e["op"] == "update"]
    assert update_payloads[0].get("leadType") == expected


@pytest.mark.asyncio
async def test_pipeline_field_with_category_gives_corrective_error(fake_db: _FakeSupabase) -> None:
    """The original bug: pipeline_type='rental' must now return a clear, helpful
    error pointing at lead_type — not the bare stage enum."""
    fake_db.set_for("Contact", "select", _FakeResult(data=_contact_row("buyer")))

    out = await _invoke(
        contacts_mod.update_contact,
        _ctx(),
        {"contact_id": "c1", "reason": "renter", "new_pipeline_type": "rental"},
    )

    assert "error" in out
    msg = out["error"].lower()
    assert "lead_type" in msg
    assert "rental" in msg
    # And no update was written for the bad value.
    assert "update" not in fake_db.ops()


@pytest.mark.asyncio
async def test_invalid_lead_type_is_rejected_clearly(fake_db: _FakeSupabase) -> None:
    fake_db.set_for("Contact", "select", _FakeResult(data=_contact_row("buyer")))
    out = await _invoke(
        contacts_mod.update_contact,
        _ctx(),
        {"contact_id": "c1", "reason": "categorize", "lead_type": "investor"},
    )
    assert "error" in out
    assert "lead_type" in out["error"].lower()


# ── 3. Tags tolerance (TASK 3) ────────────────────────────────────────────────
# The model intermittently passes `tags`/`add_tags` as a STRING — most often a
# JSON-encoded list ('["hot","pre-approved"]'), sometimes a single tag or a
# comma run. Without coercion that surfaced as "tags needs an actual list
# format", which the model retried until the turn's step budget was spent.


def test_normalize_tags_json_array_string() -> None:
    assert contacts_mod._normalize_tags('["hot","pre-approved"]') == ["hot", "pre-approved"]


def test_normalize_tags_single_string() -> None:
    assert contacts_mod._normalize_tags("hot") == ["hot"]


def test_normalize_tags_comma_run() -> None:
    assert contacts_mod._normalize_tags("hot, pre-approved") == ["hot", "pre-approved"]


def test_normalize_tags_real_list_unchanged() -> None:
    assert contacts_mod._normalize_tags(["hot", "warm"]) == ["hot", "warm"]


def test_normalize_tags_empty_and_none() -> None:
    assert contacts_mod._normalize_tags(None) == []
    assert contacts_mod._normalize_tags("") == []
    assert contacts_mod._normalize_tags("[]") == []


@pytest.mark.asyncio
async def test_create_contact_accepts_json_string_tags(fake_db: _FakeSupabase) -> None:
    """create_contact stores a list even when tags arrive as a JSON string."""
    out = await _invoke(
        contacts_mod.create_contact,
        _ctx(),
        {"name": "Dana Lee", "tags": '["hot","pre-approved"]'},
    )
    assert out.get("ok") is True
    insert_payloads = [
        e["payload"] for e in fake_db.log if e["op"] == "insert" and e["table"] == "Contact"
    ]
    assert insert_payloads, "expected an INSERT on Contact"
    assert insert_payloads[0]["tags"] == ["hot", "pre-approved"]


@pytest.mark.asyncio
async def test_create_contact_accepts_single_string_tag(fake_db: _FakeSupabase) -> None:
    out = await _invoke(
        contacts_mod.create_contact,
        _ctx(),
        {"name": "Sam Rivers", "tags": "new-lead"},
    )
    assert out.get("ok") is True
    insert_payloads = [
        e["payload"] for e in fake_db.log if e["op"] == "insert" and e["table"] == "Contact"
    ]
    assert insert_payloads[0]["tags"] == ["new-lead"]


@pytest.mark.asyncio
async def test_update_contact_accepts_json_string_add_tags(fake_db: _FakeSupabase) -> None:
    """update_contact merges tags even when add_tags arrives as a JSON string
    (and does not slice a bare string char-by-char)."""
    fake_db.set_for(
        "Contact",
        "select",
        _FakeResult(data={**_contact_row("buyer"), "tags": ["existing"]}),
    )
    out = await _invoke(
        contacts_mod.update_contact,
        _ctx(),
        {"contact_id": "c1", "reason": "qualified", "add_tags": '["hot","pre-approved"]'},
    )
    assert out.get("ok") is True
    update_payloads = [e["payload"] for e in fake_db.log if e["op"] == "update"]
    assert update_payloads, "expected an UPDATE on Contact"
    assert update_payloads[0]["tags"] == ["existing", "hot", "pre-approved"]
