"""LLM provider — OpenRouter.

The agent (chat + autonomous runs, swarm, memory embeddings)
routes every model call through OpenRouter. OpenRouter is OpenAI-API
compatible, so this is a base-URL + key swap on the OpenAI client.

`configure_agents_sdk()` points the OpenAI Agents SDK's default client at
OpenRouter — that covers every `Agent` run (chat_turn, autonomous,
swarm members). `get_llm_client()` is for the direct `AsyncOpenAI` calls
(swarm planning/audit, memory embeddings).

Fallback: when `OPENROUTER_API_KEY` is absent everything falls back to
calling OpenAI directly with `OPENAI_API_KEY`, so a deploy without the
OpenRouter secret keeps working.

Prompt caching (Phase 2 + Phase 3):
  Provider detection drives caching strategy per turn.
  - anthropic: explicit `cache_control: {type: 'ephemeral'}` markers
    attached to the system message and the last tool. ~90% input-token
    discount on cached prefixes after first hit.
  - google (Phase 3): SAME `cache_control: {type: 'ephemeral'}` shape on
    OpenRouter — confirmed in OpenRouter's prompt-caching docs (Gemini
    explicit caching uses Anthropic-compatible breakpoints). ~75% discount.
    Min cache write is ~4096 tokens (vs Anthropic's 1024) so smaller turns
    may not cache, but the marker is harmless.
  - openai / deepseek: automatic on stable prefixes >1024 tokens. Phase 1
    already keeps the system prompt + tool list stable, so the provider
    caches without explicit markers. ~50% discount on cached input.
  - xai / moonshotai / qwen / zai / unknown: no caching path on OpenRouter
    today. Phase 1's prompt trim is the only saving.

Keep CHAT_MODELS / DEFAULT_CHAT_MODEL in sync with lib/llm.ts.
"""

from __future__ import annotations

import os
from typing import Any

from openai import AsyncOpenAI

from config import settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


# ---------------------------------------------------------------------------
# SDK schema patches — applied on module import, before any Agent runs.
#
# openai 1.97+ made `logprobs` required on ResponseTextDeltaEvent (and
# `refusal` on the related delta event), but openai-agents 0.0.x streams
# chat-completions chunks from non-OpenAI providers (OpenRouter et al.)
# WITHOUT those fields, so every chat turn dies on pydantic with
# `Field required [type=missing, ...]` before the first token. Upstream
# fixes shipped in openai-python (PR #2500) and openai-agents 0.2.x
# (PR #1246); neither is in the version line we're pinned to (the cap
# `openai-agents<0.1` is load-bearing because translate() in modal_app.py
# matches event class names that moved between 0.0 and 0.2).
#
# Inject a default for the missing fields on the construction paths the
# SDK uses (__init__ for direct kwargs, model_validate for dict input).
# Idempotent and version-tolerant — if the field already has a default or
# the event class isn't present in the installed openai, the patch is a
# no-op.
# ---------------------------------------------------------------------------
def _patch_openai_event_schemas() -> None:
    try:
        from openai.types.responses import (
            ResponseTextDeltaEvent,
        )
    except ImportError:
        return

    event_classes_and_fields = [
        (ResponseTextDeltaEvent, {"logprobs": list}),
    ]
    # Refusal event is in newer openai versions only — wire it up if present.
    try:
        from openai.types.responses import ResponseRefusalDeltaEvent

        event_classes_and_fields.append((ResponseRefusalDeltaEvent, {"logprobs": list}))
    except ImportError:
        pass

    for cls, field_defaults in event_classes_and_fields:
        if getattr(cls, "_chippi_patched", False):
            continue

        orig_init = cls.__init__
        orig_model_validate = cls.model_validate

        def make_patched_init(orig, defaults):
            def patched_init(self, /, **data):
                for name, factory in defaults.items():
                    data.setdefault(name, factory())
                orig(self, **data)
            return patched_init

        def make_patched_validate(orig, defaults):
            def patched_validate(obj, *args, **kwargs):
                if isinstance(obj, dict):
                    needs_default = any(name not in obj for name in defaults)
                    if needs_default:
                        obj = dict(obj)
                        for name, factory in defaults.items():
                            obj.setdefault(name, factory())
                return orig(obj, *args, **kwargs)
            return patched_validate

        cls.__init__ = make_patched_init(orig_init, field_defaults)
        cls.model_validate = make_patched_validate(orig_model_validate, field_defaults)
        cls._chippi_patched = True


