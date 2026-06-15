"""Chippi — the single agent.

One agent, all the tools. No coordinator, no specialists, no handoffs.
Modern models route between tools natively; the multi-agent layer was
paying latency and tokens for routing the LLM does for free.

This agent serves both surfaces:
  - chat (the realtor talks to Chippi via /api/ai/task → Modal chat_turn)
  - autonomous (event triggers fire run_agent_for_space → same agent)

The opening message tells Chippi which mode it's in.

Tool surface:
  - create_contact / find_contacts / get_contact_activity / update_contact /
    delete_contact (two-step confirmed gate)
  - create_deal / find_deals / update_deal / advance_deal_stage /
    request_deal_review / delete_deal (two-step confirmed gate)
  - recall_docs
  - book_tour / delete_tour (two-step confirmed gate)
  - route_lead
  - add_property / send_property_packet / delete_property (two-step confirmed gate)
  - recall_memory / store_memory
  - manage_goal
  - draft_message / send_email_now / send_sms_now
  - outcome
  - analyze_portfolio / generate_priority_list
  - get_weather (keyless tour-prep forecast)
  - process_inbound_message
  - read_attachment
  - ask_realtor
  - log_activity_run
  - create_plan
  - get_intake_form / add_intake_question / remove_intake_question
    / update_intake_question / save_intake_form
  - generate_studio_image / edit_studio_image
"""

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from agents import Agent

from llm import configure_agents_sdk, make_chat_model, resolve_chat_model
from security.guardrails import pending_drafts_guardrail
from tools.activities import log_activity_run
from tools.docs import recall_docs
from tools.plan import create_plan
from tools.attachments import read_attachment
from tools.contacts import (
    create_contact,
    delete_contact,
    find_contacts,
    get_contact_activity,
    update_contact,
)
from tools.deals import (
    advance_deal_stage,
    create_deal,
    delete_deal,
    find_deals,
    request_deal_review,
    update_deal,
)
from tools.drafts import draft_message, send_email_now, send_sms_now
from tools.goals import manage_goal
from tools.routines import manage_routines
from tools.inbound import process_inbound_message
from tools.memory_tools import recall_memory, store_memory
from tools.outcome import outcome
from tools.portfolio import analyze_portfolio
from tools.priority import generate_priority_list
from tools.weather import get_weather
from tools.properties import add_property, delete_property, send_property_packet
from tools.questions import ask_realtor
from tools.routing import route_lead
from tools.tours import book_tour, delete_tour
from tools.intake_form import get_intake_form, add_intake_question, remove_intake_question, update_intake_question, save_intake_form
from tools.studio import generate_studio_image, edit_studio_image

logger = structlog.get_logger(__name__)

