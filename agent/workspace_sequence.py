"""Small dependency-free replay primitive for Workspace callback sequencing."""

import re
import uuid

_SAFE_WORKSPACE_FILE = re.compile(
    r"^(brief\.md|launch-checklist\.md|comps\.csv|handoff\.md|"
    r"workspace-follow-up-[1-9][0-9]*\.md|"
    r"workspace-report-[1-9][0-9]*\.md|"
    r"workspace-comps-[1-9][0-9]*\.csv|"
    r"workspace-actions-[1-9][0-9]*\.json)$"
)

MAX_WORKSPACE_FILES = 16
MAX_WORKSPACE_FILE_BYTES = 32_000


def reserve_sequence(next_sequence: int) -> tuple[int, int]:
    """Reserve before transport so response loss cannot reuse an event ID."""
    return next_sequence, next_sequence + 1


def is_safe_workspace_filename(name: object) -> bool:
    """Accept only the fixed private file vocabulary used by workspace VMs."""
    return isinstance(name, str) and _SAFE_WORKSPACE_FILE.fullmatch(name) is not None


def validate_workspace_files(files: object) -> bool:
    """Validate the complete host-to-VM private text-file manifest."""
    if not isinstance(files, list) or not files or len(files) > MAX_WORKSPACE_FILES:
        return False

    names: set[str] = set()
    for file in files:
        if not isinstance(file, dict):
            return False
        name = file.get("name")
        content = file.get("content")
        if (
            not is_safe_workspace_filename(name)
            or name in names
            or not isinstance(content, str)
        ):
            return False
        try:
            size = len(content.encode("utf-8"))
        except UnicodeEncodeError:
            return False
        if size > MAX_WORKSPACE_FILE_BYTES:
            return False
        names.add(name)

    return True


def _is_nonempty_text(value: object) -> bool:
    return isinstance(value, str) and bool(value)


def _is_uuid(value: object) -> bool:
    if not _is_nonempty_text(value):
        return False
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def validate_workspace_run_request(item: object, max_goal: int = 1_000) -> bool:
    """Validate every cheap base-run field before launch authority is claimed."""
    if not isinstance(item, dict):
        return False
    goal = item.get("goal")
    return (
        _is_uuid(item.get("run_id"))
        and _is_nonempty_text(item.get("space_id"))
        and _is_nonempty_text(item.get("launch_token"))
        and isinstance(goal, str)
        and len(goal.strip()[:max_goal]) >= 10
        and isinstance(item.get("packet"), dict)
    )


def validate_workspace_task_request(item: object, max_goal: int = 1_000) -> bool:
    """Validate every cheap continuation field before launch authority is claimed."""
    if not isinstance(item, dict):
        return False
    instruction = item.get("instruction")
    task_sequence = item.get("task_sequence")
    return (
        _is_uuid(item.get("task_id"))
        and _is_uuid(item.get("run_id"))
        and _is_nonempty_text(item.get("space_id"))
        and _is_nonempty_text(item.get("launch_token"))
        and isinstance(instruction, str)
        and len(instruction.strip()[:max_goal]) >= 3
        and type(task_sequence) is int
        and task_sequence >= 1
        and isinstance(item.get("execution_plan"), dict)
        and validate_workspace_files(item.get("files"))
    )
