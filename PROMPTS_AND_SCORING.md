# PROMPTS_AND_SCORING.md

Protected AI behavior reference for scoring, assistant prompts, and model/runtime boundaries.

**Protected systems:** scoring engine behavior, AI enhancement prompt contract, assistant tool-loop system prompting, and provider/runtime configuration.

---

## 1. Active AI systems

| System | Status | Location |
|---|---|---|
| Deterministic lead scoring engine | Implemented | `lib/scoring/engine.ts`, `lib/lead-scoring.ts` |
| AI enhancement layer for scoring narratives | Implemented | `lib/scoring/enhance.ts` |
| In-app assistant tool-loop prompts | Implemented | `lib/ai-tools/system-prompt.ts`, `app/api/ai/task/*` |
| In-app RAG assistant context composer | Implemented | `lib/ai.ts` |
| Embedding pipeline | Implemented | `lib/embeddings.ts`, `lib/vectorize.ts` |
| Background agent prompt/runtime stack | Implemented | `agent/agents/*`, `agent/orchestrator.py` |

---

## 2. Lead scoring contract (current)

### 2.1 Source-of-truth behavior

- Numeric scoring comes from deterministic scoring logic.
- AI is optional and only enriches qualitative fields (summary/tags/recommendation/state).
- Failure in AI enhancement must not block deterministic scored output.

### 2.2 Public scoring result shape

`LeadScoringResult` from `lib/lead-scoring.ts`:

- `scoringStatus`: `scored` | `failed` | `pending`
- `leadScore`: `number | null`
- `scoreLabel`: `hot | warm | cold | unscored`
- `scoreSummary`: `string | null`
- `scoreDetails`: structured details object when scoring succeeds

### 2.3 Failure behavior

- Deterministic engine failure returns failed/unscored fallback.
- AI enhancement failure returns deterministic fallback narrative fields while preserving scored status when engine succeeds.
- Contact persistence is independent from scoring success/failure.

---

## 3. In-app assistant contract (current)

### 3.1 Primary API surface

- `POST /api/ai/task` — interactive SSE turn execution with tool-calling and approval pause/resume.
- `POST /api/ai/task/approve/[requestId]` — continuation endpoint for permission-gated tool calls.
- `GET /api/ai/messages` and `GET/POST /api/ai/conversations` — transcript persistence APIs.

### 3.2 Prompt/runtime sources

- System prompt assembly: `lib/ai-tools/system-prompt.ts`
- Tool loop orchestration: `lib/ai-tools/loop.ts`
- Approval continuation: `lib/ai-tools/continue-turn.ts`
- Event protocol: `lib/ai-tools/events.ts`

### 3.3 Safety behavior

- Mutating tool calls can be paused for approval.
- Pending approvals are stored and resumed explicitly.
- Workspace ownership and auth checks gate task execution and transcript access.

---

## 4. Background agent model/runtime boundary

- Runtime entrypoints: `agent/modal_app.py` (heartbeat, run-now webhook)
- Orchestration: `agent/orchestrator.py`
- Agent composition and handoffs: `agent/agents/*`
- Security/budget controls: `agent/security/*`

This system is separate from the in-app assistant tool loop and should be documented/changed independently.

---

## 5. Change-control rules (strict)

Explicit instruction is required to change any of the following:

1. Deterministic scoring logic and weighting behavior
2. AI enhancement output contract or fallback semantics
3. Assistant system prompt/tool-loop behavior
4. Provider/runtime choices (OpenAI SDKs, model bindings, Modal runtime hooks)
5. Approval/pending-approval semantics for mutating assistant actions
6. Embedding model/dimensions and vector retrieval assumptions

For authorized changes, validate both success and failure paths and confirm persistence-isolation guarantees (especially intake/contact creation).

