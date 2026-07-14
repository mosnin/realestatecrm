"""Best-effort push notifications from the Python agent runtime.

The Python side has no path to the web-push stack in lib/push.ts, so background
work (swarms, delegated runs) used to finish silently — the result landed in
the DB and nobody was told. This helper closes the loop by POSTing to the
internal Next.js endpoint /api/internal/notify (AGENT_INTERNAL_SECRET-authed,
same contract as tools/team.py), which fans out to the space's push
subscriptions.

STRICTLY best-effort: every failure — unconfigured base URL/secret, transport
error, non-2xx — is logged and swallowed. A notification must never fail or
delay the run it reports on.
"""

from __future__ import annotations

import httpx
import structlog

from config import settings

logger = structlog.get_logger(__name__)

_TIMEOUT = 10.0

# The notify endpoint enforces the same caps; trimming here keeps the payload
# small and makes the copy predictable in tests.
MAX_TITLE = 200
MAX_BODY = 500


async def notify_space(
    space_id: str,
    title: str,
    body: str,
    url: str | None = None,
) -> bool:
    """POST a push notification for a space. Returns True iff the endpoint
    accepted it. Never raises."""
    base_url = (settings.app_url or "").rstrip("/")
    secret = settings.agent_internal_secret
    if not base_url or not secret:
        logger.warning("notify_skipped_unconfigured", space_id=space_id)
        return False

    payload: dict[str, str] = {
        "spaceId": space_id,
        "title": (title or "").strip()[:MAX_TITLE],
        "body": (body or "").strip()[:MAX_BODY],
    }
    if url:
        payload["url"] = url

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.post(
                f"{base_url}/api/internal/notify",
                json=payload,
                headers={"Authorization": f"Bearer {secret}"},
            )
        if resp.status_code >= 400:
            logger.warning(
                "notify_rejected", space_id=space_id, status_code=resp.status_code
            )
            return False
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort by contract
        logger.warning("notify_failed", space_id=space_id, error=str(exc))
        return False
