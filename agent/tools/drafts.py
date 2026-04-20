"""Draft creation tool — agent writes message drafts for human approval.

The agent never sends messages directly. It creates an AgentDraft record
with status='pending'. A human approves or dismisses it in the UI.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event


@function_tool
async def create_draft_message(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    channel: str,
    content: str,
    reasoning: str,
    subject: str | None = None,
    deal_id: str | None = None,
    priority: int = 0,
) -> dict[str, Any]:
    """Create a draft message for human review before sending.

    channel must be one of: 'sms', 'email', 'note'.
    Returns the created draft record.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    valid_channels = {"sms", "email", "note"}
    if channel not in valid_channels:
        return {"error": f"Invalid channel '{channel}'. Must be one of {valid_channels}"}

    # Validate the contact belongs to this space
    check = await (
        db.table("Contact")
        .select("id,name")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    # Drafts expire after 7 days if not actioned
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
        "status": "pending",
        "expiresAt": expires_at,
    }

    result = await db.table("AgentDraft").insert(draft).execute()

    contact_name = check.data[0].get("name", "contact") if check.data else "contact"
    await publish_event(
        ctx.context,
        "draft",
        f"Draft {channel.upper()} for {contact_name} — awaiting your approval",
        metadata={"contactId": contact_id, "channel": channel},
    )

    return result.data[0] if result.data else draft


@function_tool
async def check_recent_drafts(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    hours: int = 48,
) -> list[dict[str, Any]]:
    """Check if a draft was already created for this contact in the last N hours.

    Use this before creating a new draft to avoid duplicate suggestions.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    result = await (
        db.table("AgentDraft")
        .select("id,channel,status,createdAt")
        .eq("spaceId", space_id)
        .eq("contactId", contact_id)
        .gte("createdAt", cutoff)
        .execute()
    )
    return result.data or []
