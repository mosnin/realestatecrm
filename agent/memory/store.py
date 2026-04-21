"""Persistent agent memory via pgvector in Supabase.

Memories accumulate across runs so the agent builds understanding over time —
each run is smarter than the last. Without this the agent has amnesia.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from db import supabase


async def load_memories(
    space_id: str,
    entity_id: str | None = None,
    entity_type: str | None = None,
    memory_type: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Load memories for a space, optionally scoped to an entity."""
    db = await supabase()

    query = (
        db.table("AgentMemory")
        .select("id,entityType,entityId,memoryType,content,importance,createdAt,updatedAt")
        .eq("spaceId", space_id)
        .order("importance", desc=True)
        .order("createdAt", desc=True)
        .limit(limit)
    )

    if entity_id:
        query = query.eq("entityId", entity_id)
    if entity_type:
        query = query.eq("entityType", entity_type)
    if memory_type:
        query = query.eq("memoryType", memory_type)

    result = await query.execute()
    return result.data or []


async def save_memory(
    space_id: str,
    entity_type: str,
    entity_id: str,
    memory_type: str,
    content: str,
    importance: float = 0.5,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Persist a new memory fact. Returns the created record."""
    db = await supabase()

    memory = {
        "id": str(uuid.uuid4()),
        "spaceId": space_id,
        "entityType": entity_type,
        "entityId": entity_id,
        "memoryType": memory_type,
        "content": content,
        "importance": max(0.0, min(1.0, importance)),
        "expiresAt": expires_at,
    }

    result = await db.table("AgentMemory").insert(memory).execute()
    return result.data[0] if result.data else memory


async def prune_expired(space_id: str) -> int:
    """Delete memories past their expiry date. Called at start of each run."""
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    result = await (
        db.table("AgentMemory")
        .delete()
        .eq("spaceId", space_id)
        .lte("expiresAt", now)
        .not_.is_("expiresAt", "null")
        .execute()
    )
    return len(result.data) if result.data else 0


async def format_memories_for_prompt(
    memories: list[dict[str, Any]],
    max_chars: int = 3_000,
) -> str:
    """Render memories as a compact text block for injection into agent prompts.

    Respects max_chars budget. High-importance memories are already first
    (callers sort by importance DESC). Individual entries are capped at 200 chars
    so one verbose memory can't crowd out the rest.
    """
    if not memories:
        return ""

    header = "## What you already know (from previous runs)\n"
    lines: list[str] = []
    remaining = max_chars - len(header)

    for m in memories:
        content = m["content"]
        if len(content) > 200:
            content = content[:197] + "…"

        entity_label = ""
        if m.get("entityId") and m.get("entityType") != "space":
            entity_label = f" [{m.get('entityType', 'entity')} {m['entityId'][:8]}]"

        line = f"- {content}{entity_label}"
        if remaining - len(line) - 1 < 0:
            lines.append("- (additional memories omitted — budget reached)")
            break
        lines.append(line)
        remaining -= len(line) + 1  # +1 for newline

    return header + "\n".join(lines)
