# DECISIONS.md

Decision log for product and technical choices in the Chippi repository.

Use this to record meaningful decisions and avoid re-litigating context. When a decision is made (by a human or during AI-assisted work), log it here with full context so future contributors understand why.

---

## How to use this file

1. Add new decisions at the top of the log section (most recent first).
2. Fill in all fields in the template.
3. Mark decisions as `[CONFIRMED]` if backed by repo evidence or explicit instruction, or `[PLACEHOLDER]` if inferred.
4. Set a follow-up review date when the decision may need revisiting.

---

## Decision template

```md
## [YYYY-MM-DD] <Decision title>

- **Status**: [CONFIRMED] or [PLACEHOLDER]
- **Decision**: <short statement of what was decided>
- **Context**: <why this decision was needed>
- **Options considered**:
  1. <option A — description>
  2. <option B — description>
  3. <option C — description>
- **Chosen option**: <which option and why>
- **Expected impact**: <benefits and constraints>
- **Risks**: <known downsides or trade-offs>
- **Follow-up review date**: <YYYY-MM-DD>
```

---

## Log

## [CONFIRMED] Deterministic scoring engine with optional AI enhancement

- **Status**: [CONFIRMED] — implemented in `lib/lead-scoring.ts`, `lib/scoring/engine.ts`, and `lib/scoring/enhance.ts`
- **Decision**: Compute lead scores deterministically, then optionally use AI for qualitative summary/recommendation enrichment.
- **Context**: Scoring needed to stay reliable even when model providers are unavailable or degraded. Deterministic scoring provides stable outputs; AI enhancement improves readability when available.
- **Options considered**:
  1. Full LLM scoring for score + rationale
  2. Deterministic score only (no AI text)
  3. Deterministic score + optional AI enhancement (chosen)
- **Chosen option**: 3 — deterministic core with optional enhancement.
- **Expected impact**: More predictable scoring behavior, fewer hard failures, better operational resilience.
- **Risks**: Enhancement quality still depends on model output; docs/tests must avoid assuming AI is always available.
- **Follow-up review date**: [TBD]

---

## [CONFIRMED] Dual AI surfaces: in-app assistant + background agent runtime

- **Status**: [CONFIRMED] — implemented in `app/api/ai/task/*` + `lib/ai-tools/*` and `agent/*` + `app/api/agent/*`
- **Decision**: Keep two complementary AI surfaces:
  1) interactive in-app assistant for user-in-the-loop tasks, and
  2) background agent runtime for proactive monitoring/drafting workflows.
- **Context**: Realtors need both real-time assistant help and asynchronous workflow automation.
- **Options considered**:
  1. Chat-only assistant
  2. Background automation only
  3. Dual-surface architecture (chosen)
- **Chosen option**: 3 — maintain both surfaces with clear boundaries.
- **Expected impact**: Better coverage of immediate and asynchronous use cases without overloading one interface.
- **Risks**: Documentation drift if boundaries between surfaces are not kept explicit.
- **Follow-up review date**: [TBD]

---

## [CONFIRMED] Protect launch wedge over generic CRM expansion

- **Status**: [CONFIRMED] — product context and codebase both support this
- **Decision**: Prioritize renter/leasing qualification speed and clarity over broad CRM feature expansion.
- **Context**: Chippi's initial user is a new solo realtor handling renter leads. The codebase is built around intake → scoring → CRM triage. Expanding to generic CRM breadth would dilute the activation value and increase setup friction.
- **Options considered**:
  1. Expand to generic CRM breadth now — serve more use cases, risk losing focus
  2. Maintain focused wedge — serve the specific user well, expand later
- **Chosen option**: 2 — Maintain focused wedge. The product should do one thing well before expanding.
- **Expected impact**: Better activation rates, clearer user value, simpler product to maintain.
- **Risks**: Some users may request broader CRM features early. Narrow scope limits addressable market initially.
- **Follow-up review date**: [TBD — revisit after initial user feedback]

---

## [CONFIRMED] Explainable scoring contract

- **Status**: [CONFIRMED] — implemented in `lib/lead-scoring.ts`
- **Decision**: Lead scoring must produce an explainable contract: numeric score (0-100), label (hot/warm/cold/unscored), and plain-language summary (max 300 chars).
- **Context**: Realtors need to quickly triage leads. An opaque score number is not actionable. The summary explains *why* a lead scored the way it did.
- **Options considered**:
  1. Opaque numeric score only
  2. Score + label (no summary)
  3. Score + label + explainable summary (chosen)
- **Chosen option**: 3 — Full explainable contract. The summary drives trust and actionability.
- **Expected impact**: Realtors can make faster follow-up decisions with confidence. Scoring feels practical, not magical.
- **Risks**: Prompt/schema drift could break the contract. Summary quality depends on model output.
- **Follow-up review date**: [TBD — revisit if scoring accuracy feedback emerges]

---

## [CONFIRMED] OpenAI platform for assistant, embeddings, and agent orchestration

- **Status**: [CONFIRMED] — implemented across `lib/ai.ts`, `lib/embeddings.ts`, and `agent/*`
- **Decision**: Standardize on OpenAI ecosystem components for in-app assistant, embeddings, and background-agent reasoning/orchestration.
- **Context**: Consolidating provider surface area simplifies operations and model/runtime management across both JS and Python systems.
- **Options considered**:
  1. OpenAI ecosystem only (chosen)
  2. Multi-provider split by subsystem
  3. Non-OpenAI default with fallback adapters
- **Chosen option**: 1 — OpenAI ecosystem for current AI workloads.
- **Expected impact**: Operational simplicity and fewer provider-integration failure points.
- **Risks**: Single-provider concentration risk.
- **Follow-up review date**: [TBD]

---

## [CONFIRMED] Onboarding completion and application submission are separate states

- **Status**: [CONFIRMED] — implemented in `User.onboardingCompletedAt` (user-level) vs `Contact` records (per-lead)
- **Decision**: Onboarding completion and application submission must remain separate states with no shared completion logic.
- **Context**: Onboarding is a user/workspace activation flow. Application submission is a prospect/lead ingestion flow. Coupling these would create fragile shared state and confusing edge cases.
- **Options considered**:
  1. Shared "completion" flag for both
  2. Separate state tracking (chosen)
- **Chosen option**: 2 — Separate states. Onboarding is on `User`, applications create `Contact` records.
- **Expected impact**: Clean workflow boundaries. Agents cannot accidentally couple these flows.
- **Risks**: None significant — separation is the safer default.
- **Follow-up review date**: N/A

---

## [CONFIRMED] Stripe-backed brokerage billing path

- **Status**: [CONFIRMED] — Stripe package, billing routes, and webhook handler are present in code
- **Decision**: Use Stripe-backed checkout/portal/webhook flow for brokerage subscription lifecycle.
- **Context**: Billing requires a standard subscription lifecycle with reliable webhook-driven status updates.
- **Options considered**:
  1. Stripe checkout + billing portal + webhooks (chosen)
  2. Alternative payment processor
  3. Manual billing only
- **Chosen option**: 1 — Stripe-backed subscription flow.
- **Expected impact**: More standard billing lifecycle management and recoverable state transitions.
- **Risks**: Billing still touches access control/workspace lifecycle and needs continued hardening.
- **Follow-up review date**: [TBD]