_patch_openai_event_schemas()


# The model Chippi runs on. OpenRouter slug. Mirrors DEFAULT_CHAT_MODEL in
# lib/chat-models.ts.
DEFAULT_CHAT_MODEL = "qwen/qwen3.7-plus"

# Allowlist resolve_chat_model() accepts (anything else falls back to the
# default): the chat model + the swarm worker model (settings.worker_model).
# The per-workspace picker was removed, so this is an internal allowlist, not a
# user-facing menu.
CHAT_MODELS: tuple[str, ...] = (
    "qwen/qwen3.7-plus",
    "z-ai/glm-5.2",
)

# Embedding model — OpenRouter and OpenAI resolve this to the same
# underlying model, so stored 1536-dim vectors stay valid across the swap.
EMBEDDING_MODEL = (
    "openai/text-embedding-3-small"
    if settings.openrouter_api_key
    else "text-embedding-3-small"
)


# Per-request HTTP timeout on every LLM call. Without it the SDK default
# (effectively unbounded for our purposes) lets a hung provider request ride
# the full 600s Modal container budget, at which point the container is killed
# mid-stream with no terminal SSE frame — the browser then hangs forever. A
# 120s cap means a stalled call RAISES (caught by the fallback/error paths,
# which emit a terminal frame) long before the container dies. Generous enough
# for legitimate long reasoning turns; short enough that a wedged socket can't
# silently eat a turn.
LLM_REQUEST_TIMEOUT_SECONDS = 120.0


def get_llm_client() -> AsyncOpenAI:
    """Build the shared LLM client — OpenRouter when configured, else OpenAI."""
    if settings.openrouter_api_key:
        return AsyncOpenAI(
            base_url=OPENROUTER_BASE_URL,
            api_key=settings.openrouter_api_key,
            timeout=LLM_REQUEST_TIMEOUT_SECONDS,
        )
    return AsyncOpenAI(
        api_key=settings.openai_api_key,
        timeout=LLM_REQUEST_TIMEOUT_SECONDS,
    )


def openai_model(name: str) -> str:
    """Resolve a bare OpenAI model name for the active provider —
    vendor-prefixed for OpenRouter, bare for OpenAI direct."""
    return f"openai/{name}" if settings.openrouter_api_key else name


def usage_accounting_extra_body() -> dict:
    """OpenRouter usage-accounting opt-in, for `extra_body=` on direct
    chat.completions calls.

    OpenRouter only returns the exact per-request cost (`usage.cost`) when
    the request carries `usage: {"include": true}` — without it the ledger's
    exact-cost branch never fires and rows are priced from the fallback
    list-price table. Empty on direct-OpenAI deploys, where the API rejects
    the unknown `usage` request parameter.
    https://openrouter.ai/docs/use-cases/usage-accounting
    """
    return {"usage": {"include": True}} if settings.openrouter_api_key else {}


# Models to fall through on a 429, in order. Bare OpenAI names; resolved
# for the active provider by fallback_models(). Shared by the chat path
# (modal_app.chat_turn) and the autonomous path (orchestrator).
FALLBACK_MODELS: tuple[str, ...] = ("gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini")


def fallback_models() -> list[str]:
    """Resolved 429-fallback model slugs for the active provider."""
    return [openai_model(m) for m in FALLBACK_MODELS]


