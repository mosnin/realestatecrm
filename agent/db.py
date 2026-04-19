"""Supabase client for the agent — service role, read/write access."""

from __future__ import annotations

from functools import lru_cache

from supabase import AsyncClient, acreate_client

from config import settings


@lru_cache(maxsize=1)
async def get_supabase() -> AsyncClient:
    """Return a lazily-initialised async Supabase client (service role)."""
    return await acreate_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


async def supabase() -> AsyncClient:
    return await get_supabase()
