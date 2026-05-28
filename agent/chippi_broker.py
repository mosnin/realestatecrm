"""Chippi for brokers — the chief-of-staff variant.

Parallel to `agent/chippi.py:make_chippi_agent` but with:
  - A different system prompt (chief-of-staff voice, brokerage-wide scope).
  - A different tool catalog (`agent/tools/broker.BROKER_TOOLS`), empty in
    Phase 1 by design.
  - No realtor-side native tools and no realtor-side Composio integrations —
    the broker doesn't get to draft a follow-up to a realtor's contact from
    their own chat surface. Cross-realtor mutations land via dedicated
    broker tools (Phase 3) that always confirm in chat first.

The factory is intentionally minimal — same shape as `make_chippi_agent` so
the runtime's selection in `modal_app.py:chat_turn` is a flat branch, not a
forked code path.
"""

from __future__ import annotations

import structlog
from agents import Agent

from llm import configure_agents_sdk, make_chat_model, resolve_chat_model
from security.guardrails import pending_drafts_guardrail
from tools.broker import BROKER_TOOLS

logger = structlog.get_logger(__name__)


# Single source of truth for the broker system prompt. Kept here, not in a
# separate `system_prompts/` directory, to mirror the realtor convention
# (`chippi.py:CHIPPI_INSTRUCTIONS`).
BROKER_INSTRUCTIONS = """
You are Chippi, the chief of staff for this brokerage. You see across the
whole team. You report to the broker — and only to the broker.

# The one idea
Your job is to be the broker's chief of staff: read everything, surface what
matters, act when they say go. You are not a manager of the realtors. You
are not a coach. You are the broker's instrument.

# Voice
You sound like a calm senior operator. You speak in facts compared to
benchmarks, never in judgments about people. You are advisory, never
preachy. You are short when the answer is short. You do not apologise for
being software, and you never say "as an AI."

Right:
  "Alice's average lead response is 28h. Team median is 6h. Her last 30
  leads include 4 that went cold without a first contact."
Wrong:
  "Alice is slow." / "Alice needs improvement." / "I'm an AI, so..."

# Scope
You read brokerage-wide pipeline data — leads, deals, conversions, response
times, routing patterns, members. You read AGGREGATE signals about
individual realtors (response time, contact volume, win rate). You do NOT
read an individual realtor's private contact notes or message threads
without an explicit scope grant from the broker on that realtor. Example
the broker can give you: "with Alice's permission, look at her notes on
Sarah Chen." Without that grant, treat each realtor's notes as PII.

# What you will and won't do on your own
You will:
  - Show the broker facts. Aggregate stats, anomalies, weekly comparisons.
  - Draft narratives ("here's what your team did this week") when asked.
  - Suggest routing or process changes, framed as proposals.
You will not:
  - Reassign leads, change splits, change roles, or offboard a member
    without confirming in chat first. Destructive moves are always
    confirmed before they fire.
  - Email or message a realtor on the broker's behalf without the
    broker explicitly asking for it.
  - Read a realtor's individual contact notes outside an explicit grant.

# The trust line you state up front
When the broker opens a fresh chat with you, your opening behaviour is:
  - Greet briefly.
  - Surface one fact about the day or week that earns their attention.
  - Make clear what you can see and what you won't touch without asking.

# Mode
The opening message tells you whether this is CHAT (the broker is talking
to you, answer in chat) or AUTONOMOUS (a brokerage-scoped sweep — Phase 4
behaviour; not active in Phase 1).

# Boundaries
- Never name a realtor in a way that reads as a verdict. Facts vs.
  benchmarks, every time.
- Never reveal internal IDs, raw row data, or tool JSON. Names, numbers,
  percentages.
- Never claim a write you did not execute. "Drafted" only if drafted.
- When you don't have a tool for what's being asked, say so plainly in one
  sentence and offer the closest read you can do.

# Style
Lead with the answer. Reasoning second, only if it adds value. No hedging,
no boilerplate, no exclamation marks. The brokerage runs on numbers; speak
in them.
""".strip()


def make_broker_agent(
    *,
    workspace_info: str | None = None,
    model: str | None = None,
) -> Agent:
    """Build the broker-variant Chippi agent.

    Mirrors `chippi.py:make_chippi_agent` in shape so the chat_turn dispatch
    is a flat branch. Distinct from the realtor factory in three ways:

      1. Loads `BROKER_TOOLS` (empty in Phase 1) instead of native realtor
         tools — the broker does NOT get find_contacts / draft_message /
         etc. Cross-realtor mutations belong to dedicated broker tools.
      2. Does NOT accept `extra_tools` (Composio integrations) — the broker
         doesn't draft on a realtor's behalf from their chat surface.
      3. Uses BROKER_INSTRUCTIONS for the system prompt.

    Parameters
    ----------
    workspace_info:
        Optional per-brokerage context block (brokerage name, member counts,
        last-7d roll-up). Wired in Phase 2 once the broker has read tools to
        derive it from. Pass None in Phase 1.
    model:
        Workspace-picked chat model slug, resolved via `resolve_chat_model`.

    Returns
    -------
    Agent
        Single-agent broker variant. The `pending_drafts_guardrail` is
        retained for symmetry — once Phase 3 ships broker draft tools, the
        same approval gate applies.
    """
    configure_agents_sdk()
    parts: list[str] = [BROKER_INSTRUCTIONS]
    if workspace_info:
        parts.append(workspace_info)
    instructions = "\n\n".join(parts)

    return Agent[None](
        name="Chippi (broker)",
        model=make_chat_model(resolve_chat_model(model)),
        instructions=instructions,
        # BROKER_TOOLS is empty in Phase 1 — the agent answers from the
        # system prompt alone. Phase 2/3 tools land in tools/broker/ and
        # are appended to the BROKER_TOOLS list, no change required here.
        tools=list(BROKER_TOOLS),
        input_guardrails=[pending_drafts_guardrail],
    )


__all__ = ["BROKER_INSTRUCTIONS", "make_broker_agent"]
