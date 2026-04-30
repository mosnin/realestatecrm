"""Coordinator Agent — surveys the workspace and delegates to specialist agents via handoffs.

Instead of running all enabled agents blindly on every heartbeat, the Coordinator
reads the workspace state once and routes work only to the specialists that have
a real signal to act on.

Handoff flow:
  CoordinatorAgent
    → survey_workspace()             ← lightweight DB snapshot
    → handoff offer_agent            ← if application_submitted trigger (highest priority)
    → handoff tour_followup          ← if tour_completed trigger (time-critical)
    → handoff lead_nurture           ← if stale leads or new_lead trigger
    → handoff deal_sentinel          ← if stalled/at-risk deals
    → handoff long_term_nurture      ← if cold-lead pool is meaningful
    → handoff lead_scorer            ← if application trigger or mass score decay
    → CoordinatorRunReport           ← structured summary stored as space memory

Guardrails:
  Input  — pending_drafts_guardrail: blocks run if ≥10 unreviewed drafts
  Output — run_integrity_guardrail:  validates CoordinatorRunReport before storage
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from agents import Agent, RunContextWrapper, function_tool, handoff

from config import settings
from db import supabase
from schemas import CoordinatorRunReport
from security.context import AgentContext
from security.guardrails import pending_drafts_guardrail, run_integrity_guardrail
from tools.goals import list_active_goals
from tools.priority import generate_priority_list
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
4. After all handoffs complete (or if nothing needed to run), produce your final
   CoordinatorRunReport output (see "Final output" section below).

## Routing rules

Activate offer_agent FIRST when:
- An "application_submitted" trigger is active.
- Pass the contactId from the trigger in your brief.
- This is the highest-priority event — a submitted application needs a same-hour response.

Activate tour_followup_agent when:
- A "tour_completed" trigger is active.
- Pass the contactId from the trigger.
- Runs second — post-tour follow-up is the most time-sensitive recurring action.

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
- cold_leads_30d > 8  (many contacts likely have stale scores from engagement decay)
- Note: application_submitted rescoring is handled by offer_agent via store_fact;
  lead_scorer only needs to run for broad engagement decay signals.

Activate lead_nurture_agent when pending_questions > 0 to process recent inbound replies.

Check active_goals > 0 at the start of each run: pass the goal count to whichever
specialist is relevant (e.g. lead_nurture for follow_up_sequence goals, deal_sentinel
for deal_close goals) so they can advance the goals and call update_goal_status.

## Rules
- ONLY hand off to agents that appear in the enabled_agents list from the survey result.
- Maintain this order when multiple agents are needed:
  offer_agent → tour_followup → lead_nurture → deal_sentinel → long_term_nurture → lead_scorer
  offer_agent and tour_followup run first because they are time-critical.
- Your handoff brief must be specific. Include contactIds for event-driven agents.
  Example: "application_submitted trigger received. contactId: abc-123. Process immediately."
- Do not activate an agent simply because it is enabled — only when a concrete
  signal exists (non-zero count or matching trigger).

## Priority list
After all specialist handoffs are complete (or if nothing_to_do is True),
call generate_priority_list(top_n=5) to update the realtor's daily focus list.
This should be the LAST tool call before producing your CoordinatorRunReport.

## Final output
After all work is done, produce a CoordinatorRunReport with these fields:
- workspace_name: the workspace name from your brief
- run_date: today's date as YYYY-MM-DD
- agents_activated: list of specialist names you handed off to (empty list if none)
- total_drafts_created: your best estimate of total drafts/sends across all specialists
  (read from their final messages; use 0 if unknown)
- total_follow_ups_set: your best estimate of total follow-ups scheduled
  (read from their final messages; use 0 if unknown)
- overall_summary: 1-2 sentences describing what happened this run
- nothing_to_do: true ONLY if all counts were 0, no triggers were active, and no
  agents ran. False in all other cases.
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

    stale_res, cold_res, stalled_res, closing_res, application_res, goals_res, questions_res = await asyncio.gather(
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

        # Contacts who recently submitted an application (type=APPLICATION, updated in last 24h)
        db.table("Contact")
        .select("id", count="exact")
        .eq("spaceId", space_id)
        .eq("type", "APPLICATION")
        .gte("updatedAt", (now - timedelta(hours=24)).isoformat())
        .execute(),

        # Active agent goals
        db.table("AgentGoal")
        .select("id", count="exact")
        .eq("spaceId", space_id)
        .eq("status", "active")
        .execute(),

        # Pending inbound questions awaiting realtor response
        db.table("AgentQuestion")
        .select("id", count="exact")
        .eq("spaceId", space_id)
        .eq("status", "pending")
        .execute(),
    )

    snapshot = {
        "stale_leads": stale_res.count or 0,
        "cold_leads_30d": cold_res.count or 0,
        "stalled_deals": stalled_res.count or 0,
        "deals_closing_soon": closing_res.count or 0,
        "recent_applications": application_res.count or 0,
        "active_goals": goals_res.count or 0,
        "pending_questions": questions_res.count or 0,
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
            f"{snapshot['deals_closing_soon']} closing soon, "
            f"{snapshot['recent_applications']} recent application(s), "
            f"{snapshot['active_goals']} active goal(s), "
            f"{snapshot['pending_questions']} pending question(s)"
        ),
        agent_type="coordinator",
    )

    return snapshot


def _make_on_handoff(display_name: str, agent_key: str) -> Callable:
    """Return an async on_handoff callback that tracks the active specialist and
    publishes an SSE delegation event. Setting current_agent_type before the
    specialist runs ensures effective_autonomy_for() reads the right override."""
    async def _callback(ctx: RunContextWrapper[AgentContext]) -> None:
        ctx.context.current_agent_type = agent_key
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
    from agents.offer_agent import make_offer_agent
    from agents.tour_followup import make_tour_followup_agent

    _registry: dict[str, tuple[Callable, str, str]] = {
        "offer_agent": (
            make_offer_agent,
            "Offer Agent",
            "contacts who just submitted a rental or buyer application and need an immediate acknowledgement",
        ),
        "tour_followup": (
            make_tour_followup_agent,
            "Tour Follow-Up Agent",
            "contacts who just completed a tour and need an immediate, personalised follow-up",
        ),
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

    # offer_agent and tour_followup run first — time-critical event-driven responses
    _order = ["offer_agent", "tour_followup", "lead_nurture", "deal_sentinel", "long_term_nurture", "lead_scorer"]
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

    return Agent[CoordinatorRunReport](
        name="Chippi Coordinator",
        model=settings.orchestrator_model,
        instructions=COORDINATOR_INSTRUCTIONS,
        tools=[survey_workspace, list_active_goals, generate_priority_list],
        handoffs=handoffs_list,
        output_type=CoordinatorRunReport,
        input_guardrails=[pending_drafts_guardrail],
        output_guardrails=[run_integrity_guardrail],
    )
