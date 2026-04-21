"""Per-space daily token budget enforcement via Upstash Redis.

Each space gets a rolling daily budget. If the budget is exhausted the agent
skips inference for that space until midnight UTC resets the counter.

Keys:
  agent:budget:{space_id}:{YYYY-MM-DD}  →  tokens_used (int, expires in 48h)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from upstash_redis.asyncio import Redis

from config import settings

logger = logging.getLogger(__name__)

_redis: Redis | None = None


def _get_redis() -> Redis | None:
    global _redis
    if not settings.kv_rest_api_url or not settings.kv_rest_api_token:
        return None
    if _redis is None:
        _redis = Redis(url=settings.kv_rest_api_url, token=settings.kv_rest_api_token)
    return _redis


def _today_key(space_id: str) -> str:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"agent:budget:{space_id}:{date}"


async def check_budget(space_id: str, daily_limit: int) -> bool:
    """Return True if the space has budget remaining for today."""
    r = _get_redis()
    if r is None:
        return True  # No Redis configured — allow (dev / test)
    key = _today_key(space_id)
    used = await r.get(key)
    used_int = int(used) if used else 0
    if used_int >= daily_limit:
        logger.warning("agent_budget_exhausted space=%s used=%d limit=%d", space_id, used_int, daily_limit)
        return False
    return True


async def record_usage(space_id: str, tokens: int) -> int:
    """Increment token counter. Returns new total. Expires key after 48 h."""
    r = _get_redis()
    if r is None:
        return tokens
    key = _today_key(space_id)
    new_total = await r.incrby(key, tokens)
    # Set expiry on first write (INCRBY creates the key)
    if new_total == tokens:
        await r.expire(key, 172_800)  # 48 hours
    return new_total


async def get_usage(space_id: str) -> int:
    """Return tokens consumed today for a space."""
    r = _get_redis()
    if r is None:
        return 0
    val = await r.get(_today_key(space_id))
    return int(val) if val else 0
