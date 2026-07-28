# Chippi Voice Delegation — Stage Audit

Date: 2026-07-28
Branch: `codex/durable-agent-foundation`
Baseline commit: `61e3d3c283ac57c75a7ce8eb19fadd5768d6bbf5`

## Product outcome

A realtor can open Chippi voice mode from the existing composer, speak a substantial goal, and ask Chippi to delegate it. Chippi creates a durable, conversation-linked Work Session, shows it as a living child-work card, continues after the voice dialog or browser closes, and lets the realtor approve, answer, cancel, or reopen the finished artifact.

This is the first coherent vertical slice of the requested “ChatGPT Work inside Chippi” direction:

1. Natural realtime voice is the control surface.
2. Delegation creates durable background work rather than a request-bound promise.
3. The originating conversation owns the visible child-work record.
4. Progress, questions, approvals, cancellation, completion, and the artifact are inspectable.
5. Existing text chat and paying-customer behavior remain unchanged while the feature flag is off.

## Gate 1 — Reality audit

### Verified current product

- The signed-in production Chippi workspace is a polished, minimal dark chat surface with conversation history, Chat/Agent modes, attachments, search, draft mode, work sessions, and inline tool/delegation blocks.
- The production composer currently exposes no voice entry point.
- `ChippiPromptBox` already has a dormant `onVoiceStart` contract and renders a microphone when a parent supplies it, but `ChippiWorkspace` does not supply it.
- `/api/ai/realtime-session` uses the retired preview session flow and preview model, exposes an ephemeral provider token to the browser, and is not wired to a customer-facing component.
- `delegate_task` creates a `SwarmRun` and invokes Modal using a request-adjacent fire-and-forget call. Its card can display progress, but the run is not linked to the originating conversation at the data-model level.
- Work Sessions already implement the stronger product primitive: `WorkSession` is conversation-linked, Inngest-dispatched when configured, retryable, live-updated, cancellable, approval-aware, question-aware, and produces a durable artifact.

### Evidence

- Current chat: `docs/audits/chippi-voice-delegation/01-current-chat.png`
- Current actions menu without voice: `docs/audits/chippi-voice-delegation/02-current-actions-no-voice.png`
- Source: `components/ui/chippi-prompt-box.tsx`
- Source: `components/chippi/chippi-workspace.tsx`
- Source: `app/api/ai/realtime-session/route.ts`
- Source: `lib/ai-tools/tools/delegate-task.ts`
- Source: `lib/work-sessions/engine.ts`
- Source: `lib/work-sessions/kick.ts`
- Source: `app/api/work-sessions/route.ts`

### Gate 1 score

| Dimension | Score | Evidence-backed judgment |
|---|---:|---|
| Product reality coverage | 9.2 | Live authenticated journey plus source-to-runtime trace |
| North-star alignment | 9.5 | Directly implements voice-controlled durable agent work |
| Paying-customer safety | 9.3 | Additive and off by default; no production mutation |
| Technology currency | 9.0 | Official current Realtime WebRTC/server-gateway guidance reviewed |
| Scope coherence | 9.4 | One complete user outcome, not a disconnected infrastructure task |

Gate 1: **PASS**

## Gate 2 — Direction decision

### Selected architecture

Use the current OpenAI unified Realtime WebRTC interface as the voice transport while keeping Chippi’s existing OpenRouter/Agents SDK harness for planning and work execution.

- Browser sends its WebRTC offer to Chippi’s authenticated server route.
- Chippi’s server creates the Realtime call using the standard OpenAI credential; the browser never receives that credential.
- The Realtime model receives one narrow server-enforced function: `start_work_session`.
- The function call crosses an authenticated, tenant-scoped Chippi API boundary.
- The API creates or validates the originating conversation, writes the spoken goal into the transcript, creates a deterministic/idempotent Work Session, writes the live Work Session block, and kicks the existing durable planner.
- The browser returns the function output to the same voice response and navigates to the conversation-linked child-work card.

### Why Work Sessions, not SwarmRun

`WorkSession` already has the durable lifecycle the requested experience needs. Extending the legacy `SwarmRun` trigger would preserve the exact request-bound failure mode identified in the autonomy audit. This slice advances the customer experience while reusing the strongest existing background primitive.

### Explicit limits

- Feature flag: `REALTIME_VOICE_GATEWAY_ENABLED=1`.
- One narrow voice tool: start a read-only Work Session.
- Existing Work Session caps remain authoritative: 10 starts/hour and at most 2 active sessions/workspace.
- Voice cannot send messages, mutate CRM records, execute arbitrary integrations, or call a terminal in this slice.
- The voice-created session defaults to `plan_first`; “just go” must be explicitly requested and still remains read-only.
- No browser-held standard OpenAI API key.

### Gate 2 score

| Dimension | Score | Evidence-backed judgment |
|---|---:|---|
| User value | 9.1 | Hands-free delegation that survives leaving the chat |
| Product coherence | 9.3 | Reuses Chippi conversations, work sessions, and visual language |
| Differentiation | 9.0 | Voice is an actual operating control, not dictation |
| Security boundary | 9.2 | One server-enforced capability with tenant/conversation checks |
| Reversibility | 9.5 | Feature-off rollback restores current behavior |
| Cost control | 9.1 | Existing rate/active-run limits; one realtime session per explicit open |

