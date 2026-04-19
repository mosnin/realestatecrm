"""Main orchestrator — runs all enabled agents for every active space.

Flow per space:
  1. Load AgentSettings — skip if disabled or budget exhausted
  2. Build AgentContext with runtime-injected spaceId
  3. Run each enabled specialist agent sequentially
  4. Record token usage against daily budget
  5. Log run summary

Security: spaceId is set once in AgentContext and flows through RunContextWrapper.
No tool ever accepts spaceId as a parameter — it is always read from context.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

import structlog
from agents import Runner, RunConfig

from config import settings
from db import supabase
from schemas import AgentSettings, Space
from security.budget import check_budget, record_usage
from security.context import AgentContext

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


async def run_agent_for_space(space: Space, agent_settings: AgentSettings) -> None:
    """Execute all enabled agents for one space."""
    run_id = str(uuid.uuid4())
    log = logger.bind(space_id=space.id, space_slug=space.slug, run_id=run_id)

    # Token budget check before spending any inference
    has_budget = await check_budget(space.id, agent_settings.daily_token_budget)
    if not has_budget:
        log.warning("agent_run_skipped_budget_exhausted")
        return

    ctx = AgentContext.from_settings(agent_settings, run_id=run_id, space_name=space.name)

    log.info("agent_run_started", enabled_agents=agent_settings.enabled_agents)
    total_tokens = 0

    # Import agents lazily so Modal only loads them when needed
    from agents.lead_nurture import make_lead_nurture_agent
    from agents.deal_sentinel import make_deal_sentinel_agent

    agent_registry = {
        "lead_nurture": make_lead_nurture_agent,
        "deal_sentinel": make_deal_sentinel_agent,
    }

    run_config = RunConfig(
        model=settings.orchestrator_model,
        max_turns=settings.max_react_iterations,
        tracing_disabled=False,  # enables OpenAI traces dashboard
    )

    for agent_name in agent_settings.enabled_agents:
        factory = agent_registry.get(agent_name)
        if not factory:
            log.warning("unknown_agent_skipped", agent=agent_name)
            continue

        agent = factory()
        agent_log = log.bind(agent=agent_name)
        agent_log.info("agent_started")

        try:
            prompt = _build_agent_prompt(agent_name, space, ctx)
            result = await Runner.run(
                agent,
                input=prompt,
                context=ctx,
                run_config=run_config,
            )

            # Accumulate token usage from this agent's run
            usage = getattr(result, "usage", None)
            if usage:
                run_tokens = getattr(usage, "total_tokens", 0)
                total_tokens += run_tokens
                ctx.tokens_used += run_tokens

            agent_log.info("agent_completed", tokens=total_tokens)

        except Exception:
            agent_log.exception("agent_run_failed")
            # Continue to next agent — don't let one failure kill the run

    # Record total usage against budget
    if total_tokens > 0:
        await record_usage(space.id, total_tokens)

    log.info("agent_run_finished", total_tokens=total_tokens)


def _build_agent_prompt(agent_name: str, space: Space, ctx: AgentContext) -> str:
    now = datetime.now(timezone.utc).strftime("%A, %B %d, %Y at %H:%M UTC")
    return (
        f"You are running as the {agent_name} agent for the real estate workspace '{space.name}'.\n"
        f"Current time: {now}\n"
        f"Autonomy level: {ctx.autonomy_level}\n\n"
        f"Review the workspace and take appropriate actions within your role.\n"
        f"Be concise. Prioritise high-impact actions. Stop after handling the most important items."
    )


async def run_all_spaces() -> None:
    """Entry point called by Modal heartbeat — runs agents for all enabled spaces."""
    log = logger.bind(trigger="heartbeat")
    log.info("heartbeat_started")

    spaces = await get_enabled_spaces()
    if not spaces:
        log.info("no_enabled_spaces")
        return

    log.info("spaces_found", count=len(spaces))

    # Run spaces concurrently but cap concurrency to avoid overloading the DB
    semaphore = asyncio.Semaphore(5)

    async def run_with_semaphore(space: Space, agent_settings: AgentSettings) -> None:
        async with semaphore:
            await run_agent_for_space(space, agent_settings)

    await asyncio.gather(
        *[run_with_semaphore(space, s) for space, s in spaces],
        return_exceptions=True,
    )

    log.info("heartbeat_finished", spaces_processed=len(spaces))
