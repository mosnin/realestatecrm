"""Top-down swarm orchestrator.

Called by the Modal run_swarm endpoint. Given a goal and optional custom agents,
it plans, executes in parallel, audits, and writes results to Supabase.
All progress is written to SwarmEvent for SSE consumption.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from agents import Agent, ModelSettings, Runner
from openai import AsyncOpenAI

from config import settings
from db import get_pool, supabase as get_supabase
from ledger import record_chat_usage
from llm import (
    CostTrackingClient,
    configure_agents_sdk,
    extract_usage_with_cache,
    get_llm_client,
    make_chat_model,
    openai_model,
    resolve_chat_model,
    usage_accounting_extra_body,
)
from notify import notify_space
from security.budget import acquire_swarm_lock, check_budget, release_swarm_lock

logger = structlog.get_logger(__name__)

# The swarm endpoint receives no AgentSettings (the payload carries only the
# goal + spaceId), so the budget gate uses the same per-space daily default
# the schema declares (AgentSettings.daily_token_budget = 50_000). One gate
# before planning is enough — a swarm that can't afford to plan can't afford
# to run.
_SWARM_DAILY_TOKEN_BUDGET = 50_000

# Hard execution bounds. These are enforced on planner output before any
# SwarmMember row or model call is created; the planner prompt is not trusted
# as a capability boundary. Worker Agents receive no tools and therefore
# cannot delegate again: the maximum child depth is exactly one.
SWARM_MIN_MEMBERS = 2
SWARM_MAX_MEMBERS = 6
SWARM_MAX_CONCURRENT_MEMBERS = 6
SWARM_MAX_CHILD_DEPTH = 1
_ACTIVE_RUN_STATUSES = ("queued", "planning", "running", "auditing")


def validate_swarm_runtime() -> None:
    """Fail before planning or model spend when atomic DB transitions are unavailable."""
    if not settings.database_url:
        raise RuntimeError(
            "Swarm runtime unavailable: DATABASE_URL is required for atomic specialist "
            "transitions. No specialist was started."
        )


def _usage_from_completion(response: object) -> tuple[int, int, int, float | None]:
    """Return (prompt, completion, cached, cost) from a chat.completions result.

    The planner and auditor call the OpenAI client directly, so usage lives on
    `response.usage` (prompt_tokens / completion_tokens), with cached prompt
    tokens under `prompt_tokens_details.cached_tokens`. Honest zero for any
    field the provider didn't populate.
    """
    usage = getattr(response, "usage", None)
    if usage is None:
        return (0, 0, 0, None)
    prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion = int(getattr(usage, "completion_tokens", 0) or 0)
    cached = 0
    details = getattr(usage, "prompt_tokens_details", None)
    if details is not None:
        cached = int(getattr(details, "cached_tokens", 0) or 0)
    raw_cost = getattr(usage, "cost", None)
    cost = float(raw_cost) if isinstance(raw_cost, (int, float)) and raw_cost >= 0 else None
    return (prompt, completion, cached, cost)


async def _notify_run_outcome(space_id: str, goal: str, outcome: str) -> None:
    """Best-effort completion push. Without it a finished background run is
    indistinguishable from a dead one until the realtor happens to open the
    app. notify_space swallows every failure by contract; the extra wrap here
    is belt-and-suspenders so a notification can never fail the run."""
    try:
        snippet = (goal or "").strip()
        if len(snippet) > 120:
            snippet = snippet[:119].rstrip() + "…"
        body = f"{snippet} — {outcome}" if snippet else outcome
        await notify_space(space_id, "Chippi finished a background task", body)
    except Exception as exc:  # noqa: BLE001 — never fail the run over a push
        logger.warning("swarm_notify_failed", space_id=space_id, error=str(exc))


async def emit_event(db, swarm_run_id: str, event_type: str, data: dict, member_id: str | None = None) -> None:
    """Write an event row — consumed by the SSE endpoint."""
    row: dict[str, Any] = {"swarmRunId": swarm_run_id, "type": event_type, "data": data}
    if member_id:
        row["memberId"] = member_id
    await db.table("SwarmEvent").insert(row).execute()


def normalize_swarm_plan(plan: dict, goal: str) -> dict:
    """Clamp untrusted planner output to the product's deterministic bounds."""
    raw_tasks = plan.get("tasks") if isinstance(plan, dict) else None
    tasks = [task for task in (raw_tasks or []) if isinstance(task, dict)]
    tasks = tasks[:SWARM_MAX_MEMBERS]

    while len(tasks) < SWARM_MIN_MEMBERS:
        index = len(tasks) + 1
        tasks.append(
            {
                "name": f"Specialist {index}",
                "role": "Independent specialist",
                "task": (
                    "Investigate a distinct part of this goal and return concise, "
                    f"actionable findings: {goal}"
                ),
                "agentIndex": -1,
                "wave": 1,
            }
        )

    normalized_tasks = []
    for index, task in enumerate(tasks):
        raw_wave = task.get("wave", 1)
        try:
            wave = int(raw_wave)
        except (TypeError, ValueError):
            wave = 1
        normalized_tasks.append(
            {
                **task,
                "name": str(task.get("name") or f"Specialist {index + 1}"),
                "role": str(task.get("role") or "Independent specialist"),
                "task": str(task.get("task") or goal),
                "wave": 2 if wave == 2 else 1,
            }
        )

    return {
        "tasks": normalized_tasks,
        "rationale": str(plan.get("rationale") or "") if isinstance(plan, dict) else "",
        "executionBounds": {
            "maxConcurrentMembers": SWARM_MAX_CONCURRENT_MEMBERS,
            "maxChildDepth": SWARM_MAX_CHILD_DEPTH,
        },
    }


