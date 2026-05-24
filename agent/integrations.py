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


# Native tool names that ship on every Chippi agent (chippi.py:make_chippi_agent).
# Integration tool names that collide with these get a toolkit prefix added
# defensively. The xAI Chat Completions endpoint rejects the entire request
# with `Duplicate function definition` when two functions share a name —
# OpenAI / Anthropic silently dedup but Grok is strict. The user-visible
# symptom is a chat that says "integrations connected" then fails on the
# next turn with a 400 from the model provider.
_NATIVE_TOOL_NAMES = frozenset({
    "create_contact", "find_contacts", "get_contact_activity", "update_contact",
    "create_deal", "find_deals", "update_deal", "advance_deal_stage", "request_deal_review",
    "book_tour", "route_lead", "add_property", "send_property_packet",
    "recall_memory", "store_memory", "manage_goal", "manage_routines",
    "draft_message", "outcome", "analyze_portfolio", "generate_priority_list",
    "process_inbound_message", "read_attachment", "ask_realtor",
    "log_activity_run", "recall_docs", "create_plan",
    "get_intake_form", "add_intake_question", "remove_intake_question",
    "update_intake_question", "save_intake_form",
    "generate_studio_image", "edit_studio_image",
})


def _safe_tool_name(slug: str, toolkit: str) -> str:
    """Build a unique-per-process function name from a Composio tool spec.

    Composio slugs are uppercase + underscore (`GMAIL_SEND_EMAIL`,
    `HUBSPOT_CRM_CREATE_CONTACT`). Lowercasing usually keeps them unique
    against our native tools — but a Composio `Create Contact` name path
    or a toolkit that ships a bare verb (`create_contact`) collides with
    our native `create_contact` tool. The xAI Chat Completions API
    refuses any request whose function list has duplicate names.
    Defensively prefix with the toolkit slug whenever the base would
    collide, and replace any non-[a-z0-9_] characters so the name stays
    valid for every provider.
    """
    raw = (slug or "").lower()
    cleaned = "".join(c if c.isalnum() or c == "_" else "_" for c in raw)
    tk = (toolkit or "").lower().strip("_")
    # Force a toolkit prefix whenever the cleaned base would collide with
    # a native tool. If the slug already starts with the toolkit, no extra
    # prefix is added (Composio slugs usually do, so this is a no-op).
    if cleaned in _NATIVE_TOOL_NAMES and tk and not cleaned.startswith(f"{tk}_"):
        cleaned = f"{tk}_{cleaned}"
    if not cleaned:
        cleaned = f"{tk}_unnamed" if tk else "unnamed_tool"
    return cleaned[:64]


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
    """Expose the integration dispatcher (find + call) when the realtor has
    any active toolkit connected.

    The prior approach front-loaded every Composio action into the model's
    tool list: 500+ function definitions per chat turn for a realtor with
    Gmail + HubSpot + Slack + Instagram, past xAI's 200-tool ceiling
    (`Maximum tools limit reached. 520 tools provided but the maximum is
    200.`) and a brutal token cost on every other provider even for
    chats that never touch an integration. Dispatcher pattern collapses
    that to two meta-tools the model only invokes when it actually needs
    an external system:

        find_integration_tool(query)   -> top-N matching action specs
        call_integration_tool(slug, .) -> executes the chosen action

    Both proxy through Vercel (the same /search and /execute endpoints
    Composio's per-IP auth allowlists already accept), so Modal's egress
    IPs never appear in Composio's request log.

    Returns [] when no toolkits are connected (no point loading the
    dispatcher only for it to find nothing) or when the proxy is
    misconfigured.
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

    # Quick connectivity check — the dispatcher is dead weight if the
    # realtor has zero active toolkits. Cheap read against our own DB.
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
