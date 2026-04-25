"""AgentContext — runtime-injected security boundary.

spaceId is NEVER taken from LLM tool arguments. It is injected once when the
agent run starts and flows through every tool call via RunContextWrapper.
This prevents prompt-injection attacks from crossing tenant boundaries.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from schemas import AgentSettings, AutonomyLevel


@dataclass
class AgentContext:
    """Immutable per-run context injected at orchestration time."""

    space_id: str
    space_name: str
    autonomy_level: AutonomyLevel
    daily_token_budget: int
    enabled_agents: list[str]
    run_id: str

    # Tokens consumed so far this run (mutable — updated after each LLM call)
    tokens_used: int = field(default=0, compare=False)

    @classmethod
    def from_settings(cls, settings: AgentSettings, run_id: str, space_name: str) -> "AgentContext":
        return cls(
            space_id=settings.space_id,
            space_name=space_name,
            autonomy_level=settings.autonomy_level,
            daily_token_budget=settings.daily_token_budget,
            enabled_agents=settings.enabled_agents,
            run_id=run_id,
        )

    def is_autonomous(self) -> bool:
        return self.autonomy_level == "autonomous"

    def requires_draft(self) -> bool:
        return self.autonomy_level in ("autonomous", "draft_required")

    def requires_approval_for(self, action_type: str) -> bool:
        """Return True when this action needs human approval before execution."""
        # Actions safe to run autonomously regardless of level
        autonomous_actions = {
            "update_lead_score",
            "update_deal_probability",
            "create_follow_up_reminder",
            "log_observation",
            "store_memory",
        }
        if action_type in autonomous_actions:
            return False

        # All other actions respect the space's autonomy level
        if self.autonomy_level == "autonomous":
            return False
        if self.autonomy_level == "draft_required":
            return True  # create draft, wait for approval
        # suggest_only: flag in activity log only
        return True