async def _run_status(db, swarm_run_id: str) -> str | None:
    result = await (
        db.table("SwarmRun")
        .select("status")
        .eq("id", swarm_run_id)
        .maybe_single()
        .execute()
    )
    if not isinstance(result.data, dict):
        return None
    status = result.data.get("status")
    return status if isinstance(status, str) else None


async def _run_is_cancelled(db, swarm_run_id: str) -> bool:
    return await _run_status(db, swarm_run_id) == "cancelled"


async def _publish_member_transition_if_parent_active(
    swarm_run_id: str,
    member_id: str,
    *,
    member_status: str,
    allowed_member_statuses: tuple[str, ...],
    event_type: str,
    event_data: dict,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
    output: str | None = None,
    set_output: bool = False,
) -> bool:
    """Atomically transition a member and publish its event under a parent lock.

    The parent row is locked and required to still be ``running`` in the same
    SQL statement as the member update and event insert. Cancellation either
    wins first (no member/event write) or waits for this transition to commit,
    after which the transition is truthfully ordered before cancellation.
    """
    pool = await get_pool()
    sql = """
        WITH active_run AS MATERIALIZED (
          SELECT "id"
          FROM "SwarmRun"
          WHERE "id" = $1
            AND "status" = ANY($2::text[])
          FOR UPDATE
        ),
        updated_member AS (
          UPDATE "SwarmMember" AS member
          SET "status" = $4,
              "startedAt" = COALESCE($6::timestamptz, member."startedAt"),
              "completedAt" = COALESCE($7::timestamptz, member."completedAt"),
              "output" = CASE WHEN $8 THEN $9 ELSE member."output" END
          FROM active_run
          WHERE member."id" = $3
            AND member."swarmRunId" = active_run."id"
            AND member."status" = ANY($5::text[])
          RETURNING member."id"
        )
        INSERT INTO "SwarmEvent" ("swarmRunId", "memberId", "type", "data")
        SELECT $1, updated_member."id", $10, $11::jsonb
        FROM updated_member
        RETURNING "id"
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            sql,
            swarm_run_id,
            ("running",),
            member_id,
            member_status,
            list(allowed_member_statuses),
            started_at,
            completed_at,
            set_output,
            output,
            event_type,
            event_data,
        )
    return row is not None


async def _transition_active_run(
    db,
    swarm_run_id: str,
    payload: dict,
    allowed_statuses: tuple[str, ...] = _ACTIVE_RUN_STATUSES,
) -> bool:
    """Conditionally update a live run without overwriting cancellation."""
    result = await (
        db.table("SwarmRun")
        .update(payload)
        .eq("id", swarm_run_id)
        .in_("status", allowed_statuses)
        .execute()
    )
    return bool(result.data)


async def _run_members_bounded(db, swarm_run_id: str, members: list[dict], space_id: str) -> None:
    """Execute one wave with an explicit, deterministic concurrency ceiling."""
    semaphore = asyncio.Semaphore(SWARM_MAX_CONCURRENT_MEMBERS)

    async def run_bounded(member: dict) -> None:
        async with semaphore:
            await run_member(db, swarm_run_id, member, space_id)

    results = await asyncio.gather(
        *[run_bounded(member) for member in members],
        return_exceptions=True,
    )
    errors = [result for result in results if isinstance(result, BaseException)]
    if errors:
        raise RuntimeError(
            f"{len(errors)} specialist execution(s) failed before publishing a terminal state"
        )


async def _persist_members_then_emit_plan(
    db,
    swarm_run_id: str,
    plan: dict,
    custom_agents: list[dict],
    goal: str,
) -> list[dict]:
    """Persist the complete planned tree before announcing it to live clients."""
    members = []
    for task_def in plan.get("tasks", []):
        if not isinstance(task_def, dict):
            continue
        raw_index = task_def.get("agentIndex", -1)
        try:
            agent_index = int(raw_index)
        except (TypeError, ValueError):
            agent_index = -1
        agent_config = (
            custom_agents[agent_index]
            if 0 <= agent_index < len(custom_agents)
            else None
        )
        member_row = {
            "swarmRunId": swarm_run_id,
            "customAgentId": agent_config["id"] if agent_config else None,
            "name": task_def.get("name", "Specialist"),
            "role": task_def.get("role", ""),
            "systemPrompt": agent_config["systemPrompt"] if agent_config else "",
            "task": task_def.get("task", goal),
            "wave": task_def.get("wave", 1),
            "status": "queued",
        }
        result = await db.table("SwarmMember").insert(member_row).execute()
        members.append(result.data[0])

    await emit_event(
        db,
        swarm_run_id,
        "plan_created",
        {"plan": plan, "taskCount": len(members), "membersReady": True},
    )
    return members


async def plan_swarm(
    goal: str, custom_agents: list[dict], client: AsyncOpenAI, space_id: str
) -> dict:
    """Ask GPT-4o to decompose the goal into parallel sub-tasks. Returns a plan dict."""
    agent_roster = "\n".join(
        f"- Agent {i}: {a['name']} — {a.get('systemPrompt', '')[:200]}"
        for i, a in enumerate(custom_agents)
    ) if custom_agents else "No custom agents specified — use general-purpose sub-agents."

    prompt = f"""You are a planning AI for a real estate agent's swarm system.