def resolve_chat_model(model: str | None) -> str:
    """Return a valid chat model slug — the workspace's pick or the default.

    Without OpenRouter the multi-vendor slugs don't apply, so the OpenAI-
    direct fallback collapses to a single known-good model.
    """
    if not settings.openrouter_api_key:
        return "gpt-5"
    if model and model in CHAT_MODELS:
        return model
    # Operator override: CHIPPI_CHAT_MODEL lets the deployer point Chippi at any
    # OpenRouter slug (e.g. a Claude model, which also unlocks the Anthropic
    # prompt-caching path above) WITHOUT a code change. Trusted because only the
    # deployer sets env — it bypasses the CHAT_MODELS picker allowlist. Keep in
    # sync with resolveChatModel() in lib/llm.ts.
    env_default = os.environ.get("CHIPPI_CHAT_MODEL", "").strip()
    return env_default or DEFAULT_CHAT_MODEL


# ---------------------------------------------------------------------------
# Reasoning-effort routing (Phase 3)
# ---------------------------------------------------------------------------
#
# Phase 1 (PR #155) dropped the global default from "medium" to "low" to
# stop paying for reasoning tokens on trivial turns ("hey", "set a reminder
# for 3pm"). That was the right move, but it left the model under-resourced
# on the few turns that genuinely need to think — planning, comparison,
# audit, multi-step research.
#
# decide_reasoning_effort() looks at the user message and returns "medium"
# when the request smells like real planning, "low" otherwise. Single source
# of truth — chat and autonomous-run callers both go through here.

import os

# Per-deploy override. Wins over the heuristic when set to a valid value.
# Useful when a deploy needs to flip the floor globally (e.g. cost emergency
# → force "low"; investor demo → force "medium"). Bad values silently
# fall through to the heuristic so a typo can't break every turn.
_VALID_EFFORTS = ("low", "medium", "high")


# Lowercased keyword signals that lift a turn from "low" to "medium". The
# bar is intentionally narrow — these are phrases that imply the realtor
# wants the model to STRUCTURE its thinking, not just answer. Adding more
# words here costs reasoning tokens on every turn that mentions them, so
# new entries should buy demonstrable quality.
_PLANNING_SIGNALS = (
    "build a plan",
    "build me a plan",
    "make a plan",
    "make me a plan",
    "create a plan",
    "plan out",
    "plan this",
    "step by step",
    "step-by-step",
    "walk me through",
    "think through",
    "research ",       # trailing space — "research" the verb, not "researched"
    "deep research",
    "investigate",
    "audit ",          # trailing space — avoids "audited"
    "compare ",
    "analyze ",
    "analyse ",
    "evaluate ",
    "assess ",
    "diagnose",
    "root cause",
    "strategy for",
    "should i ",       # "should I refinance X, Y, Z" → needs weighing
)


def decide_reasoning_effort(user_message: str | None = None) -> str:
    """Return 'low' | 'medium' | 'high' for this turn.

    Default is "low" — the cheap setting Phase 1 (PR #155) standardised on.
    Escalates to "medium" when the message carries a planning / research
    signal (see _PLANNING_SIGNALS).

    The env var CHIPPI_REASONING_EFFORT, when set to "low"/"medium"/"high",
    overrides the heuristic. Useful to flip the floor per deploy without
    a code change (cost emergency → force "low"; investor demo → "medium").
    Invalid values fall through silently so a typo can't break every turn.

    Same function powers both the chat path (user message) and the
    autonomous path (routine instruction or the opening prompt). Sweep
    mode passes an empty string and gets "low" — sweeps are cheap and
    routine; they don't need to think harder than a chat turn.
    """
    override = (os.environ.get("CHIPPI_REASONING_EFFORT") or "").strip().lower()
    if override in _VALID_EFFORTS:
        return override

    if not user_message:
        return "low"
    text = user_message.lower()
    for signal in _PLANNING_SIGNALS:
        if signal in text:
            return "medium"
    return "low"


