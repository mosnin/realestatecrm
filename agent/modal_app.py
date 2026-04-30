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
        # Required by Modal's @fastapi_endpoint as of 2025
        "fastapi[standard]>=0.115.0",
        # Attachment extraction (read_attachment tool inside the sandbox)
        "pypdf>=5.0.0",
        "python-docx>=1.1.0",
        "openpyxl>=3.1.0",
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
# Web endpoint — on-demand run from the UI (POST /api/agent/run-now)
# ---------------------------------------------------------------------------

@app.function(secrets=secrets, timeout=270)
@modal.fastapi_endpoint(method="POST")
async def run_now_webhook(item: dict) -> dict:
    """HTTP webhook for triggering runs from the Next.js UI.

    After deploying, set MODAL_WEBHOOK_URL in your Next.js env to the URL
    printed by `modal deploy`. Secured with AGENT_INTERNAL_SECRET.
    """
    import sys, os
    sys.path.insert(0, "/app")

    secret = item.get("secret", "") or ""
    expected = os.environ.get("AGENT_INTERNAL_SECRET", "")
    if not expected or secret != expected:
        return {"error": "Unauthorized"}

    space_id = item.get("space_id", "")

    from orchestrator import run_all_spaces, run_agent_for_space
    if space_id:
        from db import supabase
        from schemas import AgentSettings, Space
        db = await supabase()
        sr = await db.table("AgentSettings").select("*").eq("spaceId", space_id).single().execute()
        spr = await db.table("Space").select("id,slug,name").eq("id", space_id).single().execute()
        if sr.data and spr.data:
            await run_agent_for_space(
                Space(id=spr.data["id"], slug=spr.data["slug"], name=spr.data["name"]),
                AgentSettings.model_validate(sr.data),
            )
    else:
        await run_all_spaces()

    return {"ok": True, "space_id": space_id or "all"}


# ---------------------------------------------------------------------------
# Web endpoint — Cowork chat turn (POST /chat_turn)
# ---------------------------------------------------------------------------
# Spawns a fresh Modal Sandbox per call for OS-level isolation, feeds the
# user turn to /app/sandbox_runner.py via stdin, and streams the JSONL it
# emits on stdout back to the caller as Server-Sent Events.
#
# Per-call sandboxes (no warm reuse) keep the security boundary clean and
# the wiring trivial. Reuse-across-messages with idle eviction is a future
# optimisation; the bottleneck right now is OpenAI inference latency, not
# sandbox cold-start.

@app.function(secrets=secrets, timeout=600)
@modal.fastapi_endpoint(method="POST")
async def chat_turn(item: dict):
    """HTTP endpoint that runs one Cowork chat turn inside a fresh Sandbox.

    Body shape (JSON):
      {
        "secret": "<AGENT_INTERNAL_SECRET>",
        "space_id": "...",
        "conversation_id": "...",
        "message": "user text",
        "history": [{"role": "user|assistant", "content": "..."}, ...],
        "attachments": [...]   // optional
      }

    Streams `text/event-stream` frames back to the caller. Each frame is one
    JSONL line emitted by sandbox_runner.py wrapped as `data: <json>\\n\\n`.
    """
    import sys, os, json, uuid
    sys.path.insert(0, "/app")

    from fastapi.responses import StreamingResponse

    # ---- auth (matches run_now_webhook: secret comes in the body) ----
    expected = os.environ.get("AGENT_INTERNAL_SECRET", "")
    secret = item.get("secret", "") or ""
    if not expected or secret != expected:
        return {"error": "Unauthorized"}

    space_id = (item.get("space_id") or "").strip()
    message = item.get("message") or ""
    if not space_id or not isinstance(message, str) or not message.strip():
        return {"error": "space_id and message required"}

    history = item.get("history") or []
    attachments = item.get("attachments") or []
    conversation_id = item.get("conversation_id") or ""

    # ---- load Space + AgentSettings to populate runtime context ----
    # Same query shape used by run_now_webhook / run_space.
    from db import supabase
    db = await supabase()

    sr = await db.table("AgentSettings").select("*").eq("spaceId", space_id).single().execute()
    spr = await db.table("Space").select("id,slug,name").eq("id", space_id).single().execute()

    if not sr.data or not spr.data:
        return {"error": f"space or agent settings not found: {space_id}"}

    settings_row = sr.data
    space_row = spr.data

    # Build the JSON payload sandbox_runner.py expects on stdin.
    payload = {
        "space_id": space_row["id"],
        "space_name": space_row.get("name", "") or "",
        "run_id": conversation_id or f"chat-{uuid.uuid4()}",
        "message": message,
        "history": history,
        "autonomy_level": settings_row.get("autonomyLevel", "draft_required"),
        "per_agent_autonomy": settings_row.get("perAgentAutonomy", {}) or {},
        "daily_token_budget": int(settings_row.get("dailyTokenBudget", 100_000) or 100_000),
        "enabled_agents": settings_row.get("enabledAgents", []) or [],
        "confidence_threshold": int(settings_row.get("confidenceThreshold", 0) or 0),
        "attachments": attachments,
    }
    stdin_bytes = (json.dumps(payload) + "\n").encode("utf-8")

    async def event_stream():
        sb = None
        try:
            # Reuse the app image so the sandbox already has /app/ and deps.
            sb = await modal.Sandbox.create.aio(
                image=image,
                app=app,
                secrets=secrets,
                timeout=600,
            )

            # text=True gives us str lines instead of bytes, and bufsize=1 makes
            # stdout line-buffered so each emit() in sandbox_runner.py flushes
            # promptly to our async iterator below.
            proc = await sb.exec.aio(
                "python", "/app/sandbox_runner.py",
                text=True,
                bufsize=1,
            )

            # Push the JSON payload, then close stdin so the runner unblocks.
            # Modal's StreamWriter.write is sync but write_eof is what flips
            # the EOF flag on the inner pipe; drain to make sure the bytes
            # are on the wire before we start reading stdout.
            await proc.stdin.write.aio(stdin_bytes.decode("utf-8"))
            await proc.stdin.drain.aio()
            proc.stdin.write_eof()
            await proc.stdin.drain.aio()

            # Forward each JSONL line as one SSE frame. The runner flushes
            # after every emit() so lines arrive in real time.
            async for line in proc.stdout:
                if not line:
                    continue
                stripped = line.rstrip("\n").rstrip("\r")
                if not stripped:
                    continue
                yield f"data: {stripped}\n\n"
        except Exception as e:
            # Surface sandbox/launch failures as an inline error event so the
            # caller's SSE consumer sees a terminal frame instead of a hang.
            err = json.dumps({"type": "error", "message": f"sandbox failure: {e}"})
            yield f"data: {err}\n\n"
        finally:
            if sb is not None:
                try:
                    await sb.terminate.aio()
                except Exception:
                    pass

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
