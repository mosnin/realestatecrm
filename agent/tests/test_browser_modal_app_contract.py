"""Isolation contract for the separately deployable Research Workspace app.

This is intentionally an AST-level deployment-boundary test: importing the
actual Modal entrypoint would create deployment objects, while the safety
property we need to preserve is exactly which image, secrets, and functions
the entrypoint declares.
"""

from __future__ import annotations

import ast
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parents[1]
BROWSER_APP = AGENT_DIR / "browser_modal_app.py"
CHAT_APP = AGENT_DIR / "modal_app.py"


def _environment_keys(tree: ast.AST) -> set[str]:
    keys: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not node.args:
            continue
        function = node.func
        if not (
            isinstance(function, ast.Attribute)
            and function.attr == "get"
            and isinstance(function.value, ast.Attribute)
            and function.value.attr == "environ"
            and isinstance(function.value.value, ast.Name)
            and function.value.value.id == "os"
        ):
            continue
        first_arg = node.args[0]
        if isinstance(first_arg, ast.Constant) and isinstance(first_arg.value, str):
            keys.add(first_arg.value)
    return keys


def test_browser_modal_entrypoint_has_only_browser_configuration_and_surface():
    tree = ast.parse(BROWSER_APP.read_text())

    assert _environment_keys(tree) == {
        "CHIPPI_BROWSER_MODAL_APP_NAME",
        "CHIPPI_BROWSER_MODAL_SECRET_NAME",
        "CHIPPI_BROWSER_APP_URL",
        "CHIPPI_BROWSER_WORKER_SECRET",
    }
    top_level_functions = {
        node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    assert top_level_functions == {
        "run_headless_browser_session",
        "start_headless_browser_workspace",
    }

    source = BROWSER_APP.read_text()
    assert ".add_local_file(" in source
    assert '"browser_headless.py"' in source
    assert ".add_local_dir(" not in source
    for forbidden in (
        "chippi-secrets",
        "OPENAI_API_KEY",
        "OPENROUTER_API_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "COMPOSIO_API_KEY",
        "chat_turn",
        "run_space",
        "run_swarm_endpoint",
    ):
        assert forbidden not in source


def test_broad_chat_entrypoint_no_longer_declares_browser_worker_or_secret():
    source = CHAT_APP.read_text()
    for removed_surface in (
        "run_headless_browser_session",
        "start_headless_browser_workspace",
        "browser_worker_secrets",
        "headless_image",
        "CHIPPI_BROWSER_MODAL_SECRET_NAME",
    ):
        assert removed_surface not in source
