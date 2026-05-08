"""Checkpoint save/restore for agent task runs.

Writes to the TaskCheckpoint table so a paused or failed task can resume
from its last known state rather than restarting cold.

Failures are logged but never raised — a checkpoint miss must never crash
the agent run.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog

from db import supabase

logger = structlog.get_logger(__name__)


async def save_checkpoint(
    task_id: str,
    space_id: str,
    step_index: int,
    messages: list[dict],
    metadata: dict | None = None,
) -> str | None:
    """Persist current agent state to TaskCheckpoint.

    Returns the new checkpoint id on success, None on failure.
    The checkpointData column is jsonb; asyncpg's codec handles
    dict serialisation — do not pre-serialize to a string.
    """
    checkpoint_id = str(uuid.uuid4())
    try:
        db = await supabase()
        await db.table("TaskCheckpoint").insert(
            {
                "id": checkpoint_id,
                "taskId": task_id,
                "spaceId": space_id,
                "stepIndex": step_index,
                "checkpointData": {
                    "messages": messages,
                    "metadata": metadata or {},
                    "savedAt": datetime.now(timezone.utc).isoformat(),
                },
            }
        ).execute()
        logger.info(
            "checkpoint_saved",
            task_id=task_id,
            checkpoint_id=checkpoint_id,
            step_index=step_index,
        )
        return checkpoint_id
    except Exception as e:
        logger.error("checkpoint_save_failed", task_id=task_id, error=str(e))
        return None


async def load_checkpoint(task_id: str) -> dict | None:
    """Load the most recent checkpoint for a task.

    Returns a dict with keys: id, stepIndex, messages, metadata, savedAt.
    Returns None if no checkpoint exists or on error.

    checkpointData is stored as jsonb and decoded to a dict by asyncpg's
    codec automatically — no JSON parsing needed here.
    """
    try:
        db = await supabase()
        result = (
            await db.table("TaskCheckpoint")
            .select("id, stepIndex, checkpointData, createdAt")
            .eq("taskId", task_id)
            .order("createdAt", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
        )
        if not result.data:
            return None
        row = result.data
        # asyncpg decodes jsonb columns to dicts; handle the (unlikely) string
        # fallback defensively in case the codec is missing in a test context.
        data: dict
        raw = row["checkpointData"]
        if isinstance(raw, str):
            import json
            data = json.loads(raw)
        else:
            data = raw
        return {
            "id": row["id"],
            "stepIndex": row["stepIndex"],
            "messages": data.get("messages", []),
            "metadata": data.get("metadata", {}),
            "savedAt": data.get("savedAt"),
        }
    except Exception as e:
        logger.error("checkpoint_load_failed", task_id=task_id, error=str(e))
        return None
