"""Read-only contact tools — spaceId always injected from AgentContext."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext

_CLIP = 300  # max chars for any free-text field returned to the agent


def _trim(value: Any, max_chars: int = _CLIP) -> Any:
    """Truncate a string field so tool results don't bloat the context window."""
    if isinstance(value, str) and len(value) > max_chars:
        return value[:max_chars - 1] + "…"
    return value


@function_tool
async def list_contacts(
    ctx: RunContextWrapper[AgentContext],
    limit: int = 20,
    lead_type: str | None = None,
    overdue_follow_up_only: bool = False,
) -> list[dict[str, Any]]:
    """List contacts in the space. Optionally filter by leadType or overdue follow-ups."""
    space_id = ctx.context.space_id
    db = await supabase()

    query = (
        db.table("Contact")
        .select("id,name,email,phone,leadType,leadScore,scoreLabel,followUpAt,lastContactedAt,type,tags,createdAt")
        .eq("spaceId", space_id)
        .order("createdAt", desc=True)
        .limit(limit)
    )

    if lead_type:
        query = query.eq("leadType", lead_type)

    if overdue_follow_up_only:
        now_iso = datetime.now(timezone.utc).isoformat()
        query = query.lte("followUpAt", now_iso).not_.is_("followUpAt", "null")

    result = await query.execute()
    return result.data or []


@function_tool
async def get_contact(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
) -> dict[str, Any] | None:
    """Fetch details for a single contact by ID.

    Large blobs (applicationData, formConfigSnapshot, scoreDetails) are
    excluded — they can exceed 10 KB and are not needed for agent decisions.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    result = await (
        db.table("Contact")
        .select(
            "id,name,email,phone,leadType,leadScore,scoreLabel,scoringStatus,"
            "scoreSummary,followUpAt,lastContactedAt,type,tags,status,"
            "budget,preferences,notes,createdAt,updatedAt"
        )
        .eq("id", contact_id)
        .eq("spaceId", space_id)  # tenant isolation — never skip this
        .single()
        .execute()
    )
    if not result.data:
        return None
    row = result.data
    # Truncate free-text fields that can be arbitrarily long
    for field in ("scoreSummary", "preferences", "notes"):
        if field in row:
            row[field] = _trim(row[field])
    return row


@function_tool
async def get_contact_activity(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Return the most recent activity entries for a contact."""
    space_id = ctx.context.space_id
    db = await supabase()

    result = await (
        db.table("ContactActivity")
        .select("id,type,content,createdAt")  # metadata omitted — often large JSON
        .eq("contactId", contact_id)
        .eq("spaceId", space_id)
        .order("createdAt", desc=True)
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    for row in rows:
        row["content"] = _trim(row.get("content"))
    return rows


@function_tool
async def get_contacts_without_followup(
    ctx: RunContextWrapper[AgentContext],
    days_since_contact: int = 7,
) -> list[dict[str, Any]]:
    """Return active contacts not contacted in N days and with no follow-up scheduled."""
    space_id = ctx.context.space_id
    db = await supabase()

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_since_contact)).isoformat()

    result = await (
        db.table("Contact")
        .select("id,name,email,phone,leadType,leadScore,followUpAt,lastContactedAt,type")
        .eq("spaceId", space_id)
        .eq("type", "QUALIFICATION")
        .is_("followUpAt", "null")
        .or_(f"lastContactedAt.lt.{cutoff},lastContactedAt.is.null")
        .order("createdAt", desc=True)
        .limit(50)
        .execute()
    )
    return result.data or []