Gate 2: **PASS**

## Gate 3 — Implementation audit

### Implemented vertical slice

- `app/api/ai/realtime-session/route.ts` now uses the current unified WebRTC SDP gateway and `gpt-realtime-2.1`. The standard OpenAI credential remains server-side; the route returns only SDP.
- The provider call includes a stable, hashed user safety identifier and a 15-second acceptance timeout.
- `lib/realtime/voice-delegation.ts` exposes one narrow function, `start_work_session`, and makes `plan_first` the default. The Realtime system instructions explicitly prohibit claiming a start before the function succeeds.
- `lib/realtime/client-events.ts` normalizes both supported completed-function-call event shapes. A per-session call-id set prevents duplicate browser dispatch.
- `app/api/ai/realtime-delegate/route.ts` authenticates the workspace, validates conversation tenancy, derives stable IDs from the provider call ID, checks conflicts before quota, enforces two active sessions and ten starts/hour, and fails closed without Inngest readiness.
- `lib/work-sessions/start.ts` centralizes creation and dispatch for text and voice. A deterministic retry re-kicks only a still-planning run, repairing the insert-before-dispatch window without replaying an advanced session.
- The spoken goal and a typed `work_session` block are persisted in the originating conversation.
- `components/chippi/realtime-voice-dialog.tsx` adds the voice surface through the existing dormant composer microphone contract and reuses Chippi's existing dialog, type, color, button, and Thinking Orb language.
- `components/ai/blocks/work-session-block-view.tsx` renders the existing Work Session card inline. It preserves plan approval, questions, cancellation, progress, failure, summary, and artifact access.
- `WorkSessionsStrip` suppresses a duplicate global card when that session is already visible in the open conversation.
- Server-computed readiness keeps the affordance absent unless the explicit feature flag and required OpenAI/Inngest configuration are present. Broker chat and existing text chat remain unchanged.

### Gate 3 score

| Dimension | Score | Evidence-backed judgment |
|---|---:|---|
| Vertical-slice completeness | 9.3 | Mic → voice → tool → durable run → inline card is connected |
| Agent/product coherence | 9.4 | Voice controls the existing agent/work primitive instead of adding a parallel demo |
| Durability and replay | 9.1 | Deterministic IDs, accepted-row recovery, Inngest-backed continuation |
| Tenant/security boundary | 9.2 | Server-held credential, authenticated workspace, scoped conversation, one capability |
| Experience cohesion | 9.2 | Existing composer, dialog primitives, orb, cards, and interaction states reused |
| Reversibility | 9.7 | No schema change; feature is absent when readiness is false |

Gate 3: **PASS**

## Gate 4 — Verification audit

### Executed evidence

- 26 focused tests passed across seven files:
  - current Realtime configuration and deterministic IDs;
  - both Realtime function-call event shapes;
  - feature-off/readiness behavior;
  - authenticated SDP exchange and credential containment;
  - tenant-scoped delegation, persisted messages, replay, and conflicting replay;
  - Work Session insert/dispatch/retry behavior;
  - composer, transcript, and duplicate-card product wiring.
- The full Vitest suite passed: **542 files, 4,965 passed, 1 skipped**.
- Direct TypeScript `tsc --noEmit` passed.
- ESLint produced zero errors. One pre-existing hook-cleanup warning remains in `chippi-workspace.tsx:714`, outside this feature's changed logic.
- `git diff --check` passed.
- The production baseline was captured in authenticated Chrome before implementation. No production code or customer data was changed.
- No OpenAI, Modal, Inngest, Vercel, or Supabase production call was used for acceptance.

### Honest evidence limit

The checkout has no local Clerk, Supabase, OpenAI, or Inngest environment. Therefore the new microphone dialog and live provider/background transition have not been visually or behaviorally exercised in a configured staging runtime. Source-level design conformity and local contracts are verified; runtime audio, latency, reconnect, and cross-browser behavior are not.

### Gate 4 score

| Dimension | Score | Evidence-backed judgment |
|---|---:|---|
| Static/type safety | 9.5 | Clean typecheck and diff |
| Focused negative-path coverage | 9.4 | Flag, auth, tenancy, retry, conflict, quota, and both event shapes |
| Regression coverage | 9.5 | Entire 4,965-test suite passes |
| Runtime integration evidence | 5.0 | No configured staging OpenAI/Inngest/DB execution |
| Visual/browser evidence | 5.5 | Production baseline captured; changed UI not rendered in a configured build |
| Overall verification | 7.8 | Strong local acceptance, incomplete runtime proof |

Gate 4: **NO-GO for release**. Local code acceptance passes; configured-runtime acceptance does not yet meet 9/10.

## Gate 5 — Release decision

Status: **NO-GO for production activation**.

The feature remains off and invisible. Production activation requires:

1. Confirm `OPENAI_API_KEY`, Inngest, and Work Session migration availability in the intended environment without exposing secret values.
2. Staging WebRTC microphone test on Chrome and Safari.
3. Staging close/reopen, duplicate function-call, cancellation, provider failure, and artifact replay tests.
4. Cost/latency telemetry for session creation, first audio, function dispatch, and Work Session acceptance.
5. Explicit decision to enable `REALTIME_VOICE_GATEWAY_ENABLED`.

No Vercel build minutes were consumed and no deployment was initiated.
