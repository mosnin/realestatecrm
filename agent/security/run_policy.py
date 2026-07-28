"""Short-lived, signed capability grants for Modal-originated internal calls.

The Next.js internal action routes verify the same compact HMAC format in
``lib/agent/run-policy.ts``.  Python deliberately mints a fresh, narrow grant
at the point of an action instead of carrying a process-wide "agent can act"
token.  The shared internal bearer still authenticates Modal; this token binds
an individual call to a run, workspace, subject, mode, and capability.

This module never reads or logs a secret value.  A missing/misconfigured
``AGENT_RUN_POLICY_SECRET`` returns no grant so shadow rollout compatibility is
preserved; callers that are unattended must still deny local write attempts.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from collections.abc import Iterable
from typing import Any

RUN_POLICY_HEADER = "x-chippy-run-policy"
RUN_POLICY_AUDIENCE = "chippy-internal-actions"
_MAX_TTL_SECONDS = 900
_DEFAULT_TTL_SECONDS = 300
_VALID_MODES = frozenset({"interactive", "unattended", "voice_control", "sandbox"})
_VALID_CAPABILITIES = frozenset({
    "integration:read",
    "integration:write",
    "team_message:send",
    "task:create_child",
    "task:manage",
    "proposal:decide",
    "sandbox:execute",
})

# Keep this explicit allowlist aligned with
# lib/integrations/action-policy.ts. Unknown provider actions are writes.
_INTEGRATION_READ_ACTIONS = frozenset({
    "GMAIL_FETCH_EMAILS",
    "GMAIL_LIST_THREADS",
    "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
    "OUTLOOK_LIST_MESSAGES",
    "OUTLOOK_GET_MESSAGE",
    "GOOGLECALENDAR_EVENTS_LIST",
    "GOOGLECALENDAR_FIND_FREE_SLOTS",
    "SLACK_LIST_ALL_CHANNELS",
    "SLACK_FETCH_CONVERSATION_HISTORY",
    "SLACK_LIST_ALL_USERS",
    "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION",
    "HUBSPOT_LIST_CONTACTS",
    "HUBSPOT_LIST_DEALS",
    "HUBSPOT_LIST_EMAILS",
    "LINKEDIN_GET_MY_INFO",
    "LINKEDIN_GET_COMPANY_INFO",
    "INSTAGRAM_GET_USER_INFO",
    "INSTAGRAM_LIST_ALL_CONVERSATIONS",
    "FACEBOOK_GET_PAGE_CONVERSATIONS",
    "TWITTER_USER_LOOKUP_ME",
    "NOTION_SEARCH_NOTION_PAGE",
    "NOTION_QUERY_DATABASE",
    "GOOGLESHEETS_VALUES_GET",
    "GOOGLESHEETS_GET_SPREADSHEET_INFO",
    "GOOGLESHEETS_BATCH_GET",
})


def integration_action_capability(slug: str) -> str:
    """Return the one capability required by a reviewed integration action."""
    return "integration:read" if slug in _INTEGRATION_READ_ACTIONS else "integration:write"


def is_unattended_write(mode: str, capability: str) -> bool:
    """Unattended execution proposes writes; it never calls them directly."""
    return mode == "unattended" and capability in {"integration:write", "team_message:send"}


def issue_run_policy(
    *,
    run_id: str,
    space_id: str,
    subject: str,
    mode: str,
    capabilities: Iterable[str],
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
) -> str | None:
    """Issue a TS-compatible signed grant, or ``None`` when safely unavailable.

    ``None`` intentionally does not raise: AGENT_RUN_POLICY_MODE remains shadow
    during caller migration.  It is not a reason for an unattended caller to
    perform a write; those callers are denied before making an HTTP request.
    """
    secret = os.environ.get("AGENT_RUN_POLICY_SECRET", "")
    normalized_capabilities = list(dict.fromkeys(capabilities))
    if (
        len(secret) < 32
        or not space_id
        or not subject
        or mode not in _VALID_MODES
        or not normalized_capabilities
        or len(normalized_capabilities) > 16
        or any(capability not in _VALID_CAPABILITIES for capability in normalized_capabilities)
    ):
        return None
    try:
        uuid.UUID(run_id)
    except (ValueError, TypeError, AttributeError):
        return None

    now = int(time.time())
    ttl = max(30, min(int(ttl_seconds), _MAX_TTL_SECONDS))
    claims: dict[str, Any] = {
        "v": 1,
        "iss": "chippy",
        "aud": RUN_POLICY_AUDIENCE,
        "runId": run_id,
        "spaceId": space_id,
        "subject": subject,
        "mode": mode,
        "capabilities": normalized_capabilities,
        "depth": 0,
        "iat": now,
        "exp": now + ttl,
        "nonce": secrets.token_urlsafe(24),
    }
    payload = _b64url(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    return f"{payload}.{_b64url(signature)}"


def action_headers(context: Any, capability: str) -> dict[str, str]:
    """Bearer-like header map for the exact capability needed by one call.

    ``AgentContext`` is intentionally duck-typed to keep the signing seam
    independent from the legacy Agents SDK.  The only state consumed is the
    run/space/user identity the runtime injected, never tool-model arguments.
    """
    policy_run_id = str(getattr(context, "run_policy_run_id", ""))
    legacy_run_id = str(getattr(context, "run_id", ""))
    run_id = policy_run_id if _is_uuid(policy_run_id) else legacy_run_id
    token = issue_run_policy(
        run_id=run_id,
        space_id=str(getattr(context, "space_id", "")),
        subject=str(getattr(context, "user_id", "")),
        mode=str(getattr(context, "run_mode", "interactive")),
        capabilities=(capability,),
    )
    return {RUN_POLICY_HEADER: token} if token else {}


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        return False
    return True
