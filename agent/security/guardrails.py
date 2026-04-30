"""Agent guardrails — pre- and post-run safety checks for the Coordinator.

Input guardrail  (fires before the first LLM call):
  pending_drafts_guardrail — blocks the run if the realtor already has ≥10
  unreviewed drafts. Prevents the agent from burying the realtor in drafts
  they haven't had time to review.

Output guardrail (fires after the coordinator produces its final report):
  run_integrity_guardrail — validates the CoordinatorRunReport before it is
  stored as memory. Catches degenerate outputs (empty summary, negative counts)
  that would corrupt future context.
"""

from __future__ import annotations

from typing import Any

from agents import Agent, GuardrailFunctionOutput, RunContextWrapper, input_guardrail, output_guardrail

from db import supabase
from schemas import CoordinatorRunReport
from security.context import AgentContext


# ─── Input guardrail — draft overload protection ──────────────────────────────

DRAFT_OVERLOAD_THRESHOLD = 10


@input_guardrail
async def pending_drafts_guardrail(
    ctx: RunContextWrapper[AgentContext],
    agent: Agent,
    input: Any,  # noqa: A002
) -> GuardrailFunctionOutput:
    """Block the agent run when the space already has too many unreviewed drafts.

    Rationale: if the realtor hasn't reviewed 10+ drafts from previous runs,
    creating more will overwhelm them and devalue every suggestion. The agent
    should wait until the inbox is cleared.
    """
    db = await supabase()
    result = await (
        db.table("AgentDraft")
        .select("id", count="exact")
        .eq("spaceId", ctx.context.space_id)
        .eq("status", "pending")
        .execute()
    )
    count = result.count or 0

    if count >= DRAFT_OVERLOAD_THRESHOLD:
        return GuardrailFunctionOutput(
            output_info={
                "pending_drafts": count,
                "threshold": DRAFT_OVERLOAD_THRESHOLD,
                "reason": (
                    f"Workspace has {count} unreviewed drafts "
                    f"(threshold: {DRAFT_OVERLOAD_THRESHOLD}). "
                    "Review your agent inbox before the next run."
                ),
            },
            tripwire_triggered=True,
        )

    return GuardrailFunctionOutput(
        output_info={"pending_drafts": count},
        tripwire_triggered=False,
    )


# ─── Output guardrail — run report integrity ──────────────────────────────────

@output_guardrail
async def run_integrity_guardrail(
    ctx: RunContextWrapper[AgentContext],
    agent: Agent,
    output: CoordinatorRunReport,
) -> GuardrailFunctionOutput:
    """Validate the CoordinatorRunReport before it is stored as memory.

    Trips when the report is clearly degenerate:
    - Summary is empty or trivially short (< 15 characters)
    - Any count field is negative (data corruption indicator)

    Does NOT trip for runs where nothing_to_do=True — a healthy, quiet workspace
    is a legitimate outcome and should be stored.
    """
    issues = []

    if not output.overall_summary or len(output.overall_summary.strip()) < 15:
        issues.append("overall_summary is missing or too short")

    if output.total_drafts_created < 0:
        issues.append("total_drafts_created is negative")

    if output.total_follow_ups_set < 0:
        issues.append("total_follow_ups_set is negative")

    if issues:
        return GuardrailFunctionOutput(
            output_info={"issues": issues, "report": output.model_dump()},
            tripwire_triggered=True,
        )

    return GuardrailFunctionOutput(
        output_info={"valid": True},
        tripwire_triggered=False,
    )
