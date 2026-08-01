"""Dedicated, feature-off Modal VM Sandbox worker for Chippy Workspace Runs.

The Modal *function* owns the narrow callback secret. The VM Sandbox receives
only a fixed packet-building script and goal data through its filesystem: no
cloud credentials, no callback token, no network, no inbound ports.
"""
from __future__ import annotations
import base64, hashlib, hmac, json, os, re, uuid
from pathlib import Path

import httpx, modal
from workspace_sequence import is_safe_workspace_filename, reserve_sequence

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
    endpoint_secret_name = os.environ.get(
        "CHIPPI_WORKSPACE_MODAL_ENDPOINT_SECRET_NAME", ""
    ).strip()
    endpoint_secret = (
        modal.Secret.from_name(endpoint_secret_name)
        if endpoint_secret_name
        else modal.Secret.from_dict({})
    )
else:
    workspace_secret = modal.Secret.from_dict({})
    bypass_secret = modal.Secret.from_dict({})
    endpoint_secret = modal.Secret.from_dict({})
secrets = [workspace_secret, bypass_secret, endpoint_secret]
MAX_GOAL = 1000
PACKET_SCRIPT = '''import json, pathlib
p = pathlib.Path("/workspace"); p.mkdir(parents=True, exist_ok=True)
packet = json.loads((p / "input.json").read_text())["packet"]
for name, content in packet.items(): (p / {"brief":"brief.md","checklist":"launch-checklist.md","comps":"comps.csv","handoff":"handoff.md"}[name]).write_text(content)
print("Created brief.md, launch-checklist.md, comps.csv, handoff.md")
'''
TASK_SCRIPT = '''import argparse, csv, io, json, pathlib, re
p = pathlib.Path("/workspace"); payload = json.loads((p / "task-input.json").read_text())
safe_input = re.compile(r"^(brief\\.md|launch-checklist\\.md|comps\\.csv|handoff\\.md|workspace-follow-up-[1-9][0-9]*\\.md|workspace-report-[1-9][0-9]*\\.md|workspace-comps-[1-9][0-9]*\\.csv|workspace-actions-[1-9][0-9]*\\.json)$")
op_id = re.compile(r"^[a-z][a-z0-9_-]{0,39}$")
seq = payload.get("task_sequence")
if not isinstance(seq, int) or seq < 1: raise SystemExit("invalid task sequence")
files = payload.get("files")
if not isinstance(files, list) or not files or len(files) > 16: raise SystemExit("unsafe workspace manifest")
seen = set()
for item in files:
    if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not isinstance(item.get("content"), str): raise SystemExit("unsafe workspace manifest")
    name = item["name"]
    if not safe_input.fullmatch(name) or name in seen or len(item["content"].encode()) > 32000: raise SystemExit("unsafe workspace filename")
    seen.add(name); (p / name).write_text(item["content"], encoding="utf-8")
plan = payload.get("execution_plan")
if not isinstance(plan, dict): raise SystemExit("invalid typed plan")
title = str(plan.get("title", "")).replace("\\n", " ").strip()[:160]
summary = str(plan.get("summary", "")).replace("\\n", " ").strip()[:180]
steps = [str(step).replace("\\n", " ").strip()[:220] for step in plan.get("nextSteps", []) if str(step).strip()]
evidence_raw = plan.get("evidence")
if not title or not summary or not isinstance(evidence_raw, list) or not 1 <= len(evidence_raw) <= 3 or not 1 <= len(steps) <= 5 or len(set(steps)) != len(steps): raise SystemExit("invalid grounded plan")
evidence = []
for item in evidence_raw:
    if not isinstance(item, dict) or not isinstance(item.get("file"), str) or not isinstance(item.get("quote"), str): raise SystemExit("invalid grounded evidence")
    name, quote = item["file"], item["quote"].strip()
    if not safe_input.fullmatch(name) or name not in seen or not quote or len(quote) > 500: raise SystemExit("unsafe grounded evidence")
    if quote not in (p / name).read_text(encoding="utf-8"): raise SystemExit("grounded evidence does not match private file")
    evidence.append((name, quote))
if len(set(evidence)) != len(evidence): raise SystemExit("duplicate grounded evidence")
operations_raw = plan.get("operations")
legacy = operations_raw is None
if legacy:
    operations_raw = [{"id": "legacy-report", "type": "legacy_markdown_report"}]
elif not isinstance(operations_raw, list) or not 2 <= len(operations_raw) <= 3: raise SystemExit("invalid typed operations")
operations = []
for item in operations_raw:
    if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not op_id.fullmatch(item["id"]): raise SystemExit("invalid operation id")
    kind = item.get("type")
    if kind not in (("legacy_markdown_report",) if legacy else ("grounded_markdown_report", "comps_csv_projection", "json_action_register")): raise SystemExit("unknown operation")
    op = {"id": item["id"], "type": kind}
    if kind == "comps_csv_projection":
        if item.get("source") != "comps.csv" or "comps.csv" not in seen: raise SystemExit("invalid CSV source")
        reader = csv.DictReader(io.StringIO((p / "comps.csv").read_text(encoding="utf-8")))
        header = reader.fieldnames or []
        columns = item.get("columns")
        row_limit = item.get("rowLimit")
        if not isinstance(columns, list) or not 1 <= len(columns) <= 5 or any(not isinstance(col, str) or col not in header for col in columns) or len(set(columns)) != len(columns) or not isinstance(row_limit, int) or not 1 <= row_limit <= 20: raise SystemExit("invalid CSV projection")
        op.update({"source": "comps.csv", "columns": columns, "rowLimit": row_limit})
        sort = item.get("sort")
        if sort is not None:
            if not isinstance(sort, dict) or sort.get("column") not in columns or sort.get("direction") not in ("asc", "desc"): raise SystemExit("invalid CSV sort")
            op["sort"] = {"column": sort["column"], "direction": sort["direction"]}
    operations.append(op)
if len({op["id"] for op in operations}) != len(operations) or len({op["type"] for op in operations}) != len(operations): raise SystemExit("duplicate typed operations")
def artifact(op):
    return "workspace-follow-up-%d.md" % seq if op["type"] == "legacy_markdown_report" else "workspace-report-%d.md" % seq if op["type"] == "grounded_markdown_report" else "workspace-comps-%d.csv" % seq if op["type"] == "comps_csv_projection" else "workspace-actions-%d.json" % seq
parser = argparse.ArgumentParser(); group = parser.add_mutually_exclusive_group(required=True); group.add_argument("--inspect", action="store_true"); group.add_argument("--execute"); group.add_argument("--validate", action="store_true"); args = parser.parse_args()
if args.inspect:
    print("Hydrated: " + ", ".join(sorted(seen)))
elif args.execute:
    op = next((candidate for candidate in operations if candidate["id"] == args.execute), None)
    if op is None: raise SystemExit("unknown operation")
    target = p / artifact(op)
    if op["type"] in ("legacy_markdown_report", "grounded_markdown_report"):
        lines = ["# " + title, "", "## Request", str(payload.get("instruction", ""))[:1000], "", "## Summary", summary, "", "## Grounded evidence"]
        for name, quote in evidence: lines.extend(["", "### " + name, "> " + quote])
        lines.extend(["", "## Suggested next steps"] + ["- " + step for step in steps])
        target.write_text("\\n".join(lines) + "\\n", encoding="utf-8")
    elif op["type"] == "comps_csv_projection":
        rows = list(csv.DictReader(io.StringIO((p / "comps.csv").read_text(encoding="utf-8"))))
        if op.get("sort"):
            def sort_key(row):
                value = (row.get(op["sort"]["column"]) or "").strip()
                try: return (0, float(value.replace(",", "")))
                except ValueError: return (1, value.casefold())
            rows.sort(key=sort_key, reverse=op["sort"]["direction"] == "desc")
        output = io.StringIO(newline=""); writer = csv.DictWriter(output, fieldnames=op["columns"], extrasaction="ignore", lineterminator="\\n"); writer.writeheader(); writer.writerows([{column: row.get(column, "") for column in op["columns"]} for row in rows[:op["rowLimit"]]])
        target.write_text(output.getvalue(), encoding="utf-8")
    else:
        target.write_text(json.dumps({"title": title, "summary": summary, "actions": [{"id": index + 1, "nextStep": step, "evidence": [{"file": name, "quote": quote} for name, quote in evidence]} for index, step in enumerate(steps)]}, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
    if not target.is_file() or target.stat().st_size < 1 or target.stat().st_size > 32000: raise SystemExit("typed artifact is invalid")
    print("Created " + target.name)
elif args.validate:
    expected = {artifact(op) for op in operations}
    current_candidates = {"workspace-follow-up-%d.md" % seq, "workspace-report-%d.md" % seq, "workspace-comps-%d.csv" % seq, "workspace-actions-%d.json" % seq}
    actual = {path.name for path in p.iterdir() if path.name in current_candidates}
    if actual != expected or any(not (p / name).is_file() or (p / name).stat().st_size < 1 or (p / name).stat().st_size > 32000 for name in expected): raise SystemExit("typed artifact manifest is invalid")
    print("Validated " + ", ".join(sorted(expected)))
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
    run_id, space_id, launch_token, goal, packet = str(item.get("run_id", "")), str(item.get("space_id", "")), str(item.get("launch_token", "")), str(item.get("goal", "")).strip()[:MAX_GOAL], item.get("packet")
    try: uuid.UUID(run_id)
    except ValueError: return JSONResponse({"error":"invalid run id"}, status_code=400)
    if not space_id or not launch_token or len(goal) < 10 or not isinstance(packet, dict): return JSONResponse({"error":"invalid workspace request"}, status_code=400)
    seq = 1
    def event(kind: str, message: str, **extra):
        nonlocal seq
        # Advance before I/O: a committed callback whose HTTP response is lost
        # must never cause the later failure callback to reuse its sequence.
        current_sequence, seq = reserve_sequence(seq)
        reply = _callback({"run_id":run_id,"space_id":space_id,"launch_token":launch_token,"sequence":current_sequence,"type":kind,"message":message,**extra})
        return reply.get("cancellationRequested", False)
    sandbox = None
    try:
        if event("workspace_started", "Initialized an isolated Chippy workspace."):
            return {"cancelled": True, "run_id": run_id}
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
    instruction, files, task_sequence, execution_plan = str(item.get("instruction", "")).strip()[:MAX_GOAL], item.get("files"), item.get("task_sequence"), item.get("execution_plan")
    if not space_id or len(instruction) < 3 or not isinstance(files, list) or not isinstance(task_sequence, int) or task_sequence < 1 or len(files) > 16 or not isinstance(execution_plan, dict): return {"error": "invalid workspace task"}
    for file in files:
        if not isinstance(file, dict) or not is_safe_workspace_filename(file.get("name")) or not isinstance(file.get("content"), str) or len(file["content"].encode()) > 32000: return {"error": "unsafe workspace manifest"}
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
        payload = {"instruction": instruction, "files": files, "task_sequence": task_sequence, "execution_plan": execution_plan}
        await sandbox.filesystem.write_text.aio(json.dumps(payload), "/workspace/task-input.json")
        await sandbox.filesystem.write_text.aio(TASK_SCRIPT, "/workspace/continue_workspace.py")
        operations = execution_plan.get("operations")
        if operations is None:
            operations = [{"id": "legacy-report", "type": "legacy_markdown_report"}]
        elif not isinstance(operations, list) or not 2 <= len(operations) <= 3: raise RuntimeError("invalid typed workspace plan")
        commands = [(["python", "/workspace/continue_workspace.py", "--inspect"], "Inspecting the current private workspace.")]
        for operation in operations:
            if not isinstance(operation, dict) or not isinstance(operation.get("id"), str) or not isinstance(operation.get("type"), str): raise RuntimeError("invalid typed workspace plan")
            commands.append((["python", "/workspace/continue_workspace.py", "--execute", operation["id"]], f"Executing typed {operation['type']} operation."))
        commands.append((["python", "/workspace/continue_workspace.py", "--validate"], "Validating the typed private workspace artifacts."))
        for command, label in commands:
            shown = " ".join(command)
            if event("command_started", label, command=shown): event("cancelled", "Workspace continuation cancelled."); return {"cancelled": True}
            process = await sandbox.exec.aio(*command, timeout=45); stdout = await process.stdout.read.aio(); stderr = await process.stderr.read.aio(); await process.wait.aio()
            if process.returncode != 0: raise RuntimeError((stderr or stdout or "workspace task failed")[:1000])
            if event("command_finished", label, command=shown, output=stdout[:2000]): event("cancelled", "Workspace continuation cancelled."); return {"cancelled": True}
        names = []
        for operation in operations:
            kind = operation["type"]
            name = f"workspace-follow-up-{task_sequence}.md" if kind == "legacy_markdown_report" else f"workspace-report-{task_sequence}.md" if kind == "grounded_markdown_report" else f"workspace-comps-{task_sequence}.csv" if kind == "comps_csv_projection" else f"workspace-actions-{task_sequence}.json"
            content = await sandbox.filesystem.read_bytes.aio(f"/workspace/{name}")
            if not content or len(content) > 32000: raise RuntimeError("workspace task file exceeded limit")
            names.append({"name": name, "content": base64.b64encode(content).decode()})
            event("file_created", f"Created {name}.")
        event("completed", "Workspace continuation is ready.", output="\n".join(operation["type"] for operation in operations)[:2000], files=names)
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
