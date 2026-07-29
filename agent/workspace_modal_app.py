"""Dedicated, feature-off Modal VM Sandbox worker for Chippy Workspace Runs.

The Modal *function* owns the narrow callback secret. The VM Sandbox receives
only a fixed packet-building script and goal data through its filesystem: no
cloud credentials, no callback token, no network, no inbound ports.
"""
from __future__ import annotations
import base64, hashlib, hmac, json, os, re, uuid
from pathlib import Path

import httpx, modal
from workspace_sequence import reserve_sequence

_AGENT_DIR = Path(__file__).resolve().parent
app = modal.App(os.environ.get("CHIPPI_WORKSPACE_MODAL_APP_NAME", "chippi-workspace"))
image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi[standard]>=0.115.0,<1",
    "httpx>=0.28.0,<1",
).add_local_file(
    _AGENT_DIR / "workspace_sequence.py",
    remote_path="/root/workspace_sequence.py",
)
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
TASK_SCRIPT = '''import argparse, json, pathlib, re
p = pathlib.Path("/workspace"); payload = json.loads((p / "task-input.json").read_text())
safe = re.compile(r"^(brief\\.md|launch-checklist\\.md|comps\\.csv|handoff\\.md|workspace-follow-up-[1-9][0-9]*\\.md)$")
for item in payload["files"]:
    name = item["name"]
    if not safe.fullmatch(name) or "/" in name or "\\\\" in name: raise SystemExit("unsafe workspace filename")
    (p / name).write_text(item["content"], encoding="utf-8")
parser = argparse.ArgumentParser(); parser.add_argument("--inspect", action="store_true"); parser.add_argument("--validate", action="store_true"); args = parser.parse_args()
output_name = "workspace-follow-up-%d.md" % payload["task_sequence"]
if args.inspect:
    print("Hydrated: " + ", ".join(sorted(item["name"] for item in payload["files"])))
elif args.validate:
    target = p / output_name
    if not target.is_file() or target.stat().st_size > 32000: raise SystemExit("follow-up artifact is invalid")
    print("Validated " + output_name)
else: raise SystemExit("choose --inspect or --validate")
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

def _task_callback(payload: dict) -> dict:
    url, secret = os.environ.get("CHIPPI_WORKSPACE_TASK_CALLBACK_URL", ""), os.environ.get("CHIPPI_WORKSPACE_CALLBACK_SECRET", "")
    if not url or not secret: raise RuntimeError("workspace task callback is not configured")
    raw = json.dumps(payload, separators=(",", ":")); signature = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    response = httpx.post(url, content=raw, headers=_callback_headers(signature), timeout=20)
    response.raise_for_status(); return response.json()

def _claim_task_launch(item: dict) -> bool:
    url, secret = os.environ.get("CHIPPI_WORKSPACE_TASK_LAUNCH_CLAIM_URL", ""), os.environ.get("CHIPPI_WORKSPACE_CALLBACK_SECRET", "")
    if not url or not secret: raise RuntimeError("workspace task launch claim is not configured")
    payload = {"task_id": item.get("task_id"), "space_id": item.get("space_id"), "launch_token": item.get("launch_token")}
    raw = json.dumps(payload, separators=(",", ":")); signature = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    response = httpx.post(url, content=raw, headers=_callback_headers(signature), timeout=10)
    response.raise_for_status(); return response.json().get("won") is True

@app.function(image=image, secrets=secrets, timeout=180, max_containers=10)
async def run_workspace(item: dict):
    from fastapi.responses import JSONResponse

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
    from fastapi.responses import JSONResponse

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
    await run_workspace.spawn.aio(item)
    return JSONResponse({"accepted": True, "run_id": run_id}, status_code=202)

@app.function(image=image, secrets=secrets, timeout=180, max_containers=10)
async def run_workspace_task(item: dict):
    """A follow-up gets a fresh VM; persisted files/tasks, never a warm VM,
    are the source of truth. The Sandbox only receives bounded text inputs."""
    expected = os.environ.get("CHIPPI_WORKSPACE_MODAL_SECRET", "")
    if not expected or not hmac.compare_digest(str(item.get("secret", "")), expected): return {"error": "unauthorized"}
    task_id, run_id, space_id = str(item.get("task_id", "")), str(item.get("run_id", "")), str(item.get("space_id", ""))
    try: uuid.UUID(task_id); uuid.UUID(run_id)
    except ValueError: return {"error": "invalid id"}
    instruction, files, task_sequence, program = str(item.get("instruction", "")).strip()[:MAX_GOAL], item.get("files"), item.get("task_sequence"), item.get("program")
    if not space_id or len(instruction) < 3 or not isinstance(files, list) or not isinstance(task_sequence, int) or task_sequence < 1 or len(files) > 16 or not isinstance(program, str) or not program or len(program) > 12000: return {"error": "invalid workspace task"}
    safe_name = re.compile(r"^(brief\\.md|launch-checklist\\.md|comps\\.csv|handoff\\.md|workspace-follow-up-[1-9][0-9]*\\.md)$")
    if re.search(r"\b(import\s+(?:os|sys|subprocess|socket|urllib|http|requests|ctypes|multiprocessing|inspect)|from\s+(?:os|sys|subprocess|socket|urllib|http|requests|ctypes|multiprocessing|inspect)\b|\b(?:eval|exec|compile|__import__|open)\s*\(|\.system\s*\(|\.popen\s*\()", program, re.I) or not all(term in program for term in ("instruction", "read_text", "output_path", "write_text")) or re.search(r"\.\.[/\\\\]|/etc|/proc|/dev|~/", program): return {"error": "unsafe workspace program"}
    for file in files:
        if not isinstance(file, dict) or not isinstance(file.get("name"), str) or not isinstance(file.get("content"), str) or not safe_name.fullmatch(file["name"]) or len(file["content"].encode()) > 32000: return {"error": "unsafe workspace manifest"}
    seq = 1
    def event(kind: str, message: str, **extra):
        nonlocal seq
        current_sequence, seq = reserve_sequence(seq)
        reply = _task_callback({"task_id": task_id, "run_id": run_id, "space_id": space_id, "sequence": current_sequence, "type": kind, "message": message, **extra})
        return reply.get("cancellationRequested", False)
    sandbox = None
    try:
        event("workspace_started", "Opened a fresh isolated workspace for this continuation.")
        sandbox = await modal.Sandbox.create.aio("sleep", "120", app=app, image=image, timeout=120, cpu=1, memory=1024, block_network=True, experimental_options={"vm_runtime": True})
        mkdir = await sandbox.exec.aio("mkdir", "-p", "/workspace", timeout=5); await mkdir.wait.aio()
        output_path = f"/workspace/workspace-follow-up-{task_sequence}.md"
        payload = {"instruction": instruction, "files": files, "task_sequence": task_sequence}
        await sandbox.filesystem.write_text.aio(json.dumps(payload), "/workspace/task-input.json")
        await sandbox.filesystem.write_text.aio(TASK_SCRIPT, "/workspace/continue_workspace.py")
        harness = "from pathlib import Path\\ninstruction = " + repr(instruction) + "\\nworkspace = Path('/workspace')\\noutput_path = Path(" + repr(output_path) + ")\\n" + program
        await sandbox.filesystem.write_text.aio(harness, "/workspace/generated_follow_up.py")
        for command, label in ((["python", "/workspace/continue_workspace.py", "--inspect"], "Inspecting the current private workspace."), (["python", "-I", "/workspace/generated_follow_up.py"], "Applying the grounded continuation."), (["python", "/workspace/continue_workspace.py", "--validate"], "Validating the private follow-up file.")):
            shown = " ".join(command)
            if event("command_started", label, command=shown): event("cancelled", "Workspace continuation cancelled."); return {"cancelled": True}
            process = await sandbox.exec.aio(*command, timeout=45); stdout = await process.stdout.read.aio(); stderr = await process.stderr.read.aio(); await process.wait.aio()
            if process.returncode != 0: raise RuntimeError((stderr or stdout or "workspace task failed")[:1000])
            if event("command_finished", label, command=shown, output=stdout[:2000]): event("cancelled", "Workspace continuation cancelled."); return {"cancelled": True}
        name = f"workspace-follow-up-{task_sequence}.md"; content = await sandbox.filesystem.read_bytes.aio(f"/workspace/{name}")
        if len(content) > 32000: raise RuntimeError("workspace task file exceeded limit")
        event("file_created", f"Created {name}.")
        event("completed", "Workspace continuation is ready.", output="\n".join(step.get("description", "") for step in item.get("command_plan", []) if isinstance(step, dict))[:2000], files=[{"name": name, "content": base64.b64encode(content).decode()}])
        return {"accepted": True, "task_id": task_id}
    except Exception as exc:
        try: event("failed", "Workspace continuation could not finish.", output=re.sub(r"[^ -~]", "", str(exc))[:1000])
        except Exception: pass
        return {"error": "workspace task failed"}
    finally:
        if sandbox is not None:
            try: await sandbox.terminate.aio()
            except Exception: pass

@app.function(image=image, secrets=secrets, timeout=20, max_containers=10)
@modal.fastapi_endpoint(method="POST")
async def launch_workspace_task(item: dict):
    from fastapi.responses import JSONResponse
    expected = os.environ.get("CHIPPI_WORKSPACE_MODAL_SECRET", "")
    if not expected or not hmac.compare_digest(str(item.get("secret", "")), expected): return JSONResponse({"error": "Unauthorized"}, status_code=401)
    task_id = str(item.get("task_id", ""))
    try: uuid.UUID(task_id)
    except ValueError: return JSONResponse({"error": "invalid task id"}, status_code=400)
    if not isinstance(item.get("launch_token"), str) or not item["launch_token"]: return JSONResponse({"error": "invalid launch token"}, status_code=400)
    try:
        if not _claim_task_launch(item): return JSONResponse({"accepted": True, "duplicate": True, "task_id": task_id}, status_code=202)
    except Exception: return JSONResponse({"error": "launch claim unavailable"}, status_code=503)
    await run_workspace_task.spawn.aio(item)
    return JSONResponse({"accepted": True, "task_id": task_id}, status_code=202)
