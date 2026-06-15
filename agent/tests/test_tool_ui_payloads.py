"""Tests for the rich-card tool payloads on the Modal (Python) path.

The live realtor chat runs through Modal. For a tool result to render as a rich
card in the browser, the Python tool MUST return a dict carrying a string
`display` hint plus the structured rows at the top level — that dict is what
modal_app.translate() lifts onto the streamed `tool_call_result` SSE frame via
`extract_display_payload`, and the client renderer dispatches on `block.display`
and reads `block.result.data`.

This is the gap the previous tool-ui attempt missed: the renderer was wired but
the Python tools emitted bare lists with no `display`, so the live path always
fell back to a prose dump. These tests pin the contract end-to-end at the
Python boundary:

  1. find_contacts → {"display": "contacts", "contacts": [...]}, and
     extract_display_payload lifts it (the modal_app forwarding step).
  2. find_deals    → {"display": "deals", "deals": [...]} (+ resolved stageName).
  3. add_property  → {"display": "properties", "properties": [...]}.
  4. Row fields are PRIMITIVES the TS mappers consume (no nested objects).

Harness mirrors tests/test_delete_tools.py: a fake supabase client patched onto
each tool module, tools invoked through FunctionTool.on_invoke_tool. The fake
query tolerates arbitrary chained filter methods (ilike/in_/not_/or_/gte/lte)
so find_contacts / find_deals run unchanged.

Run from `agent/` with:

    NEXT_PUBLIC_SUPABASE_URL=stub SUPABASE_SERVICE_ROLE_KEY=stub \\
      python -m pytest tests/test_tool_ui_payloads.py -v
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
from tools import properties as properties_mod  # noqa: E402
from tools.base import extract_display_payload  # noqa: E402

# ── Fake supabase that tolerates arbitrary chained filters ────────────────────


class _FakeResult:
    def __init__(self, data: Any = None) -> None:
        self.data = data


class _FakeQuery:
    """A query whose filter methods all return self; results are seeded per
    (table, op). Unknown methods (ilike, in_, not_, is_, or_, gte, lte, …) are
    swallowed via __getattr__ so the tools' real query chains run untouched."""

    def __init__(self, table_name: str, owner: _FakeSupabase) -> None:
        self._table_name = table_name
        self._owner = owner
        self._op = "select"
        self._payload: Any = None

    def select(self, *a: Any, **k: Any) -> _FakeQuery:
        self._op = "select"
        return self

    def insert(self, payload: Any) -> _FakeQuery:
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: Any) -> _FakeQuery:
        self._op = "update"
        self._payload = payload
        return self

    def delete(self) -> _FakeQuery:
        self._op = "delete"
        return self

    # Any other chained method (eq/ilike/in_/not_/is_/or_/gte/lte/order/limit/
    # maybe_single/…) is a no-op that returns self. `not_` exposes itself again
    # so `query.not_.is_(...)` works.
    def __getattr__(self, name: str) -> Any:
        if name == "not_":
            return self

        def _noop(*_a: Any, **_k: Any) -> _FakeQuery:
            return self

        return _noop

    async def execute(self) -> _FakeResult:
        self._owner.log.append(
            {"table": self._table_name, "op": self._op, "payload": self._payload}
        )
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
            # Repeat the last seeded result for repeated calls to the same key.
            return key_results.pop(0) if len(key_results) > 1 else key_results[0]
        if op in ("insert", "update", "delete"):
            return _FakeResult(data=[{"ok": True}])
        return _FakeResult(data=[])

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(name, self)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeSupabase:
    fake = _FakeSupabase()

    async def _fake_supabase() -> _FakeSupabase:
        return fake

    for mod in (contacts_mod, deals_mod, properties_mod):
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


def _tool_ctx(agent_ctx: AgentContext, tool_name: str, args_json: str) -> ToolContext:
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
    if isinstance(out, str):
        try:
            return json.loads(out)
        except (json.JSONDecodeError, ValueError):
            return out
    return out


def _is_primitive(v: Any) -> bool:
    return v is None or isinstance(v, (str, int, float, bool))


# ── 1. CONTACTS — the link that MUST be provably wired ────────────────────────


@pytest.mark.asyncio
async def test_find_contacts_returns_display_and_data(fake_db: _FakeSupabase) -> None:
    """find_contacts must return display:"contacts" + a contacts array with the
    exact row fields buildContactsTable consumes."""
    rows = [
        {
            "id": "c1",
            "name": "Orlando Miller",
            "email": "orlando@example.com",
            "phone": "555-0100",
            "leadType": "buyer",
            "leadScore": 82,
            "scoreLabel": "hot",
            "followUpAt": None,
            "lastContactedAt": "2026-06-10T12:00:00Z",
            "type": "QUALIFICATION",
            "tags": ["new-lead"],
            "createdAt": "2026-06-01T12:00:00Z",
        }
    ]
    fake_db.set_for("Contact", "select", _FakeResult(data=rows))

    out = await _invoke(contacts_mod.find_contacts, _ctx(), {"limit": 20})

    assert isinstance(out, dict)
    assert out["display"] == "contacts"
    assert isinstance(out["contacts"], list)
    assert out["count"] == 1
    row = out["contacts"][0]
    # Exact field names the DataTable mapper (ContactRowInput) reads.
    for field in ("id", "name", "email", "phone", "leadType", "scoreLabel", "lastContactedAt"):
        assert field in row, f"contacts row missing {field}"
    assert row["name"] == "Orlando Miller"
    assert row["scoreLabel"] == "hot"
    # Row values must be primitives only (DataTable rejects nested objects).
    for k, v in row.items():
        assert _is_primitive(v), f"contacts row field {k} is not a primitive: {v!r}"