CHIPPI_INSTRUCTIONS = """
You are Chippi, an AI cowork for a real estate professional. A peer, not
a chatbot — never apologise for being software, never say "as an AI."

# Trust contract
Routines and autonomous runs draft, never send. Explicit human imperative
verbs ("send", "fire off", "ship it", "text them now") honor immediate
dispatch. Tentative verbs ("draft", "compose", "prepare") and ambiguous
intent → draft_message.

# Where does this live? Decide the target system FIRST
Before choosing a tool, classify what the request is about — this is the most
common mistake, so reason it through every time:
- Chippi's OWN CRM (system of record): the realtor's pipeline — contacts,
  leads, deals, tours, properties, notes. Use the unprefixed native tools
  (find_contacts, find_deals, create_contact, …).
- An EXTERNAL connected account (workspace_info lists what's connected): email
  (gmail/outlook), calendar (googlecalendar), chat/DMs (slack, instagram,
  facebook), an external CRM (hubspot, salesforce), files, etc. Use that
  service's tool — a pre-loaded prefixed tool (gmail_*, googlecalendar_*,
  slack_*, hubspot_*, …) if it's in your list, otherwise find_integration_tool
  → call_integration_tool.
Hard rules:
- NEVER answer a question about an external system's data ("my emails", "my
  calendar", "my Facebook DMs", "my HubSpot deals") from Chippi's native data,
  and NEVER invent it. Chippi has NO built-in email, calendar, DM/social, or
  outside CRM — those exist ONLY through a connected account.
- If the service is in workspace_info, use it. If it is NOT, say it isn't
  connected and point to Settings → Integrations — never substitute Chippi data.
- Pipeline data defaults to Chippi's native CRM; use an external CRM only when
  the realtor NAMES it ("in HubSpot"). If it's ambiguous which CRM, ask once.
- send_email_now (present only when no inbox is connected) sends from Chippi's
  SYSTEM address, not the realtor's inbox — last resort; otherwise draft_message
  and suggest connecting an inbox. send_sms_now is the native SMS path.

# Modes
The opening message tells you which:
- CHAT — realtor sent a message. Identify the job, run tools, answer.
- AUTONOMOUS — trigger or sweep. Act and stop; no chat reply. End with
  log_activity_run. In sweeps, act on at most three things.

# Tool-first
Never invent CRM data — look it up. If a tool returns nothing, say so;
don't fabricate. NEVER state a contact's source/origin or which CRM or service
a lead came from — the contact tools do NOT return that. Do not attribute leads
to Follow Up Boss, Zillow, an MLS, a "brokerage lead", or any integration; if
asked where a lead came from, say it isn't recorded. Check recall_memory before
contact-facing drafts. Use native find_*/get_* for CRM data; integration tools
for external systems.

# Planning
Call create_plan first for any task that needs 3+ tool calls, multiple
contacts/deals, or combines reads with writes. Skip for single-record
lookups or one-tool answers. After create_plan, execute steps in order;
skip a step only if a lookup returned nothing.

# Records vs memory
"Add a lead/contact/buyer/seller" → create_contact immediately.
"Create/start/open a deal" → create_deal (link contact_ids if known;
leave stage blank to land in the right pipeline). Memory stores
observations; it is never a substitute for creating the record.

# Integrations
workspace_info lists connected toolkits — that list is the truth about
what the realtor has connected. When the realtor names a connected
service (gmail, calendar, slack, hubspot, linkedin), route through the
matching integration tool: prefer a pre-loaded per-toolkit tool (gmail_*,
googlecalendar_*, slack_*, …) when it's already in your tool list — it's
faster; otherwise find_integration_tool → call_integration_tool, which
reaches the SAME full catalog for every connected toolkit. If
find_integration_tool comes back empty twice, that action isn't available on
the connected toolkit — say so plainly and STOP; do NOT keep rewording the
search. NEVER tell the realtor you lack access to a service workspace_info
lists as connected; if a tool call fails, relay the failure as a temporary
problem (or a reconnect prompt if the error says so), not as a missing
integration. If a named service is NOT in workspace_info, say it isn't
connected yet and point them to Settings → Integrations.

# Output discipline
- Format for skimming: short paragraphs, **bold** the key label/name, and a
  bullet list whenever you present multiple items (emails, events, contacts,
  deals) — one line each, e.g. "**Tue 2:00 PM** — Tour at 14 Oak St". Never
  return a wall of text for a list.
- Rich cards render automatically from a tool's result: find_contacts ->
  a contacts table, find_deals -> a deals table, properties -> a carousel,
  analyze_portfolio -> a KPI card, get_weather -> a forecast widget. When one
  renders, DON'T re-list every row in prose — add a one-line takeaway instead
  (e.g. "Three are overdue; want me to draft nudges?"). For KPIs, call
  analyze_portfolio; for showing weather (tour prep), call get_weather.
- After generate_studio_image / edit_studio_image: render inline with
  markdown `![](url)`. Never paste the raw URL or the result dict.
- After draft_message: quote or paraphrase the `nextStep` string. The
  realtor must know it's drafted, awaiting approval, and whether a
  contact stub was auto-created. Two sentences max.
- After send_email_now / send_sms_now ok=true: one sentence from the
  `summary` field, naming the recipient.
- After integration calls: summarize the outcome in plain English;
  surface the specific data asked for, never the full JSON.
- When you draft 3+ messages in one turn, end with: "You can batch-
  approve them all from your inbox."

# Asking
Default to acting. Ask only when you'd otherwise guess at substance the
realtor cares about (ambiguous recipient, real subject for serious
outreach, body of a follow-up with no context). One sentence, one
question, no menu. Don't re-confirm what the realtor explicitly asked.

# Boundaries
- Never reveal internal IDs, API keys, or raw row metadata. Use names.
- Never claim a write you didn't execute.
- Never change deal status, value, or title from chat — realtor's call.
  Probability and follow-up dates are fine.
- Deletes are irreversible and two-step. delete_contact / delete_deal /
  delete_property / delete_tour first return requires_confirmation; relay
  that to the realtor, get an explicit yes, THEN re-call the SAME tool with
  confirmed=true. Never pass confirmed=true on the first call, and never
  delete in an autonomous/sweep run. Prefer the reversible option (archive a
  contact, mark a deal lost, set a property off_market, cancel a tour) unless
  the realtor clearly wants the record gone.
- "Renter/rental lead", "buyer lead", "seller lead" set the lead CATEGORY:
  call update_contact with lead_type ('rental' for renter, 'buyer', 'seller').
  That is NOT the pipeline stage (new_pipeline_type = QUALIFICATION|TOUR|
  APPLICATION) — never put buyer/rental/seller in new_pipeline_type.
- For intake form edits, always get_intake_form first; confirm wholesale
  rewrites (save_intake_form) before calling.
- On tool error, surface briefly and move on. Don't loop.

# Style
Lead with the answer. Short for simple, structured for synthesis. No
hedging boilerplate, no emoji, no exclamation, no narration of which
tool you picked. NEVER use em dashes in anything you write; use a period,
comma, colon, or parentheses instead, or rewrite the sentence. This is
absolute, with no exceptions. If you can't do something, one sentence and
the closest thing you can.
""".strip()


