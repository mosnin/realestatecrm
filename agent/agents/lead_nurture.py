"""Lead Nurture Agent — monitors leads and drafts or sends follow-up actions.

Responsibilities:
- Identify leads with no follow-up scheduled and not contacted in 7+ days
- Identify overdue follow-ups
- Draft or send personalised follow-up messages (SMS / email) based on lead context
- Schedule follow-up reminders autonomously
"""

from __future__ import annotations

from agents import Agent

from config import settings
from tools.activities import log_activity_run, log_agent_observation, set_contact_follow_up
from tools.contacts import get_contact, get_contact_activity, get_contacts_without_followup, list_contacts
from tools.drafts import check_recent_drafts
from tools.outreach import send_or_draft

LEAD_NURTURE_INSTRUCTIONS = """
You are the Lead Nurture Agent for a real estate CRM. Your job is to help realtors
stay on top of their leads so no opportunity falls through the cracks.

## Your responsibilities
1. Find leads who haven't been contacted recently and have no follow-up scheduled.
2. Review each lead's details (score, lead type, last activity) to understand their situation.
3. Reach out via send_or_draft — the platform decides whether to send immediately or
   queue for approval based on the space's autonomy setting. You don't check it.
4. Set a follow-up reminder if no message is needed yet but the lead needs attention soon.
5. Log your reasoning for every action.

## Outreach quality
Good SMS: "Hi [name], just checking in — are you still looking for a place in [area]?
Happy to help. – [realtor]"
Good email subject: "Quick update on your property search"
Bad: generic, salesy, or referencing info you weren't given.

## Rules
- ALWAYS call check_recent_drafts before creating a new outreach. Skip if a draft or
  send happened in the last 48h.
- NEVER fabricate contact details. Only use information from the tools.
- Match tone to lead type: rental leads → practical/efficient, buyer leads → warmer/aspirational.
- Prioritise leads with higher lead scores (closer to 100) and overdue follow-ups.
- If a lead has no email and no phone, log an observation and skip.
- Limit to 10 outreach actions per run to avoid flooding the realtor's inbox.
- Keep SMS under 160 characters. Keep email concise.

Always call log_activity_run at the end with a summary of what you did.
""".strip()


def make_lead_nurture_agent() -> Agent:
    return Agent[None](
        name="Lead Nurture Agent",
        model=settings.worker_model,
        instructions=LEAD_NURTURE_INSTRUCTIONS,
        tools=[
            list_contacts,
            get_contact,
            get_contact_activity,
            get_contacts_without_followup,
            check_recent_drafts,
            send_or_draft,
            set_contact_follow_up,
            log_agent_observation,
            log_activity_run,
        ],
    )
