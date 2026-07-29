"""Dedicated, feature-off Modal VM Sandbox worker for Chippy Workspace Runs.

The Modal *function* owns the narrow callback secret. The VM Sandbox receives
only a fixed packet-building script and goal data through its filesystem: no
cloud credentials, no callback token, no network, no inbound ports.
"""
from __future__ import annotations
import base64, hashlib, hmac, json, os, re, uuid
import httpx, modal
from fastapi.responses import JSONResponse
from workspace_sequence import reserve_sequence

app = modal.App(os.environ.get("CHIPPI_WORKSPACE_MODAL_APP_NAME", "chippi-workspace"))
image = modal.Image.debian_slim(python_version="3.12")
if modal.is_local():
    workspace_secret = modal.Secret.from_name(
        os.environ.get("CHIPPI_WORKSPACE_MODAL_SECRET_NAME", "chippi-workspace-secrets")
    )
    bypass_secret_name = os.environ.get(
        "CHIPPI_WORKSPACE_MODAL_BYPASS_SECRET_NAME", ""
    ).strip()
    bypass_secret = (
        modal.Secret.from_name(bypass_secret_name)
        if bypass_secret_name
        else modal.Secret.from_dict({})
    )
else:
    workspace_secret = modal.Secret.from_dict({})
    bypass_secret = modal.Secret.from_dict({})
secrets = [workspace_secret, bypass_secret]
MAX_GOAL = 1000
PACKET_SCRIPT = '''import json, pathlib
p = pathlib.Path("/workspace"); p.mkdir(parents=True, exist_ok=True)
packet = json.loads((p / "input.json").read_text())["packet"]
for name, content in packet.items(): (p / {"brief":"brief.md","checklist":"launch-checklist.md","comps":"comps.csv","handoff":"handoff.md"}[name]).write_text(content)
print("Created brief.md, launch-checklist.md, comps.csv, handoff.md")
'''

def _callback_headers(signature: str) -> dict[str, str]:
    headers = {
        "content-type": "application/json",
        "x-chippy-workspace-signature": signature,
    }
    bypass = os.environ.get("CHIPPI_BROWSER_VERCEL_BYPASS_SECRET", "")
    if bypass:
        headers["x-vercel-protection-bypass"] = bypass
    return headers

def _callback(payload: dict) -> dict:
    url, secret = os.environ.get("CHIPPI_WORKSPACE_CALLBACK_URL", ""), os.environ.get("CHIPPI_WORKSPACE_CALLBACK_SECRET", "")
    if not url or not secret: raise RuntimeError("workspace callback is not configured")
    raw = json.dumps(payload, separators=(",", ":"))
    signature = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    response = httpx.post(url, content=raw, headers=_callback_headers(signature), timeout=20)
    response.raise_for_status(); return response.json()

def _claim_launch(item: dict) -> bool:
    """Server-side fenced acceptance before any background container spawns."""
    url, secret = os.environ.get("CHIPPI_WORKSPACE_LAUNCH_CLAIM_URL", ""), os.environ.get("CHIPPI_WORKSPACE_CALLBACK_SECRET", "")
    if not url or not secret: raise RuntimeError("workspace launch claim is not configured")
    payload = {"run_id": item.get("run_id"), "space_id": item.get("space_id"), "launch_token": item.get("launch_token")}
    raw = json.dumps(payload, separators=(",", ":"))
    signature = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    response = httpx.post(url, content=raw, headers=_callback_headers(signature), timeout=10)
    response.raise_for_status()
    return response.json().get("won") is True

