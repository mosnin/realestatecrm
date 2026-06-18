"""Unit tests for the per-space swarm concurrency lock (security.budget).

This lock is what stops a double-submit to /api/swarm from billing the same
swarm twice — the planner, every member, and the auditor each record a
ChatUsage row, so an un-deduped second dispatch re-bills the whole swarm. The
tests pin the SET-NX semantics directly, the owner-only release, namespace
isolation from the autonomous run lock, and fail-open when Redis is absent.
"""

from __future__ import annotations

import pytest

import security.budget as budget


class _FakeRedis:
    """Minimal in-memory stand-in for the Upstash async client — just the
    SET NX EX / GET / DELETE surface the lock helpers touch."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.store:
            return None  # NX: key already held → no-op (upstash returns null)
        self.store[key] = value
        return True

    async def get(self, key):
        return self.store.get(key)

    async def delete(self, key):
        self.store.pop(key, None)


@pytest.fixture
def fake_redis(monkeypatch):
    r = _FakeRedis()
    monkeypatch.setattr(budget, "_get_redis", lambda: r)
    return r


@pytest.mark.asyncio
async def test_swarm_lock_blocks_concurrent_run(fake_redis):
    # First swarm for the space claims the slot.
    assert await budget.acquire_swarm_lock("space-1", "swarm-A") is True
    # A concurrent second swarm (the double-submit) cannot — so it never bills.
    assert await budget.acquire_swarm_lock("space-1", "swarm-B") is False
    # Once the first releases, the slot frees up for a genuinely later run.
    await budget.release_swarm_lock("space-1", "swarm-A")
    assert await budget.acquire_swarm_lock("space-1", "swarm-C") is True


@pytest.mark.asyncio
async def test_release_only_by_owner(fake_redis):
    assert await budget.acquire_swarm_lock("space-1", "swarm-A") is True
    # A non-owner release must not free someone else's lock.
    await budget.release_swarm_lock("space-1", "swarm-B")
    assert await budget.acquire_swarm_lock("space-1", "swarm-B") is False
    # The real owner can release it.
    await budget.release_swarm_lock("space-1", "swarm-A")
    assert await budget.acquire_swarm_lock("space-1", "swarm-B") is True


@pytest.mark.asyncio
async def test_swarm_and_run_locks_are_independent(fake_redis):
    # The autonomous run lock and the swarm lock live in separate namespaces, so
    # a background autonomous run never blocks a user-initiated swarm (or vice
    # versa) — both can hold their slot for the same space at once.
    assert await budget.acquire_run_lock("space-1", "run-A") is True
    assert await budget.acquire_swarm_lock("space-1", "swarm-A") is True


@pytest.mark.asyncio
async def test_swarm_lock_fails_open_without_redis(monkeypatch):
    # No Redis configured (dev / test) → never block runs.
    monkeypatch.setattr(budget, "_get_redis", lambda: None)
    assert await budget.acquire_swarm_lock("space-1", "swarm-A") is True
    assert await budget.acquire_swarm_lock("space-1", "swarm-B") is True
