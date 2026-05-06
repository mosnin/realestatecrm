"""Tool primitives — retry with exponential backoff and idempotency caching.

Usage
-----
Retry a Supabase mutation:
    result = await with_retry(lambda: db.table("Foo").update(patch).execute())

Idempotency decorator (applied OUTSIDE @function_tool):
    @idempotent_tool
    @function_tool
    async def create_something(ctx, ...): ...
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable

import structlog

log = structlog.get_logger(__name__)

# ── Retry ──────────────────────────────────────────────────────────────────────

# Exceptions that are never transient — do not retry.
_NO_RETRY = (ValueError, PermissionError)


async def with_retry(
    coro_fn: Callable,
    max_attempts: int = 3,
    base_delay: float = 1.0,
) -> Any:
    """Call `coro_fn()` up to `max_attempts` times with exponential backoff.

    `coro_fn` must be a zero-argument async callable (use `lambda` or
    `functools.partial` at the call site to bind arguments).

    Back-off schedule (base_delay=1.0): 1 s → 2 s → 4 s
    Never retries: ValueError, PermissionError, or RuntimeError whose message
    starts with "space_disabled:".
    """
    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await coro_fn()
        except _NO_RETRY as exc:
            raise
        except RuntimeError as exc:
            if str(exc).startswith("space_disabled:"):
                raise
            last_exc = exc
        except Exception as exc:  # noqa: BLE001
            last_exc = exc

        if attempt < max_attempts:
            delay = base_delay * (2 ** (attempt - 1))
            log.warning(
                "tool.retry",
                attempt=attempt,
                max_attempts=max_attempts,
                delay_s=delay,
                error=str(last_exc),
            )
            await asyncio.sleep(delay)

    raise last_exc  # type: ignore[misc]


# ── Idempotency store ──────────────────────────────────────────────────────────

_IDEM: dict[str, dict] = {}
_TTL = timedelta(minutes=5)


class IdempotencyStore:
    """Module-level in-memory idempotency cache (short-lived; process scope)."""

    @staticmethod
    def make_key(tool_name: str, space_id: str, **kwargs: Any) -> str:
        """SHA-256 over tool_name + space_id + sorted kwargs → first 16 hex chars."""
        payload = json.dumps(
            {"tool": tool_name, "space": space_id, **dict(sorted(kwargs.items()))},
            sort_keys=True,
            default=str,
        )
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    @staticmethod
    def check(key: str) -> dict | None:
        """Return cached result if present and not expired; else None."""
        entry = _IDEM.get(key)
        if entry is None:
            return None
        if datetime.now(timezone.utc) > entry["_expires"]:
            del _IDEM[key]
            return None
        return {k: v for k, v in entry.items() if k != "_expires"}

    @staticmethod
    def store(key: str, result: dict) -> None:
        """Cache result with a 5-minute TTL."""
        _IDEM[key] = {**result, "_expires": datetime.now(timezone.utc) + _TTL}


# ── Idempotency decorator ──────────────────────────────────────────────────────

def idempotent_tool(tool_fn: Callable) -> Callable:
    """Decorator for mutation tools that adds idempotency caching.

    Derive the cache key from function name + space_id (ctx.context.space_id)
    + the first positional string argument (typically an entity ID).

    Apply OUTSIDE @function_tool:

        @idempotent_tool
        @function_tool
        async def my_mutation_tool(ctx, entity_id: str, ...): ...

    If a cached result is found it is returned immediately with _cached=True.
    Results are only cached on successful (non-exception) execution.
    """
    @wraps(tool_fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        # Locate ctx — it's the first arg that has `.context.space_id`
        ctx = args[0] if args else None
        space_id: str = ""
        try:
            space_id = ctx.context.space_id  # type: ignore[union-attr]
        except AttributeError:
            pass

        # First string positional argument after ctx (entity id, etc.)
        first_str = next(
            (a for a in args[1:] if isinstance(a, str)),
            next((v for v in kwargs.values() if isinstance(v, str)), ""),
        )

        key = IdempotencyStore.make_key(
            tool_name=tool_fn.__name__,
            space_id=space_id,
            first_arg=first_str,
        )

        cached = IdempotencyStore.check(key)
        if cached is not None:
            log.info("tool.idempotency_hit", tool=tool_fn.__name__, key=key)
            return {**cached, "_cached": True}

        result = await tool_fn(*args, **kwargs)

        if isinstance(result, dict) and "error" not in result:
            IdempotencyStore.store(key, result)

        return result

    return wrapper
