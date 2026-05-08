"""Context compaction for long-running agent message histories.

As a multi-turn agent run accumulates messages, the context window fills up.
This module detects when the accumulated character count exceeds a threshold
and summarizes the oldest half of the history via a cheap LLM call, replacing
those messages with a single system-role summary.

The TypeScript equivalent lives at lib/agent/compaction.ts. Keep the two
in sync on the summarization prompt and split strategy.
"""

from __future__ import annotations

import structlog
from openai import AsyncOpenAI

from config import settings

logger = structlog.get_logger(__name__)

_MAX_CHARS_DEFAULT = 80_000
_COMPACTION_MODEL = "gpt-5-mini"


def _estimate_chars(messages: list[dict]) -> int:
    """Rough character count across all message contents."""
    return sum(len(str(m.get("content", ""))) for m in messages)


async def compact_messages(
    messages: list[dict],
    max_chars: int = _MAX_CHARS_DEFAULT,
    client: AsyncOpenAI | None = None,
) -> list[dict]:
    """Compact a message list when it exceeds ``max_chars``.

    Strategy:
    1. Estimate total character count. If within budget, return unchanged.
    2. Split at the midpoint. Summarize the older half via ``_COMPACTION_MODEL``.
    3. Return ``[system summary message, ...newer half]``.

    On any failure the original messages are returned unchanged — compaction
    is best-effort and must never break the agent run.

    Parameters
    ----------
    messages:
        The full conversation history (list of role/content dicts).
    max_chars:
        Character budget before compaction triggers.
    client:
        Optional pre-built AsyncOpenAI client. One is constructed from
        ``settings.openai_api_key`` when not provided.
    """
    if _estimate_chars(messages) <= max_chars:
        return messages

    midpoint = len(messages) // 2
    older = messages[:midpoint]
    newer = messages[midpoint:]

    logger.info(
        "compaction_triggered",
        total_messages=len(messages),
        older_count=len(older),
        newer_count=len(newer),
        estimated_chars=_estimate_chars(messages),
    )

    try:
        oai = client or AsyncOpenAI(api_key=settings.openai_api_key)

        # Truncate each message's content to 500 chars so the summarization
        # prompt itself doesn't blow up the context of the summarizer.
        older_text = "\n".join(
            f"{m.get('role', '?').upper()}: {str(m.get('content', ''))[:500]}"
            for m in older
        )

        resp = await oai.chat.completions.create(
            model=_COMPACTION_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize the following conversation history concisely. "
                        "Preserve key facts, decisions, and outcomes. Max 500 words."
                    ),
                },
                {"role": "user", "content": older_text},
            ],
            max_tokens=600,
        )
        summary = resp.choices[0].message.content or ""

        compacted = [
            {"role": "system", "content": f"[Earlier conversation summary]\n{summary}"},
            *newer,
        ]
        logger.info(
            "compaction_complete",
            summary_chars=len(summary),
            compacted_message_count=len(compacted),
        )
        return compacted

    except Exception as e:
        logger.warning("compaction_failed", error=str(e))
        return messages
