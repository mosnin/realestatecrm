"""Pydantic models mirroring the TypeScript types in lib/types.ts.

Keep in sync with supabase/schema.sql and lib/types.ts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums / Literals
# ---------------------------------------------------------------------------

LeadType = Literal["rental", "buyer"]
DealStatus = Literal["active", "won", "lost", "on_hold"]
Priority = Literal["LOW", "MEDIUM", "HIGH"]
ContactType = Literal["QUALIFICATION", "TOUR", "APPLICATION"]
AutonomyLevel = Literal["autonomous", "draft_required", "suggest_only"]
DraftChannel = Literal["sms", "email", "note"]
DraftStatus = Literal["pending", "approved", "dismissed", "sent"]
AgentType = Literal["lead_nurture", "deal_sentinel", "long_term_nurture", "lead_scorer", "tour_followup", "offer_agent", "coordinator"]
ActionOutcome = Literal["completed", "queued_for_approval", "suggested", "failed"]
MemoryType = Literal["fact", "preference", "observation", "reminder"]
EntityType = Literal["contact", "deal", "space"]


# ---------------------------------------------------------------------------
# CRM entities (read from DB)
# ---------------------------------------------------------------------------

class Contact(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    name: str
    email: str | None = None
    phone: str | None = None
    lead_type: LeadType | None = Field(None, alias="leadType")
    address: str | None = None
    notes: str | None = None
    budget: float | None = None
    tags: list[str] = Field(default_factory=list)
    lead_score: int | None = Field(None, alias="leadScore")
    score_label: str | None = Field(None, alias="scoreLabel")
    follow_up_at: datetime | None = Field(None, alias="followUpAt")
    last_contacted_at: datetime | None = Field(None, alias="lastContactedAt")
    type: ContactType = "QUALIFICATION"
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class DealMilestone(BaseModel):
    id: str
    label: str
    due_date: str | None = Field(None, alias="dueDate")
    completed: bool = False
    completed_at: datetime | None = Field(None, alias="completedAt")

    model_config = {"populate_by_name": True}


class Deal(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    title: str
    description: str | None = None
    value: float | None = None
    address: str | None = None
    priority: Priority = "MEDIUM"
    close_date: str | None = Field(None, alias="closeDate")
    stage_id: str | None = Field(None, alias="stageId")
    status: DealStatus = "active"
    follow_up_at: datetime | None = Field(None, alias="followUpAt")
    commission_rate: float | None = Field(None, alias="commissionRate")
    probability: int | None = None
    milestones: list[DealMilestone] = Field(default_factory=list)
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class Space(BaseModel):
    id: str
    slug: str
    name: str


# ---------------------------------------------------------------------------
# Agent tables
# ---------------------------------------------------------------------------

class AgentSettings(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    enabled: bool = False
    autonomy_level: AutonomyLevel = Field("suggest_only", alias="autonomyLevel")
    daily_token_budget: int = Field(50_000, alias="dailyTokenBudget")
    heartbeat_interval_minutes: int = Field(15, alias="heartbeatIntervalMinutes")
    enabled_agents: list[str] = Field(default_factory=lambda: ["lead_nurture"], alias="enabledAgents")
    # Per-agent overrides — keys are agent_type strings; missing key → inherits autonomy_level
    per_agent_autonomy: dict[str, AutonomyLevel] = Field(default_factory=dict, alias="perAgentAutonomy")
    confidence_threshold: int = Field(0, alias="confidenceThreshold")

    model_config = {"populate_by_name": True}


class AgentDraft(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    contact_id: str | None = Field(None, alias="contactId")
    deal_id: str | None = Field(None, alias="dealId")
    channel: DraftChannel
    subject: str | None = None
    content: str
    reasoning: str | None = None
    priority: int = 0
    status: DraftStatus = "pending"
    confidence: int | None = None
    outcome: str | None = None
    outcome_detected_at: datetime | None = Field(None, alias="outcomeDetectedAt")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class AgentActivityLogEntry(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    run_id: str = Field(alias="runId")
    agent_type: str = Field(alias="agentType")
    action_type: str = Field(alias="actionType")
    reasoning: str | None = None
    outcome: ActionOutcome
    related_contact_id: str | None = Field(None, alias="relatedContactId")
    related_deal_id: str | None = Field(None, alias="relatedDealId")
    reversible: bool = True
    metadata: dict[str, Any] | None = None
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class AgentGoal(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    contact_id: str | None = Field(None, alias="contactId")
    deal_id: str | None = Field(None, alias="dealId")
    goal_type: str = Field(alias="goalType")
    description: str
    instructions: str | None = None
    status: str = "active"
    priority: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)
    completed_at: datetime | None = Field(None, alias="completedAt")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = {"populate_by_name": True}


class AgentQuestion(BaseModel):
    id: str
    space_id: str = Field(alias="spaceId")
    run_id: str = Field(alias="runId")
    agent_type: str = Field(alias="agentType")
    question: str
    context: str | None = None
    status: str = "pending"
    answer: str | None = None
    answered_at: datetime | None = Field(None, alias="answeredAt")
    priority: int = 0
    contact_id: str | None = Field(None, alias="contactId")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Internal agent types
# ---------------------------------------------------------------------------

class ActionPlan(BaseModel):
    """Structured output from the orchestrator reasoning step."""
    summary: str
    actions: list[PlannedAction]
    skip_reason: str | None = None


class PlannedAction(BaseModel):
    agent_type: AgentType
    action_type: str
    contact_id: str | None = None
    deal_id: str | None = None
    reasoning: str
    requires_approval: bool = False
    priority: int = 0
    params: dict[str, Any] = Field(default_factory=dict)


class CoordinatorRunReport(BaseModel):
    """Structured summary produced by the Coordinator at the end of every run.

    Stored as a high-level space memory so future runs have a typed record of
    what happened. Ground-truth action counts are in AgentActivityLog; the
    counts here are the coordinator's best-effort estimates from specialist outputs.
    """

    workspace_name: str
    run_date: str                           # ISO date YYYY-MM-DD
    agents_activated: list[str] = Field(default_factory=list)
    total_drafts_created: int = 0
    total_follow_ups_set: int = 0
    overall_summary: str                    # 1-2 sentence narrative of the run
    nothing_to_do: bool = False             # True when workspace was healthy and no agents ran
