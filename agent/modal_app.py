"""Modal entrypoint for the Chippi background agent.

Deployment:
  modal deploy agent/modal_app.py

The heartbeat function runs every 15 minutes and processes all spaces
that have the agent enabled. Each space is guarded by a daily token budget
stored in Upstash Redis.

Secrets: create a single Modal secret named "chippi-secrets" containing
all required env vars (see config.py for the full list).

  modal secret create chippi-secrets \\
    NEXT_PUBLIC_SUPABASE_URL=... \\
    SUPABASE_SERVICE_ROLE_KEY=... \\
    DATABASE_URL=... \\
    OPENAI_API_KEY=... \\
    KV_REST_API_URL=... \\
    KV_REST_API_TOKEN=... \\
    NEXT_PUBLIC_APP_URL=... \\
    AGENT_INTERNAL_SECRET=...
"""

from __future__ import annotations

import modal

# ---------------------------------------------------------------------------
# Image — install Python deps from pyproject.toml
# ---------------------------------------------------------------------------

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "openai-agents>=0.0.15",
        "openai>=1.75.0",
        "supabase>=2.15.0",
        "asyncpg>=0.30.0",
        "pydantic>=2.11.0",
        "pydantic-settings>=2.9.0",
        "httpx>=0.28.0",
        "upstash-redis>=1.3.0",
        "structlog>=25.1.0",
    )
    .add_local_dir(".", remote_path="/app")  # copy agent/ directory into image
)

app = modal.App("chippi-agent", image=image)

secrets = [modal.Secret.from_name("chippi-secrets")]

# ---------------------------------------------------------------------------
# Heartbeat — runs every 15 minutes
# ---------------------------------------------------------------------------

@app.function(
    schedule=modal.Period(minutes=15),
    secrets=secrets,
    timeout=270,  # 4.5 min — gives 30s slack before Modal's 5-min default
    retries=modal.Retries(max_retries=1, backoff_coefficient=1.0),
)
async def heartbeat() -> None:
    """Process all enabled spaces. Runs every 15 minutes."""
    import sys
    sys.path.insert(0, "/app")

    import structlog
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )

    from orchestrator import run_all_spaces
    await run_all_spaces()


# ---------------------------------------------------------------------------
# Manual trigger — run a single space on demand (useful for testing)
# ---------------------------------------------------------------------------

@app.function(
    secrets=secrets,
    timeout=270,
)
async def run_space(space_id: str) -> None:
    """Manually trigger the agent for a specific space. Useful for testing."""
    import sys
    sys.path.insert(0, "/app")

    from db import supabase
    from schemas import AgentSettings, Space
    from orchestrator import run_agent_for_space

    db = await supabase()

    settings_result = await (
        db.table("AgentSettings")
        .select("*")
        .eq("spaceId", space_id)
        .single()
        .execute()
    )
    if not settings_result.data:
        print(f"No AgentSettings found for space {space_id}")
        return

    space_result = await (
        db.table("Space")
        .select("id,slug,name")
        .eq("id", space_id)
        .single()
        .execute()
    )
    if not space_result.data:
        print(f"Space {space_id} not found")
        return

    agent_settings = AgentSettings.model_validate(settings_result.data)
    space = Space(
        id=space_result.data["id"],
        slug=space_result.data["slug"],
        name=space_result.data["name"],
    )

    await run_agent_for_space(space, agent_settings)
    print(f"Done: ran agent for {space.name} ({space_id})")


# ---------------------------------------------------------------------------
# Local dev entrypoint
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(space_id: str = "") -> None:
    """Run locally: python modal_app.py --space-id=<id> (or heartbeat if omitted)."""
    if space_id:
        run_space.remote(space_id)
    else:
        heartbeat.remote()
