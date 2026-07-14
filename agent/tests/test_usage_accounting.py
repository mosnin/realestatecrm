"""OpenRouter usage-accounting opt-in (exact per-request cost).

OpenRouter only returns `usage.cost` when the request carries
`usage: {"include": true}`. The planner/auditor direct completions calls
pass `extra_body=usage_accounting_extra_body()` — if that helper stops
returning the opt-in under OpenRouter (or starts returning it on
direct-OpenAI deploys, where the API rejects the unknown parameter),
exact-cost metering silently degrades to the fallback price table.
"""

from __future__ import annotations

import os
import sys

os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "stub")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "stub")
os.environ.setdefault("OPENAI_API_KEY", "stub-openai")
os.environ.setdefault("OPENROUTER_API_KEY", "stub-openrouter")

_AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AGENT_DIR not in sys.path:
    sys.path.insert(0, _AGENT_DIR)

import llm  # noqa: E402
from config import settings  # noqa: E402


def test_opts_in_when_openrouter_configured():
    assert settings.openrouter_api_key  # frozen by conftest env stubs
    assert llm.usage_accounting_extra_body() == {"usage": {"include": True}}


def test_empty_on_direct_openai(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "")
    assert llm.usage_accounting_extra_body() == {}