def detect_provider(model: str | None) -> str:
    """Return the OpenRouter provider prefix from a model slug.

    Examples:
        'anthropic/claude-opus-4.7' -> 'anthropic'
        'openai/gpt-5.5'            -> 'openai'
        'x-ai/grok-4.3'             -> 'xai'   (note: dash normalized out)
        'deepseek/deepseek-chat'    -> 'deepseek'
        'google/gemini-2.5-pro'     -> 'google'
        'moonshotai/kimi-k2.6'      -> 'moonshotai'
        'qwen/qwen3.7-plus'         -> 'qwen'
        'z-ai/glm-5.2'              -> 'zai'   (note: dash normalized out)
        bare 'gpt-5'                -> 'openai' (OpenAI-direct fallback path)

    Drives caching behavior and the ChatUsage.provider column.
    """
    if not model:
        return "unknown"
    if "/" not in model:
        # Bare names (OpenAI-direct fallback path) are always OpenAI.
        return "openai"
    prefix = model.split("/", 1)[0].lower().replace("-", "")
    return prefix or "unknown"


# Providers where OpenRouter accepts explicit `cache_control` breakpoints.
# Anthropic shipped first; Google Gemini explicit caching on OpenRouter uses
# the SAME breakpoint shape per OpenRouter's docs (Phase 3). xAI/Moonshot/Qwen/
# Z.AI have no caching path today. OpenAI/DeepSeek auto-cache on stable prefixes
# and don't need markers.
_CACHE_MARKER_PROVIDERS = frozenset({"anthropic", "google"})


class _CostTrackingCompletions:
    def __init__(self, tracker: "CostTrackingClient", inner: Any):
        self._tracker = tracker
        self._inner = inner

    async def create(self, **kwargs: Any) -> Any:
        # Opt into OpenRouter usage accounting so the response carries the
        # exact request cost. Merged into any extra_body the SDK already set.
        if settings.openrouter_api_key:
            extra = dict(kwargs.get("extra_body") or {})
            extra.setdefault("usage", {"include": True})
            kwargs["extra_body"] = extra
        response = await self._inner.create(**kwargs)
        # Streaming responses report usage on the final chunk, which never
        # passes through here — only non-streaming calls accumulate.
        usage = getattr(response, "usage", None)
        cost = getattr(usage, "cost", None) if usage is not None else None
        if isinstance(cost, (int, float)) and cost >= 0:
            self._tracker._total_cost += float(cost)
            self._tracker._saw_cost = True
        return response

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)


class _CostTrackingChat:
    def __init__(self, tracker: "CostTrackingClient", inner: Any):
        self._inner = inner
        self.completions = _CostTrackingCompletions(tracker, inner.completions)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)


class CostTrackingClient:
    """AsyncOpenAI proxy scoped to one agent run: opts every (non-streaming)
    chat.completions.create into OpenRouter usage accounting and accumulates
    the exact `usage.cost` the provider returns.

    Build one per run, pass it to `make_chat_model(..., openai_client=...)`,
    and read `.cost_usd` after the run for the ledger. `cost_usd` is None when
    no call carried a cost (direct-OpenAI deploys, provider omissions,
    streaming-only runs) so callers fall back to the price table.
    """

    def __init__(self, inner: AsyncOpenAI):
        self._inner = inner
        self._total_cost = 0.0
        self._saw_cost = False
        self.chat = _CostTrackingChat(self, inner.chat)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)

    @property
    def cost_usd(self) -> float | None:
        return self._total_cost if self._saw_cost else None


def make_chat_model(name: str, openai_client: AsyncOpenAI | None = None):
    """Wrap a model slug in OpenAIChatCompletionsModel against our LLM client.

    openai-agents resolves a string `model` by prefix: `openai/...` ->
    Responses API, `anthropic/...` -> Anthropic SDK, and so on. Slugs that
    don't match a registered prefix (`x-ai/grok-4.3`, `moonshotai/...`,
    `qwen/...` — every non-OpenAI vendor that OpenRouter exposes) raise
    `Unknown prefix: <vendor>` before the request ever leaves the box.
    Building the Model object explicitly bypasses prefix dispatch and routes
    every chat completion through our configured client — OpenRouter when
    its key is set, OpenAI direct otherwise. Also forces the Chat
    Completions endpoint, which is what OpenRouter speaks (it does not
    implement the Responses API).

    For Anthropic AND Google Gemini models a thin proxy attaches
    `cache_control` markers to the system message and the last tool just
    before the request goes out. Every other provider gets the plain SDK
    model — OpenAI / DeepSeek auto-cache on stable prefixes; xAI / Moonshot
    / Qwen / Z.AI have no OpenRouter caching path today.
    """
    from agents import OpenAIChatCompletionsModel

    client = openai_client or get_llm_client()
    if detect_provider(name) in _CACHE_MARKER_PROVIDERS:
        return _CachingChatModel(model=name, openai_client=client)
    return OpenAIChatCompletionsModel(model=name, openai_client=client)