Goal: {goal}

Available agents:
{agent_roster}

Decompose this goal into 2-6 parallel sub-tasks. Each task should be independent enough to run in parallel.

Return ONLY valid JSON in this exact format:
{{
  "tasks": [
    {{
      "name": "Task name",
      "role": "One-line role description",
      "task": "Specific task instructions (2-4 sentences)",
      "agentIndex": 0,
      "wave": 1
    }}
  ],
  "rationale": "Why these tasks"
}}

Rules:
- Keep tasks focused and achievable
- Each task should contribute uniquely to the goal
- Use agentIndex to map to a custom agent (0-based), or -1 to auto-assign
- wave=1 for first-wave parallel tasks, wave=2 for tasks that depend on wave-1 results
"""
    planner_model = openai_model("gpt-4o-mini")
    response = await client.chat.completions.create(
        model=planner_model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        max_tokens=1000,
        extra_body=usage_accounting_extra_body(),
    )
    # Bill the planner call. Direct chat.completions usage shape, recorded as
    # one ChatUsage row so the credit trigger fires. Best-effort: never raises.
    p_in, p_out, p_cached, p_cost = _usage_from_completion(response)
    await record_chat_usage(
        space_id=space_id,
        model=planner_model,
        prompt_tokens=p_in,
        completion_tokens=p_out,
        cached_tokens=p_cached,
        cost_usd=p_cost,
        route="agent",
    )
    plan_text = response.choices[0].message.content or "{}"
    # The planner LLM is asked for JSON (response_format=json_object), but a
    # provider that ignores the format or truncates the response would crash
    # the entire swarm on an unguarded parse. Degrade to a single auto-assigned
    # task covering the whole goal so the run still produces something.
    try:
        plan = json.loads(plan_text)
        if not isinstance(plan, dict) or not isinstance(plan.get("tasks"), list) or not plan["tasks"]:
            raise ValueError("planner returned no tasks")
        return normalize_swarm_plan(plan, goal)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("swarm_plan_parse_failed", error=str(exc)[:200])
        return normalize_swarm_plan(
            {
                "tasks": [
                    {
                        "name": "Complete goal",
                        "role": "General-purpose agent",
                        "task": goal,
                        "agentIndex": -1,
                        "wave": 1,
                    }
                ],
                "rationale": "Planner output was unparseable; running goal as a single task.",
            },
            goal,
        )


async def run_member(db, swarm_run_id: str, member: dict, space_id: str) -> None:
    """Run a single sub-agent and persist its output."""
    member_id = member["id"]

    started = await _publish_member_transition_if_parent_active(
        swarm_run_id,
        member_id,
        member_status="running",
        allowed_member_statuses=("queued",),
        event_type="agent_started",
        event_data={
            "name": member["name"],
            "role": member.get("role", ""),
            "task": member["task"],
        },
        started_at=datetime.now(timezone.utc),
    )
    if not started:
        return

    try:
        system_prompt = member.get("systemPrompt") or (
            f"You are {member['name']}, a real estate AI assistant. {member.get('role', '')}. "
            "Be concise, accurate, and helpful. Focus on the specific task assigned."
        )

        member_model = resolve_chat_model(settings.worker_model)
        # Per-member cost tracker: opts each model call into OpenRouter usage
        # accounting and sums the exact request cost across the run.
        cost_tracker = CostTrackingClient(get_llm_client())
        agent = Agent(
            name=member["name"],
            instructions=system_prompt,
            model=make_chat_model(member_model, openai_client=cost_tracker),
            model_settings=ModelSettings(max_tokens=2048),
        )

        result = await Runner.run(agent, member["task"], max_turns=8)
        output = result.final_output or "No output produced."

        # Bill this member's model usage. Agents SDK shape — same extractor the
        # chat path uses. One ChatUsage row per member so the credit trigger
        # fires; best-effort, never raises.
        m_in, m_out, _, m_cached = extract_usage_with_cache(result)
        await record_chat_usage(
            space_id=space_id,
            model=member_model,
            prompt_tokens=m_in,
            completion_tokens=m_out,
            cached_tokens=m_cached,
            cost_usd=cost_tracker.cost_usd,
            route="agent",
        )

        await _publish_member_transition_if_parent_active(
            swarm_run_id,
            member_id,
            member_status="completed",
            allowed_member_statuses=("running",),
            event_type="agent_completed",
            event_data={"name": member["name"], "output": output},
            completed_at=datetime.now(timezone.utc),
            output=output,
            set_output=True,
        )

    except Exception as exc:
        logger.error("swarm_member_failed", member_id=member_id, error=str(exc))
        await _publish_member_transition_if_parent_active(
            swarm_run_id,
            member_id,
            member_status="failed",
            allowed_member_statuses=("running",),
            event_type="agent_failed",
            event_data={"name": member["name"], "error": str(exc)},
            completed_at=datetime.now(timezone.utc),
            output=f"Error: {exc}",
            set_output=True,
        )


async def audit_results(goal: str, members: list[dict], client: AsyncOpenAI, space_id: str) -> str:
    """Synthesize sub-agent outputs into a final answer."""
    results_text = "\n\n".join(
        f"**{m['name']}** ({m.get('role', 'agent')}):\n{m.get('output', 'No output')}"
        for m in members
    )

    prompt = f"""You are a quality auditor synthesizing results from a swarm of AI agents.

