"""Deal tools — find and update. spaceId always from AgentContext."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.activities import persist_log
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


@function_tool
async def advance_deal_stage(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    reason: str,
    target_stage_name: str | None = None,
    target_stage_id: str | None = None,
    new_probability: int | None = None,
) -> dict[str, Any]:
    """Move a deal to a different stage in the workspace pipeline.

    Pass exactly one of:
      target_stage_name — case-insensitive match on a DealStage in this
                          workspace, e.g. "Under Contract", "Closed Won".
      target_stage_id   — when you already have the stage id.

    Optional:
      new_probability — 0-100. Set when the stage move warrants a
                        probability change (e.g. "Under Contract" → 80).

    reason: required short string; logs a DealActivity row so the realtor
    can audit who moved the deal and why.
    """
    if not target_stage_name and not target_stage_id:
        return {"error": "Pass either target_stage_name or target_stage_id"}
    if new_probability is not None and not (0 <= new_probability <= 100):
        return {"error": "new_probability must be 0-100"}

    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc).isoformat()

    deal_check = await (
        db.table("Deal")
        .select("id,title,stageId,probability")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not deal_check.data:
        return {"error": "Deal not found in space"}
    deal = deal_check.data
    deal_title = deal.get("title") or deal_id[:8]

    # Resolve the target stage in this workspace
    if target_stage_id:
        stage_check = await (
            db.table("DealStage")
            .select("id,name")
            .eq("id", target_stage_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
    else:
        # Case-insensitive match by name
        stages_res = await (
            db.table("DealStage")
            .select("id,name")
            .eq("spaceId", space_id)
            .ilike("name", target_stage_name or "")
            .limit(1)
            .execute()
        )
        stage_check = type("R", (), {"data": (stages_res.data[0] if stages_res.data else None)})

    if not stage_check.data:
        return {"error": "Target stage not found in workspace pipeline"}

    new_stage_id = stage_check.data["id"]
    new_stage_name = stage_check.data["name"]

    if deal.get("stageId") == new_stage_id and new_probability is None:
        return {"ok": True, "unchanged": True, "stage": new_stage_name}

    update: dict[str, Any] = {"stageId": new_stage_id, "updatedAt": now}
    if new_probability is not None:
        update["probability"] = new_probability

    await (
        db.table("Deal")
        .update(update)
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .execute()
    )

    activity_content = f"[Agent] Stage → {new_stage_name}. {reason}"
    if new_probability is not None:
        activity_content += f" (probability {new_probability}%)"

    await db.table("DealActivity").insert({
        "id": str(uuid.uuid4()),
        "dealId": deal_id,
        "spaceId": space_id,
        "type": "note",
        "content": activity_content,
        "metadata": {
            "source": "agent",
            "agentRunId": ctx.context.run_id,
            "oldStageId": deal.get("stageId"),
            "newStageId": new_stage_id,
            "newProbability": new_probability,
        },
    }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Deal '{deal_title}' → {new_stage_name}",
        agent_type=ctx.context.current_agent_type,
        metadata={"dealId": deal_id, "stageId": new_stage_id},
    )

    try:
        await persist_log(
            ctx.context,
            action_type="deal_stage_advanced",
            outcome="completed",
            reasoning=f"{deal_title} → {new_stage_name}. {reason}",
            deal_id=deal_id,
        )
    except Exception:
        pass

    return {
        "ok": True,
        "dealId": deal_id,
        "stage": new_stage_name,
        "probability": new_probability,
    }


@function_tool
async def request_deal_review(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    reason: str,
) -> dict[str, Any]:
    """Flag a deal up to the brokerage for human review.

    Use when something looks off — a stalled high-value deal, an unusual
    commission split, a client raising legal concerns. Creates a
    DealReviewRequest visible to brokers in the brokerage.

    Only works for spaces inside a brokerage. Solo realtors get an error.

    reason: required, 10+ chars. Surfaces verbatim to the broker.
    """
    if not reason or len(reason.strip()) < 10:
        return {"error": "reason must be at least 10 characters"}

    space_id = ctx.context.space_id
    db = await supabase()

    deal_check = await (
        db.table("Deal")
        .select("id,title")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .maybe_single()
        .execute()
    )
    if not deal_check.data:
        return {"error": "Deal not found in space"}
    deal_title = deal_check.data.get("title") or deal_id[:8]

    space_check = await (
        db.table("Space")
        .select("id,ownerId,brokerageId")
        .eq("id", space_id)
        .maybe_single()
        .execute()
    )
    if not space_check.data or not space_check.data.get("brokerageId"):
        return {"error": "Space is not part of a brokerage — review requests need a broker"}

    review_id = str(uuid.uuid4())
    await db.table("DealReviewRequest").insert({
        "id": review_id,
        "dealId": deal_id,
        "requestingUserId": space_check.data["ownerId"],
        "brokerageId": space_check.data["brokerageId"],
        "status": "open",
        "reason": reason.strip(),
    }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Review requested on '{deal_title}'",
        agent_type=ctx.context.current_agent_type,
        metadata={"dealId": deal_id, "reviewId": review_id},
    )

    try:
        await persist_log(
            ctx.context,
            action_type="review_requested",
            outcome="queued_for_approval",
            reasoning=reason.strip()[:500],
            deal_id=deal_id,
        )
    except Exception:
        pass

    return {
        "ok": True,
        "reviewId": review_id,
        "dealId": deal_id,
        "status": "open",
    }
