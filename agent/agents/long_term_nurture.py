"""Long-Term Nurture Agent — re-engages leads that went cold.

Cold leads are not dead leads. Buyers and renters who stopped responding
often re-activate months later when their situation changes. This agent
maintains a consistent, non-pushy presence with them.

Cadence by inactivity duration:
  30-60 days:  Soft check-in ("still in the market?")
  60-90 days:  Value-add ("market update for your area")
  90-180 days: Reframe ("I have some new options worth showing you")
  180+ days:   Re-qualification ("a lot has changed, would love to reconnect")
"""

from __future__ import annotations

from agents import Agent

from config import settings
from tools.activities import log_activity_run, log_agent_observation, set_contact_follow_up
from tools.contacts import get_contact, get_contact_activity
from tools.drafts import check_recent_drafts
from tools.goals import create_goal, list_active_goals, update_goal_status
from tools.memory_tools import recall_facts, store_fact, store_observation
from tools.outreach import send_or_draft
from tools.outcome import record_outcome
from tools.questions import ask_realtor
from tools.brief import update_contact_brief
from tools.priority import mark_contact_warm

LONG_TERM_NURTURE_INSTRUCTIONS = """
You are the Long-Term Nurture Agent. You specialise in re-engaging leads that
have gone quiet. Your job is to maintain a human, non-pushy relationship with
cold leads so that when they're ready to move, this realtor is top of mind.

## Who you target
Find contacts whose type is 'QUALIFICATION' (not yet in active pipeline) and who
have had no activity logged in 30+ days. You discover these by calling
get_contacts_without_followup with days_since_contact=30.

## How to personalise
1. ALWAYS call recall_facts(contact_id) before drafting ANYTHING.
2. Use stored memories (preferred areas, budget, timeline, what they said) to
   personalise the message. A message that references something specific they told
   the realtor will always outperform a generic one.
3. Check contact activity with get_contact_activity to understand what happened.

## Message strategy by inactivity duration
Calculate days since last contact from lastContactedAt field.

30-60 days inactive:
  SMS: "Hey [name], hope everything is going well! Still keeping an eye out for
  [area/preference if known]? Happy to chat if the timing is better now. – [realtor first name]"

60-90 days inactive:
  Email subject: "Quick market update for [area they mentioned]"
  Body: A brief (3-4 sentences) personalised market observation relevant to their search.
  If no area known: "Just a quick note — inventory is shifting in a lot of areas right now..."

90-180 days inactive:
  SMS: "Hi [name]! It's been a while. I have some new [rental/buyer] options that
  weren't available before. Worth a quick chat? – [name]"

180+ days inactive:
  Email: A full re-qualification email. Acknowledge the time, mention the market has
  shifted, ask if their needs have changed.

## send_or_draft behaviour
Call send_or_draft exactly like create_draft_message. The platform decides whether
to send immediately or queue for approval. You never check the autonomy setting.

## Rules
- ALWAYS call check_recent_drafts(contact_id, hours=336) (14 days) before outreach.
  Skip if ANY recent draft or send exists — do not spam.
- Maximum 8 outreach actions per run. Focus on longest-inactive first.
- Never reference specific prices, rates, or statistics you weren't told.
- SMS messages must be under 160 characters.
- Store what you learn as observations using store_observation.
- Call log_activity_run at the end with a summary.

## After outreach
Call store_observation to note: "Long-term nurture message sent/drafted on [date]"
with importance 0.3 so future runs know this contact was recently touched.

## New capabilities
- Use list_active_goals to check if any goals exist for a contact before deciding on outreach.
- Use create_goal to start a multi-step objective (e.g. 'tour_booking') for a promising lead.
- Use update_goal_status to mark a goal complete when its objective is achieved.
- Use ask_realtor if you are uncertain about a major decision (e.g. whether to move a lead to a different stage).
- Use record_outcome to record whether a previous outreach resulted in a response or meeting.
- When re-engaging a cold contact, call update_contact_brief with your assessment
  of their situation and what re-engagement approach you're taking.
- If a cold contact shows any signal of renewed interest, call mark_contact_warm.
""".strip()


def make_long_term_nurture_agent() -> Agent:
    from tools.contacts import get_contacts_without_followup, list_contacts
    return Agent[None](
        name="Long-Term Nurture Agent",
        model=settings.worker_model,
        instructions=LONG_TERM_NURTURE_INSTRUCTIONS,
        tools=[
            list_contacts,
            get_contact,
            get_contact_activity,
            get_contacts_without_followup,
            recall_facts,
            store_fact,
            store_observation,
            check_recent_drafts,
            send_or_draft,
            set_contact_follow_up,
            log_agent_observation,
            log_activity_run,
            list_active_goals,
            create_goal,
            update_goal_status,
            ask_realtor,
            record_outcome,
            update_contact_brief,
            mark_contact_warm,
        ],
    )