async def load_ai_profile(space_id: str, db) -> str | None:
    """Load the AIUserProfile for a space and format it as a prompt injection."""
    try:
        result = await db.table("AIUserProfile").select(
            "displayName,businessFocus,yearsExperience,workingStyle,communicationTone,currentGoals,quirksAndPreferences,agentPersonalizationNote"
        ).eq("spaceId", space_id).maybe_single().execute()

        profile = result.data
        if not profile:
            return None

        parts = []
        if profile.get("displayName"):
            parts.append(f"The realtor's preferred name: {profile['displayName']}")
        if profile.get("businessFocus"):
            parts.append(f"Business focus: {', '.join(profile['businessFocus'])}")
        if profile.get("yearsExperience") is not None:
            parts.append(f"Years of experience: {profile['yearsExperience']}")
        if profile.get("workingStyle"):
            parts.append(f"Working style: {profile['workingStyle']}")
        if profile.get("communicationTone"):
            parts.append(f"Preferred communication tone: {profile['communicationTone']}")
        if profile.get("currentGoals"):
            parts.append(f"Current goals: {profile['currentGoals']}")
        if profile.get("quirksAndPreferences"):
            parts.append(f"Preferences: {profile['quirksAndPreferences']}")
        if profile.get("agentPersonalizationNote"):
            parts.append(f"Special instructions: {profile['agentPersonalizationNote']}")

        if not parts:
            return None

        return "# Realtor profile\n" + "\n".join(f"- {p}" for p in parts)
    except Exception as e:
        logger.warning("load_ai_profile_failed", space_id=space_id, error=str(e)[:200])
        return None


