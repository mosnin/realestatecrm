"""Runtime configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase — service role bypasses RLS; never expose to client
    supabase_url: str = Field(alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key: str = Field(alias="SUPABASE_SERVICE_ROLE_KEY")

    # Direct Postgres connection for async reads (faster than REST for bulk queries)
    database_url: str = Field(alias="DATABASE_URL", default="")

    # OpenAI
    openai_api_key: str = Field(alias="OPENAI_API_KEY")

    # Upstash Redis — token budget enforcement
    kv_rest_api_url: str = Field(alias="KV_REST_API_URL", default="")
    kv_rest_api_token: str = Field(alias="KV_REST_API_TOKEN", default="")

    # Internal Next.js API base — agent uses this for write operations
    # so business-logic validation stays in one place
    app_url: str = Field(alias="NEXT_PUBLIC_APP_URL", default="http://localhost:3000")

    # Secret shared between Modal and the Next.js app for internal API calls
    agent_internal_secret: str = Field(alias="AGENT_INTERNAL_SECRET", default="")

    # Models
    orchestrator_model: str = Field(default="gpt-4o")
    worker_model: str = Field(default="gpt-4o-mini")

    # Safety limits
    max_react_iterations: int = Field(default=6)       # max tool-call turns per agent
    default_daily_token_budget: int = Field(default=50_000)

    # Context window management
    memory_chars_budget: int = Field(default=3_000)   # ~750 tokens for memory injection
    max_output_tokens: int = Field(default=1_000)      # cap LLM output per turn

    model_config = {"populate_by_name": True, "env_file": ".env.local"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
