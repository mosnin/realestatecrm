"""Regression tests for bounded specialist planning and cancellation transitions."""

from __future__ import annotations

import pytest

import swarm_orchestrator as swarm
from swarm_orchestrator import (
    SWARM_MAX_CHILD_DEPTH,
    SWARM_MAX_CONCURRENT_MEMBERS,
    SWARM_MAX_MEMBERS,
    SWARM_MIN_MEMBERS,
    _persist_members_then_emit_plan,
    _publish_member_transition_if_parent_active,
    _run_members_bounded,
    _transition_active_run,
    normalize_swarm_plan,
    validate_swarm_runtime,
)


def test_plan_is_clamped_to_six_depth_one_specialists():
    plan = normalize_swarm_plan(
        {
            "tasks": [
                {"name": f"S{i}", "task": f"Task {i}", "wave": 99}
                for i in range(10)
            ]
        },
        "Prepare a listing strategy",
    )

    assert len(plan["tasks"]) == SWARM_MAX_MEMBERS == 6
    assert all(task["wave"] == 1 for task in plan["tasks"])
    assert plan["executionBounds"] == {
        "maxConcurrentMembers": SWARM_MAX_CONCURRENT_MEMBERS,
        "maxChildDepth": SWARM_MAX_CHILD_DEPTH,
    }
    assert SWARM_MAX_CHILD_DEPTH == 1


def test_sparse_or_invalid_plan_still_has_two_bounded_specialists():
    plan = normalize_swarm_plan({"tasks": [{"name": "One"}]}, "Analyze a deal")

    assert len(plan["tasks"]) == SWARM_MIN_MEMBERS == 2
    assert all(task["task"] for task in plan["tasks"])


def test_swarm_runtime_requires_atomic_database_before_start(monkeypatch):
    monkeypatch.setattr(swarm.settings, "database_url", "")

    with pytest.raises(RuntimeError, match="No specialist was started"):
        validate_swarm_runtime()


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, winner: bool):
        self.winner = winner
        self.allowed_statuses = None

    def update(self, _payload):
        return self

    def eq(self, _column, _value):
        return self

    def in_(self, _column, values):
        self.allowed_statuses = tuple(values)
        return self

    async def execute(self):
        return _FakeResult([{"id": "run-1"}] if self.winner else [])


class _FakeDb:
    def __init__(self, winner: bool):
        self.query = _FakeQuery(winner)

    def table(self, _name):
        return self.query


@pytest.mark.asyncio
async def test_cancelled_run_rejects_a_late_terminal_transition():
    db = _FakeDb(winner=False)

    changed = await _transition_active_run(
        db,
        "run-1",
        {"status": "completed", "result": "late result"},
        ("auditing",),
    )

    assert changed is False
    assert db.query.allowed_statuses == ("auditing",)


class _AtomicConnection:
    def __init__(self, parent_status: str, member_status: str):
        self.parent_status = parent_status
        self.member_status = member_status
        self.events = []
        self.sql = ""

    async def fetchrow(self, sql, *args):
        self.sql = sql
        allowed_parent_statuses = args[1]
        next_member_status = args[3]
        allowed_member_statuses = args[4]
        if (
            self.parent_status not in allowed_parent_statuses
            or self.member_status not in allowed_member_statuses
        ):
            return None
        self.member_status = next_member_status
        self.events.append(args[9])
        return {"id": "event-1"}


class _Acquire:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self.connection

    async def __aexit__(self, *_args):
        return None


class _AtomicPool:
    def __init__(self, connection):
        self.connection = connection

    def acquire(self):
        return _Acquire(self.connection)


@pytest.mark.asyncio
async def test_cancellation_winning_parent_lock_blocks_member_and_event(monkeypatch):
    connection = _AtomicConnection(parent_status="cancelled", member_status="queued")

    async def fake_get_pool():
        return _AtomicPool(connection)

    monkeypatch.setattr(swarm, "get_pool", fake_get_pool)
    changed = await _publish_member_transition_if_parent_active(
        "run-1",
        "member-1",
        member_status="running",
        allowed_member_statuses=("queued",),
        event_type="agent_started",
        event_data={"name": "Pricing specialist"},
    )

    assert changed is False
    assert connection.member_status == "queued"
    assert connection.events == []
    assert "FOR UPDATE" in connection.sql
    assert 'INSERT INTO "SwarmEvent"' in connection.sql


class _InsertQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.payload = None

    def insert(self, payload):
        self.payload = payload
        return self

    async def execute(self):
        self.db.calls.append((self.table, self.payload))
        if self.table == "SwarmMember":
            return _FakeResult([{**self.payload, "id": f"member-{len(self.db.calls)}"}])
        return _FakeResult([{"id": "event-1"}])


class _InsertDb:
    def __init__(self):
        self.calls = []

    def table(self, name):
        return _InsertQuery(self, name)


@pytest.mark.asyncio
async def test_complete_member_tree_is_persisted_before_plan_event():
    db = _InsertDb()
    plan = normalize_swarm_plan(
        {
            "tasks": [
                {"name": "Pricing", "task": "Analyze comps"},
                {"name": "Launch", "task": "Plan launch"},
            ]
        },
        "Prepare listing",
    )

    members = await _persist_members_then_emit_plan(db, "run-1", plan, [], "Prepare listing")

    assert len(members) == 2
    assert [table for table, _payload in db.calls] == [
        "SwarmMember",
        "SwarmMember",
        "SwarmEvent",
    ]
    assert db.calls[-1][1]["type"] == "plan_created"
    assert db.calls[-1][1]["data"]["membersReady"] is True


@pytest.mark.asyncio
async def test_escaped_member_exception_fails_the_wave(monkeypatch):
    async def exploding_member(*_args):
        raise RuntimeError("member transition unavailable")

    monkeypatch.setattr(swarm, "run_member", exploding_member)

    with pytest.raises(RuntimeError, match="failed before publishing"):
        await _run_members_bounded(
            None,
            "run-1",
            [{"id": "member-1"}, {"id": "member-2"}],
            "space-1",
        )


@pytest.mark.asyncio
async def test_eager_database_pool_fails_before_sdk_or_planner_work(monkeypatch):
    monkeypatch.setattr(swarm.settings, "database_url", "postgresql://configured")
    configured_sdk = False
    built_client = False

    async def unavailable_pool():
        raise RuntimeError("database pool unavailable")

    def configure_sdk():
        nonlocal configured_sdk
        configured_sdk = True

    def build_client():
        nonlocal built_client
        built_client = True

    monkeypatch.setattr(swarm, "get_supabase", unavailable_pool)
    monkeypatch.setattr(swarm, "configure_agents_sdk", configure_sdk)
    monkeypatch.setattr(swarm, "get_llm_client", build_client)

    with pytest.raises(RuntimeError, match="pool unavailable"):
        await swarm.run_swarm(
            {"swarmRunId": "run-1", "spaceId": "space-1", "goal": "Prepare listing"}
        )

    assert configured_sdk is False
    assert built_client is False
