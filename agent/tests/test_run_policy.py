"""Focused contracts for the Python → internal-action capability bridge."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from types import SimpleNamespace

from security.context import AgentContext
from security.run_policy import (
    RUN_POLICY_HEADER,
    action_headers,
    integration_action_capability,
    is_unattended_write,
)

_SECRET = "test-run-policy-secret-with-at-least-32-bytes"
_RUN_ID = "fd73b2c4-afbd-4822-bb81-e01e04c5bcce"


def _claims(token: str) -> dict:
    payload, signature = token.split(".")
    expected = hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).digest()
    assert hmac.compare_digest(
        base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4)), expected
    )
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def test_action_headers_emits_one_exact_capability_and_policy_authority_id(monkeypatch):
    monkeypatch.setenv("AGENT_RUN_POLICY_SECRET", _SECRET)
    context = SimpleNamespace(
        # Existing stream keys may be legacy/non-UUID conversation ids.
        run_id="chat-conversation-legacy-key",
        run_policy_run_id=_RUN_ID,
        space_id="space-1",
        user_id="user-1",
        run_mode="interactive",
    )

    headers = action_headers(context, "integration:read")

    claims = _claims(headers[RUN_POLICY_HEADER])
    assert claims["runId"] == _RUN_ID
    assert claims["spaceId"] == "space-1"
    assert claims["subject"] == "user-1"
    assert claims["mode"] == "interactive"
    assert claims["capabilities"] == ["integration:read"]


def test_missing_policy_secret_emits_no_header(monkeypatch):
    monkeypatch.delenv("AGENT_RUN_POLICY_SECRET", raising=False)
    context = SimpleNamespace(
        run_id=_RUN_ID,
        run_policy_run_id="",
        space_id="space-1",
        user_id="user-1",
        run_mode="interactive",
    )

    assert action_headers(context, "integration:read") == {}


def test_invalid_authority_id_falls_back_to_a_valid_legacy_run_id(monkeypatch):
    monkeypatch.setenv("AGENT_RUN_POLICY_SECRET", _SECRET)
    context = SimpleNamespace(
        run_id=_RUN_ID,
        run_policy_run_id="not-a-uuid",
        space_id="space-1",
        user_id="user-1",
        run_mode="interactive",
    )

    claims = _claims(action_headers(context, "team_message:send")[RUN_POLICY_HEADER])
    assert claims["runId"] == _RUN_ID
    assert claims["capabilities"] == ["team_message:send"]


def test_autonomous_context_is_explicitly_unattended_and_write_calls_are_denied():
    context = AgentContext(
        space_id="space-1",
        space_name="Workspace",
        daily_token_budget=100,
        run_id=_RUN_ID,
        user_id="user-1",
        run_mode="unattended",
        run_policy_run_id=_RUN_ID,
    )

    assert context.run_mode == "unattended"
    assert is_unattended_write(context.run_mode, "integration:write") is True
    assert is_unattended_write(context.run_mode, "team_message:send") is True
    assert is_unattended_write(context.run_mode, "integration:read") is False


def test_unknown_integration_slug_is_write_by_default():
    assert integration_action_capability("GMAIL_FETCH_EMAILS") == "integration:read"
    assert integration_action_capability("GMAIL_SEND_EMAIL") == "integration:write"
    assert integration_action_capability("NEW_PROVIDER_ACTION") == "integration:write"
