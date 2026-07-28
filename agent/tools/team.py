"""Team tools — Chippi talks to the realtor's brokerage for them.

Two verbs from the Focus Update's "Chippi does, never links":

- message_teammate: send a real-time team message (DM) to someone on the
  realtor's brokerage — "tell Sarah the Henderson tour moved to 3pm."
- create_automation: silently build a standing workflow from a sentence —
  "text every new Zillow lead within 5 minutes." The workflow is created
  ENABLED but with autonomy=draft (it stages drafts, never sends), so a
  silently-built automation can never silently message a client.

Both call internal Next.js endpoints (AGENT_INTERNAL_SECRET-authed) so the
write path, permission checks, and rate limits stay identical to the human
UI — exactly the studio.py contract.
"""

from __future__ import annotations

from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from config import settings
from security.context import AgentContext
from security.run_policy import action_headers, is_unattended_write
from tools.base import rate_limited

_TIMEOUT = 30.0


async def _post_internal(
    path: str,
    payload: dict[str, Any],
    run_policy_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    """POST to an internal endpoint; normalize transport + HTTP errors into
    {"error": ...} dicts the agent can read back to the realtor."""
    base_url = (settings.app_url or "").rstrip("/")
    secret = settings.agent_internal_secret
    if not base_url or not secret:
        return {"error": "Team features are not configured."}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            headers = {"Authorization": f"Bearer {secret}"}
            headers.update(run_policy_headers or {})
            resp = await client.post(
                f"{base_url}{path}",
                json=payload,
                headers=headers,
            )
    except Exception as exc:  # noqa: BLE001 — surface to the agent, never throw
        return {"error": f"request failed: {exc}"}

    try:
        data = resp.json()
    except Exception:  # noqa: BLE001
        snippet = (resp.text or "")[:200].replace("\n", " ").strip()
        return {"error": f"non-JSON response ({resp.status_code}): {snippet}"}

    if resp.status_code >= 400:
        # Pass structured detail through (e.g. ambiguous-recipient candidates)
        # so the agent can ask the realtor a precise follow-up question.
        err: dict[str, Any] = {"error": data.get("error") or f"failed ({resp.status_code})"}
        if isinstance(data.get("candidates"), list):
            err["candidates"] = data["candidates"]
        return err

    return data


@function_tool(strict_mode=False)
@rate_limited(max_calls=30, window_seconds=3600)
async def message_teammate(
    ctx: RunContextWrapper[AgentContext],
    recipient: str,
    message: str,
) -> dict[str, Any]:
    """Send a real-time team message (DM) to a teammate at the realtor's brokerage."""
    # recipient: the teammate's name or email as the realtor said it.
    # message: what to send, written out in full — the realtor sees it in Messages.
    clean_recipient = (recipient or "").strip()
    clean_message = (message or "").strip()
    if not clean_recipient or not clean_message:
        return {"error": "recipient and message are required"}
    if is_unattended_write(ctx.context.run_mode, "team_message:send"):
        return {
            "error": "Unattended runs must propose team messages for review.",
            "code": "RUN_POLICY_DENIED",
        }

    data = await _post_internal(
        "/api/internal/messages/send",
        {
            "spaceId": ctx.context.space_id,
            "recipient": clean_recipient,
            "message": clean_message,
        },
        action_headers(ctx.context, "team_message:send"),
    )
    if "error" in data:
        return data

    who = data.get("recipient") or {}
    return {
        "sent": True,
        "to": who.get("name") or who.get("email"),
        "message_id": data.get("messageId"),
    }


@function_tool(strict_mode=False)
@rate_limited(max_calls=10, window_seconds=3600)
async def create_automation(
    ctx: RunContextWrapper[AgentContext],
    description: str,
) -> dict[str, Any]:
    """Build a standing automation (workflow) from a plain-English description. It runs on autopilot but only ever DRAFTS messages for the realtor's approval."""
    # description: what should happen and when, e.g. "when a new lead comes in,
    # draft a text within 5 minutes and set a follow-up task for tomorrow".
    clean = (description or "").strip()
    if not clean:
        return {"error": "description is required"}

    data = await _post_internal(
        "/api/internal/automations/create",
        {"spaceId": ctx.context.space_id, "description": clean},
    )
    if "error" in data:
        return data

    wf = data.get("workflow") or {}
    return {
        "created": True,
        "id": wf.get("id"),
        "name": wf.get("name"),
        "trigger": wf.get("trigger"),
        "action_count": wf.get("actionCount"),
        # Surface the safety contract so the agent explains it honestly.
        "autonomy": "draft — it stages messages for approval, never sends on its own",
    }
