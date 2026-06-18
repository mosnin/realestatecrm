"""Question tool — agents use this to ask the realtor for guidance when uncertain.

Two shapes:
  - ASYNC QUEUE (default): a free-text `question` is written to AgentQuestion
    and the realtor answers later from their inbox. Use for an open-ended ask
    the realtor doesn't need to answer to unblock this turn.
  - INTERACTIVE CARD: when the agent passes `options` (a flat list of choices)
    or `steps` (a multi-step setup), `ask_realtor` returns a display payload —
    an OptionList or a QuestionFlow — rendered inline in the chat. The realtor
    taps a choice and the answer comes back as their next message, so the agent
    continues on the following turn. This is the right shape when the answer is
    a pick from a known set and you want it NOW to keep going. Prefer it over a
    prose question even if it costs a few more tokens.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext
from tools.streaming import publish_event


def _clean_options(options: Any) -> list[dict[str, Any]] | None:
    """Keep only serializable {id,label,description?} fields from a choice list.

    Drops anything else (icon / disabled / nested objects) so the payload
    passes the chat's strict OptionList / QuestionFlow validators. Returns None
    when the input isn't a non-empty list of well-formed options.
    """
    if not isinstance(options, list) or not options:
        return None
    cleaned: list[dict[str, Any]] = []
    for opt in options:
        if not isinstance(opt, dict):
            return None
        oid = opt.get("id")
        label = opt.get("label")
        if not isinstance(oid, str) or not oid:
            return None
        if not isinstance(label, str) or not label:
            return None
        entry: dict[str, Any] = {"id": oid, "label": label}
        desc = opt.get("description")
        if isinstance(desc, str) and desc:
            entry["description"] = desc
        cleaned.append(entry)
    return cleaned


@function_tool(strict_mode=False)
async def ask_realtor(
    ctx: RunContextWrapper[AgentContext],
    question: str,
    context: str | None = None,
    contact_id: str | None = None,
    priority: int = 0,
    options: list[dict[str, Any]] | None = None,
    steps: list[dict[str, Any]] | None = None,
    selection_mode: str | None = None,
) -> dict[str, Any]:
    """Ask the realtor: a free-text question (async inbox) OR an interactive card."""
    # question: 10-500 chars. context: optional, <=1000 chars.
    # priority: 0 normal, 50 important, 100 urgent.
    # options: flat [{id,label,description?}] -> inline OptionList (one pick).
    # steps: [{id,title,description?,options:[{id,label}],selectionMode?}] ->
    #        inline QuestionFlow (multi-step). The realtor's answer returns as
    #        their next message; continue on the following turn.
    space_id = ctx.context.space_id

    # ── Interactive QuestionFlow (multi-step) ────────────────────────────────
    if isinstance(steps, list) and steps:
        flow_steps: list[dict[str, Any]] = []
        for step in steps:
            if not isinstance(step, dict):
                return {"error": "each step must be an object"}
            sid = step.get("id")
            title = step.get("title")
            step_options = _clean_options(step.get("options"))
            if not isinstance(sid, str) or not sid:
                return {"error": "each step needs a non-empty id"}
            if not isinstance(title, str) or not title:
                return {"error": "each step needs a title"}
            if step_options is None:
                return {"error": f"step '{sid}' needs at least one option"}
            entry: dict[str, Any] = {"id": sid, "title": title, "options": step_options}
            sdesc = step.get("description")
            if isinstance(sdesc, str) and sdesc:
                entry["description"] = sdesc
            smode = step.get("selectionMode")
            if smode in ("single", "multi"):
                entry["selectionMode"] = smode
            flow_steps.append(entry)
        return {
            "id": "ask-questions",
            "steps": flow_steps,
            "display": "question-flow",
        }

    # ── Interactive OptionList (one decision from a flat set) ─────────────────
    clean = _clean_options(options)
    if clean is not None:
        if len(clean) < 2:
            return {"error": "options needs at least two choices"}
        payload: dict[str, Any] = {
            "id": "ask-options",
            "options": clean,
            "selectionMode": selection_mode if selection_mode in ("single", "multi") else "single",
            "display": "option-list",
        }
        if isinstance(question, str) and question.strip():
            payload["prompt"] = question.strip()
        return payload

    # ── Async free-text question (default) ───────────────────────────────────
    # Validate question length
    if len(question) < 10:
        return {"error": "question must be at least 10 characters"}
    if len(question) > 500:
        return {"error": "question must be 500 characters or fewer"}

    if context is not None and len(context) > 1000:
        return {"error": "context must be 1000 characters or fewer"}

    db = await supabase()

    # Validate contact belongs to this space (if provided)
    if contact_id:
        check = await (
            db.table("Contact")
            .select("id")
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .execute()
        )
        if not check.data:
            return {"error": "Contact not found in space"}

    question_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    entry: dict[str, Any] = {
        "id": question_id,
        "spaceId": space_id,
        "runId": ctx.context.run_id,
        "agentType": ctx.context.current_agent_type,
        "question": question,
        "status": "pending",
        "priority": max(0, min(100, priority)),
        "createdAt": now,
    }
    if context is not None:
        entry["context"] = context
    if contact_id:
        entry["contactId"] = contact_id

    await db.table("AgentQuestion").insert(entry).execute()

    await publish_event(
        ctx.context,
        "info",
        f"Question queued for realtor: {question[:80]}",
        agent_type=ctx.context.current_agent_type,
        metadata={"questionId": question_id, "priority": priority},
    )

    return {
        "questionId": question_id,
        "status": "pending",
        "message": "Question queued for realtor review",
    }
