"""Deal tools — find and update. spaceId always from AgentContext."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event

_CLIP = 300


def _trim(value: Any, max_chars: int = _CLIP) -> Any:
    if isinstance(value, str) and len(value) > max_chars:
        return value[:max_chars - 1] + "…"
    return value


@function_tool
async def find_deals(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str | None = None,
    status: str = "active",
    stalled_days: int | None = None,
    closing_within_days: int | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Find deals in this space. One tool, many filters.

    deal_id: return that one deal (returns [] if not found / cross-space).
    status: 'active' | 'won' | 'lost' | 'on_hold' (default 'active').
    stalled_days: e.g. 14 → only deals not updated in 14+ days.
    closing_within_days: e.g. 14 → only deals with closeDate in the next 14 days.
    limit: 1-50.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    limit = max(1, min(50, limit))

    if deal_id:
        result = await (
            db.table("Deal")
            .select(
                "id,title,value,status,priority,closeDate,stageId,probability,"
                "commissionRate,followUpAt,address,description,createdAt,updatedAt"
            )
            .eq("id", deal_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        if not result.data:
            return []
        row = result.data
        row["description"] = _trim(row.get("description"))
        row["address"] = _trim(row.get("address"))
        return [row]

    query = (
        db.table("Deal")
        .select(
            "id,title,value,status,priority,closeDate,stageId,probability,"
            "commissionRate,followUpAt,createdAt,updatedAt"
        )
        .eq("spaceId", space_id)
        .eq("status", status)
        .limit(limit)
    )

    now = datetime.now(timezone.utc)

    if stalled_days is not None and stalled_days > 0:
        cutoff = (now - timedelta(days=stalled_days)).isoformat()
        query = query.lte("updatedAt", cutoff).order("updatedAt")
    elif closing_within_days is not None and closing_within_days > 0:
        today = now.date().isoformat()
        ahead = (now + timedelta(days=closing_within_days)).date().isoformat()
        query = (
            query.lte("closeDate", ahead)
            .gte("closeDate", today)
            .not_.is_("closeDate", "null")
            .order("closeDate")
        )
    else:
        query = query.order("createdAt", desc=True)

    result = await query.execute()
    return result.data or []


@function_tool
async def update_deal(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    reason: str,
    probability: int | None = None,
    follow_up_date: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    """Update a deal. Pass only the fields you want to change.

    probability: 0–100 close probability.
    follow_up_date: ISO date string for next follow-up.
    note: short agent note (<1000 chars) prepended to deal description with date.
    reason: required short string; logged on the activity row.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    check = await (
        db.table("Deal")
        .select("id,title,probability,description")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        return {"error": "Deal not found in space"}
    deal = check.data
    deal_title = deal.get("title") or deal_id[:8]

    update: dict[str, Any] = {}
    activities: list[dict[str, Any]] = []
    summary_parts: list[str] = []

    if probability is not None:
        if not (0 <= probability <= 100):
            return {"error": "probability must be between 0 and 100"}
        old_prob = deal.get("probability")
        if old_prob != probability:
            update["probability"] = probability
            from_str = f"{old_prob}%" if old_prob is not None else "—"
            activities.append({
                "type": "note",
                "content": f"[Agent] Probability {from_str} → {probability}%. {reason}",
                "metadata": {"source": "agent", "oldProbability": old_prob, "newProbability": probability},
            })
            summary_parts.append(f"prob {probability}%")

    if follow_up_date:
        update["followUpAt"] = follow_up_date
        activities.append({
            "type": "follow_up",
            "content": f"[Agent] Follow-up scheduled: {reason}",
            "metadata": {"source": "agent", "followUpDate": follow_up_date},
        })
        summary_parts.append(f"follow-up {follow_up_date}")

    if note:
        if len(note) > 1000:
            return {"error": "note must be under 1000 characters"}
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        prefix = f"[Agent {date_str}] {note}\n\n"
        existing = deal.get("description") or ""
        update["description"] = (prefix + existing).strip()[:5000]
        summary_parts.append("note")

    if update:
        update["updatedAt"] = now
        await (
            db.table("Deal")
            .update(update)
            .eq("id", deal_id)
            .eq("spaceId", space_id)
            .execute()
        )

    for act in activities:
        await db.table("DealActivity").insert({
            "id": str(uuid.uuid4()),
            "dealId": deal_id,
            "spaceId": space_id,
            "type": act["type"],
            "content": act["content"],
            "metadata": {**act["metadata"], "agentRunId": ctx.context.run_id},
        }).execute()

    if summary_parts:
        await publish_event(
            ctx.context,
            "action",
            f"Updated deal '{deal_title}': " + ", ".join(summary_parts),
            agent_type=ctx.context.current_agent_type,
            metadata={"dealId": deal_id},
        )

    return {"ok": True, "dealId": deal_id, "changes": summary_parts or ["no-op"]}
