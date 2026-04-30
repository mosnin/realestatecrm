"""Modal entrypoint for Chippi.

Two web endpoints, no scheduled functions. The 15-minute heartbeat is gone —
Chippi only wakes up on real triggers or explicit user action.

  POST  chat_turn        — interactive chat surface (called by /api/ai/task)
  POST  run_now_webhook  — autonomous run for a single space (or trigger-drain)

Deployment:
  modal deploy agent/modal_app.py

Secrets: a single Modal secret named "chippi-secrets" containing all env
vars listed in config.py.
"""

from __future__ import annotations

import modal

# ---------------------------------------------------------------------------
# Image
# ---------------------------------------------------------------------------

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "openai-agents>=0.0.15",
        "openai>=1.75.0",
        "asyncpg>=0.30.0",
        "pydantic>=2.11.0",
        "pydantic-settings>=2.9.0",
        "httpx>=0.28.0",
        "upstash-redis>=1.3.0",
        "structlog>=25.1.0",
        # Required by Modal's @fastapi_endpoint
        "fastapi[standard]>=0.115.0",
        # Attachment extraction (read_attachment tool)
        "pypdf>=5.0.0",
        "python-docx>=1.1.0",
        "openpyxl>=3.1.0",
    )
    .add_local_dir(".", remote_path="/app")
)

app = modal.App("chippi-agent", image=image)

secrets = [modal.Secret.from_name("chippi-secrets")]


# ---------------------------------------------------------------------------
# Manual trigger — run a single space on demand
# ---------------------------------------------------------------------------

@app.function(secrets=secrets, timeout=300)
async def run_space(space_id: str) -> None:
    """Run Chippi for one space. Useful for local testing / cron drains."""
    import sys
    sys.path.insert(0, "/app")

    from db import supabase
    from schemas import AgentSettings, Space
    from orchestrator import run_agent_for_space

    db = await supabase()

    sr = await (
        db.table("AgentSettings").select("*").eq("spaceId", space_id).maybe_single().execute()
    )
    if not sr.data:
        print(f"No AgentSettings found for space {space_id}")
        return

    spr = await (
        db.table("Space").select("id,slug,name").eq("id", space_id).maybe_single().execute()
    )
    if not spr.data:
        print(f"Space {space_id} not found")
        return

    agent_settings = AgentSettings.model_validate(sr.data)
    space = Space(id=spr.data["id"], slug=spr.data["slug"], name=spr.data["name"])

    await run_agent_for_space(space, agent_settings)
    print(f"Done: ran agent for {space.name} ({space_id})")


# ---------------------------------------------------------------------------
# Web endpoint — autonomous run from the UI / trigger queue
# ---------------------------------------------------------------------------

@app.function(secrets=secrets, timeout=300)
@modal.fastapi_endpoint(method="POST")
async def run_now_webhook(item: dict) -> dict:
    """HTTP webhook that runs Chippi autonomously for a space.

    Set MODAL_WEBHOOK_URL in the Next.js env to the URL printed by
    `modal deploy`. Secured with AGENT_INTERNAL_SECRET.
    """
    import os
    import sys
    sys.path.insert(0, "/app")

    expected = os.environ.get("AGENT_INTERNAL_SECRET", "")
    secret = (item.get("secret") or "")
    if not expected or secret != expected:
        return {"error": "Unauthorized"}

    space_id = (item.get("space_id") or "").strip()
    if not space_id:
        return {"error": "space_id required"}

    from db import supabase
    from schemas import AgentSettings, Space
    from orchestrator import run_agent_for_space

    db = await supabase()
    sr = await (
        db.table("AgentSettings").select("*").eq("spaceId", space_id).maybe_single().execute()
    )
    spr = await (
        db.table("Space").select("id,slug,name").eq("id", space_id).maybe_single().execute()
    )
    if not sr.data or not spr.data:
        return {"error": f"space or agent settings not found: {space_id}"}

    await run_agent_for_space(
        Space(id=spr.data["id"], slug=spr.data["slug"], name=spr.data["name"]),
        AgentSettings.model_validate(sr.data),
    )
    return {"ok": True, "space_id": space_id}


# ---------------------------------------------------------------------------
# Web endpoint — chat turn (called by /api/ai/task)
# ---------------------------------------------------------------------------
# Runs Chippi inline in this Modal function and streams SDK events back as
# Server-Sent Events. The previous architecture spawned a fresh Sandbox per
# call and piped JSONL through stdin/stdout — that bought no real isolation
# (none of these tools shell out or write outside postgres) and cost 5–15s
# of cold-start on every turn. Inline run, same security boundary, no tax.

