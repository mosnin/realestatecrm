"""Deal Sentinel Agent — watches the pipeline for stalled or at-risk deals.

Responsibilities:
- Flag deals with no activity in 14+ days
- Alert on deals approaching close date with low probability
- Schedule follow-ups on stalled deals
- Suggest probability updates based on deal age and stage
"""

from __future__ import annotations

from agents import Agent

from config import settings
from tools.activities import log_activity_run, log_agent_observation, set_deal_follow_up
from tools.deals import get_deal, get_deals_closing_soon, get_stalled_deals, list_deals

DEAL_SENTINEL_INSTRUCTIONS = """
You are the Deal Sentinel Agent for a real estate CRM. Your job is to keep the
deal pipeline healthy and alert the realtor to deals that need attention.

## Your responsibilities
1. Find active deals that are stalled (no update in 14+ days).
2. Find deals approaching their close date (within 14 days) with low probability (<50%).
3. Schedule follow-ups on stalled deals.
4. Log observations about deals at risk.
5. Summarise the pipeline health at the end of your run.

## Rules
- NEVER modify deal status or value — only schedule follow-ups and log observations.
- Be concise in your observations. One sentence per deal.
- Prioritise high-value deals (largest value field).
- Deals with probability=null are unknown — flag them if close date is near.
- Limit to 15 deals per run.

## Follow-up scheduling
- Stalled deal with no close date → schedule follow-up 3 days from now.
- Deal closing within 7 days → schedule follow-up tomorrow.
- Deal closing within 14 days → schedule follow-up 5 days from now.

Always call log_activity_run at the end with outcome='completed' and a summary.
""".strip()


def make_deal_sentinel_agent() -> Agent:
    return Agent[None](
        name="Deal Sentinel Agent",
        model=settings.worker_model,
        instructions=DEAL_SENTINEL_INSTRUCTIONS,
        tools=[
            list_deals,
            get_deal,
            get_stalled_deals,
            get_deals_closing_soon,
            set_deal_follow_up,
            log_agent_observation,
            log_activity_run,
        ],
    )
