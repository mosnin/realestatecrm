"""Outreach tool — send or draft a message depending on autonomy level.

This is the core tool that makes the background agent feel agentic.

- autonomy_level == "autonomous"   → send email/SMS immediately via internal API
- autonomy_level == "draft_required" → create a pending AgentDraft for approval
- autonomy_level == "suggest_only"  → log observation only, no draft

The agent never calls create_draft_message directly. It calls send_or_draft and
the autonomy level decides what happens. This lets the realtor tune how much
the agent acts on its own without changing any agent prompts.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from config import settings
from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event


@function_tool
async def send_or_draft(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    channel: str,
    content: str,
    reasoning: str,
    subject: str | None = None,
    deal_id: str | None = None,
    priority: int = 0,
    confidence: int = -1,
) -> dict[str, Any]:
    """Send or draft a message for a contact. Behaviour is controlled by the space's
    autonomy_level setting — you never need to check it yourself.

    channel: 'sms' | 'email' | 'note'
    subject: required when channel == 'email'
    content: the message body. Keep SMS under 160 chars.
    reasoning: why this outreach is warranted (stored in draft or activity log).
    priority: 0 (normal) to 100 (urgent) — affects draft inbox ordering.

    Returns: { "action": "sent" | "drafted" | "suggested", ... }
    """
    space_id = ctx.context.space_id
    autonomy = ctx.context.effective_autonomy_for(ctx.context.current_agent_type)

    # Confidence gate: if threshold is set and confidence is below it, force to draft
    confidence_threshold = ctx.context.confidence_threshold
    if autonomy == "autonomous" and confidence >= 0 and confidence_threshold > 0:
        if confidence < confidence_threshold:
            autonomy = "draft_required"

    db = await supabase()

    valid_channels = {"sms", "email", "note"}
    if channel not in valid_channels:
        return {"error": f"Invalid channel '{channel}'. Must be one of {valid_channels}"}

    if channel == "email" and not subject:
        return {"error": "subject is required for email channel"}

    # Validate contact belongs to this space before any write
    check = await (
        db.table("Contact")
        .select("id,name,email,phone")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    contact = check.data[0]
    contact_name = contact.get("name", "contact")

    # ── suggest_only: log observation, no message ──────────────────────────
    if autonomy == "suggest_only":
        await db.table("ContactActivity").insert({
            "id": str(uuid.uuid4()),
            "contactId": contact_id,
            "spaceId": space_id,
            "type": "note",
            "content": f"[Agent suggestion] {channel.upper()} to {contact_name}: {content[:200]}",
            "metadata": {
                "source": "agent",
                "agentRunId": ctx.context.run_id,
                "reasoning": reasoning[:300],
                "autonomyLevel": autonomy,
                "channel": channel,
            },
        }).execute()

        await publish_event(
            ctx.context,
            "info",
            f"Suggestion logged for {contact_name} (suggest_only mode — no message created)",
            agent_type="outreach",
        )
        return {"action": "suggested", "contactId": contact_id, "channel": channel}

    # ── autonomous: send directly via internal API ─────────────────────────
    if autonomy == "autonomous" and channel in ("email", "sms"):
        if not settings.agent_internal_secret or not settings.app_url:
            # Fall back to draft if internal API is not configured
            pass
        else:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    res = await client.post(
                        f"{settings.app_url}/api/agent/send",
                        json={
                            "contactId": contact_id,
                            "spaceId": space_id,
                            "channel": channel,
                            "content": content,
                            "subject": subject,
                            "runId": ctx.context.run_id,
                        },
                        headers={"Authorization": f"Bearer {settings.agent_internal_secret}"},
                    )

                if res.status_code == 200:
                    result = res.json()
                    await publish_event(
                        ctx.context,
                        "action",
                        f"{channel.upper()} sent to {contact_name} ({result.get('deliveredTo', '')})",
                        agent_type="outreach",
                        metadata={"contactId": contact_id, "channel": channel},
                    )
                    return {
                        "action": "sent",
                        "contactId": contact_id,
                        "channel": channel,
                        "deliveredTo": result.get("deliveredTo"),
                    }

                # API returned an error — fall through to draft
                error_body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = error_body.get("error", f"status {res.status_code}")
                await publish_event(
                    ctx.context,
                    "info",
                    f"Send failed ({error_msg}), falling back to draft for {contact_name}",
                    agent_type="outreach",
                )

            except Exception as exc:
                await publish_event(
                    ctx.context,
                    "info",
                    f"Send request failed ({exc}), falling back to draft",
                    agent_type="outreach",
                )

    # ── draft_required (or autonomous fallback): create pending draft ──────
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    draft = {
        "id": str(uuid.uuid4()),
        "spaceId": space_id,
        "contactId": contact_id,
        "dealId": deal_id,
        "channel": channel,
        "subject": subject,
        "content": content,
        "reasoning": reasoning,
        "priority": priority,
        "confidence": confidence if confidence >= 0 else None,
        "status": "pending",
        "expiresAt": expires_at,
    }

    result = await db.table("AgentDraft").insert(draft).execute()

    await publish_event(
        ctx.context,
        "draft",
        f"Draft {channel.upper()} for {contact_name} — awaiting your approval",
        metadata={"contactId": contact_id, "channel": channel},
    )

    created = result.data[0] if result.data else draft
    return {"action": "drafted", "draftId": created.get("id", ""), "contactId": contact_id, "channel": channel}
