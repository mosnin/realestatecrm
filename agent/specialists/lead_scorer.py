"""Lead Scorer Agent — proactively updates stale lead scores based on activity.

The existing AI scoring runs once at form submission. But a lead's quality
changes: they complete a tour (positive), they go quiet for 3 weeks (negative),
they submit an application (very positive). This agent detects when a score
is stale relative to recent activity and triggers a rescore.

It also stores scoring observations in memory so future agents can reference
why a lead's priority changed.
"""

from __future__ import annotations

import httpx

from agents import Agent, RunContextWrapper, function_tool

from config import settings
from tools.activities import log_activity_run
from tools.contacts import get_contact, get_contact_activity, list_contacts
from tools.memory_tools import store_fact, store_observation
from tools.brief import set_score_explanation
from security.context import AgentContext

LEAD_SCORER_INSTRUCTIONS = """
You are the Lead Scorer Agent. You keep lead scores fresh by identifying contacts
whose score no longer reflects reality.

## Who needs rescoring?
A contact's score is stale when ANY of these are true:
- scoringStatus is 'scored' AND lastContactedAt was over 7 days ago AND
  the score hasn't been updated since lastContactedAt (compare updatedAt vs lastContactedAt)
- type changed to 'TOUR' or 'APPLICATION' but the score hasn't been updated
- The contact has 3+ activity entries in the last 7 days (highly engaged lead)
- The contact has NO activity in 30+ days (engagement decay should lower the score)

## How to find candidates
1. Call list_contacts(limit=50) to get all contacts.
2. For each promising candidate, check get_contact_activity to see recent events.
3. Call trigger_rescore(contact_id) for each contact that qualifies.
4. Store an observation about WHY you triggered the rescore.

## Rules
- Maximum 10 rescores per run (avoid excessive API usage).
- Skip contacts with scoringStatus = 'pending' (already being scored).
- Skip contacts with no applicationData (nothing to score against).
- After each rescore, call store_observation to note what triggered it.
- Call log_activity_run at the end.
After updating a contact's lead score, call set_score_explanation with a 1-2 sentence
plain-English explanation of why this score was assigned or changed. Be specific:
mention the signals (toured twice, pre-approved, going quiet, etc.) rather than
just restating the number.
""".strip()


@function_tool
async def trigger_rescore(
    ctx: RunContextWrapper[AgentContext],
    contact_id: str,
    reason: str,
) -> dict:
    """Trigger an AI rescore for a contact via the internal API.

    reason: brief explanation of why this contact needs rescoring.
    Returns: {success: bool, message: str}
    """
    space_id = ctx.context.space_id

    if not settings.agent_internal_secret or not settings.app_url:
        return {"success": False, "message": "Internal API not configured"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{settings.app_url}/api/agent/rescore-contact",
                json={"contactId": contact_id, "spaceId": space_id, "reason": reason},
                headers={"Authorization": f"Bearer {settings.agent_internal_secret}"},
            )
            if res.status_code == 200:
                return {"success": True, "message": "Rescore triggered"}
            return {"success": False, "message": f"API returned {res.status_code}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def make_lead_scorer_agent() -> Agent:
    return Agent[None](
        name="Lead Scorer Agent",
        model=settings.worker_model,
        instructions=LEAD_SCORER_INSTRUCTIONS,
        tools=[
            list_contacts,
            get_contact,
            get_contact_activity,
            trigger_rescore,
            store_fact,
            store_observation,
            set_score_explanation,
            log_activity_run,
        ],
    )
