"""Outcome tools — record and query the results of outreach actions.

When an agent run processes inbound messages or learns the outcome of a
previous outreach, it calls record_outcome to close the feedback loop.
Lead scores are adjusted based on outcomes so agents learn what works.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event


VALID_OUTCOMES = {"responded", "no_response", "bounced", "unsubscribed", "meeting_booked"}


@function_tool
async def record_outcome(
    ctx: RunContextWrapper[AgentContext],
    draft_id: str,
    outcome: str,
    notes: str | None = None,
) -> dict[str, Any]:
    """Record the outcome of a previously sent or approved draft.

    outcome: 'responded' | 'no_response' | 'bounced' | 'unsubscribed' | 'meeting_booked'
    notes: optional free-text notes about the outcome.

    Adjusts the contact's lead score:
    - responded: +5
    - meeting_booked: +15
    - no_response: -2
    - bounced: -5
    - unsubscribed: -20

    Returns: { "updated": true, "draftId": str, "outcome": str, "scoreAdjustment": int }
    """
    space_id = ctx.context.space_id
    db = await supabase()

    if outcome not in VALID_OUTCOMES:
        return {"error": f"Invalid outcome. Must be one of {VALID_OUTCOMES}"}

    # Validate draft belongs to this space
    draft_check = await (
        db.table("AgentDraft")
        .select("id,contactId,outcome")
        .eq("id", draft_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not draft_check.data:
        return {"error": "Draft not found in space"}

    draft = draft_check.data[0]
    contact_id = draft.get("contactId")

    now = datetime.now(timezone.utc).isoformat()

    # Update the draft outcome
    draft_update: dict[str, Any] = {"outcome": outcome, "outcomeDetectedAt": now, "updatedAt": now}
    await (
        db.table("AgentDraft")
        .update(draft_update)
        .eq("id", draft_id)
        .eq("spaceId", space_id)
        .execute()
    )

    # Adjust lead score based on outcome
    score_delta = {
        "responded": 5,
        "meeting_booked": 15,
        "no_response": -2,
        "bounced": -5,
        "unsubscribed": -20,
    }[outcome]

    score_adjustment = 0
    if contact_id and score_delta != 0:
        contact_check = await (
            db.table("Contact")
            .select("id,leadScore")
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .execute()
        )
        if contact_check.data:
            current_score = contact_check.data[0].get("leadScore") or 50
            new_score = max(0, min(100, current_score + score_delta))
            score_adjustment = new_score - current_score
            if score_adjustment != 0:
                await (
                    db.table("Contact")
                    .update({"leadScore": new_score, "updatedAt": now})
                    .eq("id", contact_id)
                    .eq("spaceId", space_id)
                    .execute()
                )

            # Log outcome as ContactActivity if notes or meaningful outcome
            if notes or outcome in ("responded", "meeting_booked"):
                log_content = f"[Outcome] {outcome.replace('_', ' ').title()}"
                if notes:
                    log_content += f": {notes[:200]}"
                await db.table("ContactActivity").insert({
                    "id": str(uuid.uuid4()),
                    "contactId": contact_id,
                    "spaceId": space_id,
                    "type": "note",
                    "content": log_content,
                    "metadata": {
                        "source": "agent",
                        "draftId": draft_id,
                        "outcome": outcome,
                        "scoreAdjustment": score_adjustment,
                        "agentRunId": ctx.context.run_id,
                    },
                }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Outcome recorded: {outcome.replace('_', ' ')} (score {score_adjustment:+d})",
        agent_type=ctx.context.current_agent_type,
        metadata={"draftId": draft_id, "outcome": outcome, "scoreAdjustment": score_adjustment},
    )

    return {
        "updated": True,
        "draftId": draft_id,
        "outcome": outcome,
        "scoreAdjustment": score_adjustment,
    }


@function_tool
async def get_outcome_summary(
    ctx: RunContextWrapper[AgentContext],
    days: int = 30,
) -> dict[str, Any]:
    """Get a summary of outreach outcomes over the past N days.

    Returns counts by outcome type so agents can learn what's working.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    since = (datetime.now(timezone.utc) - timedelta(days=max(1, min(90, days)))).isoformat()

    result = await (
        db.table("AgentDraft")
        .select("outcome")
        .eq("spaceId", space_id)
        .not_.is_("outcome", "null")
        .gte("outcomeDetectedAt", since)
        .execute()
    )

    counts: dict[str, int] = {}
    for row in (result.data or []):
        o = row.get("outcome", "unknown")
        counts[o] = counts.get(o, 0) + 1

    total = sum(counts.values())
    response_rate = round(
        (counts.get("responded", 0) + counts.get("meeting_booked", 0)) / total * 100, 1
    ) if total > 0 else 0.0

    return {
        "period_days": days,
        "total_outcomes": total,
        "counts": counts,
        "response_rate_pct": response_rate,
    }
