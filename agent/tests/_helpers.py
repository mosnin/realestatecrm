"""Shared test helpers for invoking agent tools through the SDK.

The single source of truth for building a ``ToolContext`` that works against
whatever ``openai-agents`` build is installed.

``ToolContext``'s constructor has shifted across the SDK's pre-1.0 point
releases — the pinned build (``openai-agents>=0.0.15,<0.1``, currently 0.0.19)
takes only ``(context, usage, tool_call_id)`` and rejects the ``tool_name`` /
``tool_arguments`` kwargs some newer builds accept. Rather than hard-code one
shape, we offer every plausible kwarg and keep only those the LIVE
``ToolContext.__init__`` signature actually accepts. This keeps the tests
green on the CI-pinned SDK and on a contributor's slightly different local one.
"""

from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import Any

from agents.tool_context import ToolContext
from agents.usage import Usage


def make_tool_context(agent_ctx: Any, tool_name: str, args_json: str = "{}") -> ToolContext:
    """Build a ``ToolContext`` carrying ``agent_ctx`` as the run context.

    Filters the candidate kwargs against the installed ``ToolContext.__init__``
    signature so the call works no matter which point-release fields exist.
    """
    candidate: dict[str, Any] = {
        "context": agent_ctx,
        "usage": Usage(),
        "tool_name": tool_name,
        "tool_call_id": f"call_{tool_name}",
        "tool_arguments": args_json,
    }
    accepted = set(inspect.signature(ToolContext.__init__).parameters)
    kwargs = {k: v for k, v in candidate.items() if k in accepted}
    return ToolContext(**kwargs)


def disable_tool_error_wrapper(tool: Any) -> Callable[[], None]:
    """Make a ``FunctionTool`` re-raise instead of swallowing exceptions.

    By default ``@function_tool`` wraps the handler so any raised exception is
    turned into a model-visible *string* (via ``default_tool_error_function``).
    The contract tests need the ORIGINAL exception to surface so they can
    assert its type/message (e.g. ``BrokerPermissionError``).

    On the pinned SDK (``openai-agents`` 0.0.19) that error function is a
    closure free variable of ``tool.on_invoke_tool`` — there is no instance
    attribute to monkeypatch — so we rebind the closure cell to ``None``,
    which is exactly the branch the wrapper checks (``if
    failure_error_function is None: raise``). We also clear the attribute-style
    fields some other SDK builds expose, so the helper works across versions.

    The tools are module-level singletons, so mutating the cell leaks across
    tests; this returns a zero-arg ``restore()`` that puts the original error
    function back. Callers (fixtures) should invoke it on teardown.
    """
    undo: list[Callable[[], None]] = []

    # Attribute-style (older/newer builds that expose these on the dataclass).
    for attr in ("_failure_error_function", "_use_default_failure_error_function"):
        if hasattr(tool, attr):
            original = getattr(tool, attr)
            setattr(tool, attr, None if attr.endswith("function") else False)
            undo.append(lambda a=attr, o=original: setattr(tool, a, o))

    # Closure-style (the 0.0.x line): rebind the free variable to None.
    on_invoke = getattr(tool, "on_invoke_tool", None)
    closure = getattr(on_invoke, "__closure__", None)
    freevars = getattr(getattr(on_invoke, "__code__", None), "co_freevars", ())
    if closure and "failure_error_function" in freevars:
        cell = closure[freevars.index("failure_error_function")]
        original_fn = cell.cell_contents
        cell.cell_contents = None
        undo.append(lambda c=cell, o=original_fn: setattr(c, "cell_contents", o))

    def restore() -> None:
        for fn in undo:
            fn()

    return restore
