"""Priority list tools — generate a ranked daily focus list for the realtor.

The agent calls generate_priority_list after its main work is done.
The result is stored as a space memory so the UI can surface it without
triggering another agent run.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from memory.store import save_memory
from security.context import AgentContext
from tools.streaming import publish_event


@function_tool
async def generate_priority_list(
    ctx: RunContextWrapper[AgentContext],
    top_n: int = 5,
) -> dict[str, Any]:
    """Generate a ranked list of contacts the realtor should focus on today.

    Scores each contact by urgency signals:
    +30  overdue follow-up (followUpAt is in the past)
    +20  high lead score (>= 70)
    +15  recent inbound message (lastContactedAt within 48h — they reached out)
    +10  active goal exists for this contact
    +8   tour scheduled or recently completed (type == 'TOUR')
    -10  contacted very recently (lastContactedAt within 24h)
    -20  no contact info (no email AND no phone)

    Returns the top top_n contacts with a brief reasoning string each.
    Stores the result as a space-level memory for the UI to read.
    """
    space_id = ctx.context.space_id
    db = await supabase()
    now = datetime.now(timezone.utc)

    contacts_res = await (
        db.table("Contact")
        .select("id,name,email,phone,leadScore,followUpAt,lastContactedAt,type,leadType")
        .eq("spaceId", space_id)
        .execute()
    )
    contacts = contacts_res.data or []

    # Load active goals (contactId → bool)
    goals_res = await (
        db.table("AgentGoal")
        .select("contactId")
        .eq("spaceId", space_id)
        .eq("status", "active")
        .execute()
    )
    contacts_with_goals = {g["contactId"] for g in (goals_res.data or []) if g.get("contactId")}

    scored: list[dict[str, Any]] = []
    for c in contacts:
        cid = c.get("id")
        name = c.get("name", "Unknown")
        score = 0
        reasons: list[str] = []

        # Overdue follow-up
        follow_up_at = c.get("followUpAt")
        if follow_up_at:
            try:
                fua = datetime.fromisoformat(follow_up_at.replace("Z", "+00:00"))
                if fua < now:
                    score += 30
                    reasons.append("follow-up overdue")
            except ValueError:
                pass

        # High lead score
        lead_score = c.get("leadScore") or 0
        if lead_score >= 70:
            score += 20
            reasons.append(f"hot lead ({lead_score}/100)")
        elif lead_score >= 50:
            score += 8
            reasons.append(f"warm lead ({lead_score}/100)")

        # Recent inbound (they reached out to us)
        last_contacted = c.get("lastContactedAt")
        if last_contacted:
            try:
                lca = datetime.fromisoformat(last_contacted.replace("Z", "+00:00"))
                hours_ago = (now - lca).total_seconds() / 3600
                if 0 < hours_ago <= 24:
                    score -= 10  # just contacted by us
                elif hours_ago <= 48:
                    score += 15
                    reasons.append("replied recently")
            except ValueError:
                pass

        # Active goal
        if cid in contacts_with_goals:
            score += 10
            reasons.append("active goal")

        # Tour contact
        if c.get("type") == "TOUR":
            score += 8
            reasons.append("tour stage")

        # No contact info — skip
        if not c.get("email") and not c.get("phone"):
            score -= 20

        if score > 0 or reasons:
            scored.append({
                "contactId": cid,
                "name": name,
                "score": score,
                "leadScore": lead_score,
                "reasons": reasons,
                "leadType": c.get("leadType"),
                "email": c.get("email"),
                "phone": c.get("phone"),
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:max(1, min(10, top_n))]

    # Build readable reason strings
    items = []
    for item in top:
        reason_str = ", ".join(item["reasons"]) if item["reasons"] else "needs attention"
        items.append({
            "contactId": item["contactId"],
            "name": item["name"],
            "reason": reason_str.capitalize() + ".",
            "leadScore": item["leadScore"],
            "leadType": item["leadType"],
            "hasEmail": bool(item.get("email")),
            "hasPhone": bool(item.get("phone")),
        })

    result = {
        "generatedAt": now.isoformat(),
        "items": items,
        "totalEvaluated": len(contacts),
    }

    # Store as space memory so the UI can read it without re-running the agent
    summary = f"Today's focus: {', '.join(i['name'] for i in items[:3])}" if items else "No priority contacts today."
    await save_memory(
        space_id=space_id,
        entity_type="space",
        entity_id=space_id,
        memory_type="observation",
        content=f"PRIORITY_LIST:{json.dumps(result)}",
        importance=0.9,
    )

    await publish_event(
        ctx.context,
        "action",
        f"Priority list updated: {len(items)} contact(s) to focus on today",
        agent_type=ctx.context.current_agent_type,
        metadata={"count": len(items)},
    )

    return result


@function_tool
async def mark_contact_warm(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    signal: str,
) -> dict[str, Any]:
    """Flag a previously cold contact as newly warm — resurfaces them in the priority list.

    signal: brief description of what changed ('replied to SMS', 'viewed listing', etc.)
    """
    space_id = ctx.context.space_id
    db = await supabase()

    check = await (
        db.table("Contact")
        .select("id,name,leadScore")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    contact = check.data[0]
    now = datetime.now(timezone.utc).isoformat()

    # Boost lead score on re-engagement signal
    current_score = contact.get("leadScore") or 40
    new_score = min(100, current_score + 12)

    await (
        db.table("Contact")
        .update({"leadScore": new_score, "updatedAt": now})
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )

    await db.table("ContactActivity").insert({
        "id": str(uuid.uuid4()),
        "contactId": contact_id,
        "spaceId": space_id,
        "type": "note",
        "content": f"[Agent] Contact re-engaged: {signal}",
        "metadata": {"source": "agent", "signal": signal, "agentRunId": ctx.context.run_id},
    }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"{contact['name']} just re-engaged ({signal}) — added to today's priority list",
        agent_type=ctx.context.current_agent_type,
        metadata={"contactId": contact_id},
    )

    return {"flagged": True, "contactId": contact_id, "scoreBoost": new_score - current_score}
