"""Goal management tools — agents use these to set and track multi-step objectives."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event

_VALID_GOAL_TYPES = {
    "follow_up_sequence",
    "tour_booking",
    "offer_progress",
    "reengagement",
    "custom",
}

_VALID_STATUSES = {"active", "completed", "cancelled", "paused"}


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
    """Create a new AgentGoal to track a multi-step objective.

    goal_type must be one of: follow_up_sequence, tour_booking, offer_progress,
    reengagement, custom.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    if goal_type not in _VALID_GOAL_TYPES:
        return {"error": f"Invalid goal_type '{goal_type}'. Must be one of: {', '.join(sorted(_VALID_GOAL_TYPES))}"}

    # Validate contact belongs to this space (if provided)
    if contact_id:
        check = await (
            db.table("Contact")
            .select("id")
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .execute()
        )
        if not check.data:
            return {"error": "Contact not found in space"}

    # Validate deal belongs to this space (if provided)
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

    entry: dict[str, Any] = {
        "id": goal_id,
        "spaceId": space_id,
        "goalType": goal_type,
        "description": description,
        "status": "active",
        "priority": priority,
        "metadata": {},
        "createdAt": now,
        "updatedAt": now,
    }
    if contact_id:
        entry["contactId"] = contact_id
    if deal_id:
        entry["dealId"] = deal_id
    if instructions:
        entry["instructions"] = instructions

    await db.table("AgentGoal").insert(entry).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Goal created: {description}",
        agent_type=ctx.context.current_agent_type,
        metadata={"goalId": goal_id, "goalType": goal_type},
    )

    return {"goalId": goal_id, "status": "active"}


@function_tool
async def list_active_goals(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str | None = None,
) -> list[dict[str, Any]]:
    """Return up to 20 active goals for this space, optionally filtered by contact."""
    space_id = ctx.context.space_id
    db = await supabase()

    query = (
        db.table("AgentGoal")
        .select("id,goalType,description,status,contactId,dealId,priority,createdAt")
        .eq("spaceId", space_id)
        .eq("status", "active")
    )

    if contact_id:
        query = query.eq("contactId", contact_id)

    result = await (
        query
        .order("createdAt", desc=True)
        .limit(20)
        .execute()
    )
    return result.data or []


@function_tool
async def update_goal_status(
    ctx: RunContextWrapper[AgentContext],
    goal_id: str,
    status: str,
    completion_notes: str | None = None,
) -> dict[str, Any]:
    """Update the status of an existing AgentGoal.

    status must be one of: active, completed, cancelled, paused.
    completion_notes (optional) are merged into the goal's metadata.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    if status not in _VALID_STATUSES:
        return {"error": f"Invalid status '{status}'. Must be one of: {', '.join(sorted(_VALID_STATUSES))}"}

    # Validate the goal belongs to this space
    check = await (
        db.table("AgentGoal")
        .select("id,metadata")
        .eq("id", goal_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Goal not found in space"}

    now = datetime.now(timezone.utc).isoformat()
    updates: dict[str, Any] = {
        "status": status,
        "updatedAt": now,
    }

    if status == "completed":
        updates["completedAt"] = now

    if completion_notes:
        existing_metadata: dict[str, Any] = check.data[0].get("metadata") or {}
        updates["metadata"] = {**existing_metadata, "completionNotes": completion_notes}

    result = await (
        db.table("AgentGoal")
        .update(updates)
        .eq("id", goal_id)
        .eq("spaceId", space_id)
        .select("id,status,updatedAt")
        .execute()
    )

    await publish_event(
        ctx.context,
        "action",
        f"Goal {status}: {goal_id}",
        agent_type=ctx.context.current_agent_type,
        metadata={"goalId": goal_id, "status": status},
    )

    row = result.data[0] if result.data else {"id": goal_id, "status": status, "updatedAt": now}
    return {"goalId": row["id"], "status": row["status"], "updatedAt": row["updatedAt"]}
