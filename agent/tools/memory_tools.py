"""Memory tools — agents use these to store and recall facts across runs.

spaceId is always injected from AgentContext. Entity IDs (contactId, dealId)
are accepted as arguments because they come from prior tool calls, not from
LLM free-text input, and are validated against the space before writing.
"""

from __future__ import annotations

from typing import Any

from agents import RunContextWrapper, function_tool

from memory.store import load_memories, save_memory
from security.context import AgentContext


@function_tool
async def store_fact(
    ctx: RunContextWrapper[AgentContext],
    entity_type: str,
    entity_id: str,
    fact: str,
    importance: float = 0.5,
) -> dict[str, Any]:
    """Store a fact about a contact or deal for future runs.

    entity_type: 'contact' | 'deal' | 'space'
    importance: 0.0 (trivial) to 1.0 (critical — remember always)

    Examples:
    - "Said she needs to move by June because her lease ends"
    - "Pre-approved for $650k, working with Coastal Mortgage"
    - "Interested in Westwood/Brentwood only, not west of the 405"
    - "Deal stalled because the inspection flagged foundation issues"
    """
    space_id = ctx.context.space_id

    valid_types = {"contact", "deal", "space"}
    if entity_type not in valid_types:
        return {"error": f"entity_type must be one of {valid_types}"}

    if not fact or len(fact.strip()) < 5:
        return {"error": "fact must be a meaningful statement (5+ chars)"}

    memory = await save_memory(
        space_id=space_id,
        entity_type=entity_type,
        entity_id=entity_id,
        memory_type="fact",
        content=fact.strip(),
        importance=max(0.0, min(1.0, importance)),
    )
    return {"stored": True, "id": memory.get("id", "")}


@function_tool
async def store_observation(
    ctx: RunContextWrapper[AgentContext],
    entity_type: str,
    entity_id: str,
    observation: str,
    importance: float = 0.4,
) -> dict[str, Any]:
    """Store a behavioural observation for future context.

    Examples:
    - "Has not responded to 3 consecutive follow-up attempts"
    - "Went from hot to cold after the rate hike announcement"
    - "Very responsive on SMS, ignores email"
    """
    space_id = ctx.context.space_id

    memory = await save_memory(
        space_id=space_id,
        entity_type=entity_type,
        entity_id=entity_id,
        memory_type="observation",
        content=observation.strip(),
        importance=max(0.0, min(1.0, importance)),
    )
    return {"stored": True, "id": memory.get("id", "")}


@function_tool
async def recall_facts(
    ctx: RunContextWrapper[AgentContext],
    entity_id: str,
    entity_type: str = "contact",
) -> list[dict[str, Any]]:
    """Recall all stored facts and observations about a specific contact or deal.

    Always call this before drafting a message or making a decision about
    a specific contact/deal — the agent may have important context from
    previous runs that changes what action is appropriate.
    """
    space_id = ctx.context.space_id

    memories = await load_memories(
        space_id=space_id,
        entity_id=entity_id,
        entity_type=entity_type,
        limit=20,
    )

    return [
        {
            "fact": m["content"],
            "type": m["memoryType"],
            "importance": m["importance"],
            "storedAt": m["createdAt"],
        }
        for m in memories
    ]


@function_tool
async def recall_space_context(
    ctx: RunContextWrapper[AgentContext],
) -> list[dict[str, Any]]:
    """Recall general observations stored about this workspace (not entity-specific)."""
    space_id = ctx.context.space_id

    memories = await load_memories(
        space_id=space_id,
        entity_type="space",
        entity_id=space_id,
        limit=10,
    )

    return [{"fact": m["content"], "storedAt": m["createdAt"]} for m in memories]
