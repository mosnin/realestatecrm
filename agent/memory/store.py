"""Persistent agent memory via pgvector.

Memories accumulate across runs so the agent builds understanding over
time. Each new memory is embedded with text-embedding-3-small (1536 dims,
matches the schema column) and stored alongside the content. Recall has
two modes:

  - keyed: load_memories(entity_id=...) — direct lookup by entity, ordered
    by importance. Used at run start to inject context for a known contact
    or deal.
  - semantic: search_similar(query=...) — pgvector cosine similarity. Used
    when the agent has a topic in mind ("anything about pre-approval?")
    but doesn't know which entity to look at.

Both paths are spaceId-scoped at the SQL layer; cross-tenant leak is
impossible by construction.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from openai import AsyncOpenAI

from config import settings
from db import get_pool, supabase

_EMBED_MODEL = "text-embedding-3-small"
_EMBED_DIMS = 1536

_openai: AsyncOpenAI | None = None


def _client() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        _openai = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai


async def _embed(text: str) -> list[float] | None:
    """Embed a string. Returns None on failure so save still proceeds without
    a vector — the row will be searchable by entity but not by similarity."""
    try:
        cleaned = (text or "").strip()
        if not cleaned:
            return None
        # Embed model has a token cap; keep payload sane. ~8k chars is well
        # under the 8191 token limit for text-embedding-3-small.
        if len(cleaned) > 8000:
            cleaned = cleaned[:8000]
        res = await _client().embeddings.create(model=_EMBED_MODEL, input=cleaned)
        vec = res.data[0].embedding
        if len(vec) != _EMBED_DIMS:
            return None
        return list(vec)
    except Exception:
        return None


def _vector_literal(vec: list[float]) -> str:
    """pgvector accepts string form: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{x:.7f}" for x in vec) + "]"


async def load_memories(
    space_id: str,
    entity_id: str | None = None,
    entity_type: str | None = None,
    memory_type: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Load memories for a space, optionally scoped to an entity. Keyed lookup
    only — no similarity ranking. For semantic recall use search_similar."""
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


async def search_similar(
    space_id: str,
    query: str,
    limit: int = 8,
    entity_type: str | None = None,
    entity_id: str | None = None,
    min_similarity: float = 0.0,
) -> list[dict[str, Any]]:
    """Semantic recall via pgvector cosine similarity. Returns up to `limit`
    memories ranked by similarity to `query`, scoped to the space.

    min_similarity: 0.0–1.0 floor (1.0 = identical). Filters out weak matches
    so the agent doesn't get noise. Default 0.0 returns everything ranked.
    """
    vec = await _embed(query)
    if vec is None:
        # Embedding failed (no API key, network error, etc.). Fall back to
        # the keyed loader so the caller still gets *something* useful.
        return await load_memories(
            space_id=space_id,
            entity_id=entity_id,
            entity_type=entity_type,
            limit=limit,
        )

    pool = await get_pool()
    vec_lit = _vector_literal(vec)

    # Cosine distance: 1 - cosine_similarity. pgvector exposes <=> for it.
    # similarity = 1 - distance.
    sql = """
        SELECT id, "entityType", "entityId", "memoryType", content, importance,
               "createdAt", "updatedAt",
               1 - (embedding <=> $1::vector) AS similarity
          FROM "AgentMemory"
         WHERE "spaceId" = $2
           AND embedding IS NOT NULL
    """
    params: list[Any] = [vec_lit, space_id]
    if entity_type is not None:
        params.append(entity_type)
        sql += f' AND "entityType" = ${len(params)}'
    if entity_id is not None:
        params.append(entity_id)
        sql += f' AND "entityId" = ${len(params)}'
    if min_similarity > 0:
        params.append(float(min_similarity))
        sql += f" AND (1 - (embedding <=> $1::vector)) >= ${len(params)}"
    params.append(int(limit))
    sql += f" ORDER BY embedding <=> $1::vector LIMIT ${len(params)}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
        return [dict(r) for r in rows]


async def save_memory(
    space_id: str,
    entity_type: str,
    entity_id: str,
    memory_type: str,
    content: str,
    importance: float = 0.5,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Persist a memory and embed it for future semantic recall.

    Embedding failures don't abort the save — the row still lands, just
    without a vector. Better partial than nothing.
    """
    pool = await get_pool()
    new_id = str(uuid.uuid4())
    importance_clamped = max(0.0, min(1.0, importance))

    vec = await _embed(content)
    vec_lit = _vector_literal(vec) if vec is not None else None

    sql = """
        INSERT INTO "AgentMemory" (
            id, "spaceId", "entityType", "entityId", "memoryType",
            content, importance, embedding, "expiresAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)
        RETURNING id, "entityType", "entityId", "memoryType",
                  content, importance, "createdAt", "updatedAt"
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            sql,
            new_id, space_id, entity_type, entity_id, memory_type,
            content, importance_clamped, vec_lit, expires_at,
        )
        return dict(row) if row else {
            "id": new_id, "spaceId": space_id, "entityType": entity_type,
            "entityId": entity_id, "memoryType": memory_type, "content": content,
            "importance": importance_clamped,
        }


async def prune_expired(space_id: str) -> int:
    """Delete memories past their expiry date. Called at run start."""
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
    """Render memories as a compact text block for prompt injection.

    Respects max_chars budget. Callers pass memories already ordered by
    relevance (importance for keyed loads, similarity for semantic). Each
    entry is capped at 200 chars so one verbose memory can't crowd out
    the rest.
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
        remaining -= len(line) + 1

    return header + "\n".join(lines)


# json import retained for compat with anything that imported the module
# expecting json to be available there (none currently, but cheap insurance).
_ = json