def _build_cache_marker() -> dict[str, Any]:
    """OpenRouter forwards Anthropic-shape `cache_control` to both Anthropic
    and Gemini per OpenRouter's prompt-caching docs.

    The marker structure is identical: `{"type": "ephemeral"}` on the last
    content block of the cacheable region.

    Two markers cover the static input surface:
      1. SYSTEM — placed on the system-message content. Caches the
         CHIPPI_INSTRUCTIONS (~1.5K tokens after Phase 1) + workspace_info
         + ai_profile.
      2. TOOLS — placed on the LAST tool. The provider caches the entire
         tools array up through any tool carrying a marker, so one marker
         on the tail covers the full 30+ tool surface.

    See: https://openrouter.ai/docs/features/prompt-caching
         https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
         https://ai.google.dev/gemini-api/docs/caching
    """
    return {"type": "ephemeral"}


class _CachingChatModel:
    """OpenAIChatCompletionsModel wrapper that injects cache markers.

    Wraps the SDK model rather than subclassing because the SDK builds the
    raw `messages` array and tools list inline inside `_fetch_response`,
    and the cache_control structure has to land on those built blocks.
    We intercept the client's chat.completions.create call once at request
    time and mutate the OUTGOING payload — same wire shape the SDK would
    have sent, with two extra fields. No copy of the SDK's converter logic.

    Concretely, between message construction and the HTTP POST:
      - The system message {"role": "system", "content": str} is rewritten
        to {"role": "system", "content": [{"type": "text", "text": str,
        "cache_control": {"type": "ephemeral"}}]}.
      - The last entry of the `tools` array gets cache_control attached.

    Used for Anthropic and Google Gemini (Phase 3 — OpenRouter forwards
    the same marker shape to both per their prompt-caching docs). Other
    providers never reach this class.
    """

    def __init__(self, model: str, openai_client: AsyncOpenAI):
        from agents import OpenAIChatCompletionsModel
        self._inner = OpenAIChatCompletionsModel(
            model=model,
            openai_client=_CacheMarkerClient(openai_client),
        )

    def __getattr__(self, name: str) -> Any:
        # Forward every other attribute (get_response, stream_response,
        # model, etc.) to the wrapped SDK model. We only intercepted the
        # client; everything else stays SDK-native.
        return getattr(self._inner, name)


class _CacheMarkerClient:
    """Proxy wrapper around AsyncOpenAI that attaches cache markers on the
    way out. Forwards every other attribute unchanged.

    We wrap only `chat.completions.create` — the one entry point the agents
    SDK calls. Embeddings, files, etc. go through `get_llm_client()` directly
    and never see this proxy.
    """

    def __init__(self, inner: AsyncOpenAI):
        self._inner = inner
        self.chat = _CacheMarkerChat(inner.chat)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)


class _CacheMarkerChat:
    def __init__(self, inner: Any):
        self._inner = inner
        self.completions = _CacheMarkerCompletions(inner.completions)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)


class _CacheMarkerCompletions:
    def __init__(self, inner: Any):
        self._inner = inner

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)

    async def create(self, **kwargs: Any) -> Any:
        # Mutate in place — the SDK does not reuse the dict after dispatch.
        _apply_cache_markers(kwargs)
        return await self._inner.create(**kwargs)


