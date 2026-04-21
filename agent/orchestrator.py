"""Main orchestrator — runs the Coordinator agent for every active space.

Flow per space:
  1. Load AgentSettings — skip if disabled or daily budget exhausted
  2. Prune expired memories
  3. Load space-level memories for historical context
  4. Build AgentContext with runtime-injected spaceId (security boundary)
  5. Pop any pending Redis event triggers
  6. Run the CoordinatorAgent — it surveys the workspace and hands off to
     only the specialist agents that have a real signal to act on
  7. Record total token usage against the daily budget
  8. Store a run-summary memory for future runs

Security: spaceId is set once in AgentContext and flows through RunContextWrapper.
No tool ever accepts spaceId as a parameter — it is always read from context.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

import structlog
from agents import Runner, RunConfig, ModelSettings

from config import settings
from db import supabase
from memory.store import format_memories_for_prompt, load_memories, prune_expired, save_memory
from schemas import AgentSettings, Space
from security.budget import check_budget, record_usage
from security.context import AgentContext
from tools.streaming import publish_event

logger = structlog.get_logger(__name__)


async def get_enabled_spaces() -> list[tuple[Space, AgentSettings]]:
    """Return all spaces with agent enabled=true."""
    db = await supabase()

    settings_result = await (
        db.table("AgentSettings")
        .select("*")
        .eq("enabled", True)
        .execute()
    )

    if not settings_result.data:
        return []

    space_ids = [row["spaceId"] for row in settings_result.data]
    spaces_result = await (
        db.table("Space")
        .select("id,slug,name")
        .in_("id", space_ids)
        .execute()
    )

    spaces_by_id = {s["id"]: s for s in (spaces_result.data or [])}

    output = []
    for row in settings_result.data:
        space_data = spaces_by_id.get(row["spaceId"])
        if not space_data:
            continue
        agent_settings = AgentSettings.model_validate(row)
        space = Space(id=space_data["id"], slug=space_data["slug"], name=space_data["name"])
        output.append((space, agent_settings))

    return output


async def pop_triggers(space_id: str) -> list[dict]:
    """Pop any pending event triggers from Redis for this space.

    Triggers are pushed by POST /api/agent/trigger when events happen
    (new lead, tour completed, deal stage change). The coordinator receives
    these in its initial prompt so it can prioritise the relevant specialists.
    """
    try:
        from upstash_redis.asyncio import Redis
        if not settings.kv_rest_api_url or not settings.kv_rest_api_token:
            return []
        r = Redis(url=settings.kv_rest_api_url, token=settings.kv_rest_api_token)
        key = f"agent:triggers:{space_id}"
        items = await r.lrange(key, 0, 9)   # pop up to 10 triggers
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


async def run_agent_for_space(space: Space, agent_settings: AgentSettings) -> None:
    """Execute the Coordinator (and via handoffs, the relevant specialists) for one space."""
    run_id = str(uuid.uuid4())
    log = logger.bind(space_id=space.id, space_slug=space.slug, run_id=run_id)

    # Token budget check before spending any inference
    has_budget = await check_budget(space.id, agent_settings.daily_token_budget)
    if not has_budget:
        log.warning("agent_run_skipped_budget_exhausted")
        return

    # Housekeeping: prune stale memories
    pruned = await prune_expired(space.id)
    if pruned:
        log.info("memories_pruned", count=pruned)

    # Load space-level memories to give agents historical context
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

    # Pop pending event triggers (new_lead, tour_completed, deal_stage_changed, etc.)
    triggers = await pop_triggers(space.id)
    if triggers:
        log.info("triggers_found", count=len(triggers), events=[t.get("event") for t in triggers])

    log.info("coordinator_run_started", enabled_agents=agent_settings.enabled_agents)
    await publish_event(
        ctx, "info",
        f"Starting run for '{space.name}' — {len(agent_settings.enabled_agents)} agent(s) available",
        agent_type="coordinator",
    )

    # Build the Coordinator with handoffs to only the enabled specialists
    from agents.coordinator import make_coordinator_agent
    coordinator = make_coordinator_agent(agent_settings.enabled_agents)

    prompt = _build_coordinator_prompt(space, ctx, memory_context, triggers)

    # max_turns covers the full chain: coordinator survey turns + all specialist handoff turns.
    # We do NOT set RunConfig.model so each agent uses its own defined model
    # (coordinator=gpt-4o, specialists=gpt-4o-mini).
    run_config = RunConfig(
        max_turns=settings.coordinator_max_turns,
        tracing_disabled=False,
        model_settings=ModelSettings(
            max_tokens=settings.max_output_tokens,
            truncation="auto",
        ),
    )

    total_tokens = 0
    try:
        result = await Runner.run(
            coordinator,
            input=prompt,
            context=ctx,
            run_config=run_config,
        )

        usage = getattr(result, "usage", None)
        if usage:
            total_tokens = getattr(usage, "total_tokens", 0)
            ctx.tokens_used = total_tokens

        log.info("coordinator_run_completed", total_tokens=total_tokens)

    except Exception as exc:
        log.exception("coordinator_run_failed")
        await publish_event(ctx, "error", f"Coordinator error: {exc}", agent_type="coordinator")

    # Store a run-summary memory so future runs have continuity
    if total_tokens > 0:
        await save_memory(
            space_id=space.id,
            entity_type="space",
            entity_id=space.id,
            memory_type="observation",
            content=(
                f"Agent run on {datetime.now(timezone.utc).strftime('%Y-%m-%d')} — "
                f"coordinator with {len(agent_settings.enabled_agents)} specialist(s) available, "
                f"{total_tokens:,} tokens used."
            ),
            importance=0.2,
        )
        await record_usage(space.id, total_tokens)

    await publish_event(
        ctx, "complete",
        f"Run complete — {total_tokens:,} tokens used",
        metadata={"totalTokens": total_tokens},
    )
    log.info("agent_run_finished", total_tokens=total_tokens)


def _build_coordinator_prompt(
    space: Space,
    ctx: AgentContext,
    memory_context: str,
    triggers: list[dict],
) -> str:
    now = datetime.now(timezone.utc).strftime("%A, %B %d, %Y at %H:%M UTC")

    trigger_section = ""
    if triggers:
        _valid = {"new_lead", "tour_completed", "deal_stage_changed", "application_submitted"}
        lines = []
        for t in triggers:
            event = t.get("event", "")
            if event not in _valid:
                continue
            # Surface contactId and dealId so event-driven agents (e.g. tour_followup)
            # know exactly which entity to act on without scanning the whole workspace.
            parts = [f"- {event}"]
            if t.get("contactId"):
                parts.append(f"contactId: {t['contactId']}")
            if t.get("dealId"):
                parts.append(f"dealId: {t['dealId']}")
            lines.append("  ".join(parts))
        if lines:
            trigger_section = "\n\nActive triggers:\n" + "\n".join(lines)

    return (
        f"Workspace: '{space.name}'\n"
        f"Current time: {now}\n"
        f"Autonomy level: {ctx.autonomy_level}\n"
        f"Enabled agents: {', '.join(ctx.enabled_agents)}"
        f"{trigger_section}\n\n"
        f"{memory_context}\n\n"
        "Survey the workspace and activate the agents that have a real signal to act on."
    ).strip()


async def run_all_spaces() -> None:
    """Entry point called by Modal heartbeat — runs the coordinator for all enabled spaces."""
    log = logger.bind(trigger="heartbeat")
    log.info("heartbeat_started")

    spaces = await get_enabled_spaces()
    if not spaces:
        log.info("no_enabled_spaces")
        return

    log.info("spaces_found", count=len(spaces))

    semaphore = asyncio.Semaphore(5)

    async def run_with_semaphore(space: Space, agent_settings: AgentSettings) -> None:
        async with semaphore:
            await run_agent_for_space(space, agent_settings)

    await asyncio.gather(
        *[run_with_semaphore(space, s) for space, s in spaces],
        return_exceptions=True,
    )

    log.info("heartbeat_finished", spaces_processed=len(spaces))
