"""Provider detection + Anthropic cache marker injection (Phase 2).

These are the small invariants that the cost-reduction telemetry rests on
— if detect_provider drifts or the cache markers stop landing on the wire,
the ChatUsage.provider rollup goes wrong and Anthropic's discount evaporates
silently. Worth a tiny test net to lock both.

Run from `agent/` with:

    NEXT_PUBLIC_SUPABASE_URL=stub SUPABASE_SERVICE_ROLE_KEY=stub \
      python -m pytest tests/test_llm_caching.py -v
"""

from __future__ import annotations

import os
import sys

import pytest

# Stub env so config.py doesn't blow up before we import llm.
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "stub")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "stub")

# Test runs from agent/, but pytest sometimes invokes from repo root.
_AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AGENT_DIR not in sys.path:
    sys.path.insert(0, _AGENT_DIR)

from llm import _apply_anthropic_cache_markers, detect_provider  # noqa: E402


# ── detect_provider ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "slug,expected",
    [
        ("anthropic/claude-opus-4.7", "anthropic"),
        ("openai/gpt-5.5", "openai"),
        ("x-ai/grok-4.3", "xai"),  # dash normalized out
        ("deepseek/deepseek-chat", "deepseek"),
        ("google/gemini-2.5-pro", "google"),
        ("moonshotai/kimi-k2.6", "moonshotai"),
        ("qwen/qwen3.6-flash", "qwen"),
        # OpenAI-direct fallback path (no slash)
        ("gpt-5-mini", "openai"),
        ("gpt-4o", "openai"),
        # Edge cases
        ("", "unknown"),
        (None, "unknown"),
        ("/", "unknown"),
    ],
)
def test_detect_provider(slug, expected):
    assert detect_provider(slug) == expected


# ── _apply_anthropic_cache_markers ─────────────────────────────────────────


def test_cache_markers_rewrite_system_string_to_block_array():
    """The SDK builds the system message as {'role': 'system', 'content': str}.
    Anthropic on OpenRouter accepts cache_control only on block-content form.
    We rewrite the string into a single text block carrying the ephemeral marker.
    """
    kwargs = {
        "messages": [
            {"role": "system", "content": "You are Chippi..."},
            {"role": "user", "content": "hi"},
        ],
        "tools": [],
    }
    _apply_anthropic_cache_markers(kwargs)
    system = kwargs["messages"][0]
    assert system["role"] == "system"
    assert isinstance(system["content"], list)
    assert len(system["content"]) == 1
    block = system["content"][0]
    assert block["type"] == "text"
    assert block["text"] == "You are Chippi..."
    assert block["cache_control"] == {"type": "ephemeral"}
    # User message untouched.
    assert kwargs["messages"][1] == {"role": "user", "content": "hi"}


def test_cache_markers_attach_to_last_tool():
    """Anthropic caches the entire tools array up through any tool carrying
    a marker, so one marker on the tail covers the whole 30+ tool surface.
    """
    kwargs = {
        "messages": [{"role": "system", "content": "x"}],
        "tools": [
            {"type": "function", "function": {"name": "a"}},
            {"type": "function", "function": {"name": "b"}},
            {"type": "function", "function": {"name": "c"}},
        ],
    }
    _apply_anthropic_cache_markers(kwargs)
    assert "cache_control" not in kwargs["tools"][0]
    assert "cache_control" not in kwargs["tools"][1]
    assert kwargs["tools"][2]["cache_control"] == {"type": "ephemeral"}


def test_cache_markers_idempotent_on_retry():
    """SDK retries can rebuild the same kwargs and reach us twice. The
    second pass must not double-wrap the system content or duplicate the
    cache_control on the last tool.
    """
    kwargs = {
        "messages": [{"role": "system", "content": "x"}],
        "tools": [{"type": "function", "function": {"name": "a"}}],
    }
    _apply_anthropic_cache_markers(kwargs)
    snapshot_msg = kwargs["messages"][0]["content"]
    snapshot_tool = kwargs["tools"][0]
    _apply_anthropic_cache_markers(kwargs)
    # Already a list; should NOT be re-wrapped to [[block]].
    assert kwargs["messages"][0]["content"] == snapshot_msg
    # Already has cache_control; not duplicated/replaced.
    assert kwargs["tools"][0] == snapshot_tool


def test_cache_markers_no_tools_no_crash():
    """Empty tools array is normal at agent build time before tools attach
    — we must not throw."""
    kwargs = {
        "messages": [{"role": "system", "content": "x"}],
        "tools": [],
    }
    _apply_anthropic_cache_markers(kwargs)
    assert kwargs["tools"] == []


def test_cache_markers_no_system_no_crash():
    """Message list without a system message (e.g. resume turn replays
    serialized state) must not break — we just skip and still mark tools.
    """
    kwargs = {
        "messages": [{"role": "user", "content": "hi"}],
        "tools": [{"type": "function", "function": {"name": "a"}}],
    }
    _apply_anthropic_cache_markers(kwargs)
    assert kwargs["tools"][0]["cache_control"] == {"type": "ephemeral"}
