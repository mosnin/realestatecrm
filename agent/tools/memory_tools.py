"""Memory tools — store and recall facts across runs.

spaceId is always injected from AgentContext. Entity IDs come from prior
tool calls and are validated against the space at the storage layer.
"""

from __future__ import annotations

from typing import Any

from agents import RunContextWrapper, function_tool

from memory.store import load_memories, save_memory
from security.context import AgentContext

_VALID_TYPES = {"fact", "observation", "preference", "reminder"}
_VALID_ENTITIES = {"contact", "deal", "space"}


@function_tool
async def recall_memory(
    ctx: RunContextWrapper[AgentContext],
    entity_id: str | None = None,
    entity_type: str = "contact",
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Recall stored memories about a contact, deal, or the workspace.

    entity_id: pass a contact_id or deal_id to fetch memories for that record.
      Omit (or pass space_id) along with entity_type='space' for general
      workspace context.
    entity_type: 'contact' | 'deal' | 'space'.
    limit: 1-50.

    Always recall before drafting a message or making a decision about a
    specific contact/deal — earlier runs may have stored important context.
    """
    space_id = ctx.context.space_id

    if entity_type not in _VALID_ENTITIES:
        return [{"error": f"entity_type must be one of {_VALID_ENTITIES}"}]

    target_id = entity_id or (space_id if entity_type == "space" else None)
    if not target_id:
        return [{"error": "entity_id is required when entity_type != 'space'"}]

    memories = await load_memories(
        space_id=space_id,
        entity_id=target_id,
        entity_type=entity_type,
        limit=max(1, min(50, limit)),
    )

    return [
        {
            "fact": m["content"],
            "type": m.get("memoryType"),
            "importance": m.get("importance"),
            "storedAt": m.get("createdAt"),
        }
        for m in memories
    ]


@function_tool
async def store_memory(
    ctx: RunContextWrapper[AgentContext],
    entity_type: str,
    entity_id: str,
    content: str,
    memory_type: str = "fact",
    importance: float = 0.5,
) -> dict[str, Any]:
    """Store a memory for future runs.

    entity_type: 'contact' | 'deal' | 'space'
    entity_id: the contact/deal id (or space id for workspace-level memories)
    memory_type: 'fact' | 'observation' | 'preference' | 'reminder'
      - fact: durable truth (deadline, pre-approval amount, areas of interest)
      - observation: behavioural pattern (responsiveness, channel preference)
      - preference: explicit stated preference
      - reminder: time-bounded note for the agent's own future use
    importance: 0.0 (trivial) to 1.0 (critical — remember always). Default 0.5.

    Threshold: would a realtor want to remember this six months from now?
    If yes, store. If it's "she said hi", skip.
    """
    space_id = ctx.context.space_id

    if entity_type not in _VALID_ENTITIES:
        return {"error": f"entity_type must be one of {_VALID_ENTITIES}"}
    if memory_type not in _VALID_TYPES:
        return {"error": f"memory_type must be one of {_VALID_TYPES}"}
    if not content or len(content.strip()) < 5:
        return {"error": "content must be a meaningful statement (5+ chars)"}

    memory = await save_memory(
        space_id=space_id,
        entity_type=entity_type,
        entity_id=entity_id,
        memory_type=memory_type,
        content=content.strip(),
        importance=max(0.0, min(1.0, importance)),
    )
    return {"stored": True, "id": memory.get("id", ""), "memoryType": memory_type}
