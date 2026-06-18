"""Shared confirmation gate + executor for the agent's delete tools.

Why a two-step `confirmed` gate (and NOT the SDK's `needs_approval`):

The autonomous runtime (`agent/modal_app.py` → `Runner.run_streamed`) does
NOT consume `result.interruptions` and has no pause/serialize/resume path, so
a tool marked `needs_approval=True` on the pinned `openai-agents` (<0.1) would
never actually pause — the realtor would get no chance to say no. The trust
boundary on this runtime is therefore the SAME two-step `confirmed=True`
pattern the broker tools already use (see
`agent/tools/broker/actions.py::offboard_member`):

  1. The model calls the delete tool WITHOUT `confirmed=True`. The tool does
     NO mutation and returns `{requires_confirmation: True, ...}`.
  2. Chippi relays that to the realtor and waits for an explicit yes (the
     system prompt in `agent/chippi.py` mandates this).
  3. Only on the second call, with `confirmed=True`, does the row get deleted.

A delete can therefore NEVER fire on a single unprompted tool call. This
module centralizes the gate and the post-delete activity log so every delete
tool enforces the same contract.
"""

from __future__ import annotations

import uuid
from typing import Any

from db import supabase
from errors import from_exception, from_supabase_error
from tools.streaming import publish_event


def confirmation_required(
    *,
    entity: str,
    label: str,
    entity_id: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the first-call response that withholds the delete pending a yes.

    `entity` is the human noun ("contact", "deal", ...); `label` is the
    record's display name; `entity_id` is the row id. The returned dict carries
    `requires_confirmation: True` and performs NO mutation — the caller returns
    it immediately when `confirmed` is falsy.
    """
    payload: dict[str, Any] = {
        "ok": False,
        "requires_confirmation": True,
        "summary": (
            f"About to permanently delete {entity} \"{label}\". This cannot be "
            "undone. Confirm to proceed?"
        ),
        "entity": entity,
        "entityId": entity_id,
        "label": label,
    }
    if extra:
        payload.update(extra)
    return payload


async def delete_row(
    ctx: Any,
    *,
    table: str,
    entity: str,
    entity_id: str,
    label: str,
    contact_id: str | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    """Delete one space-scoped row and emit an audit event.

    spaceId is always taken from the AgentContext (never an argument), matching
    every other write tool. A best-effort ContactActivity row records the
    deletion when `contact_id` is supplied. Returns the model-facing result
    dict ({ok, ...} on success, {error, ...} on failure).
    """
    space_id = ctx.context.space_id
    db = await supabase()

    try:
        await (
            db.table(table)
            .delete()
            .eq("id", entity_id)
            .eq("spaceId", space_id)
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        agent_err = from_exception(e)
        return {
            "error": agent_err.message,
            "code": agent_err.code,
            "retryable": agent_err.retryable,
        }

    # Best-effort audit line on the linked contact's timeline. The row is
    # already gone; a failed activity insert must not report the delete as
    # failed (the model would retry a delete that already succeeded).
    if contact_id:
        try:
            await db.table("ContactActivity").insert({
                "id": str(uuid.uuid4()),
                "contactId": contact_id,
                "spaceId": space_id,
                "type": "note",
                "content": f"[Agent] {entity.capitalize()} deleted: {label}."
                + (f" {reason}" if reason else ""),
                "metadata": {
                    "source": "agent",
                    "delete": True,
                    "entity": entity,
                    "entityId": entity_id,
                    "agentRunId": ctx.context.run_id,
                },
            }).execute()
        except Exception:
            pass

    await publish_event(
        ctx.context,
        "action",
        f"Deleted {entity} {label}",
        agent_type=ctx.context.current_agent_type,
        metadata={"entity": entity, "entityId": entity_id},
    )

    return {"ok": True, "action": "deleted", "entity": entity, "entityId": entity_id}


__all__ = ["confirmation_required", "delete_row", "from_supabase_error"]