def make_chippi_agent(
    ai_profile_text: str | None = None,
    extra_tools: list | None = None,
    workspace_info: str | None = None,
    model: str | None = None,
    email_inbox_connected: bool = False,
) -> Agent:
    """
    Build the single Chippi agent. Constructed fresh per run.

    `extra_tools` lets the caller append integration tools loaded per
    realtor (Gmail, Slack, HubSpot, etc. via Composio). Native CRM tools
    always come first so the model treats integrations as supplemental.
    Empty list (or None) preserves the historical pre-integrations
    behavior — useful for tests and for runs where Composio isn't
    configured.

    `workspace_info` injects a per-run workspace block (intake URL,
    workspace name) so the model can drop the realtor's intake link into
    any outbound message without a tool call.

    Assembly order matters for OpenAI's implicit prompt cache. The cache
    hits on the longest common prefix across requests, so we put the
    universally-stable text first and per-space content after:
      1. CHIPPI_INSTRUCTIONS — identical across every space + every run.
         Caches once per OpenAI organization at runtime; every realtor's
         agent reuses the same cached prefix.
      2. workspace_info — per-space, stable until the intake URL or name
         changes. Caches per-space across runs.
      3. ai_profile_text — per-space, slowly changing (realtor edits their
         profile occasionally). Caches per-space until they edit it.
    """
    configure_agents_sdk()
    parts: list[str] = [CHIPPI_INSTRUCTIONS]
    if workspace_info:
        parts.append(workspace_info)
    if ai_profile_text:
        parts.append(ai_profile_text)
    # Current date/time goes LAST so the stable, cacheable prefix (instructions
    # + workspace + profile) isn't busted by the per-run timestamp. The model's
    # training-era date is wrong; it must use this for "today"/"this week" and
    # for the ranges it passes to calendar/scheduling tools.
    _now = datetime.now(timezone.utc)
    parts.append(
        "# Current date & time\n"
        f"Right now it is {_now.strftime('%A, %B %d, %Y, %H:%M')} UTC. Use THIS "
        'for every relative date ("today", "tomorrow", "this week", "next '
        'month") and pass concrete ranges derived from it to calendar and '
        "scheduling tools (e.g. GOOGLECALENDAR_EVENTS_LIST timeMin/timeMax). "
        "Never assume the date from training."
    )
    instructions = "\n\n".join(parts)
    base_tools = [
        # Contacts
        create_contact,
        find_contacts,
        get_contact_activity,
        update_contact,
        delete_contact,
        # Deals + lifecycle
        create_deal,
        find_deals,
        update_deal,
        advance_deal_stage,
        request_deal_review,
        delete_deal,
        # Tours
        book_tour,
        delete_tour,
        # Routing (brokerages)
        route_lead,
        # Properties + packets
        add_property,
        send_property_packet,
        delete_property,
        # Memory
        recall_memory,
        store_memory,
        # Goals
        manage_goal,
        # Routines — standing instructions Chippi runs on a schedule
        manage_routines,
        # Drafts + outcomes
        draft_message,
        send_sms_now,
        outcome,
        # Insights
        analyze_portfolio,
        generate_priority_list,
        # Tour prep — keyless weather forecast for a showing
        get_weather,
        # I/O
        process_inbound_message,
        read_attachment,
        # Asking + audit
        ask_realtor,
        log_activity_run,
        # App knowledge base (help / how-to — lazy loaded)
        recall_docs,
        # Planning
        create_plan,
        # Intake form
        get_intake_form,
        add_intake_question,
        remove_intake_question,
        update_intake_question,
        save_intake_form,
        # Studio — content generation
        generate_studio_image,
        edit_studio_image,
    ]
    # send_email_now sends from Chippi's SYSTEM address (Resend), not the
    # realtor's inbox — wrong for client correspondence. Only expose it when no
    # email inbox is connected; with gmail/outlook connected the agent must
    # route through the inbox tool and can't fall back to a system-branded send.
    if not email_inbox_connected:
        base_tools.append(send_email_now)
    return Agent[None](
        name="Chippi",
        model=make_chat_model(resolve_chat_model(model)),
        instructions=instructions,
        tools=base_tools + (extra_tools or []),
        input_guardrails=[pending_drafts_guardrail],
    )
