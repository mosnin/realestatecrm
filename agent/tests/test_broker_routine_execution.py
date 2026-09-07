from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from broker_run_scope import resolve_broker_run_owner
import orchestrator


@pytest.mark.asyncio
async def test_broker_authority_comes_from_database():
    records = iter([{'ownerId': 'owner'}, {'id': 'space'}, {'clerkId': 'clerk-owner'}])
    chain = Mock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute = AsyncMock(side_effect=lambda: SimpleNamespace(data=next(records)))
    db = Mock()
    db.table.return_value = chain
    assert await resolve_broker_run_owner(db, 'brokerage', 'space') == 'clerk-owner'
    assert any(call.args == ('ownerId', 'owner') for call in chain.eq.call_args_list)


@pytest.mark.asyncio
async def test_foreign_workspace_cannot_become_broker_context():
    records = iter([{'ownerId': 'owner'}, None])
    chain = Mock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.maybe_single.return_value = chain
    chain.execute = AsyncMock(side_effect=lambda: SimpleNamespace(data=next(records)))
    db = Mock()
    db.table.return_value = chain
    assert await resolve_broker_run_owner(db, 'brokerage', 'foreign') is None
    assert db.table.call_count == 2


@pytest.mark.asyncio
async def test_paused_and_busy_runs_return_rejections(monkeypatch):
    space = SimpleNamespace(id='s', slug='s')
    settings = SimpleNamespace(enabled=False)
    assert (await orchestrator.run_agent_for_space(space, settings))['ok'] is False
    settings.enabled = True
    monkeypatch.setattr(orchestrator, 'acquire_run_lock', AsyncMock(return_value=False))
    assert 'progress' in (await orchestrator.run_agent_for_space(space, settings))['error']


@pytest.mark.asyncio
async def test_broker_scope_and_receipt_survive_run_lock(monkeypatch):
    space = SimpleNamespace(id='s', slug='s')
    settings = SimpleNamespace(enabled=True)
    receipt = {'ok': True, 'run_id': 'run'}
    locked = AsyncMock(return_value=receipt)
    release = AsyncMock()
    monkeypatch.setattr(orchestrator, 'acquire_run_lock', AsyncMock(return_value=True))
    monkeypatch.setattr(orchestrator, '_run_locked', locked)
    monkeypatch.setattr(orchestrator, 'release_run_lock', release)
    assert await orchestrator.run_agent_for_space(space, settings, brokerage_id='b') == receipt
    assert locked.call_args.args[-1] == 'b'
    release.assert_awaited_once()


def test_unattended_catalog_cannot_self_confirm_team_mutations():
    from chippi_broker import make_broker_agent
    agent = make_broker_agent(unattended=True)
    names = {tool.name for tool in agent.tools}
    assert 'team_health' in names
    assert 'flag_deal_for_broker_review' in names
    assert not names.intersection({'reassign_lead', 'send_team_announcement', 'change_member_role', 'offboard_member', 'set_routing_rule'})
    assert not agent.input_guardrails  # A personal draft backlog does not block team review.
