"""Sandbox entrypoint — runs the cowork agent for a single chat turn.

The Modal Sandbox exec's this script with stdin set to a JSON message. It
streams agent events as JSONL to stdout (one JSON object per line, flushed
immediately). The Modal function reading stdout forwards each line as an SSE
event to the Next.js proxy, which forwards to the chat UI.

Stdin shape:
{
  "space_id": "...",
  "space_name": "...",
  "run_id": "...",
  "message": "user text",
  "history": [{"role": "user"|"assistant", "content": "..."}, ...],
  "autonomy_level": "...",
  "per_agent_autonomy": {...},
  "daily_token_budget": 100000,
  "enabled_agents": [...],
  "confidence_threshold": 0,
  "attachments": [
    {"id": "...", "filename": "...", "mime_type": "...",
     "extracted_text": "..."|null, "public_url": "..."},
    ...
  ]
}

Stdout shape (JSONL, one per line, flushed immediately):
{"type": "token", "delta": "..."}
{"type": "tool_call_start", "tool": "...", "args": {...}}
{"type": "tool_call_result", "tool": "...", "ok": true, "summary": "..."}
{"type": "handoff", "to": "Lead Nurture Agent"}
{"type": "done", "final_text": "..."}
{"type": "error", "message": "..."}
"""

from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

from agents import Runner

from agents.cowork import make_cowork_agent
from security.context import AgentContext


def emit(obj: dict) -> None:
    """Write one JSON object to stdout as a line, flushed immediately."""
    sys.stdout.write(json.dumps(obj, default=str) + "\n")
    sys.stdout.flush()


def _attach_message(message: str, attachments: list[dict[str, Any]] | None) -> str:
    """Append non-image attachment context to the user message text.

    Image attachments are NOT inlined here — they're handled separately by
    `_build_user_input` as structured `input_image` parts so the vision model
    actually sees the pixels. This function only enriches the text part with
    extracted document text or a pointer to `read_attachment` for non-image
    files.
    """
    if not attachments:
        return message
    parts = [message]
    for att in attachments:
        if not isinstance(att, dict):
            continue
        mime = (att.get("mime_type") or "").lower()
        if mime.startswith("image/"):
            # Skip — vision path handles images directly.
            continue
        filename = att.get("filename", "attachment")
        extracted = att.get("extracted_text")
        if extracted:
            parts.append(f"\n\n[Attached {filename}]\n{extracted}")
        else:
            att_id = att.get("id", "")
            parts.append(
                f"\n\n[Attached {filename} — id {att_id}; "
                "call read_attachment to retrieve if needed]"
            )
    return "".join(parts)


def _build_user_input(
    text: str, attachments: list[dict[str, Any]] | None
) -> str | list[dict[str, Any]]:
    """Build the `content` value for the trailing user input item.

    When the turn has at least one image attachment with a `public_url`, the
    Agents SDK / Responses API needs multi-part content: an `input_text` part
    plus one `input_image` part per image. Otherwise we keep the simple string
    form to avoid restructuring the doc-only path.
    """
    if not attachments:
        return text
    image_atts = [
        a
        for a in attachments
        if isinstance(a, dict)
        and (a.get("mime_type") or "").lower().startswith("image/")
        and a.get("public_url")
    ]
    if not image_atts:
        return text
    content: list[dict[str, Any]] = [{"type": "input_text", "text": text}]
    for att in image_atts:
        content.append({"type": "input_image", "image_url": att["public_url"]})
    return content


def _safe_json_loads(value: Any) -> Any:
    """Best-effort JSON-decode tool-call arguments. Falls back to a wrapper."""
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


