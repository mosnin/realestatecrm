"""Redis heartbeat for long-running Modal agent tasks.

Modal functions time out after 5 minutes of inactivity. HeartbeatPinger
pings a Redis key every `interval_sec` seconds with a TTL of `ttl_sec`.
Any process that stops pinging is declared dead by the Next.js side within
one TTL window (default 90 s).

Usage:
    pinger = HeartbeatPinger(task_id=task_id)
    await pinger.start()
    try:
        # ... run agent ...
    finally:
        await pinger.stop()
"""

from __future__ import annotations

import asyncio

import structlog

from config import settings

logger = structlog.get_logger(__name__)


class HeartbeatPinger:
    """Asyncio task that pings ``agent:heartbeat:{task_id}`` in Redis.

    Parameters
    ----------
    task_id:
        The AgentTask id being pinged. Used as part of the Redis key.
    interval_sec:
        How often to ping (default 30 s — well inside the 90-s TTL window).
    ttl_sec:
        Redis key TTL. A stopped pinger's key expires within this window,
        signalling a hung task to the Next.js poller (default 90 s).
    """

    def __init__(
        self,
        task_id: str,
        interval_sec: int = 30,
        ttl_sec: int = 90,
    ) -> None:
        self.task_id = task_id
        self.interval_sec = interval_sec
        self.ttl_sec = ttl_sec
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Spawn the background ping loop."""
        # Ping immediately so the key exists before the first interval elapses.
        await self._ping()
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        """Cancel the ping loop and wait for clean shutdown."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(self.interval_sec)
            await self._ping()

    async def _ping(self) -> None:
        """Write/refresh the heartbeat key in Redis.

        Skips silently when Redis credentials are not configured so that
        local development and test runs are unaffected.
        """
        try:
            if not settings.kv_rest_api_url or not settings.kv_rest_api_token:
                return
            from upstash_redis.asyncio import Redis  # lazy import — optional dep

            r = Redis(
                url=settings.kv_rest_api_url,
                token=settings.kv_rest_api_token,
            )
            key = f"agent:heartbeat:{self.task_id}"
            await r.set(key, "1", ex=self.ttl_sec)
        except Exception as e:
            # Ping failure is non-fatal — log and continue.
            logger.warning("heartbeat_ping_failed", task_id=self.task_id, error=str(e))