@app.function(secrets=secrets, timeout=600)
@modal.fastapi_endpoint(method="POST")
async def chat_turn(item: dict):
    """Run one chat turn for the realtor and stream SDK events as SSE."""
    import json
    import os
    import sys
    import uuid
    from typing import Any

    sys.path.insert(0, "/app")

    from fastapi.responses import StreamingResponse

    expected = os.environ.get("AGENT_INTERNAL_SECRET", "")
    secret = (item.get("secret") or "")
    if not expected or secret != expected:
        return {"error": "Unauthorized"}

    space_id = (item.get("space_id") or "").strip()
    message = item.get("message") or ""
    if not space_id or not isinstance(message, str) or not message.strip():
        return {"error": "space_id and message required"}

    history = item.get("history") or []
    attachments = item.get("attachments") or []
    conversation_id = item.get("conversation_id") or ""

    from db import supabase
    db = await supabase()

    sr = await (
        db.table("AgentSettings").select("*").eq("spaceId", space_id).maybe_single().execute()
    )
    spr = await (
        db.table("Space").select("id,slug,name").eq("id", space_id).maybe_single().execute()
    )
    if not sr.data or not spr.data:
        return {"error": f"space or agent settings not found: {space_id}"}

    from agents import InputGuardrailTripwireTriggered, ModelSettings, RunConfig, Runner
    from schemas import AgentSettings, Space
    from security.context import AgentContext
    from chippi import make_chippi_agent

    agent_settings = AgentSettings.model_validate(sr.data)
    space = Space(id=spr.data["id"], slug=spr.data["slug"], name=spr.data["name"])

    ctx = AgentContext.from_settings(
        agent_settings,
        run_id=conversation_id or f"chat-{uuid.uuid4()}",
        space_name=space.name,
    )

    # ── helpers ────────────────────────────────────────────────────────────

    def attach_message(text: str, atts: list[dict[str, Any]]) -> str:
        if not atts:
            return text
        parts = [text]
        for a in atts:
            if not isinstance(a, dict):
                continue
            mime = (a.get("mime_type") or "").lower()
            if mime.startswith("image/"):
                continue  # vision path handles images directly below
            filename = a.get("filename", "attachment")
            extracted = a.get("extracted_text")
            if extracted:
                parts.append(f"\n\n[Attached {filename}]\n{extracted}")
            else:
                att_id = a.get("id", "")
                parts.append(
                    f"\n\n[Attached {filename} — id {att_id}; "
                    "call read_attachment to retrieve if needed]"
                )
        return "".join(parts)

    def build_user_input(text: str, atts: list[dict[str, Any]]):
        if not atts:
            return text
        image_atts = [
            a for a in atts
            if isinstance(a, dict)
            and (a.get("mime_type") or "").lower().startswith("image/")
            and a.get("public_url")
        ]
        if not image_atts:
            return text
        content: list[dict[str, Any]] = [{"type": "input_text", "text": text}]
        for a in image_atts:
            content.append({"type": "input_image", "image_url": a["public_url"]})
        return content

    def safe_json_loads(value: Any) -> Any:
        if value is None:
            return {}
        if isinstance(value, (dict, list)):
            return value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, ValueError):
                return {"raw": value}
        return {"raw": str(value)}

    def translate(event: Any) -> dict | None:
        """Map an OpenAI Agents SDK stream event to our JSONL protocol."""
        name = type(event).__name__

        if name == "RawResponsesStreamEvent":
            data = getattr(event, "data", None)
            if data is None:
                return None
            delta = getattr(data, "delta", None)
            if delta:
                return {"type": "token", "delta": str(delta)}
            return None

        if name == "RunItemStreamEvent":
            it = getattr(event, "item", None)
            if it is None:
                return None
            ev_name = getattr(event, "name", "") or ""
            item_type = getattr(it, "type", "") or type(it).__name__

            if ev_name == "tool_called" or item_type in ("tool_call_item", "ToolCallItem"):
                tool_name = (
                    getattr(it, "tool_name", None)
                    or getattr(getattr(it, "raw_item", None), "name", None)
                    or "tool"
                )
                raw_args = getattr(getattr(it, "raw_item", None), "arguments", None)
                return {
                    "type": "tool_call_start",
                    "tool": tool_name,
                    "args": safe_json_loads(raw_args),
                }

            if ev_name == "tool_output" or item_type in ("tool_call_output_item", "ToolCallOutputItem"):
                tool_name = (
                    getattr(it, "tool_name", None)
                    or getattr(getattr(it, "raw_item", None), "name", None)
                    or "tool"
                )
                output = getattr(it, "output", None)
                summary = "" if output is None else str(output)
                if len(summary) > 800:
                    summary = summary[:799] + "…"
                return {
                    "type": "tool_call_result",
                    "tool": tool_name,
                    "ok": True,
                    "summary": summary,
                }

            return None

        return None

    # ── run ────────────────────────────────────────────────────────────────

    text_with_attachments = attach_message(message, attachments)
    user_content = build_user_input(text_with_attachments, attachments)

    input_items: list[dict[str, Any]] = []
    for turn in history:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant", "system") and content:
            input_items.append({"role": role, "content": str(content)})
    input_items.append({"role": "user", "content": user_content})

    run_config = RunConfig(
        tracing_disabled=False,
        model_settings=ModelSettings(truncation="auto"),
    )

    async def event_stream():
        try:
            chippi = make_chippi_agent()
        except Exception as e:
            err = json.dumps({"type": "error", "message": f"agent build failed: {e}"})
            yield f"data: {err}\n\n"
            return

        try:
            result = Runner.run_streamed(
                chippi, input=input_items, context=ctx, run_config=run_config
            )
            async for event in result.stream_events():
                try:
                    out = translate(event)
                except Exception:
                    out = None
                if out:
                    yield f"data: {json.dumps(out, default=str)}\n\n"

            final = getattr(result, "final_output", None)
            final_text = (
                final if isinstance(final, str) else (str(final) if final is not None else "")
            )
            done = json.dumps({"type": "done", "final_text": final_text})
            yield f"data: {done}\n\n"

        except InputGuardrailTripwireTriggered as exc:
            info = exc.guardrail_result.output.output_info or {}
            reason = info.get("reason", "Run blocked.")
            err = json.dumps({"type": "error", "message": reason})
            yield f"data: {err}\n\n"

        except Exception as e:
            err = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {err}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Local dev entrypoint
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(space_id: str = "") -> None:
    """Run locally: python modal_app.py --space-id=<id>"""
    if not space_id:
        print("usage: modal run modal_app.py --space-id=<id>")
        return
    run_space.remote(space_id)
