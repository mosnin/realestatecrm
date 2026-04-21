"""Coordinator Agent — surveys the workspace and delegates to specialist agents via handoffs.

Instead of running all enabled agents blindly on every heartbeat, the Coordinator
reads the workspace state once and routes work only to the specialists that have
a real signal to act on.

Handoff flow:
  CoordinatorAgent
    → survey_workspace()            ← lightweight DB snapshot
    → handoff lead_nurture          ← if stale leads or new_lead trigger
    → handoff deal_sentinel         ← if stalled/at-risk deals
    → handoff long_term_nurture     ← if cold-lead pool is meaningful
    → handoff lead_scorer           ← if tour/application trigger or mass decay
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from agents import Agent, RunContextWrapper, function_tool, handoff

from config import settings
from db import supabase
from security.context import AgentContext
from tools.activities import log_activity_run
from tools.streaming import publish_event

COORDINATOR_INSTRUCTIONS = """
You are the Chippi Coordinator for a real estate CRM. You are the intelligence
layer that decides WHICH specialist agents to activate and routes each one with
a focused brief. You do not perform CRM actions yourself.

## Workflow
1. Call survey_workspace() to get a snapshot of the workspace.
2. Based on the counts and active triggers, decide which specialists to activate.
3. Hand off to each relevant specialist in the prescribed order, passing a specific
   brief that tells them exactly what signals you found.
4. After all handoffs complete, you are done.
5. If nothing needs attention (all counts are 0 and no triggers), call log_activity_run
   with agent_type="coordinator", action_type="survey", outcome="completed",
   reasoning="Workspace healthy — no agent activation needed." and stop.

## Routing rules

Activate lead_nurture_agent when:
- stale_leads > 0  (contacts inactive 7+ days with no follow-up scheduled)
- OR a "new_lead" trigger is active

Activate deal_sentinel_agent when:
- stalled_deals > 0  (active deals with no update in 14+ days)
- OR deals_closing_soon > 0  (deals closing within 14 days)
- OR a "deal_stage_changed" trigger is active

Activate long_term_nurture_agent when:
- cold_leads_30d > 3  (meaningful pool of leads inactive 30+ days)

Activate lead_scorer_agent when:
- A "tour_completed" or "application_submitted" trigger is active
- OR cold_leads_30d > 8  (many contacts likely have stale scores from engagement decay)

## Rules
- ONLY hand off to agents that appear in the enabled_agents list from the survey result.
- Maintain this order when multiple agents are needed:
  lead_nurture → deal_sentinel → long_term_nurture → lead_scorer
  This ordering is intentional: active-lead follow-up before pipeline monitoring,
  pipeline monitoring before cold-lead re-engagement, scoring last.
- Your handoff brief must be specific. Instead of "do your job", say:
  "There are 6 stale leads. Focus on the ones inactive the longest first."
- Do not activate an agent simply because it is enabled — only when a concrete
  signal exists (non-zero count or matching trigger).
