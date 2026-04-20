"""Main orchestrator — runs all enabled agents for every active space.

Flow per space:
  1. Load AgentSettings — skip if disabled or budget exhausted
  2. Prune expired memories
  3. Load space-level memories to give agents historical context
  4. Build AgentContext with runtime-injected spaceId
  5. Check for pending event triggers (new_lead, tour_completed, etc.)
  6. Run each enabled specialist agent sequentially
  7. Record token usage against daily budget
  8. Store run-summary memory

Security: spaceId is set once in AgentContext and flows through RunContextWrapper.
No tool ever accepts spaceId as a parameter — it is always read from context.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import structlog
from agents import Runner, RunConfig

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
    (new lead, tour completed, deal stage change). Processing them here
    means the agent reacts within the next heartbeat (~15 min) rather
    than waiting for the next scheduled analysis.
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
        return [json.loads(i) if isinstance(i, str) else i for i in (items or [])]
    except Exception:
        return []


async def run_agent_for_space(space: Space, agent_settings: AgentSettings) -> None:
    """Execute all enabled agents for one space."""
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
    memory_context = await format_memories_for_prompt(space_memories)

    ctx = AgentContext.from_settings(agent_settings, run_id=run_id, space_name=space.name)

    # Check for triggered events (new lead, tour completed, etc.)
    triggers = await pop_triggers(space.id)
    if triggers:
        log.info("triggers_found", count=len(triggers), triggers=[t.get("event") for t in triggers])

    log.info("agent_run_started", enabled_agents=agent_settings.enabled_agents)
    await publish_event(ctx, "info", f"Starting run for '{space.name}' — {len(agent_settings.enabled_agents)} agent(s)")
    total_tokens = 0

    # Lazy imports so Modal only loads code that's actually needed
    from agents.lead_nurture import make_lead_nurture_agent
    from agents.deal_sentinel import make_deal_sentinel_agent
    from agents.long_term_nurture import make_long_term_nurture_agent
    from agents.lead_scorer import make_lead_scorer_agent

    agent_registry = {
        "lead_nurture": make_lead_nurture_agent,
        "deal_sentinel": make_deal_sentinel_agent,
        "long_term_nurture": make_long_term_nurture_agent,
        "lead_scorer": make_lead_scorer_agent,
    }

    AGENT_DISPLAY_NAMES = {
        "lead_nurture": "Lead Nurture Agent",
        "deal_sentinel": "Deal Sentinel Agent",
        "long_term_nurture": "Long-Term Nurture Agent",
        "lead_scorer": "Lead Scorer Agent",
    }

    run_config = RunConfig(
        model=settings.orchestrator_model,
        max_turns=settings.max_react_iterations,
        tracing_disabled=False,
    )

    # If there are triggers, prioritise the relevant agents regardless of schedule
    agents_to_run = list(agent_settings.enabled_agents)
    for trigger in triggers:
        event = trigger.get("event", "")
        if event == "new_lead" and "lead_nurture" not in agents_to_run:
            agents_to_run.insert(0, "lead_nurture")
        elif event == "tour_completed" and "lead_scorer" not in agents_to_run:
            agents_to_run.insert(0, "lead_scorer")
        elif event == "deal_stage_changed" and "deal_sentinel" not in agents_to_run:
            agents_to_run.insert(0, "deal_sentinel")

    for agent_name in agents_to_run:
        factory = agent_registry.get(agent_name)
        if not factory:
            log.warning("unknown_agent_skipped", agent=agent_name)
            continue

        display_name = AGENT_DISPLAY_NAMES.get(agent_name, agent_name)
        agent = factory()
        agent_log = log.bind(agent=agent_name)
        agent_log.info("agent_started")
        await publish_event(ctx, "info", f"Starting {display_name}…", agent_type=agent_name)

        try:
            prompt = _build_agent_prompt(
                agent_name, space, ctx, memory_context, triggers
            )
            result = await Runner.run(
                agent,
                input=prompt,
                context=ctx,
                run_config=run_config,
            )

            usage = getattr(result, "usage", None)
            if usage:
                run_tokens = getattr(usage, "total_tokens", 0)
                total_tokens += run_tokens
                ctx.tokens_used += run_tokens

            agent_log.info("agent_completed", tokens=total_tokens)
            await publish_event(ctx, "action", f"{display_name} finished", agent_type=agent_name)

        except Exception as exc:
            agent_log.exception("agent_run_failed")
            await publish_event(ctx, "error", f"{display_name} error: {exc}", agent_type=agent_name)

    # Store a run-summary memory so future runs know this happened
    if total_tokens > 0:
        await save_memory(
            space_id=space.id,
            entity_type="space",
            entity_id=space.id,
            memory_type="observation",
            content=f"Agent run completed on {datetime.now(timezone.utc).strftime('%Y-%m-%d')} — {len(agents_to_run)} agent(s), {total_tokens:,} tokens.",
            importance=0.2,
        )

    if total_tokens > 0:
        await record_usage(space.id, total_tokens)

    await publish_event(
        ctx, "complete",
        f"Run complete — {total_tokens:,} tokens used",
        metadata={"totalTokens": total_tokens},
    )
    log.info("agent_run_finished", total_tokens=total_tokens)


def _build_agent_prompt(
    agent_name: str,
    space: Space,
    ctx: AgentContext,
    memory_context: str,
    triggers: list[dict],
) -> str:
    now = datetime.now(timezone.utc).strftime("%A, %B %d, %Y at %H:%M UTC")

    trigger_context = ""
    if triggers:
        events = [t.get("event", "unknown") for t in triggers]
        trigger_context = f"\n\nTriggered by recent events: {', '.join(events)}. Prioritise contacts/deals related to these events."

    return (
        f"You are running as the {agent_name} agent for the real estate workspace '{space.name}'.\n"
        f"Current time: {now}\n"
        f"Autonomy level: {ctx.autonomy_level}\n"
        f"{trigger_context}\n\n"
        f"{memory_context}\n\n"
        "Review the workspace and take appropriate actions within your role.\n"
        "Be concise. Prioritise high-impact actions. Stop after handling the most important items."
    ).strip()


async def run_all_spaces() -> None:
    """Entry point called by Modal heartbeat — runs agents for all enabled spaces."""
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
