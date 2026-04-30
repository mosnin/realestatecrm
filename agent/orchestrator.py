"""Trigger-driven agent runs.

There is no heartbeat. The agent wakes up only when something happens in the
workspace: a new lead, a tour completed, a deal stage changed, an inbound
message, a goal completed. Triggers are pushed to a Redis list by the Next.js
side; this module pops them, builds the opening prompt, and runs Chippi.

For manual sweeps (the Run-now button), the trigger list is empty and the
prompt tells Chippi to look for stale leads / stalled deals on its own.

Security: spaceId is set once in AgentContext and flows through
RunContextWrapper. No tool ever accepts spaceId as an argument.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import structlog
from agents import InputGuardrailTripwireTriggered, ModelSettings, RunConfig, Runner

from config import settings
from db import supabase
from memory.store import format_memories_for_prompt, load_memories, prune_expired, save_memory
from schemas import AgentSettings, Space
from security.budget import check_budget, record_usage
from security.context import AgentContext
from chippi import make_chippi_agent
from tools.streaming import publish_event

logger = structlog.get_logger(__name__)


async def pop_triggers(space_id: str) -> list[dict]:
    """Pop pending event triggers for this space from Redis.

    Triggers are pushed by POST /api/agent/trigger when events happen in
    the workspace. The agent gets them in its opening prompt so it can act
    on each one.
    """
    try:
        from upstash_redis.asyncio import Redis
        if not settings.kv_rest_api_url or not settings.kv_rest_api_token:
            return []
        r = Redis(url=settings.kv_rest_api_url, token=settings.kv_rest_api_token)
        key = f"agent:triggers:{space_id}"
        items = await r.lrange(key, 0, 9)  # up to 10 triggers per run
        if items:
            await r.delete(key)
        parsed = []
        for item in (items or []):
            try:
                obj = json.loads(item) if isinstance(item, str) else item
                if not isinstance(obj, dict) or "event" not in obj:
                    logger.warning("trigger_malformed", item=str(item)[:100])
                    continue
                parsed.append(obj)
            except (json.JSONDecodeError, Exception):
                logger.warning("trigger_parse_error", item=str(item)[:100])
        return parsed
    except Exception:
        return []


def _build_opening_prompt(
    space: Space,
    memory_context: str,
    triggers: list[dict],
) -> str:
    """Frame the autonomous run for Chippi.

    The opening message either lists the triggers to act on or asks for a
    sweep when nothing specific fired.
    """
    now = datetime.now(timezone.utc).strftime("%A, %B %d, %Y at %H:%M UTC")

    if triggers:
        valid = {
            "new_lead",
            "tour_completed",
            "deal_stage_changed",
            "application_submitted",
            "inbound_message",
            "goal_completed",
        }
        lines = []
        for t in triggers:
            event = t.get("event", "")
            if event not in valid:
                continue
            parts = [f"- {event}"]
            if t.get("contactId"):
                parts.append(f"contactId: {t['contactId']}")
            if t.get("dealId"):
                parts.append(f"dealId: {t['dealId']}")
            lines.append("  ".join(parts))
        triggers_block = (
            "Active triggers (act on each one):\n" + "\n".join(lines)
            if lines
            else "Sweep mode — look for stale leads, stalled deals, and deals closing soon."
        )
    else:
        triggers_block = (
            "Sweep mode — no specific trigger fired. Look for stale leads "
            "(7+ days quiet, no follow-up scheduled), stalled deals (no update "
            "in 14+ days), and active deals closing within 14 days. Act on at "
            "most three things."
        )

    return (
        f"AUTONOMOUS RUN\n"
        f"Workspace: {space.name}\n"
        f"Current time: {now}\n\n"
        f"{triggers_block}\n\n"
        f"{memory_context}\n\n"
        "Take action where it's warranted. Draft, set follow-ups, store facts. "
        "Don't reply with chat text — log_activity_run with a one-line summary "
        "at the end."
    ).strip()


async def run_agent_for_space(space: Space, agent_settings: AgentSettings) -> None:
    """Execute one autonomous run for a space.

    Called from Modal `run_now_webhook` (manual trigger or trigger-queue
    drain). Skips if the space's daily token budget is exhausted.
    """
    run_id = str(uuid.uuid4())
    log = logger.bind(space_id=space.id, space_slug=space.slug, run_id=run_id)

    if not await check_budget(space.id, agent_settings.daily_token_budget):
        log.warning("agent_run_skipped_budget_exhausted")
        return

    pruned = await prune_expired(space.id)
    if pruned:
        log.info("memories_pruned", count=pruned)

    space_memories = await load_memories(
        space_id=space.id,
        entity_type="space",
        entity_id=space.id,
        limit=15,
    )
    memory_context = await format_memories_for_prompt(
        space_memories, max_chars=settings.memory_chars_budget
    )

    ctx = AgentContext.from_settings(agent_settings, run_id=run_id, space_name=space.name)
    triggers = await pop_triggers(space.id)
    if triggers:
        log.info("triggers_found", count=len(triggers), events=[t.get("event") for t in triggers])

    log.info("agent_run_started", trigger_count=len(triggers))
    await publish_event(
        ctx, "info",
        f"Starting run for '{space.name}'" + (f" — {len(triggers)} trigger(s)" if triggers else " — sweep"),
        agent_type="chippi",
    )

    chippi = make_chippi_agent()
    prompt = _build_opening_prompt(space, memory_context, triggers)

    run_config = RunConfig(
        max_turns=settings.coordinator_max_turns,
        tracing_disabled=False,
        model_settings=ModelSettings(
            max_tokens=settings.max_output_tokens,
            truncation="auto",
        ),
    )

    total_tokens = 0
    final_summary: str | None = None

    try:
        result = await Runner.run(chippi, input=prompt, context=ctx, run_config=run_config)

        usage = getattr(result, "usage", None)
        if usage:
            total_tokens = getattr(usage, "total_tokens", 0)
            ctx.tokens_used = total_tokens

        final_output = getattr(result, "final_output", None)
        if isinstance(final_output, str):
            final_summary = final_output[:280]

        log.info("agent_run_completed", total_tokens=total_tokens)

    except InputGuardrailTripwireTriggered as exc:
        info = exc.guardrail_result.output.output_info or {}
        pending = info.get("pending_drafts", "?")
        log.info("agent_run_blocked_input_guardrail", pending_drafts=pending)
        await publish_event(
            ctx, "info",
            f"Run skipped — {pending} draft(s) awaiting review. Review your inbox first.",
            agent_type="chippi",
        )
        return

    except Exception as exc:
        log.exception("agent_run_failed")
        await publish_event(ctx, "error", f"Agent error: {exc}", agent_type="chippi")

    if total_tokens > 0:
        memory_content = (
            final_summary
            or f"Run on {datetime.now(timezone.utc).strftime('%Y-%m-%d')} — {total_tokens:,} tokens used."
        )
        await save_memory(
            space_id=space.id,
            entity_type="space",
            entity_id=space.id,
            memory_type="observation",
            content=memory_content,
            importance=0.25,
        )
        await record_usage(space.id, total_tokens)

    await publish_event(
        ctx, "complete",
        f"Run complete — {total_tokens:,} tokens used",
        metadata={"totalTokens": total_tokens},
    )
    log.info("agent_run_finished", total_tokens=total_tokens)