""".strip()


@function_tool
async def survey_workspace(ctx: RunContextWrapper[AgentContext]) -> dict[str, Any]:
    """Returns a snapshot of the workspace: lead and deal counts needing attention,
    and the list of enabled agents. Call this first before deciding who to activate.
    """
    db = await supabase()
    space_id = ctx.context.space_id
    now = datetime.now(timezone.utc)

    seven_days_ago = (now - timedelta(days=7)).isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    fourteen_days_ago = (now - timedelta(days=14)).isoformat()
    today = now.date().isoformat()
    fourteen_days_out = (now + timedelta(days=14)).date().isoformat()

    stale_res, cold_res, stalled_res, closing_res = await asyncio.gather(
        # Contacts inactive 7+ days with no follow-up scheduled
        db.table("Contact")
        .select("id", count="exact")
        .eq("spaceId", space_id)
        .or_(f"lastContactedAt.lt.{seven_days_ago},lastContactedAt.is.null")
        .is_("followUpAt", None)
        .execute(),

        # Contacts with no activity in 30+ days
        db.table("Contact")
        .select("id", count="exact")
        .eq("spaceId", space_id)
        .or_(f"lastContactedAt.lt.{thirty_days_ago},lastContactedAt.is.null")
        .execute(),

        # Active deals with no update in 14+ days
        db.table("Deal")
        .select("id", count="exact")
        .eq("spaceId", space_id)
        .eq("status", "active")
        .lt("updatedAt", fourteen_days_ago)
        .execute(),

        # Active deals closing within the next 14 days
        db.table("Deal")
        .select("id", count="exact")
        .eq("spaceId", space_id)
        .eq("status", "active")
        .lte("closeDate", fourteen_days_out)
        .gte("closeDate", today)
        .execute(),
    )

    snapshot = {
        "stale_leads": stale_res.count or 0,
        "cold_leads_30d": cold_res.count or 0,
        "stalled_deals": stalled_res.count or 0,
        "deals_closing_soon": closing_res.count or 0,
        "enabled_agents": ctx.context.enabled_agents,
    }

    await publish_event(
        ctx.context,
        "info",
        (
            f"Workspace survey complete — "
            f"{snapshot['stale_leads']} stale leads, "
            f"{snapshot['cold_leads_30d']} cold 30d+, "
            f"{snapshot['stalled_deals']} stalled deals, "
            f"{snapshot['deals_closing_soon']} closing soon"
        ),
        agent_type="coordinator",
    )

    return snapshot


def _make_on_handoff(display_name: str, agent_key: str) -> Callable:
    """Return an async on_handoff callback that publishes an SSE delegation event."""
    async def _callback(ctx: RunContextWrapper[AgentContext]) -> None:
        await publish_event(
            ctx.context,
            "info",
            f"Delegating to {display_name}…",
            agent_type=agent_key,
        )
    return _callback


def make_coordinator_agent(enabled_agents: list[str]) -> Agent:
    """Build the Coordinator with handoffs to only the enabled specialist agents.

    Agents are constructed fresh each call so state never leaks between runs.
    Order is enforced regardless of how enabled_agents is stored.
    """
    from agents.deal_sentinel import make_deal_sentinel_agent
    from agents.lead_nurture import make_lead_nurture_agent
    from agents.lead_scorer import make_lead_scorer_agent
    from agents.long_term_nurture import make_long_term_nurture_agent

    _registry: dict[str, tuple[Callable, str, str]] = {
        "lead_nurture": (
            make_lead_nurture_agent,
            "Lead Nurture Agent",
            "contacts with no follow-up scheduled that have gone quiet (7+ days inactive)",
        ),
        "deal_sentinel": (
            make_deal_sentinel_agent,
            "Deal Sentinel Agent",
            "stalled deals and deals approaching their close date",
        ),
        "long_term_nurture": (
            make_long_term_nurture_agent,
            "Long-Term Nurture Agent",
            "contacts who have been inactive 30+ days and need a personalised re-engagement",
        ),
        "lead_scorer": (
            make_lead_scorer_agent,
            "Lead Scorer Agent",
            "contacts whose lead scores are stale relative to recent activity changes",
        ),
    }

    # Enforce consistent activation order regardless of storage order
    _order = ["lead_nurture", "deal_sentinel", "long_term_nurture", "lead_scorer"]
    ordered = [name for name in _order if name in enabled_agents]

    handoffs_list = []
    for name in ordered:
        entry = _registry.get(name)
        if not entry:
            continue
        factory, display_name, focus = entry
        specialist = factory()
        h = handoff(
            specialist,
            tool_description_override=(
                f"Delegate to the {display_name}, which handles {focus}. "
                "Pass a brief with exactly what signals you found and what to focus on."
            ),
            on_handoff=_make_on_handoff(display_name, name),
        )
        handoffs_list.append(h)

    return Agent[None](
        name="Chippi Coordinator",
        model=settings.orchestrator_model,
        instructions=COORDINATOR_INSTRUCTIONS,
        tools=[survey_workspace, log_activity_run],
        handoffs=handoffs_list,
    )