def translate_event(event: Any) -> dict | None:
    """Map an OpenAI Agents SDK stream event to our JSONL protocol.

    Event types (from agents.stream_events):
      - RawResponsesStreamEvent  → token deltas from the LLM
      - RunItemStreamEvent       → tool call / tool output / handoff / message
      - AgentUpdatedStreamEvent  → fired when a handoff target becomes the active agent

    NOTE: Field names are validated against openai-agents 0.0.15+. The SDK has
    a known typo ("handoff_occured") that we handle explicitly; if the SDK ever
    fixes it the new spelling won't break this code because we match both.
    """
    name = type(event).__name__

    # ----- LLM token stream -----
    if name == "RawResponsesStreamEvent":
        data = getattr(event, "data", None)
        if data is None:
            return None
        # The OpenAI Responses API streams a variety of events; we only care
        # about output text deltas (response.output_text.delta).
        delta = getattr(data, "delta", None)
        if delta:
            return {"type": "token", "delta": str(delta)}
        return None

    # ----- Run items: tool calls, tool outputs, handoffs, messages -----
    if name == "RunItemStreamEvent":
        item = getattr(event, "item", None)
        if item is None:
            return None
        ev_name = getattr(event, "name", "") or ""
        item_type = getattr(item, "type", "") or type(item).__name__

        # Tool call started
        if ev_name == "tool_called" or item_type in ("tool_call_item", "ToolCallItem"):
            tool_name = (
                getattr(item, "tool_name", None)
                or getattr(getattr(item, "raw_item", None), "name", None)
                or "tool"
            )
            raw_args = getattr(getattr(item, "raw_item", None), "arguments", None)
            return {
                "type": "tool_call_start",
                "tool": tool_name,
                "args": _safe_json_loads(raw_args),
            }

        # Tool call returned
        if ev_name == "tool_output" or item_type in (
            "tool_call_output_item",
            "ToolCallOutputItem",
        ):
            tool_name = (
                getattr(item, "tool_name", None)
                or getattr(getattr(item, "raw_item", None), "name", None)
                or "tool"
            )
            output = getattr(item, "output", None)
            summary = "" if output is None else str(output)
            if len(summary) > 800:
                summary = summary[:799] + "…"
            return {
                "type": "tool_call_result",
                "tool": tool_name,
                "ok": True,
                "summary": summary,
            }

        # Handoff — request side (the model has decided to hand off)
        if ev_name == "handoff_requested" or item_type in (
            "handoff_call_item",
            "HandoffCallItem",
        ):
            target = (
                getattr(item, "target_agent_name", None)
                or getattr(getattr(item, "raw_item", None), "name", None)
                or ""
            )
            return {"type": "handoff", "to": target}

        # Handoff actually occurred (note SDK typo: "handoff_occured")
        if ev_name in ("handoff_occured", "handoff_occurred") or item_type in (
            "handoff_output_item",
            "HandoffOutputItem",
        ):
            target = (
                getattr(item, "target_agent_name", None)
                or getattr(getattr(item, "raw_item", None), "name", None)
                or ""
            )
            return {"type": "handoff", "to": target}

        # Message output — we already get incremental tokens via Raw events,
        # so the message_output_created item is just the bookend. Skip it.
        return None

    # ----- Agent itself was swapped (post-handoff) -----
    if name == "AgentUpdatedStreamEvent":
        new_agent = getattr(event, "new_agent", None)
        target = getattr(new_agent, "name", "") if new_agent else ""
        if target:
            return {"type": "handoff", "to": target}
        return None

    return None


async def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        emit({"type": "error", "message": "no stdin input"})
        return 1

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        emit({"type": "error", "message": f"invalid json: {e}"})
        return 1

    if "space_id" not in payload or "message" not in payload:
        emit({"type": "error", "message": "payload missing required field: space_id and/or message"})
        return 1

    ctx = AgentContext(
        space_id=payload["space_id"],
        space_name=payload.get("space_name", ""),
        autonomy_level=payload.get("autonomy_level", "draft_required"),
        per_agent_autonomy=payload.get("per_agent_autonomy", {}) or {},
        daily_token_budget=int(payload.get("daily_token_budget", 100_000)),
        enabled_agents=payload.get("enabled_agents", []) or [],
        run_id=payload.get("run_id", "chat"),
        confidence_threshold=int(payload.get("confidence_threshold", 0)),
    )
    ctx.current_agent_type = "cowork"

    attachments = payload.get("attachments") or []
    message = _attach_message(payload["message"], attachments)
    history = payload.get("history") or []

    # The Agents SDK's Runner.run_streamed accepts `input` as either a string
    # or a list of input items (prior turns + the new user turn). We use the
    # list form so the model sees the conversation history.
    input_items: list[dict[str, Any]] = []
    for turn in history:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant", "system") and content:
            input_items.append({"role": role, "content": str(content)})

    user_content = _build_user_input(message, attachments)
    input_items.append({"role": "user", "content": user_content})

    try:
        agent = make_cowork_agent()
    except Exception as e:
        emit({"type": "error", "message": f"agent build failed: {e}"})
        return 1

    try:
        result = Runner.run_streamed(agent, input=input_items, context=ctx)
        async for event in result.stream_events():
            try:
                translated = translate_event(event)
            except Exception:
                translated = None
            if translated:
                emit(translated)

        final = getattr(result, "final_output", None)
        final_text = (
            final if isinstance(final, str) else (str(final) if final is not None else "")
        )
        emit({"type": "done", "final_text": final_text})
        return 0
    except Exception as e:
        emit({"type": "error", "message": str(e)})
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
