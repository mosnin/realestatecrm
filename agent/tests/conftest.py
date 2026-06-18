"""Shared pytest setup for the agent test suite.

Two jobs, both of which MUST happen before any test module is imported —
which is exactly what a top-level ``conftest.py`` guarantees (pytest imports
it before collecting the test files):

  1. Stub the environment variables ``config.Settings`` reads, and put the
     ``agent/`` directory on ``sys.path`` so ``import agents`` /
     ``import security.context`` / ``import tools.*`` resolve no matter what
     directory pytest is invoked from.

     The env stubs are load-bearing for cross-file isolation. ``config.py``
     builds its ``settings`` singleton at import time (``@lru_cache`` +
     module-level ``settings = get_settings()``), reading the env ONCE. The
     first test module that imports anything pulling in ``config`` freezes
     those values. ``test_llm_caching.py`` needs ``OPENAI_API_KEY`` /
     ``OPENROUTER_API_KEY`` set so ``make_chat_model`` can build an
     ``AsyncOpenAI`` client — but if ``test_broker_tools.py`` (which imports
     ``tools.broker`` → ``db`` → ``config``) is collected first WITHOUT those
     keys, the singleton caches empty strings and ``test_llm_caching.py``'s
     own import-time ``setdefault`` runs too late. Setting them here, before
     any collection, fixes the ordering dependency for the whole suite.

  2. Expose ``make_tool_context`` (see ``tests/_helpers.py``) — the single
     SDK-compatible ``ToolContext`` builder shared by every tool test.
"""

from __future__ import annotations

import os
import sys

# 1a. Stub env BEFORE any test module (and therefore `config`) is imported.
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "stub")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "stub")
os.environ.setdefault("OPENAI_API_KEY", "stub-openai")
os.environ.setdefault("OPENROUTER_API_KEY", "stub-openrouter")

# 1b. Make `agent/` importable regardless of pytest's invocation directory.
_AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AGENT_DIR not in sys.path:
    sys.path.insert(0, _AGENT_DIR)