def _apply_cache_markers(create_kwargs: dict[str, Any]) -> None:
    """Mutate `messages` and `tools` to carry cache_control markers.

    Idempotent: if the system message is already a block list with markers,
    or the last tool already carries cache_control, nothing changes. Safe
    against the SDK rebuilding the same kwargs across a retry.

    System message: the SDK inserts it as {"content": str, "role": "system"}.
    Rewrite the string to a single-block content array carrying the marker.

    Tools: the SDK passes tools as a list of dicts shaped like
    {"type": "function", "function": {...}}. Anthropic and Gemini on
    OpenRouter accept `cache_control` as a sibling of `function`. One
    marker on the last tool covers every preceding tool.
    """
    messages = create_kwargs.get("messages")
    if isinstance(messages, list):
        for msg in messages:
            if (
                isinstance(msg, dict)
                and msg.get("role") == "system"
                and isinstance(msg.get("content"), str)
            ):
                msg["content"] = [
                    {
                        "type": "text",
                        "text": msg["content"],
                        "cache_control": _build_cache_marker(),
                    }
                ]
                break  # Only one system message; first hit wins.

    tools = create_kwargs.get("tools")
    if isinstance(tools, list) and tools:
        last_tool = tools[-1]
        if isinstance(last_tool, dict) and "cache_control" not in last_tool:
            last_tool["cache_control"] = _build_cache_marker()


# Back-compat alias for tests/external callers that imported the old name.
_apply_anthropic_cache_markers = _apply_cache_markers


_configured = False


def configure_agents_sdk() -> None:
    """Point the OpenAI Agents SDK at OpenRouter. Idempotent; no-op without
    an OpenRouter key (the SDK then uses its OpenAI default client).

    Tracing is disabled when on OpenRouter — the SDK's trace exporter only
    speaks to OpenAI's backend, and a pure-OpenRouter deploy may not carry
    an OpenAI key at all.
    """
    global _configured
    if _configured or not settings.openrouter_api_key:
        _configured = True
        return

    from agents import set_default_openai_client, set_tracing_disabled

    set_default_openai_client(get_llm_client(), use_for_tracing=False)
    set_tracing_disabled(True)
    _configured = True


def extract_usage(result: object) -> tuple[int, int, int]:
    """Return (input, output, total) token counts from an Agents SDK run.

    Usage is accumulated on the run context — `result.context_wrapper.usage`
    — NOT on `result` itself. A bare `result.usage` does not exist on
    RunResultStreaming; reading it silently yields None and zeroes out every
    usage and budget number. Both shapes are tried so an SDK change can't
    quietly re-break metering.
    """
    tokens_in, tokens_out, total, _ = extract_usage_with_cache(result)
    return (tokens_in, tokens_out, total)


def extract_usage_with_cache(result: object) -> tuple[int, int, int, int]:
    """Return (input, output, total, cached_input) token counts.

    The agents SDK normalizes provider-specific cached-token fields into
    `usage.input_tokens_details.cached_tokens` — true for both OpenAI
    (`prompt_tokens_details.cached_tokens`) and Anthropic via OpenRouter
    (cache_read_input_tokens, which OpenRouter maps to the same field).
    DeepSeek's `prompt_cache_hit_tokens` is also normalized here. Anything
    the provider didn't populate falls through as 0 — honest zero, not
    estimate.

    Used by the chat-turn telemetry writer in modal_app.chat_turn to feed
    the ChatUsage.cachedTokens column.
    """
    usage = None
    ctx_wrapper = getattr(result, "context_wrapper", None)
    if ctx_wrapper is not None:
        usage = getattr(ctx_wrapper, "usage", None)
    if usage is None:
        usage = getattr(result, "usage", None)
    if usage is None:
        return (0, 0, 0, 0)
    tokens_in = int(getattr(usage, "input_tokens", 0) or 0)
    tokens_out = int(getattr(usage, "output_tokens", 0) or 0)
    total = int(getattr(usage, "total_tokens", 0) or 0) or (tokens_in + tokens_out)
    cached = 0
    details = getattr(usage, "input_tokens_details", None)
    if details is not None:
        cached = int(getattr(details, "cached_tokens", 0) or 0)
    return (tokens_in, tokens_out, total, cached)
