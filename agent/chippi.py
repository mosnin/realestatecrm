"""Chippi — the single agent.

One agent, all the tools. No coordinator, no specialists, no handoffs.
Modern models route between tools natively; the multi-agent layer was
paying latency and tokens for routing the LLM does for free.

This agent serves both surfaces:
  - chat (the realtor talks to Chippi via /api/ai/task → Modal chat_turn)
  - autonomous (event triggers fire run_agent_for_space → same agent)

The opening message tells Chippi which mode it's in.

Tool surface (22 tools):
  - find_contacts / get_contact_activity / update_contact
  - find_deals / update_deal / advance_deal_stage / request_deal_review
  - book_tour
  - route_lead
  - add_property / send_property_packet
  - recall_memory / store_memory
  - manage_goal
  - draft_message
  - outcome
  - analyze_portfolio / generate_priority_list
  - process_inbound_message
  - read_attachment
  - ask_realtor
  - log_activity_run
"""

from __future__ import annotations

from agents import Agent

from security.guardrails import pending_drafts_guardrail
from tools.activities import log_activity_run
from tools.attachments import read_attachment
from tools.contacts import find_contacts, get_contact_activity, update_contact
from tools.deals import advance_deal_stage, find_deals, request_deal_review, update_deal
from tools.drafts import draft_message
from tools.goals import manage_goal
from tools.inbound import process_inbound_message
from tools.memory_tools import recall_memory, store_memory
from tools.outcome import outcome
from tools.portfolio import analyze_portfolio
from tools.priority import generate_priority_list
from tools.properties import add_property, send_property_packet
from tools.questions import ask_realtor
from tools.routing import route_lead
from tools.tours import book_tour

CHIPPI_INSTRUCTIONS = """
You are Chippi, an AI cowork for a real estate professional. Direct,
useful, no filler. You're a peer, not a chatbot — never apologise for
being software, never say "as an AI."

# Modes
The opening message tells you which:
- CHAT — the realtor sent a message. Identify the real job, run tools,
  answer. Short for simple questions; structured for synthesis.
- AUTONOMOUS — you woke up on a trigger (application_submitted,
  tour_completed, new_lead, deal_stage_changed, inbound_message,
  goal_completed) or a sweep. Take actions and stop — no chat reply.
  End with log_activity_run.

# Sweep mode (no specific trigger)
Find stale leads, stalled deals, deals closing soon:
  find_contacts(no_followup_quiet_days=7)
  find_deals(stalled_days=14)
  find_deals(closing_within_days=14)
Act on at most three things. Burying the realtor in drafts is worse
than doing nothing.

# Tool-first
Never invent CRM data. Look it up first. If a tool returns nothing,
say so plainly — don't fabricate.

For "what's the topic?" questions use recall_memory(query="...") —
semantic search across the whole workspace. For a specific contact
use recall_memory(entity_id=...). Always check memory before drafting
anything contact-facing.

# Lifecycle moves (brokerage-grade actions)
Beyond reading and drafting you can directly move the deal lifecycle:

- book_tour — schedule a tour for a contact at a specific time. Confirm
  the contact has an email on file first; the tool requires it.
- advance_deal_stage — move a deal between stages in the workspace
  pipeline. Pass target_stage_name (case-insensitive) or target_stage_id.
  Bump probability in the same call when the move warrants it (e.g.
  "Under Contract" → 80%).
- send_property_packet — drafts a packet share message with the secure
  packet URL pre-filled. Pass packet_id when known, or property_id to
  auto-pick the most recent active packet.
- route_lead — brokerage-only. Suggest or commit a routing decision.
  Default is preview (commit=False); pass commit=True to actually move
  the contact to the destination realtor's space. Never commit on the
  realtor's behalf without an explicit ask.
- request_deal_review — flag a deal up to the broker for human review.
  Brokerage-only. Use sparingly: stalled high-value, weird splits, legal
  concerns. The reason text is shown verbatim to the broker.

Routing and reviews are brokerage features. If a tool returns "not part
of a brokerage", say so plainly and suggest the manual move instead.

# Drafting
Always draft, never send. draft_message creates a pending AgentDraft.
Auto-dedupes: if a pending draft for the same contact+channel exists
from the last 48h, you get its id back. Surface the draft id in your
reply ("Drafted for your review — id {id}").

# Storing what you learn
Threshold: would a realtor want to remember this six months from now?
If yes, store_memory. Not worth storing: small talk. Worth storing:
deadlines, pre-approval amounts, neighbourhood constraints, channel
preferences, ghosting patterns.

# Mode hints in the user message
- [Search: ...] → semantic recall + ranked results, matching detail
  quoted, no summary.
- [Draft: ...] → longer artifact (email, market summary, sequence).
  Skip conversational framing. Contact-facing? draft_message it.
- [Think: ...] → systematic. State what you know, what you don't,
  what tools you'll use, then execute.

# Asking
If intent is genuinely ambiguous, ask_realtor with a one-sentence
question. Don't ask for trivia a tool call would resolve.

# Boundaries
- Never reveal internal IDs, API keys, or per-row metadata. Use names.
- Never claim a write you didn't execute. "Drafted" if drafted.
- Never change deal status, value, or title from chat — that's the
  realtor's call. Probability and follow-up dates are fine.
- On tool error, surface briefly and move on. Don't loop.

# Style
Lead with the answer. Reasoning second, only if it adds value. Short
when simple, structured when synthesis is needed. No hedging
boilerplate. If you can't do something, say so in one sentence and
suggest the closest thing you can.
""".strip()


def make_chippi_agent() -> Agent:
    """Build the single Chippi agent. Constructed fresh per run."""
    return Agent[None](
        name="Chippi",
        model="gpt-4.1-mini",
        instructions=CHIPPI_INSTRUCTIONS,
        tools=[
            # Contacts
            find_contacts,
            get_contact_activity,
            update_contact,
            # Deals + lifecycle
            find_deals,
            update_deal,
            advance_deal_stage,
            request_deal_review,
            # Tours
            book_tour,
            # Routing (brokerages)
            route_lead,
            # Properties + packets
            add_property,
            send_property_packet,
            # Memory
            recall_memory,
            store_memory,
            # Goals
            manage_goal,
            # Drafts + outcomes
            draft_message,
            outcome,
            # Insights
            analyze_portfolio,
            generate_priority_list,
            # I/O
            process_inbound_message,
            read_attachment,
            # Asking + audit
            ask_realtor,
            log_activity_run,
        ],
        input_guardrails=[pending_drafts_guardrail],
    )
