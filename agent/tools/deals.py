"""Deal read tools — spaceId always injected from AgentContext."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext

_CLIP = 300


def _trim(value: Any, max_chars: int = _CLIP) -> Any:
    if isinstance(value, str) and len(value) > max_chars:
        return value[:max_chars - 1] + "…"
    return value


@function_tool
async def list_deals(
    ctx: RunContextWrapper[AgentContext],
    status: str = "active",
    limit: int = 30,
) -> list[dict[str, Any]]:
    """List deals in the space filtered by status."""
    space_id = ctx.context.space_id
    db = await supabase()

    result = await (
        db.table("Deal")
        .select("id,title,value,status,priority,closeDate,stageId,probability,commissionRate,followUpAt,createdAt,updatedAt")
        .eq("spaceId", space_id)
        .eq("status", status)
        .order("createdAt", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


@function_tool
async def get_deal(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
) -> dict[str, Any] | None:
    """Fetch details for a single deal by ID.

    milestones are excluded (large JSON array not needed for agent decisions).
    """
    space_id = ctx.context.space_id
    db = await supabase()

    result = await (
        db.table("Deal")
        .select(
            "id,title,value,status,priority,closeDate,stageId,probability,"
            "commissionRate,followUpAt,address,description,createdAt,updatedAt"
        )
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .single()
        .execute()
    )
    if not result.data:
        return None
    row = result.data
    row["description"] = _trim(row.get("description"))
    row["address"] = _trim(row.get("address"))
    return row


@function_tool
async def get_deals_closing_soon(
    ctx: RunContextWrapper[AgentContext],
    days_ahead: int = 14,
) -> list[dict[str, Any]]:
    """Return active deals with a close date in the next N days."""
    space_id = ctx.context.space_id
    db = await supabase()

    now = datetime.now(timezone.utc)
    cutoff = (now + timedelta(days=days_ahead)).date().isoformat()

    result = await (
        db.table("Deal")
        .select("id,title,value,closeDate,stageId,probability,commissionRate,followUpAt")
        .eq("spaceId", space_id)
        .eq("status", "active")
        .lte("closeDate", cutoff)
        .not_.is_("closeDate", "null")
        .order("closeDate")
        .limit(20)
        .execute()
    )
    return result.data or []


@function_tool
async def get_stalled_deals(
    ctx: RunContextWrapper[AgentContext],
    stalled_days: int = 14,
) -> list[dict[str, Any]]:
    """Return active deals that haven't been updated in N days."""
    space_id = ctx.context.space_id
    db = await supabase()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=stalled_days)).isoformat()

    result = await (
        db.table("Deal")
        .select("id,title,value,closeDate,stageId,probability,updatedAt,followUpAt")
        .eq("spaceId", space_id)
        .eq("status", "active")
        .lte("updatedAt", cutoff)
        .order("updatedAt")
        .limit(20)
        .execute()
    )
    return result.data or []
