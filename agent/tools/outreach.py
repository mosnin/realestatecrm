"""Outreach tool — always creates a pending draft.

Chippi never sends. Every contact-facing message lands in the realtor's
approval inbox as an AgentDraft. The realtor is the only thing that crosses
the line between draft and send.

This is a deliberate, fixed contract. There used to be three autonomy
modes (autonomous / draft_required / suggest_only); the configuration
turned out to be friction without value. One mode, one decision, one trust
boundary.
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
    """Create a pending draft message for a contact. Always drafts — the
    realtor approves before anything is sent.

    channel: 'sms' | 'email' | 'note'
    subject: required when channel == 'email'
    content: the message body. Keep SMS under 160 chars.
    reasoning: why this outreach is warranted (stored on the draft).
    priority: 0 (normal) to 100 (urgent) — affects draft inbox ordering.

    Returns: { "action": "drafted", "draftId": "...", ... }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    valid_channels = {"sms", "email", "note"}
    if channel not in valid_channels:
        return {"error": f"Invalid channel '{channel}'. Must be one of {valid_channels}"}

    if channel == "email" and not subject:
        return {"error": "subject is required for email channel"}

    # Validate contact belongs to this space before any write
    check = await (
        db.table("Contact")
        .select("id,name")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    contact_name = check.data[0].get("name", "contact")
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
