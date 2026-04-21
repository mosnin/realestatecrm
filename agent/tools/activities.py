"""Write tools for activity logging and follow-up scheduling.

These write directly to the DB (lightweight, no business-logic side effects).
spaceId is always injected from AgentContext — never accepted as a tool argument.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext


@function_tool
async def log_agent_observation(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    observation: str,
) -> dict[str, Any]:
    """Record an agent observation as a contact activity note."""
    space_id = ctx.context.space_id
    db = await supabase()

    entry = {
        "id": str(uuid.uuid4()),
        "contactId": contact_id,
        "spaceId": space_id,
        "type": "note",
        "content": f"[Agent] {observation}",
        "metadata": {"source": "agent", "agentRunId": ctx.context.run_id},
    }

    result = await db.table("ContactActivity").insert(entry).execute()
    return result.data[0] if result.data else entry


@function_tool
async def set_contact_follow_up(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    follow_up_date: str,
    reason: str,
) -> dict[str, Any]:
    """Schedule a follow-up date for a contact (ISO date string, e.g. '2026-04-25')."""
    space_id = ctx.context.space_id
    db = await supabase()

    # Validate the contact belongs to this space before writing
    check = await (
        db.table("Contact")
        .select("id")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    result = await (
        db.table("Contact")
        .update({"followUpAt": follow_up_date, "updatedAt": datetime.now(timezone.utc).isoformat()})
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .select("id,followUpAt")
        .execute()
    )

    # Log the agent action as an activity
    await db.table("ContactActivity").insert({
        "id": str(uuid.uuid4()),
        "contactId": contact_id,
        "spaceId": space_id,
        "type": "follow_up",
        "content": f"[Agent] Follow-up scheduled: {reason}",
        "metadata": {"source": "agent", "agentRunId": ctx.context.run_id, "followUpDate": follow_up_date},
    }).execute()

    return result.data[0] if result.data else {}


@function_tool
async def set_deal_follow_up(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    follow_up_date: str,
    reason: str,
) -> dict[str, Any]:
    """Schedule a follow-up date for a deal (ISO date string)."""
    space_id = ctx.context.space_id
    db = await supabase()

    check = await (
        db.table("Deal")
        .select("id")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Deal not found in space"}

    result = await (
        db.table("Deal")
        .update({"followUpAt": follow_up_date, "updatedAt": datetime.now(timezone.utc).isoformat()})
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .select("id,followUpAt")
        .execute()
    )

    await db.table("DealActivity").insert({
        "id": str(uuid.uuid4()),
        "dealId": deal_id,
        "spaceId": space_id,
        "type": "follow_up",
        "content": f"[Agent] Follow-up scheduled: {reason}",
        "metadata": {"source": "agent", "agentRunId": ctx.context.run_id, "followUpDate": follow_up_date},
    }).execute()

    return result.data[0] if result.data else {}


@function_tool
async def log_activity_run(
    ctx: RunContextWrapper[AgentContext],
    agent_type: str,
    action_type: str,
    outcome: str,
    reasoning: str,
    contact_id: str | None = None,
    deal_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Persist an entry to AgentActivityLog. Returns the new log entry ID."""
    space_id = ctx.context.space_id
    db = await supabase()

    entry_id = str(uuid.uuid4())
    await db.table("AgentActivityLog").insert({
        "id": entry_id,
        "spaceId": space_id,
        "runId": ctx.context.run_id,
        "agentType": agent_type,
        "actionType": action_type,
        "reasoning": reasoning,
        "outcome": outcome,
        "relatedContactId": contact_id,
        "relatedDealId": deal_id,
        "metadata": metadata or {},
    }).execute()
    return entry_id
