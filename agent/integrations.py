"""Composio integration loader for the Modal agent.

Exposes the find_integration_tool + call_integration_tool dispatcher when
the realtor has any active Composio toolkit. Returns [] when no toolkits
are connected or the proxy is unconfigured — chat must keep working on
the native catalog regardless.
"""
from __future__ import annotations

import os
from typing import Any

import structlog

from config import settings
from db import supabase

logger = structlog.get_logger()


async def active_toolkits(space_id: str, user_id: str) -> list[str]:
    """Toolkit slugs the realtor has connected and our DB has marked active."""
    db = await supabase()
    res = await (
        db.table("IntegrationConnection")
        .select("toolkit")
        .eq("spaceId", space_id)
        .eq("userId", user_id)
        .eq("status", "active")
        .execute()
    )
    rows = res.data or []
    return [r["toolkit"] for r in rows if r.get("toolkit")]


def _proxy_base() -> tuple[str, str] | None:
    """The (base_url, secret) pair the agent uses to call Vercel internally.

    Returns None if the proxy is unconfigured or pointed at a local URL —
    a localhost base would be a deploy misconfig, not something to send
    integration calls to.
    """
    base_url = (settings.app_url or "").rstrip("/")
    secret = settings.agent_internal_secret
    if not base_url or not secret:
        return None
    if "localhost" in base_url or "127.0.0.1" in base_url:
        return None
    return base_url, secret


async def load_integration_tools(space_id: str, user_id: str) -> list[Any]:
    """Return the find + call dispatcher tools when the realtor has any
    active Composio toolkit connected. Empty list otherwise — chat must
    keep working on the native catalog if integrations are unavailable.
    """
    proxy = _proxy_base()
    if proxy is None:
        logger.warning(
            "integration_proxy_not_configured",
            space_id=space_id,
            user_id=user_id,
            hint="set NEXT_PUBLIC_APP_URL and AGENT_INTERNAL_SECRET in the Modal secret",
        )
        return []

    try:
        toolkits = await active_toolkits(space_id, user_id)
    except Exception as err:  # noqa: BLE001
        logger.warning(
            "integration_dispatcher_active_check_failed",
            space_id=space_id,
            user_id=user_id,
            error=str(err)[:200],
        )
        return []
    if not toolkits:
        return []

    from tools.integrations_dispatcher import (
        call_integration_tool,
        find_integration_tool,
    )

    logger.info(
        "integration_dispatcher_enabled",
        space_id=space_id,
        user_id=user_id,
        connected_toolkits=toolkits,
    )
    return [find_integration_tool, call_integration_tool]


async def resolve_owner_user_id(space_id: str) -> str | None:
    """For autonomous runs (no user in the request), the workspace OWNER is
    the entity whose connections we use. Returns the owner's Clerk userId
    or None if the chain (Space → User → clerkId) is broken.
    """
    db = await supabase()
    try:
        sp = await (
            db.table("Space")
            .select("ownerId")
            .eq("id", space_id)
            .maybe_single()
            .execute()
        )
        if not sp.data:
            return None
        owner_db_id = sp.data.get("ownerId")
        if not owner_db_id:
            return None
        u = await (
            db.table("User")
            .select("clerkId")
            .eq("id", owner_db_id)
            .maybe_single()
            .execute()
        )
        return (u.data or {}).get("clerkId")
    except Exception as err:  # noqa: BLE001
        logger.warning(
            "resolve_owner_user_id_failed",
            space_id=space_id,
            error=str(err)[:200],
        )
        return None
