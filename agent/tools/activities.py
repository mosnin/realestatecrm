"""Run-level audit logging.

The end-of-run summary that lands in AgentActivityLog. Other "log this"
moves have been folded into the tools that cause them — follow-ups are
written by update_contact/update_deal, observations by store_memory.
"""

from __future__ import annotations

import uuid
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext


@function_tool
async def log_activity_run(
    ctx: RunContextWrapper[AgentContext],
    action_type: str,
    outcome: str,
    reasoning: str,
    contact_id: str | None = None,
    deal_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Persist an entry to AgentActivityLog so the realtor has an audit trail.

    Call once per substantive run. Skip for trivial lookups.

    action_type: short label, e.g. 'sweep', 'tour_followup', 'lead_qualification'.
    outcome: 'completed' | 'queued_for_approval' | 'suggested' | 'failed'.
    reasoning: 1-2 sentences describing what was decided and why.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    entry_id = str(uuid.uuid4())
    await db.table("AgentActivityLog").insert({
        "id": entry_id,
        "spaceId": space_id,
        "runId": ctx.context.run_id,
        "agentType": ctx.context.current_agent_type,
        "actionType": action_type,
        "reasoning": reasoning,
        "outcome": outcome,
        "relatedContactId": contact_id,
        "relatedDealId": deal_id,
        "metadata": metadata or {},
    }).execute()
    return entry_id
