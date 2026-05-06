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

import asyncio
import json
import uuid
from datetime import datetime, timezone

import structlog
from agents import InputGuardrailTripwireTriggered, ModelSettings, RunConfig, Runner
from openai import AsyncOpenAI, APIStatusError, RateLimitError

from config import settings
from db import supabase
from ledger import StepLedger
from memory.store import format_memories_for_prompt, load_memories, prune_expired, save_memory
from schemas import AgentSettings, Space
from security.budget import check_budget, record_usage
from security.context import AgentContext
from chippi import make_chippi_agent
from tools.streaming import publish_event

# ---------------------------------------------------------------------------
# Optional module guards (T8 modules — may not be committed yet)
# ---------------------------------------------------------------------------

try:
    from checkpoints import save_checkpoint, load_checkpoint
    _CHECKPOINTS_AVAILABLE = True
except ImportError:
    _CHECKPOINTS_AVAILABLE = False
    save_checkpoint = load_checkpoint = None  # type: ignore[assignment]

try:
    from heartbeat import HeartbeatPinger
    _HEARTBEAT_AVAILABLE = True
except ImportError:
    _HEARTBEAT_AVAILABLE = False
    HeartbeatPinger = None  # type: ignore[assignment,misc]

try:
    from compaction import compact_messages
    _COMPACTION_AVAILABLE = True
except ImportError:
    _COMPACTION_AVAILABLE = False
    compact_messages = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Model fallback list (KR2)
# ---------------------------------------------------------------------------

_FALLBACK_MODELS = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1-nano"]

# ---------------------------------------------------------------------------
# High-risk tool detection (KR4)
# ---------------------------------------------------------------------------

_HIGH_RISK_PATTERNS = ["send_", "archive_", "delete_", "mark_deal_lost", "mark_person"]


def _is_high_risk_tool(tool_name: str) -> bool:
    """Return True when a tool name matches a high-risk operation pattern."""
    return any(tool_name.startswith(p) or p in tool_name for p in _HIGH_RISK_PATTERNS)

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Model-fallback runner (KR2)
# ---------------------------------------------------------------------------

async def _run_with_fallback(
    agent,
    input_data,
    run_config: RunConfig,
    context,
) -> object:
    """Run the agent, falling back through _FALLBACK_MODELS on 429 errors.

    The agent's model attribute is patched per attempt. On exhaustion raises
    RuntimeError so the caller can surface a clean error rather than a bare
    exception.
    """
    last_exc: Exception | None = None
    for i, model in enumerate(_FALLBACK_MODELS):
        try:
            agent.model = model
            result = await Runner.run(
                agent, input=input_data, run_config=run_config, context=context
            )
            return result
        except (RateLimitError, APIStatusError) as exc:
            status = getattr(exc, "status_code", None)
            err_str = str(exc)
            is_429 = isinstance(exc, RateLimitError) or status == 429 or "429" in err_str
            if is_429 and i < len(_FALLBACK_MODELS) - 1:
                next_model = _FALLBACK_MODELS[i + 1]
                logger.warning(
                    "model_rate_limited_falling_back",
                    model=model,
                    next_model=next_model,
                    attempt=i + 1,
                )
                await asyncio.sleep(2)
                last_exc = exc
                continue
            raise
        except Exception as exc:
            err_str = str(exc)
            if ("429" in err_str or "rate_limit" in err_str.lower()) and i < len(_FALLBACK_MODELS) - 1:
                next_model = _FALLBACK_MODELS[i + 1]
                logger.warning(
                    "model_rate_limited_falling_back",
                    model=model,
                    next_model=next_model,
                    attempt=i + 1,
                )
                await asyncio.sleep(2)
                last_exc = exc
                continue
            raise
    raise RuntimeError(f"All models exhausted after rate-limit errors") from last_exc


# ---------------------------------------------------------------------------
# Critic / verifier (KR3)
# ---------------------------------------------------------------------------

async def _run_critic(goal: str, outcome_summary: str, client: AsyncOpenAI) -> str:
    """Ask a cheap LLM whether the agent accomplished its goal.

    Returns a short verdict string like "YES — the agent ..." or "NO — ...".
    On failure returns "UNKNOWN" so the caller can still store a metadata entry.
    """
    try:
        resp = await client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You evaluate if an agent completed its goal. "
                        "Respond: YES or NO, then one sentence why."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Goal: {goal}\n\nOutcome: {outcome_summary}",
                },
            ],
            max_tokens=100,
        )
        return resp.choices[0].message.content or "UNKNOWN"
    except Exception as exc:
        logger.warning("critic_call_failed", error=str(exc))
        return "UNKNOWN"


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

    # task_id is not available for autonomous sweeps (no AgentTask row exists).
    # The ledger will skip DB writes gracefully when task_id is None.
    ledger = StepLedger(space_id=space.id, task_id=None)

    total_tokens = 0
    final_summary: str | None = None

    try:
        result = await Runner.run(chippi, input=prompt, context=ctx, run_config=run_config)

        usage = getattr(result, "usage", None)
        tokens_in: int = 0
        tokens_out: int = 0
        if usage:
            tokens_in = getattr(usage, "input_tokens", 0) or 0
            tokens_out = getattr(usage, "output_tokens", 0) or 0
            total_tokens = getattr(usage, "total_tokens", 0) or (tokens_in + tokens_out)
            ctx.tokens_used = total_tokens

        final_output = getattr(result, "final_output", None)
        if isinstance(final_output, str):
            final_summary = final_output[:280]

        # Record the full agent run as a single LLM-call step in the ledger.
        await ledger.record_llm_call(
            tool_name="chippi",
            input_summary=prompt[:500],
            output_summary=final_summary or f"{total_tokens:,} tokens used",
            model=settings.orchestrator_model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
        )

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
