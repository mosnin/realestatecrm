"""Small dependency-free replay primitive for Workspace callback sequencing."""

import re

_SAFE_WORKSPACE_FILE = re.compile(
    r"^(brief\.md|launch-checklist\.md|comps\.csv|handoff\.md|"
    r"workspace-follow-up-[1-9][0-9]*\.md)$"
)


def reserve_sequence(next_sequence: int) -> tuple[int, int]:
    """Reserve before transport so response loss cannot reuse an event ID."""
    return next_sequence, next_sequence + 1


def is_safe_workspace_filename(name: object) -> bool:
    """Accept only the fixed private file vocabulary used by workspace VMs."""
    return isinstance(name, str) and _SAFE_WORKSPACE_FILE.fullmatch(name) is not None