Original goal: {goal}

Sub-agent results:
{results_text}

Synthesize these results into a clear, comprehensive final answer.
- Highlight key findings
- Note any conflicts or gaps
- Provide actionable recommendations
- Be concise but complete

Format with markdown headers for readability."""

    auditor_model = openai_model("gpt-4o-mini")
    response = await client.chat.completions.create(
        model=auditor_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
        extra_body=usage_accounting_extra_body(),
    )
    # Bill the auditor call — one ChatUsage row, same as the planner.
    a_in, a_out, a_cached, a_cost = _usage_from_completion(response)
    await record_chat_usage(
        space_id=space_id,
        model=auditor_model,
        prompt_tokens=a_in,
        completion_tokens=a_out,
        cached_tokens=a_cached,
        cost_usd=a_cost,
        route="agent",
    )
    return response.choices[0].message.content or "No synthesis produced."


async def run_swarm(payload: dict) -> None:
    """Main entry point called by the Modal endpoint."""
    validate_swarm_runtime()
    swarm_run_id: str = payload["swarmRunId"]
    goal: str = payload["goal"]
    space_id: str = payload["spaceId"]
    custom_agents: list[dict] = payload.get("customAgents", [])

    # supabase() eagerly initializes the same DATABASE_URL-backed asyncpg pool
    # used by atomic member transitions. Fail here before SDK setup, planning,
    # member creation, or any billable model work.
    db = await get_supabase()
    configure_agents_sdk()
    client = get_llm_client()

    # One swarm per space at a time. A double-submit to /api/swarm creates two
    # SwarmRuns and would bill BOTH (the planner, every member, and the auditor
    # each record ChatUsage). Mirrors the autonomous acquire_run_lock; a
    # separate Redis namespace keeps autonomous runs and swarms from blocking
    # each other. Fails open if Redis is unavailable.
    if not await acquire_swarm_lock(space_id, swarm_run_id):
        logger.warning("swarm_skipped_concurrent", swarm_run_id=swarm_run_id, space_id=space_id)
        changed = await _transition_active_run(db, swarm_run_id, {
            "status": "failed",
            "errorMessage": "Another swarm is already running for this workspace.",
            "completedAt": datetime.now(timezone.utc).isoformat(),
        })
        if not changed:
            return
        await emit_event(
            db, swarm_run_id, "swarm_failed",
            {"error": "Another swarm is already running for this workspace."},
        )
        # No completion push here on purpose: this is a double-submit and the
        # realtor is looking at the immediate error in the UI; the swarm that
        # holds the lock will send its own completion push.
        return

    try:
        # Budget gate — the swarm runs the planner, every member, and the
        # auditor against real models. Before this gate it ran completely
        # ungated: an exhausted space could fire an unbounded swarm bill.
        # One check up front (same per-space daily counter the autonomous
        # orchestrator uses) is enough; refuse the whole run when spent.
        if not await check_budget(space_id, _SWARM_DAILY_TOKEN_BUDGET):
            logger.warning(
                "swarm_skipped_budget_exhausted",
                swarm_run_id=swarm_run_id,
                space_id=space_id,
            )
            changed = await _transition_active_run(db, swarm_run_id, {
                "status": "failed",
                "errorMessage": "Daily token budget exhausted — swarm skipped.",
                "completedAt": datetime.now(timezone.utc).isoformat(),
            })
            if not changed:
                return
            await emit_event(
                db, swarm_run_id, "swarm_failed", {"error": "Daily token budget exhausted."}
            )
            await _notify_run_outcome(
                space_id, goal, "did not run: daily token budget exhausted"
            )
            return

        # Planning phase
        if not await _transition_active_run(
            db, swarm_run_id, {"status": "planning"}, ("queued",)
        ):
            return
        await emit_event(db, swarm_run_id, "swarm_planning", {"message": "Analyzing goal and creating execution plan..."})

        plan = await plan_swarm(goal, custom_agents, client, space_id)

        if not await _transition_active_run(db, swarm_run_id, {
            "plan": plan,
            "status": "running",
        }, ("planning",)):
            return
        members = await _persist_members_then_emit_plan(
            db, swarm_run_id, plan, custom_agents, goal
        )

        # Run wave 1 in parallel. return_exceptions=True so one member whose
        # DB write escapes run_member's own handler can't cancel its siblings
        # mid-flight — each sub-agent stands or falls on its own.
        wave_1 = [m for m in members if m.get("wave", 1) == 1]
        await _run_members_bounded(db, swarm_run_id, wave_1, space_id)

        if await _run_is_cancelled(db, swarm_run_id):
            return

        # Run wave 2 if any (sequential after wave 1)
        wave_2 = [m for m in members if m.get("wave", 1) == 2]
        if wave_2:
            await emit_event(db, swarm_run_id, "wave_2_starting", {"agentCount": len(wave_2)})
            await _run_members_bounded(db, swarm_run_id, wave_2, space_id)

        if await _run_is_cancelled(db, swarm_run_id):
            return

        # Audit phase
        if not await _transition_active_run(
            db, swarm_run_id, {"status": "auditing"}, ("running",)
        ):
            return
        await emit_event(db, swarm_run_id, "audit_started", {"message": "Synthesizing results..."})

        # Reload members with outputs
        members_result = await db.table("SwarmMember").select("name,role,output,status").eq("swarmRunId", swarm_run_id).execute()
        final_result = await audit_results(goal, members_result.data or [], client, space_id)

        # Complete
        if not await _transition_active_run(db, swarm_run_id, {
            "status": "completed",
            "result": final_result,
            "completedAt": datetime.now(timezone.utc).isoformat(),
        }, ("auditing",)):
            return
        await emit_event(db, swarm_run_id, "swarm_completed", {"result": final_result})
        await _notify_run_outcome(space_id, goal, "completed")

    except Exception as exc:
        if await _run_is_cancelled(db, swarm_run_id):
            return
        logger.error("swarm_failed", swarm_run_id=swarm_run_id, error=str(exc))
        changed = await _transition_active_run(db, swarm_run_id, {
            "status": "failed",
            "errorMessage": str(exc),
            "completedAt": datetime.now(timezone.utc).isoformat(),
        })
        if not changed:
            return
        await emit_event(db, swarm_run_id, "swarm_failed", {"error": str(exc)})
        await _notify_run_outcome(space_id, goal, "failed")

    finally:
        await release_swarm_lock(space_id, swarm_run_id)
