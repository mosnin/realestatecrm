"""Direct write tools for the background agent.

These tools let specialist agents update CRM records without going through the
user-facing API routes (which require Clerk auth). They write via the Supabase
service role client — the same pattern as the activity tools (activities.py).

Security:
  - spaceId is always injected from AgentContext, never accepted as a parameter
  - Every write first validates that the target entity belongs to the space
  - Only a narrow set of fields can be changed (no id, spaceId, billing fields)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event


# ── Contact writes ─────────────────────────────────────────────────────────────

@function_tool
async def update_contact_type(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    new_type: str,
    reason: str,
) -> dict[str, Any]:
    """Advance a contact's pipeline type.

    new_type must be one of: 'QUALIFICATION' | 'TOUR' | 'APPLICATION'
    Use this when a lead's status has genuinely changed — e.g. after confirming
    they've submitted an application or attended a tour.

    Logs a ContactActivity entry so the realtor can see what changed and why.
    """
    valid_types = {"QUALIFICATION", "TOUR", "APPLICATION"}
    if new_type not in valid_types:
        return {"error": f"new_type must be one of {valid_types}"}

    space_id = ctx.context.space_id
    db = await supabase()

    check = await (
        db.table("Contact")
        .select("id,name,type")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    contact = check.data[0]
    old_type = contact.get("type", "QUALIFICATION")

    if old_type == new_type:
        return {"ok": True, "unchanged": True, "type": new_type}

    now = datetime.now(timezone.utc).isoformat()
    await (
        db.table("Contact")
        .update({"type": new_type, "stageChangedAt": now, "updatedAt": now})
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )

    await db.table("ContactActivity").insert({
        "id": str(uuid.uuid4()),
        "contactId": contact_id,
        "spaceId": space_id,
        "type": "note",
        "content": f"[Agent] Pipeline stage updated: {old_type} → {new_type}. {reason}",
        "metadata": {
            "source": "agent",
            "agentRunId": ctx.context.run_id,
            "oldType": old_type,
            "newType": new_type,
        },
    }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Updated {contact.get('name', 'contact')} pipeline type: {old_type} → {new_type}",
        agent_type="write",
    )

    return {"ok": True, "contactId": contact_id, "from": old_type, "to": new_type}


@function_tool
async def tag_contact(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    tags_to_add: list[str],
    reason: str,
) -> dict[str, Any]:
    """Add tags to a contact without replacing existing ones.

    Use to label leads with agent-surfaced context like 'high_intent',
    'price_sensitive', 'needs_follow_up', 'stalled', etc.
    Max 5 tags per call; tags are capped at 60 chars each.
    """
    if not tags_to_add:
        return {"error": "tags_to_add must not be empty"}
    if len(tags_to_add) > 5:
        return {"error": "Maximum 5 tags per call"}

    space_id = ctx.context.space_id
    db = await supabase()

    check = await (
        db.table("Contact")
        .select("id,name,tags")
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Contact not found in space"}

    contact = check.data[0]
    existing_tags: list[str] = contact.get("tags") or []

    # Normalise and deduplicate
    clean_tags = [t.strip()[:60] for t in tags_to_add if t.strip()]
    merged = list(dict.fromkeys(existing_tags + clean_tags))  # preserves order, dedupes

    await (
        db.table("Contact")
        .update({"tags": merged, "updatedAt": datetime.now(timezone.utc).isoformat()})
        .eq("id", contact_id)
        .eq("spaceId", space_id)
        .execute()
    )

    await db.table("ContactActivity").insert({
        "id": str(uuid.uuid4()),
        "contactId": contact_id,
        "spaceId": space_id,
        "type": "note",
        "content": f"[Agent] Tags added: {', '.join(clean_tags)}. {reason}",
        "metadata": {"source": "agent", "agentRunId": ctx.context.run_id, "addedTags": clean_tags},
    }).execute()

    return {"ok": True, "contactId": contact_id, "addedTags": clean_tags, "allTags": merged}


# ── Deal writes ────────────────────────────────────────────────────────────────

@function_tool
async def update_deal_probability(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    probability: int,
    reason: str,
) -> dict[str, Any]:
    """Update the close probability of a deal (0–100).

    Use this when signals suggest a deal is more or less likely to close —
    e.g. a long stall, an approaching close date, or a re-engaged buyer.
    Logs a DealActivity note so the realtor can see the reasoning.
    """
    if not (0 <= probability <= 100):
        return {"error": "probability must be between 0 and 100"}

    space_id = ctx.context.space_id
    db = await supabase()

    check = await (
        db.table("Deal")
        .select("id,title,probability")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Deal not found in space"}

    deal = check.data[0]
    old_probability = deal.get("probability")

    await (
        db.table("Deal")
        .update({"probability": probability, "updatedAt": datetime.now(timezone.utc).isoformat()})
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .execute()
    )

    await db.table("DealActivity").insert({
        "id": str(uuid.uuid4()),
        "dealId": deal_id,
        "spaceId": space_id,
        "type": "note",
        "content": (
            f"[Agent] Probability updated: {old_probability}% → {probability}%. {reason}"
            if old_probability is not None
            else f"[Agent] Probability set to {probability}%. {reason}"
        ),
        "metadata": {
            "source": "agent",
            "agentRunId": ctx.context.run_id,
            "oldProbability": old_probability,
            "newProbability": probability,
        },
    }).execute()

    await publish_event(
        ctx.context,
        "action",
        f"Deal '{deal.get('title', deal_id[:8])}' probability → {probability}%",
        agent_type="write",
    )

    return {"ok": True, "dealId": deal_id, "from": old_probability, "to": probability}


@function_tool
async def update_deal_notes(
    ctx: RunContextWrapper[AgentContext],
    deal_id: str,
    note: str,
) -> dict[str, Any]:
    """Append a timestamped agent note to a deal's description field.

    Use to surface intelligence the agent discovered — e.g. "Buyer went quiet
    after rate increase on 2026-04-15. Stall likely rate-related."
    Notes are prepended so the most recent appears first.
    """
    if len(note) > 1000:
        return {"error": "Note must be under 1000 characters"}

    space_id = ctx.context.space_id
    db = await supabase()

    check = await (
        db.table("Deal")
        .select("id,title,description")
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .execute()
    )
    if not check.data:
        return {"error": "Deal not found in space"}

    deal = check.data[0]
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prefix = f"[Agent {date_str}] {note}\n\n"
    existing = deal.get("description") or ""
    updated_description = (prefix + existing).strip()[:5000]

    await (
        db.table("Deal")
        .update({"description": updated_description, "updatedAt": datetime.now(timezone.utc).isoformat()})
        .eq("id", deal_id)
        .eq("spaceId", space_id)
        .execute()
    )

    return {"ok": True, "dealId": deal_id, "noteAdded": note[:100]}
