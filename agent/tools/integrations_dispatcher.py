"""Integration dispatcher — discover + invoke Composio tools on demand.

The previous architecture front-loaded every action from every connected
toolkit into the model's tool list. With Gmail + HubSpot + Slack + a few
others, that's 500+ function definitions per turn — past xAI's 200-tool
ceiling and a heavy token cost on every other provider. The dispatcher
collapses that to two tools the model can call only when it needs an
integration:

    find_integration_tool(query)   →  list of {slug, name, description}
    call_integration_tool(slug, arguments_json)  →  the action's result

The model uses find_integration_tool whenever the user asks for something
that needs an external system ("read my last 10 emails", "find HubSpot
contacts in stage X", "post this on LinkedIn"), then calls
call_integration_tool with the slug from the search result.

Both tools proxy through Vercel (see app/api/internal/integrations/
{search,execute}/route.ts) — Modal egress IPs never touch Composio
directly, which keeps the auth surface tidy and dodges IP-allowlist
issues on the Composio side.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import structlog
from agents import RunContextWrapper, function_tool

from config import settings
from security.context import AgentContext
from tools.base import rate_limited

logger = structlog.get_logger()

_SEARCH_TIMEOUT = 30.0
_EXEC_TIMEOUT = 120.0


def _proxy_base() -> tuple[str, str] | None:
    base_url = (settings.app_url or "").rstrip("/")
    secret = settings.agent_internal_secret
    if not base_url or not secret:
        return None
    if "localhost" in base_url or "127.0.0.1" in base_url:
        return None
    return base_url, secret


@function_tool
@rate_limited(max_calls=60, window_seconds=3600)
async def find_integration_tool(
    ctx: RunContextWrapper[AgentContext],
    query: str,
    limit: int = 10,
) -> str:
    """Discover Composio actions in the realtor's connected toolkits.

    Use this when the realtor asks Chippi to do something that needs an
    external integration — read their Gmail, post to LinkedIn, list
    HubSpot contacts, send a Slack message, etc. Returns the top matching
    actions across every connected toolkit (Gmail, HubSpot, Slack, etc.).

    query: a short natural-language description of what you need to do.
           Examples: "read recent emails", "send gmail", "create hubspot
           contact", "post to linkedin", "list slack channels".

    limit: how many results to return. Default 10, max 30.

    Returns JSON of {tools: [{slug, name, description, toolkit, parameters}]}.
    The `slug` is what you pass to call_integration_tool to actually run
    the action. The `parameters` is the JSON schema for that action's
    arguments — read it carefully before calling.

    Returns {tools: []} when no toolkits are connected or none match the
    query. Don't keep searching with new queries — if the first search
    didn't surface what you need, tell the realtor the integration isn't
    connected and ask if they want to connect it.
    """
    proxy = _proxy_base()
    if proxy is None:
        return json.dumps({"tools": [], "error": "integration proxy not configured"})
    base_url, secret = proxy

    clean_query = (query or "").strip()
    safe_limit = max(1, min(30, int(limit) if limit else 10))

    user_id = getattr(ctx.context, "user_id", "")
    if not user_id:
        return json.dumps({
            "tools": [],
            "error": "no realtor identity on this run — integrations unavailable",
        })

    try:
        async with httpx.AsyncClient(timeout=_SEARCH_TIMEOUT) as client:
            resp = await client.post(
                f"{base_url}/api/internal/integrations/search",
                json={
                    "spaceId": ctx.context.space_id,
                    "userId": user_id,
                    "query": clean_query,
                    "limit": safe_limit,
                },
                headers={"Authorization": f"Bearer {secret}"},
            )
    except Exception as err:
        logger.warning(
            "find_integration_tool_request_failed",
            space_id=ctx.context.space_id,
            error=str(err)[:300],
        )
        return json.dumps({"tools": [], "error": f"search request failed: {err}"})

    if resp.status_code >= 400:
        return json.dumps(
            {"tools": [], "error": f"search failed ({resp.status_code})"}
        )

    try:
        data = resp.json()
    except Exception:
        return json.dumps({"tools": [], "error": "unparseable response"})

    tools = data.get("tools") or []
    logger.info(
        "find_integration_tool_results",
        space_id=ctx.context.space_id,
        query=clean_query,
        result_count=len(tools),
        top_slugs=[t.get("slug") for t in tools[:5]],
    )
    return json.dumps({"tools": tools})


@function_tool
@rate_limited(max_calls=300, window_seconds=3600)
async def call_integration_tool(
    ctx: RunContextWrapper[AgentContext],
    slug: str,
    arguments_json: str,
) -> str:
    """Execute one Composio action by slug.

    Use this after find_integration_tool to actually run the action you
    discovered. Pass the slug verbatim from the search result and the
    arguments as a JSON-encoded string that matches the action's
    `parameters` schema.

    slug: the action slug from find_integration_tool (e.g. 'GMAIL_FETCH_EMAILS',
          'HUBSPOT_CRM_CREATE_CONTACT', 'SLACK_SEND_MESSAGE').

    arguments_json: a JSON-encoded object whose shape matches the action's
                    `parameters` JSON schema. Pass an empty object string
                    `'{}'` when the action takes no arguments.

    Returns JSON of {ok, data?, error?}. On success, `data` carries the
    action's response (an email list, a contact object, a message id,
    etc.) — surface the relevant pieces back to the realtor naturally;
    don't dump raw JSON.

    Common failure modes the realtor should understand:
      - `ok=false` with an auth message → the integration needs to be
        reconnected; tell the realtor to visit /settings.
      - `ok=false` with a 4xx detail → arguments were malformed; re-read
        the schema and try again at most once before asking the realtor.
    """
    proxy = _proxy_base()
    if proxy is None:
        return json.dumps({"ok": False, "error": "integration proxy not configured"})
    base_url, secret = proxy

    clean_slug = (slug or "").strip()
    if not clean_slug:
        return json.dumps({"ok": False, "error": "slug is required"})

    try:
        arguments = json.loads(arguments_json) if arguments_json else {}
    except Exception as err:
        return json.dumps({"ok": False, "error": f"bad arguments JSON: {err}"})

    user_id = getattr(ctx.context, "user_id", "")
    if not user_id:
        return json.dumps({
            "ok": False,
            "error": "no realtor identity on this run — integrations unavailable",
        })

    logger.info(
        "call_integration_tool_invoked",
        space_id=ctx.context.space_id,
        slug=clean_slug,
        arg_keys=list(arguments.keys()) if isinstance(arguments, dict) else [],
    )

    try:
        async with httpx.AsyncClient(timeout=_EXEC_TIMEOUT) as client:
            resp = await client.post(
                f"{base_url}/api/internal/integrations/execute",
                json={
                    "spaceId": ctx.context.space_id,
                    "userId": user_id,
                    "slug": clean_slug,
                    "arguments": arguments,
                },
                headers={"Authorization": f"Bearer {secret}"},
            )
    except Exception as err:
        logger.warning(
            "call_integration_tool_request_failed",
            space_id=ctx.context.space_id,
            slug=clean_slug,
            error=str(err)[:300],
        )
        return json.dumps({"ok": False, "error": f"{clean_slug} request failed: {err}"})

    body_text = resp.text
    if resp.status_code >= 500:
        return json.dumps(
            {"ok": False, "error": f"{clean_slug} failed ({resp.status_code})"}
        )
    return body_text or json.dumps({"ok": True, "data": None})
