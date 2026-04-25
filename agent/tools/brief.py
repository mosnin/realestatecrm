"""Contact brief and score explanation tools.

These allow agents to maintain a living summary of each contact that
the UI can display — replacing blank Notes fields with agent-authored context.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from memory.store import save_memory
from security.context import AgentContext
from tools.streaming import publish_event


@function_tool
async def update_contact_brief(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    brief: str,
) -> dict[str, Any]:
    """Write or update the agent's 2-3 sentence summary for a contact.

    brief: 2-3 sentences synthesising everything the agent knows about this
    person — their situation, preferences, stage, and best next action.

    Example: "Sarah is a first-time buyer pre-approved for $620k, focused on
    Westwood and Brentwood. She toured twice in March and asked detailed
    questions about schools. Responds quickly to SMS but not email — follow up
    via text about the new Westwood listing."

    Returns: { "updated": true, "contactId": str }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    # Validate contact belongs to this space
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

    # Brief must be meaningful
    brief = brief.strip()
    if len(brief) < 20:
        return {"error": "Brief must be at least 20 characters"}
    brief = brief[:800]  # cap

    await save_memory(
        space_id=space_id,
        entity_type="contact",
        entity_id=contact_id,
        memory_type="observation",
        content=f"AGENT_BRIEF:{brief}",
        importance=0.8,
    )

    await publish_event(
        ctx.context,
        "action",
        f"Brief updated for {contact_name}",
        agent_type=ctx.context.current_agent_type,
        metadata={"contactId": contact_id},
    )

    return {"updated": True, "contactId": contact_id}


@function_tool
async def set_score_explanation(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    score: int,
    explanation: str,
) -> dict[str, Any]:
    """Record a plain-English explanation for a contact's lead score.

    score: the numeric score (0-100) being explained
    explanation: 1-2 sentences describing why this score was assigned.

    Example: "Score 78: Has toured twice, is pre-approved, and replies quickly —
    strong buying intent. Slight drop from 85 because they've gone quiet this week."

    Returns: { "updated": true, "contactId": str, "score": int }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    check = await (
        db.table("Contact")
        .select("id,name")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    explanation = explanation.strip()[:500]
    if len(explanation) < 10:
        return {"error": "Explanation must be at least 10 characters"}

    score = max(0, min(100, score))

    await save_memory(
        space_id=space_id,
        entity_type="contact",
        entity_id=contact_id,
        memory_type="fact",
        content=f"SCORE_EXPLANATION:{score}:{explanation}",
        importance=0.7,
    )

    return {"updated": True, "contactId": contact_id, "score": score}