@app.function(image=image, secrets=secrets, timeout=180, max_containers=10)
async def run_workspace(item: dict):
    expected = os.environ.get("CHIPPI_WORKSPACE_MODAL_SECRET", "")
    if not expected or not hmac.compare_digest(str(item.get("secret", "")), expected): return JSONResponse({"error":"Unauthorized"}, status_code=401)
    run_id, space_id, goal, packet = str(item.get("run_id", "")), str(item.get("space_id", "")), str(item.get("goal", "")).strip()[:MAX_GOAL], item.get("packet")
    try: uuid.UUID(run_id)
    except ValueError: return JSONResponse({"error":"invalid run id"}, status_code=400)
    if not space_id or len(goal) < 10 or not isinstance(packet, dict): return JSONResponse({"error":"invalid workspace request"}, status_code=400)
    seq = 1
    def event(kind: str, message: str, **extra):
        nonlocal seq
        # Advance before I/O: a committed callback whose HTTP response is lost
        # must never cause the later failure callback to reuse its sequence.
        current_sequence, seq = reserve_sequence(seq)
        reply = _callback({"run_id":run_id,"space_id":space_id,"sequence":current_sequence,"type":kind,"message":message,**extra})
        return reply.get("cancellationRequested", False)
    sandbox = None
    try:
        event("workspace_started", "Initialized an isolated Chippy workspace.")
        sandbox = await modal.Sandbox.create.aio("sleep", "120", app=app, image=image, timeout=120, cpu=1, memory=1024, block_network=True, experimental_options={"vm_runtime": True})
        mkdir = await sandbox.exec.aio("mkdir", "-p", "/workspace", timeout=5); await mkdir.wait.aio()
        await sandbox.filesystem.write_text.aio(json.dumps({"goal": goal, "packet": packet}), "/workspace/input.json")
        await sandbox.filesystem.write_text.aio(PACKET_SCRIPT, "/workspace/build_packet.py")
        if event("command_started", "Building the Listing Intelligence Packet.", command="python /workspace/build_packet.py"):
            event("cancelled", "Workspace cancelled before packet generation."); return {"cancelled": True}
        process = await sandbox.exec.aio("python", "/workspace/build_packet.py", timeout=45)
        stdout = await process.stdout.read.aio(); stderr = await process.stderr.read.aio(); await process.wait.aio()
        if process.returncode != 0: raise RuntimeError((stderr or stdout or "packet builder failed")[:1000])
        if event("command_finished", "Packet files created.", command="python /workspace/build_packet.py", output=stdout[:2000]):
            event("cancelled", "Workspace cancelled before files were published."); return {"cancelled": True}
        files = []
        for name in ("brief.md", "launch-checklist.md", "comps.csv", "handoff.md"):
            content = await sandbox.filesystem.read_bytes.aio(f"/workspace/{name}")
            files.append({"name":name,"content":base64.b64encode(content).decode()})
            event("file_created", f"Created {name}.")
        event("completed", "Listing Intelligence Packet is ready.", files=files)
        return {"accepted": True, "run_id": run_id}
    except Exception as exc:
        try: event("failed", "Workspace could not finish.", output=re.sub(r"[^ -~]", "", str(exc))[:1000])
        except Exception: pass
        return JSONResponse({"error":"workspace failed"}, status_code=500)
    finally:
        if sandbox is not None:
            try: await sandbox.terminate.aio()
            except Exception: pass

@app.function(image=image, secrets=secrets, timeout=20, max_containers=10)
@modal.fastapi_endpoint(method="POST")
async def launch_workspace(item: dict):
    """Authenticated fast acceptor: the durable runner owns the VM lifecycle."""
    expected = os.environ.get("CHIPPI_WORKSPACE_MODAL_SECRET", "")
    if not expected or not hmac.compare_digest(str(item.get("secret", "")), expected): return JSONResponse({"error":"Unauthorized"}, status_code=401)
    run_id = str(item.get("run_id", ""))
    try: uuid.UUID(run_id)
    except ValueError: return JSONResponse({"error":"invalid run id"}, status_code=400)
    if not isinstance(item.get("launch_token"), str) or not item["launch_token"]:
        return JSONResponse({"error":"invalid launch token"}, status_code=400)
    try:
        if not _claim_launch(item):
            return JSONResponse({"accepted": True, "duplicate": True, "run_id": run_id}, status_code=202)
    except Exception:
        # Never start on an unavailable/ambiguous authority decision.
        return JSONResponse({"error":"launch claim unavailable"}, status_code=503)
    run_workspace.spawn(item)
    return JSONResponse({"accepted": True, "run_id": run_id}, status_code=202)
