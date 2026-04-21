"""Supabase client for the agent — service role, read/write access."""

from __future__ import annotations

from supabase import AsyncClient, acreate_client

from config import settings

# Module-level singleton. @lru_cache cannot be used on coroutines because it
# caches the coroutine object itself — not the awaited result — so the second
# call tries to re-await an already-consumed coroutine and raises RuntimeError.
_client: AsyncClient | None = None


async def supabase() -> AsyncClient:
    """Return a lazily-initialised async Supabase client (service role)."""
    global _client
    if _client is None:
        _client = await acreate_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _client
