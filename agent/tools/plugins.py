"""Custom-plugin tools — the realtor's own HTTP tools, callable by name.

The realtor registers plugins on the Plugins page (name, description, HTTPS
endpoint, optional auth header). `list_plugins` tells the model what exists;
`use_plugin` calls one. Execution is delegated to the internal Next.js
endpoint (AGENT_INTERNAL_SECRET-authed), which runs the SAME hardened path as
the TS chat tool — SSRF guard, no redirects, safe dispatcher, timeout,
response cap, server-side auth-header attach. This runtime never sees the
stored secret and never fetches the target directly.
"""

from __future__ import annotations

from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from config import settings
from db import supabase
from security.context import AgentContext
from tools.base import rate_limited

_TIMEOUT = 30.0


@function_tool(strict_mode=False)
@rate_limited(max_calls=60, window_seconds=3600)
async def list_plugins(ctx: RunContextWrapper[AgentContext]) -> dict[str, Any]:
    """List the realtor's registered custom plugins with descriptions of when to use each."""
    db = await supabase()
    res = (
        await db.table("CustomPlugin")
        .select("name, description, method, enabled")
        .eq("spaceId", ctx.context.space_id)
        .order("name")
        .execute()
    )
    plugins = res.data or []
    return {"plugins": plugins, "count": len(plugins)}


@function_tool(strict_mode=False)
@rate_limited(max_calls=30, window_seconds=3600)
async def use_plugin(
    ctx: RunContextWrapper[AgentContext],
    plugin: str,
    input: str | None = None,
) -> dict[str, Any]:
    """Call one of the realtor's custom plugins (their own HTTP API) by name."""
    # plugin: the plugin name exactly as listed (e.g. "mls-lookup").
    # input: what to send — JSON passes through as the body; plain text wraps
    #        as {"input": text}; for GET plugins it becomes ?input=.
    base_url = (settings.app_url or "").rstrip("/")
    secret = settings.agent_internal_secret
    if not base_url or not secret:
        return {"error": "Custom plugins are not configured."}

    clean = (plugin or "").strip()
    if not clean:
        return {"error": "plugin name is required"}

    payload: dict[str, Any] = {"spaceId": ctx.context.space_id, "plugin": clean}
    if input:
        payload["input"] = input

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.post(
                f"{base_url}/api/internal/plugins/call",
                json=payload,
                headers={"Authorization": f"Bearer {secret}"},
            )
    except Exception as exc:  # noqa: BLE001 — surface to the agent, never throw
        return {"error": f"plugin call failed: {exc}"}

    try:
        data = resp.json()
    except Exception:  # noqa: BLE001
        snippet = (resp.text or "")[:200].replace("\n", " ").strip()
        return {"error": f"non-JSON response ({resp.status_code}): {snippet}"}

    if resp.status_code >= 400:
        return {"error": data.get("error") or f"plugin call failed ({resp.status_code})"}

    return {
        "plugin": data.get("plugin"),
        "status": data.get("status"),
        "ok": data.get("httpOk"),
        "body": data.get("body"),
    }