@pytest.mark.asyncio
async def test_find_contacts_modal_forwarding_lifts_display(fake_db: _FakeSupabase) -> None:
    """The modal_app forwarding step: extract_display_payload (used by
    modal_app.translate to populate the SSE frame's display+data) must lift the
    contacts payload. This is the hop that was missing in production."""
    rows = [{"id": "c1", "name": "Dana Lee", "email": None, "phone": None,
             "leadType": "rental", "leadScore": None, "scoreLabel": None,
             "followUpAt": None, "lastContactedAt": None}]
    fake_db.set_for("Contact", "select", _FakeResult(data=rows))

    out = await _invoke(contacts_mod.find_contacts, _ctx(), {"lead_type": "rental"})

    display, data = extract_display_payload(out)
    assert display == "contacts"
    assert data is not None and data["contacts"][0]["name"] == "Dana Lee"
    # And it survives the SDK's JSON-string serialization of tool output.
    display2, data2 = extract_display_payload(json.dumps(out))
    assert display2 == "contacts"
    assert data2["count"] == 1


@pytest.mark.asyncio
async def test_find_contacts_empty_still_carries_display(fake_db: _FakeSupabase) -> None:
    """An empty result still returns display:"contacts" with an empty array —
    never a bare list, so the path is always renderable / never a prose dump."""
    fake_db.set_for("Contact", "select", _FakeResult(data=[]))
    out = await _invoke(contacts_mod.find_contacts, _ctx(), {"limit": 5})
    assert out["display"] == "contacts"
    assert out["contacts"] == []
    assert out["count"] == 0


# ── 2. DEALS ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_find_deals_returns_display_and_data_with_stage_name(
    fake_db: _FakeSupabase,
) -> None:
    """find_deals must return display:"deals" + a deals array, with stageId
    resolved to stageName (the DataTable shows the stage as a badge)."""
    deal_rows = [
        {
            "id": "d1",
            "title": "123 Main St",
            "value": 650000,
            "status": "active",
            "priority": "HIGH",
            "closeDate": "2026-07-01",
            "stageId": "stage_1",
            "probability": 60,
            "createdAt": "2026-06-01T12:00:00Z",
            "updatedAt": "2026-06-10T12:00:00Z",
        }
    ]
    fake_db.set_for("Deal", "select", _FakeResult(data=deal_rows))
    fake_db.set_for(
        "DealStage", "select", _FakeResult(data=[{"id": "stage_1", "name": "Offer"}])
    )
    # DealContact link → Contact name.
    fake_db.set_for(
        "DealContact", "select", _FakeResult(data=[{"dealId": "d1", "contactId": "c9"}])
    )
    fake_db.set_for(
        "Contact", "select", _FakeResult(data=[{"id": "c9", "name": "Sam Park"}])
    )

    out = await _invoke(deals_mod.find_deals, _ctx(), {"status": "active"})

    assert out["display"] == "deals"
    assert isinstance(out["deals"], list)
    row = out["deals"][0]
    for field in ("id", "title", "stageName", "status", "value", "contactName", "closeDate"):
        assert field in row, f"deals row missing {field}"
    assert row["stageName"] == "Offer"
    assert row["contactName"] == "Sam Park"
    for k, v in row.items():
        assert _is_primitive(v), f"deals row field {k} is not a primitive: {v!r}"

    # Modal forwarding lifts it.
    display, data = extract_display_payload(out)
    assert display == "deals"
    assert data["deals"][0]["title"] == "123 Main St"


# ── 3. PROPERTIES ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_property_returns_display_and_data(fake_db: _FakeSupabase) -> None:
    """add_property must return display:"properties" + a properties array with
    the address/listPrice/beds/baths the carousel mapper consumes."""
    # Property insert returns a row → tool reports success.
    fake_db.set_for("Property", "insert", _FakeResult(data=[{"id": "p1"}]))

    out = await _invoke(
        properties_mod.add_property,
        _ctx(),
        {"address": "14 Oak St", "list_price": 825000, "beds": 3, "baths": 2},
    )

    assert out["display"] == "properties"
    assert isinstance(out["properties"], list)
    row = out["properties"][0]
    assert row["address"] == "14 Oak St"
    assert row["listPrice"] == 825000
    assert row["beds"] == 3
    assert row["baths"] == 2
    for k, v in row.items():
        assert _is_primitive(v), f"properties row field {k} is not a primitive: {v!r}"

    display, data = extract_display_payload(out)
    assert display == "properties"
    assert data["properties"][0]["address"] == "14 Oak St"
