"""Goal tools — create and manage multi-step goals for contacts and deals.

Goals give agents persistent objectives that span multiple runs. For example,
the lead_nurture agent can create a 'tour_booking' goal for a hot lead and
track progress across heartbeats until the goal is completed or cancelled.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event


VALID_GOAL_TYPES = {"follow_up_sequence", "tour_booking", "offer_progress", "deal_close", "custom"}
VALID_STATUSES = {"active", "completed", "cancelled", "paused"}


@function_tool
async def create_goal(
    ctx: RunContextWrapper[AgentContext],
    goal_type: str,
    description: str,
    contact_id: str | None = None,
    deal_id: str | None = None,
    instructions: str | None = None,
    priority: int = 0,
) -> dict[str, Any]:
    """Create a persistent goal for a contact or deal.

    goal_type: 'follow_up_sequence' | 'tour_booking' | 'offer_progress' | 'deal_close' | 'custom'
    description: what the goal is (shown to the realtor)
    instructions: what the agent should do each run to advance this goal
    priority: 0 (normal) to 100 (urgent)

    Returns: { "created": true, "goalId": str }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    if goal_type not in VALID_GOAL_TYPES:
        return {"error": f"Invalid goal_type. Must be one of {VALID_GOAL_TYPES}"}

    # Validate contact belongs to space if provided
    if contact_id:
        check = await (
            db.table("Contact")
            .select("id,name")
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .execute()
        )
        if not check.data:
            return {"error": "Contact not found in space"}

    # Validate deal belongs to space if provided
    if deal_id:
        check = await (
            db.table("Deal")
            .select("id")
            .eq("id", deal_id)
            .eq("spaceId", space_id)
            .execute()
        )
        if not check.data:
            return {"error": "Deal not found in space"}

    goal_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    goal = {
        "id": goal_id,
        "spaceId": space_id,
        "contactId": contact_id,
        "dealId": deal_id,
        "goalType": goal_type,
        "description": description,
        "instructions": instructions,
        "status": "active",
        "priority": max(0, min(100, priority)),
        "metadata": {"createdByRunId": ctx.context.run_id, "agentType": ctx.context.current_agent_type},
        "createdAt": now,
        "updatedAt": now,
    }

    result = await db.table("AgentGoal").insert(goal).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Goal created: {description[:80]}",
        agent_type=ctx.context.current_agent_type,
        metadata={"goalId": goal_id, "goalType": goal_type, "contactId": contact_id},
    )

    created = result.data[0] if result.data else goal
    return {"created": True, "goalId": created.get("id", goal_id), "goalType": goal_type}


@function_tool
async def update_goal_status(
    ctx: RunContextWrapper[AgentContext],
    goal_id: str,
    status: str,
    completion_notes: str | None = None,
) -> dict[str, Any]:
    """Update the status of an existing goal.

    status: 'active' | 'completed' | 'cancelled' | 'paused'
    completion_notes: optional summary of how the goal was completed/cancelled.

    Returns: { "updated": true, "goalId": str, "status": str }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    if status not in VALID_STATUSES:
        return {"error": f"Invalid status. Must be one of {VALID_STATUSES}"}

    # Verify goal belongs to this space
    check = await (
        db.table("AgentGoal")
        .select("id,description,status")
        .eq("id", goal_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Goal not found in space"}

    now = datetime.now(timezone.utc).isoformat()
    update = {
        "status": status,
        "updatedAt": now,
    }
    if status == "completed":
        update["completedAt"] = now
    if completion_notes:
        update["metadata"] = {
            **check.data[0].get("metadata", {}),
            "completionNotes": completion_notes,
            "completedByRunId": ctx.context.run_id,
        }

    await (
        db.table("AgentGoal")
        .update(update)
        .eq("id", goal_id)
        .eq("spaceId", space_id)
        .execute()
    )

    description = check.data[0].get("description", "")
    await publish_event(
        ctx.context,
        "action",
        f"Goal {status}: {description[:60]}",
        agent_type=ctx.context.current_agent_type,
        metadata={"goalId": goal_id, "status": status},
    )

    return {"updated": True, "goalId": goal_id, "status": status}


@function_tool
async def list_active_goals(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str | None = None,
    deal_id: str | None = None,
) -> dict[str, Any]:
    """List active goals for this workspace, optionally filtered by contact or deal.

    Returns up to 20 active goals ordered by priority (highest first).
    """
    space_id = ctx.context.space_id
    db = await supabase()

    query = (
        db.table("AgentGoal")
        .select("id,contactId,dealId,goalType,description,instructions,priority,createdAt")
        .eq("spaceId", space_id)
        .eq("status", "active")
        .order("priority", desc=True)
        .limit(20)
    )

    if contact_id:
        query = query.eq("contactId", contact_id)
    if deal_id:
        query = query.eq("dealId", deal_id)

    result = await query.execute()
    goals = result.data or []

    return {
        "goals": goals,
        "count": len(goals),
        "filtered_by": {"contactId": contact_id, "dealId": deal_id},
    }
