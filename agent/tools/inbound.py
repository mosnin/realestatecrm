"""Inbound message processing — records replies from contacts and updates engagement signals."""
from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Any
from agents import RunContextWrapper, function_tool
from config import settings
from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event


@function_tool
async def process_inbound_message(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    channel: str,
    content: str,
    external_id: str | None = None,
) -> dict[str, Any]:
    """Record an inbound reply from a contact and update their engagement signals.

    channel: 'sms' | 'email'
    content: the message body
    external_id: optional ID from the SMS/email provider for deduplication

    Returns: { "recorded": true, "intent": "positive"|"question"|"objection"|"other", "scoreBoost": int }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    valid_channels = {"sms", "email"}
    if channel not in valid_channels:
        return {"error": f"channel must be 'sms' or 'email', got '{channel}'"}

    # Validate contact belongs to this space
    check = await (
        db.table("Contact")
        .select("id,name,leadScore")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    contact = check.data[0]
    contact_name = contact.get("name", "contact")

    # Simple intent detection from message content
    lower = content.lower()
    if any(w in lower for w in ["yes", "interested", "love", "perfect", "when", "how much", "available", "schedule", "book", "tour", "visit"]):
        intent = "positive"
    elif any(w in lower for w in ["?", "what", "why", "how", "where", "who", "which", "tell me"]):
        intent = "question"
    elif any(w in lower for w in ["no", "not interested", "stop", "unsubscribe", "remove", "don't", "cant", "can't"]):
        intent = "objection"
    else:
        intent = "other"

    now = datetime.now(timezone.utc).isoformat()

    # Log the inbound message as a ContactActivity
    metadata: dict[str, Any] = {
        "source": "inbound",
        "channel": channel,
        "intent": intent,
        "agentRunId": ctx.context.run_id,
    }
    if external_id:
        metadata["externalId"] = external_id

    await db.table("ContactActivity").insert({
        "id": str(uuid.uuid4()),
        "contactId": contact_id,
        "spaceId": space_id,
        "type": "message",
        "content": f"[Inbound {channel.upper()}] {content[:500]}",
        "metadata": metadata,
    }).execute()

    # Update lastContactedAt
    await (
        db.table("Contact")
        .update({"lastContactedAt": now, "updatedAt": now})
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )

    # Boost lead score for positive engagement
    score_boost = 0
    if intent in ("positive", "question"):
        current_score = contact.get("leadScore") or 50
        new_score = min(100, current_score + 5)
        score_boost = new_score - current_score
        if score_boost > 0:
            await (
                db.table("Contact")
                .update({"leadScore": new_score, "updatedAt": now})
                .eq("id", contact_id)
                .eq("spaceId", space_id)
                .execute()
            )

    # Push trigger to Redis for the agent to process on next run
    try:
        if settings.kv_rest_api_url and settings.kv_rest_api_token:
            import httpx
            trigger = json.dumps({
                "event": "inbound_message_received",
                "contactId": contact_id,
                "channel": channel,
                "intent": intent,
                "spaceId": space_id,
                "queuedAt": now,
            })
            key = f"agent:triggers:{space_id}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{settings.kv_rest_api_url}/rpush/{key}",
                    json=[trigger],
                    headers={"Authorization": f"Bearer {settings.kv_rest_api_token}"},
                )
    except Exception:
        pass  # Redis push is best-effort

    await publish_event(
        ctx.context,
        "action",
        f"Inbound {channel.upper()} from {contact_name} recorded (intent: {intent})",
        agent_type="inbound",
        metadata={"contactId": contact_id, "intent": intent, "scoreBoost": score_boost},
    )

    return {
        "recorded": True,
        "contactId": contact_id,
        "contactName": contact_name,
        "intent": intent,
        "scoreBoost": score_boost,
    }
