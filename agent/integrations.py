"""
Composio integration loader for the Modal agent.

Mirrors the TypeScript-side wiring in `lib/ai-tools/sdk-chat.ts` →
`loadIntegrationTools(ctx)`. Without this, the production Modal runtime
has no awareness of the realtor's connected toolkits — every chat and
every autonomous run starts with zero integration tools regardless of
how many apps the realtor has connected.

Contract:
- `entity_id` is the realtor's Clerk userId. Composio scopes connections
  per entity, and our `IntegrationConnection` table also indexes by
  `userId` (Clerk). The Next.js callback persists with the Clerk userId,
  so this side reads with the same key.
- `space_id` is the workspace. We read active toolkits from the
  workspace + user pair so a brokerage with multiple realtors loads the
  right one's connections.
- Auth-error reconcile: when Composio reports `CONNECTED_ACCOUNT_*` /
  401 / 403 for a specific toolkit, we flip our row to `expired` so the
  /settings panel shows amber + Reconnect on the next visit. Mirrors
  `markExpiredByToolkit` in TypeScript.

Returns a list of agent tools ready to be passed into
`Agent(tools=[...])`. Empty list on any failure — chat keeps working
on the native catalog. A Composio outage must not take down chat.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from config import settings
from db import supabase

logger = structlog.get_logger()

# Vercel-proxy timeouts. List is cheap, execute can be slow for actions
# that themselves call out to slow providers (Gmail attach, Slack history).
_LIST_TIMEOUT = 30.0
_EXEC_TIMEOUT = 120.0


def composio_configured() -> bool:
    """True when COMPOSIO_API_KEY is set. Modal secret must include it."""
    return bool(os.environ.get("COMPOSIO_API_KEY"))


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


async def mark_expired_by_toolkit(
    space_id: str, user_id: str, toolkit: str, reason: str
) -> None:
    """Flip the row to 'expired' so /settings shows amber + Reconnect."""
    db = await supabase()
    try:
        # Find the active row for this triple.
        find_res = await (
            db.table("IntegrationConnection")
            .select("id,status")
            .eq("spaceId", space_id)
            .eq("userId", user_id)
            .eq("toolkit", toolkit)
            .eq("status", "active")
            .maybe_single()
            .execute()
        )
        row = find_res.data
        if not row:
            return  # already gone or already expired
        await (
            db.table("IntegrationConnection")
            .update(
                {
                    "status": "expired",
                    "lastError": reason[:500],
                    # `'now()'` here was passed as a string literal — the
                    # underlying asyncpg pool wants a real datetime for
                    # TIMESTAMPTZ columns, so every mark-expired write was
                    # silently failing in production.
                    "updatedAt": datetime.now(timezone.utc),
                }
            )
            .eq("id", row["id"])
            .execute()
        )
        logger.info(
            "integration_marked_expired_from_modal",
            space_id=space_id,
            toolkit=toolkit,
            reason=reason[:200],
        )
    except Exception as err:  # noqa: BLE001 - best-effort write
        logger.warning(
            "integration_mark_expired_failed",
            space_id=space_id,
            toolkit=toolkit,
            error=str(err)[:200],
        )


def _is_auth_like_error(err: Exception) -> bool:
    """Match Composio's CONNECTED-ACCOUNT auth-failure shapes specifically.

    Returns True only when the error is about ONE user's connection being
    dead (expired token, revoked grant, missing account). Returns False on
    platform-level errors (wrong COMPOSIO_API_KEY, IP allowlist rejection,
    rate limit) — those are infrastructure problems with our master key
    and must not flip the user's IntegrationConnection row to 'expired'.
    A bare 401 used to qualify here, but production hit a 401 with the
    message "This API key is not authorized from the current IP address"
    when Composio's IP allowlist didn't include Modal's egress range;
    every toolkit got marked expired in one sweep and the realtor lost
    access to all their integrations until they re-connected from scratch.
    """
    name = type(err).__name__
    if name == "ComposioConnectedAccountNotFoundError":
        return True
    msg = str(err).lower()
    if "connected_account" in msg or "connected account" in msg:
        return True
    # Only treat a 4xx as a user-connection issue when the message also
    # carries a token/grant marker. Bare auth status codes mean nothing
    # without context — they're as often a platform issue as a per-user
    # one, and the wrong side of that guess costs the realtor every
    # toolkit they've connected.
    status = getattr(err, "status_code", None) or getattr(err, "statusCode", None)
    has_auth_status = status in (401, 403) or "401" in msg or "403" in msg
    if has_auth_status and any(
        marker in msg
        for marker in (
            "token expired",
            "token_expired",
            "token revoked",
            "token_revoked",
            "invalid_grant",
            "refresh failed",
            "refresh_failed",
            "unauthorized_client",
        )
    ):
        return True
    return False


def _wrap_for_logging(tool: Any, *, space_id: str, toolkit: str) -> None:
    """Replace tool.on_invoke_tool with a logging wrapper.

    Composio's provider returns FunctionTool instances whose on_invoke_tool
    is the raw execute callable. We swap it for a coroutine that logs the
    input, the result preview, and any exception at info level so we can
    diagnose integration failures from Modal logs without having to enable
    SDK debug logging.
    """
    original = getattr(tool, "on_invoke_tool", None)
    name = getattr(tool, "name", "?")
    if not callable(original):
        return

    async def logged(ctx: Any, payload: Any) -> Any:
        preview_in = (str(payload) or "")[:300]
        logger.info(
            "integration_tool_invoked",
            space_id=space_id,
            toolkit=toolkit,
            tool=name,
            input_preview=preview_in,
        )
        try:
            result = await original(ctx, payload)
        except Exception as err:  # noqa: BLE001
            logger.warning(
                "integration_tool_failed",
                space_id=space_id,
                toolkit=toolkit,
                tool=name,
                error=str(err)[:500],
            )
            raise
        preview_out = (str(result) or "")[:400]
        logger.info(
            "integration_tool_returned",
            space_id=space_id,
            toolkit=toolkit,
            tool=name,
            output_preview=preview_out,
            output_len=len(str(result)) if result is not None else 0,
        )
        return result

    tool.on_invoke_tool = logged


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


def _build_proxied_function_tool(
    *,
    slug: str,
    name: str,
    description: str,
    parameters: dict[str, Any],
    toolkit: str,
    space_id: str,
    user_id: str,
    base_url: str,
    secret: str,
) -> Any:
    """Wrap one Composio action spec as an openai-agents FunctionTool whose
    handler POSTs to /api/internal/integrations/execute.
    """
    try:
        from agents import FunctionTool
    except ImportError:
        from agents.tool import FunctionTool  # older SDK path

    async def on_invoke(ctx: Any, args_json: str) -> str:
        try:
            arguments = json.loads(args_json) if args_json else {}
        except Exception as err:
            return json.dumps({"ok": False, "error": f"bad arguments: {err}"})
        logger.info(
            "integration_tool_invoked",
            space_id=space_id,
            toolkit=toolkit,
            tool=name,
            arg_keys=list(arguments.keys()) if isinstance(arguments, dict) else [],
        )
        try:
            async with httpx.AsyncClient(timeout=_EXEC_TIMEOUT) as client:
                resp = await client.post(
                    f"{base_url}/api/internal/integrations/execute",
                    json={
                        "spaceId": space_id,
                        "userId": user_id,
                        "slug": slug,
                        "arguments": arguments,
                    },
                    headers={"Authorization": f"Bearer {secret}"},
                )
        except Exception as err:
            logger.warning(
                "integration_tool_request_failed",
                space_id=space_id,
                toolkit=toolkit,
                tool=name,
                error=str(err)[:300],
            )
            return json.dumps({"ok": False, "error": f"{slug} request failed: {err}"})

        body_text = resp.text
        if resp.status_code >= 500:
            logger.warning(
                "integration_tool_proxy_5xx",
                space_id=space_id,
                toolkit=toolkit,
                tool=name,
                status=resp.status_code,
                body_preview=body_text[:300],
            )
            return json.dumps(
                {"ok": False, "error": f"{slug} failed ({resp.status_code})"}
            )
        # 4xx may be a real auth/argument error — surface the body so the
        # model can read it and adjust. 2xx already carries {ok,data,error}.
        return body_text or json.dumps({"ok": True, "data": None})

    return FunctionTool(
        name=name,
        description=description,
        params_json_schema=parameters,
        on_invoke_tool=on_invoke,
    )


async def load_integration_tools(space_id: str, user_id: str) -> list[Any]:
    """Fetch the realtor's Composio tools by proxying through Vercel.

    Direct Composio calls from Modal hit
    `10401 HTTP_Unauthorized: This API key is not authorized from the
    current IP address` because Composio's allowlist on our key includes
    Vercel's range but not Modal's egress IPs. We could ask Composio to
    open the allowlist, but Modal IPs rotate and that's a treadmill.
    Routing through Vercel costs one extra hop per tool call and removes
    the IP coupling entirely. The Composio OAuth handshake runs from
    Vercel already (lib/integrations/composio.ts), so this just reuses
    the same auth surface for runtime tool calls.

    Returns [] on any failure — chat must keep working on the native
    catalog if integrations are unavailable.
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
    base_url, secret = proxy

    try:
        async with httpx.AsyncClient(timeout=_LIST_TIMEOUT) as client:
            resp = await client.post(
                f"{base_url}/api/internal/integrations/tools",
                json={"spaceId": space_id, "userId": user_id},
                headers={"Authorization": f"Bearer {secret}"},
            )
        if resp.status_code >= 400:
            logger.warning(
                "integration_proxy_list_http_error",
                space_id=space_id,
                user_id=user_id,
                status=resp.status_code,
                body_preview=resp.text[:300],
            )
            return []
        data = resp.json()
    except Exception as err:
        logger.warning(
            "integration_proxy_list_failed",
            space_id=space_id,
            user_id=user_id,
            error=str(err)[:300],
        )
        return []

    specs = data.get("tools") or []
    if not specs:
        return []

    tools: list[Any] = []
    for spec in specs:
        slug = spec.get("slug")
        if not slug:
            continue
        # SDK constrains tool names to lowercase alphanumeric + underscore,
        # 64 chars max. Slugs from Composio are usually fine but normalize
        # defensively.
        raw_name = (spec.get("name") or slug).lower()
        safe_name = "".join(c if c.isalnum() or c == "_" else "_" for c in raw_name)[:64]
        if not safe_name:
            continue
        try:
            tools.append(
                _build_proxied_function_tool(
                    slug=slug,
                    name=safe_name,
                    description=(spec.get("description") or slug)[:1024],
                    parameters=spec.get("parameters")
                    or {"type": "object", "properties": {}},
                    toolkit=spec.get("toolkit") or "",
                    space_id=space_id,
                    user_id=user_id,
                    base_url=base_url,
                    secret=secret,
                )
            )
        except Exception as err:  # noqa: BLE001
            logger.warning(
                "integration_tool_build_failed",
                slug=slug,
                error=str(err)[:200],
            )

    logger.info(
        "integration_tools_loaded_via_proxy",
        space_id=space_id,
        user_id=user_id,
        tool_count=len(tools),
        tool_slugs=[getattr(t, "name", "?") for t in tools[:10]],
    )
    return tools


async def resolve_owner_user_id(space_id: str) -> str | None:
    """
    For autonomous runs (no user in the request), the workspace OWNER is
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
