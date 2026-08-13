"""Dedicated Modal entrypoint for the anonymous Research Workspace browser.

Deploy this file independently of ``modal_app.py``. Its image contains only
Playwright, HTTP transport, and the browser worker; its Modal secret contains
only the Chippi web origin and browser-worker shared secret.
"""

from __future__ import annotations

import os
from pathlib import Path

import modal

_AGENT_DIR = Path(__file__).resolve().parent

browser_image = (
    modal.Image.debian_slim(python_version="3.12")
    # BrowserContext.route_web_socket is required to close all WebSockets in
    # the anonymous context and is available from Playwright 1.48.
    .pip_install("httpx>=0.28.0,<1", "playwright>=1.48,<2")
    .run_commands("playwright install --with-deps chromium")
    .add_local_file(_AGENT_DIR / "browser_headless.py", remote_path="/app/browser_headless.py")
)

app = modal.App(
    os.environ.get("CHIPPI_BROWSER_MODAL_APP_NAME", "chippi-browser"), image=browser_image
)

# Modal evaluates this module both locally (to construct the deployment) and
# remotely (to load it). Use the documented placeholder pattern so the two
# functions always have fixed dependency counts while staging may select its
# own named secrets. The public launch endpoint gets only browser_secret; the
# worker gets browser_secret plus bypass_secret in every environment.
if modal.is_local():
    browser_secret = modal.Secret.from_name(
        os.environ.get("CHIPPI_BROWSER_MODAL_SECRET_NAME", "chippi-browser-secrets")
    )
    bypass_secret_name = os.environ.get("CHIPPI_BROWSER_MODAL_BYPASS_SECRET_NAME", "").strip()
    bypass_secret = (
        modal.Secret.from_name(bypass_secret_name)
        if bypass_secret_name
        else modal.Secret.from_dict({})
    )
else:
    browser_secret = modal.Secret.from_dict({})
    bypass_secret = modal.Secret.from_dict({})

browser_secrets = [browser_secret]
worker_secrets = [browser_secret, bypass_secret]


@app.function(image=browser_image, secrets=worker_secrets, timeout=900, max_containers=20)
async def run_headless_browser_session(session_id: str, lease_token: str) -> dict:
    """Run one fresh, fenced public-web browser for at most fifteen minutes."""
    import logging
    import sys

    import httpx

    sys.path.insert(0, "/app")
    from browser_headless import poll_and_execute

    base_url = os.environ.get("CHIPPI_BROWSER_APP_URL", "").rstrip("/")
    worker_secret = os.environ.get("CHIPPI_BROWSER_WORKER_SECRET", "")
    vercel_bypass_secret = os.environ.get("CHIPPI_BROWSER_VERCEL_BYPASS_SECRET", "")
    if not base_url or not worker_secret:
        raise RuntimeError("Cloud research worker is missing its dedicated configuration.")

    result: dict = {}
    error = ""
    try:
        result = await poll_and_execute(
            base_url=base_url,
            internal_secret=worker_secret,
            session_id=session_id,
            worker_lease_token=lease_token,
            vercel_bypass_secret=vercel_bypass_secret,
            max_iterations=600,
        )
        return result
    except Exception:
        error = "Cloud research worker failed."
        logging.getLogger(__name__).error(
            "headless_browser_worker_failed session_id=%s", session_id
        )
        raise
    finally:
        # Best effort only: a process kill is recovered by the fenced lease.
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                completion_headers = {"Authorization": f"Bearer {worker_secret}"}
                if vercel_bypass_secret:
                    completion_headers["x-vercel-protection-bypass"] = vercel_bypass_secret
                await client.post(
                    f"{base_url}/api/browser-control/headless/complete",
                    headers=completion_headers,
                    json={
                        "sessionId": session_id,
                        "workerLeaseToken": lease_token,
                        **({"error": error} if error else {}),
                    },
                )
        except Exception:
            logging.getLogger(__name__).warning(
                "headless_browser_worker_completion_failed session_id=%s", session_id
            )


@app.function(secrets=browser_secrets, timeout=30)
@modal.fastapi_endpoint(method="POST", label="start-headless-browser")
async def start_headless_browser_workspace(item: dict) -> dict:
    """Accept a browser-only worker launch after the web app claims its lease."""
    import hmac
    import uuid

    expected = os.environ.get("CHIPPI_BROWSER_WORKER_SECRET", "")
    supplied = item.get("secret")
    if not expected or not isinstance(supplied, str) or not hmac.compare_digest(supplied, expected):
        from fastapi.responses import JSONResponse

        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    session_id = item.get("session_id")
    lease_token = item.get("lease_token")
    try:
        if not isinstance(session_id, str) or not isinstance(lease_token, str):
            raise ValueError
        uuid.UUID(session_id)
        uuid.UUID(lease_token)
    except (ValueError, TypeError, AttributeError):
        from fastapi.responses import JSONResponse

        return JSONResponse({"error": "valid session_id and lease_token required"}, status_code=400)
    run_headless_browser_session.spawn(session_id, lease_token)
    return {"accepted": True}
