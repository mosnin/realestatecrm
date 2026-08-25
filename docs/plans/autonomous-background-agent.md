# Plan — Enable the Chippi agent to run autonomously in the background

Linear: *"The Chippi agent is not continuing to run in the background and
complete assigned tasks autonomously."*

This plan is written against the code as it stands today. A large part of the
issue's requirement list is **already built** — the work is not to build a job
system from scratch, it is to move the *chat turn* onto the durable rails that
Work Sessions and Workspace Runs already ride, and to change three specific
behaviours that currently drop work on the floor.

---

## 1. What already exists

| Capability | Where |
| --- | --- |
| Persistent job system (scheduler, queue, DLQ, retries, `delaySeconds` up to 12h) | `worker/` (Cloudflare Worker + Queues), `lib/queue.ts`, `docs/WORKER.md` |
| Task registry executed off-request | `lib/jobs/tasks.ts` (`WORKER_TASKS`) via `/api/worker/execute` |
| Durable multi-step agent runs, one step per queued job | `lib/work-sessions/{start,kick,engine}.ts` — each step gets its own retry budget |
| Explicit task states | `WorkSessionRow.status`: `planning · awaiting_approval · awaiting_input · running · awaiting_actions · completed · failed · cancelled` (`lib/work-sessions/types.ts`) |
| Approval-gated side effects with a tool allowlist | `lib/work-sessions/actions.ts` (`WorkSessionAction`, `DURABLE_RETRY_SAFE_TOOLS`) |
| Completion notification (in-app + push) | `lib/work-sessions/engine.ts` → `createAppNotification`, `sendPushToSpace` |
| Turn queue with leases, atomic claim/renew/finish, cancellation-wins | `lib/chat/turn-control.ts` + `supabase/migrations/20260915000027_conversation_turn_lease_recovery.sql` |
| Stale-run sweeps on a 5-minute cron | `cron-conversation-turn-recovery`, `cron-workspace-run-recovery`, `cron-work-session-action-recovery` |
| Launch-claim receipts + recovery for an off-box runtime | `lib/workspace-runs/recovery.ts` (the pattern to copy) |
| Disconnect survival for the current request | `app/api/ai/task/route.ts` — drains Modal into `after()` after the browser leaves |

## 2. What actually breaks

A chat turn is executed **by the HTTP request that started it**:

```
browser ──POST /api/ai/task──▶ Vercel fn ──stream──▶ Modal (MODAL_CHAT_URL, 600s cap)
                                   │
                                   └── proxyModalStream(): SSE to browser
                                       AND the only writer of the assistant
                                       message / turn settlement
```

`app/api/ai/task/route.ts` holds the lease (`startConversationTurnLeaseGuardian`),
proxies the Modal stream, and persists the result in the proxy's terminal path.
Everything about durability is therefore bounded by that one function
invocation. Four concrete failures follow:

1. **The Vercel function is the executor.** `maxDuration = 800` is a *request*,
   silently clamped to the plan ceiling. A deploy, a rolling restart, or an OOM
   kills the invocation; Modal keeps burning tokens with nobody listening, and
   the assistant message is never written. The `after()` drain extends the
   invocation past client disconnect — it does not survive the invocation ending.
2. **Modal is called synchronously.** Chat uses request/stream, while Workspace
   Runs already use launch → `202` → signed callbacks with a launch-claim
   receipt. Only the second shape can be picked back up by a different process.
3. **An expired lease cancels the work.** `recover_expired_conversation_turns`
   moves `running`/`paused` turns whose lease died to `cancelled` with
   `execution_lease_expired`. That is correct as a *safety* behaviour and wrong
   as the *only* behaviour: the issue's "restarts and deployments do not silently
   lose active tasks" requires a bounded resume, not a tombstone.
4. **Progress is not durable.** Frames exist only inside the SSE proxy. If the
   user closes the tab and comes back, there is no partial transcript to render —
   only the final message, if it was written at all.

Everything else on the issue's list is either already true for Work Sessions or
is a small extension of it. **The plan is: make a chat turn a first-class
durable task with the same guarantees.**

---

## 3. Target architecture

```
POST /api/ai/task
  └─ enqueueConversationTurn (idempotent on clientRequestId)   ← exists
  └─ enqueueWorkerTask('chat-turn-start', { turnId, spaceId }) ← new
  └─ 202 { turnId }                                            ← returns immediately

Cloudflare queue ─▶ /api/worker/execute ─▶ WORKER_TASKS['chat-turn-start']
  └─ claimConversationTurnV2 (the claim IS the mutex — dup delivery no-ops)
  └─ launch Modal (POST → 202) with a signed callback + launch-claim URL
  └─ return; the lease outlives this invocation

Modal ──signed callbacks──▶ /api/ai/turns/[id]/events
  └─ append to ConversationTurnEvent (durable, ordered, tenant-scoped)
  └─ republish on the existing realtime channel for any attached client
  └─ terminal frame → commitConversationTurnAssistantV2 (unchanged authority)

browser: subscribes to the realtime channel; on load/reconnect replays
         ConversationTurnEvent. Streaming becomes a VIEW of durable state
         instead of the transport that owns it.
```

The DB stays the authority. The browser becomes a viewer. Nothing about the
product non-negotiables changes: one turn still produces exactly one visible
answer (the event log is keyed by `turnId` + `seq`, so replay is idempotent),
and Stop/Steer keep working through the existing `cancelRequestedAt` path —
cancellation still wins publication.

---

## 4. Phases

### Phase 0 — Instrument first (no behaviour change)

Prove the failure rate before changing the execution model.

- Structured turn telemetry: emit `turn.claimed`, `turn.settled`,
  `turn.lease_expired`, `turn.recovered` with `spaceId`, `attempts`, wall-clock.
- Add a **lost-turn gauge**: turns whose `finishedAt` is null and whose lease
  expired in the last hour, surfaced on the existing background-readiness admin
  page next to the Cloudflare scheduler row.
- Sentry alert when the gauge is non-zero for two consecutive cycles.

**Deliverable:** a number for "how many turns die per day", which is also the
regression metric for every later phase.

### Phase 1 — Durable progress log

- Migration (append-only, idempotent, per `docs/RELEASE.md`):
  `ConversationTurnEvent(id, spaceId, turnId, seq, kind, payload jsonb, createdAt)`
  with `UNIQUE (turnId, seq)` and an index on `(spaceId, turnId, seq)`.
  Register it in `TENANT_TABLES` (`lib/tenant-db.ts`) so it can only be opened
  scoped.
- Dual-write from `proxyModalStream`: every frame it already pushes to the SSE
  stream is also appended. No read path changes yet.
- Retention: prune with the existing `cron-cleanup` job (default 30 days;
  terminal assistant messages already live in the message tables).
- Client: on mount, replay `ConversationTurnEvent` for any non-terminal turn in
  the conversation before attaching to the live stream. This alone satisfies
  *"progress and final results remain available when the user returns"* for
  turns that survive.

**Tests:** replay of a partial turn renders exactly one assistant answer;
duplicate `seq` is rejected; a reconnect mid-turn does not duplicate text.

### Phase 2 — Worker-hosted execution

- New Modal entry point `launch_chat_turn` in the chat app mirroring
  `agent/workspace_modal_app.py`'s launch shape: authenticate, return `202`,
  then run and post signed callbacks. Reuse the existing callback secret and the
  launch-claim receipt so an accepted-but-silent launch is detectable.
- New task handlers in `lib/jobs/tasks.ts`:
  - `chat-turn-start` — claim (`claimConversationTurnV2`), launch Modal, record
    the launch receipt, return. Claim failure = another executor owns it = no-op.
  - `chat-turn-accepted-silence-timeout` — enqueued with `delaySeconds`; if the
    turn produced no callback within the window, fail or retry it (the
    `workspace-run-task-accepted-silence-timeout` handler is the template).
- New callback route `/api/ai/turns/[id]/events` — signature-verified, appends
  events, renews the lease on each frame (server-side lease guardian instead of
  request-side), commits the terminal outcome.
- `POST /api/ai/task` keeps its streaming response **only as an attached
  viewer**: it enqueues, then tails `ConversationTurnEvent`. Disconnect is a
  non-event because the request no longer owns anything.
- Rails, in the same order Work Sessions already use: Cloudflare queue →
  Inngest (if keyed) → `after()` inline for previews/bare envs. Never two rails
  for one turn.

**Tests:** killing the request mid-turn still settles the turn; a duplicate
queue delivery produces one execution; a launch accepted with no callbacks is
reported, not orphaned.

### Phase 3 — Resume instead of tombstone

- New RPC `resume_expired_conversation_turns(p_limit)` alongside (not replacing)
  the existing cancel RPC:
  - `attempts < maxAttempts` **and** the failure is retryable → clear the lease,
    set `status='pending'`, `nextAttemptAt = now() + backoff(attempts)`,
    increment `attempts`, re-enqueue `chat-turn-start`.
  - otherwise → today's behaviour: `cancelled` / `failed` with a real reason.
- Retryable vs permanent, classified once in `lib/chat/turn-failure.ts`:
  retryable = transport/5xx/429/lease loss/worker restart; permanent = schema or
  tenant validation, refusal, budget cap, cancellation.
- **Effect-safety ledger** — the one genuinely hard part. A resumed turn must
  not re-send an email. Migration:
  `AgentToolEffect(id, spaceId, turnId, effectKey, tool, status, resultRef, createdAt)`
  with `UNIQUE (turnId, effectKey)`, where `effectKey` is a stable hash of
  (tool name, normalised args). Effectful tools claim their row before acting
  and short-circuit to the recorded result on replay. Tools that cannot be made
  idempotent are marked non-resumable: a turn that already executed one fails
  permanently instead of retrying, with an honest error.
- Deploy drain: on `SIGTERM` in the worker execute path, stop claiming and let
  in-flight turns finish; unclaimed queue messages are redelivered by Cloudflare.

**Tests:** a resumed turn re-runs read-only tools and skips executed effectful
ones; `maxAttempts` exhaustion records a useful `lastError`; a non-idempotent
tool blocks resume rather than double-sending.

### Phase 4 — One public task-state vocabulary

Two vocabularies exist today (`ConversationTurnStatus`, `WorkSession.status`).
Do not merge the storage; add a single projection used by the UI, the API, and
notifications — `lib/chat/task-state.ts`:

| Public state | ConversationTurn | WorkSession |
| --- | --- | --- |
| `queued` | `pending` | `planning` |
| `running` | `running` | `running` |
| `needs_input` | `paused` (approval checkpoint) | `awaiting_approval`, `awaiting_input`, `awaiting_actions` |
| `completed` | `completed` | `completed` |
| `failed` | `failed` | `failed` |
| `cancelled` | `cancelled` | `cancelled` |

`GET /api/ai/turn-status` and the Today/Activity surfaces render this
projection, so "what is Chippi doing" reads the same everywhere.

### Phase 5 — Notify, limit, observe

- **Notify** (reuse `createAppNotification` + `sendPushToSpace`, as Work
  Sessions already do) on `completed`, `failed`, and `needs_input` — but only
  when no client is attached to that turn, so a watching user never gets a push
  for something already on their screen. Honest UI: a failed delivery is
  reported as failed, never celebrated.
- **Limits**, enforced in the claim path so they cannot be bypassed by a
  retry: max concurrent background turns per space; max attempts; max wall-clock
  per turn; a token/cost ceiling per turn checked against ChatUsage (OpenRouter
  usage accounting already lands exact `usage.cost` — keep it that way).
- **Unattended permission model:** a turn running with nobody watching gets the
  approval-gated tool surface, not the full one. Reuse the Work Session
  allowlist shape; anything outside it parks the turn in `needs_input` with a
  proposed action the user approves later.
- **Observe:** per-turn spans, the Phase 0 gauge kept as the SLO, DLQ contents
  surfaced on the readiness page, and a `chat-turn` row in the cron manifest
  parity test.

---

## 5. Requirement → where it lands

| Issue requirement | Phase | Notes |
| --- | --- | --- |
| Long-running work in a persistent worker/job system | 2 | Cloudflare Queues + `lib/jobs/tasks.ts`; already the rail for Work Sessions |
| Continue after the browser closes | 2 | Request stops owning execution |
| Persist state, progress, outputs, errors | 1, 2 | `ConversationTurnEvent` + existing `ConversationTurn` columns |
| Retry temporary failures | 3 | Classified retries + queue backoff |
| Prevent double processing | 2, 3 | `claimConversationTurnV2` mutex + `AgentToolEffect` unique key |
| Clear task states | 4 | One public projection over two state machines |
| Resume/recover after restart or deploy | 3 | `resume_expired_conversation_turns` + drain |
| Logging and monitoring | 0, 5 | Gauge, Sentry, readiness page |
| Notify on complete / fail / needs input | 5 | Existing notification + push plumbing |
| Permissions and limits on autonomous actions | 5 | Claim-path limits + approval-gated tool surface |

## 6. Acceptance criteria → how it is verified

| Criterion | Verification |
| --- | --- |
| A submitted task continues after the page closes | E2E: submit, kill the tab, poll `turn-status` to `completed` |
| Agent completes supported tasks without intervention | Existing Work Session e2e extended to chat turns |
| Progress and results available on return | Replay test (Phase 1) + manual reload mid-turn |
| Temporary failures retried automatically | Fault injection: Modal 503 on first launch, assert one settled turn after retry |
| Permanent failures recorded usefully | Assert `status='failed'` with a non-null, human-readable `lastError` |
| Restarts/deploys don't lose active tasks | Kill the executing worker mid-turn; the sweep resumes it within one cycle |
| Duplicate execution prevented | Deliver the same queue message twice; assert one assistant message and one effect row |

## 7. Rollout

Mirror the Workspace Run rollout discipline (`docs/chippy-workspace-runs.md`):

- `CHIPPI_DURABLE_TURNS_ENABLED` (server) + `CHIPPI_DURABLE_TURNS_SPACE_IDS`
  allowlist. Off ⇒ today's proxy path, byte for byte.
- Phase 1 ships dark (dual-write only) and can be left on safely.
- Phase 2/3 go to one non-customer canary space first; the authenticated
  submit → close tab → deploy → resume → complete journey must pass there before
  any customer space is added.
- Rollback is the flag: in-flight durable turns finish on the old path because
  the DB state machine is unchanged; only the executor moves.
- Never enable `INNGEST_CRONS_ENABLED` while the Worker is deployed (see
  `docs/WORKER.md`) — the new sweep is in the same manifest and would double-fire.

## 8. Risks

- **Effect replay is the real risk.** Retrying an agent turn is only safe with
  the effect ledger; ship Phase 3 behind its own sub-flag and default effectful
  tools to non-resumable until each one has an `effectKey`.
- **Cost.** Autonomous retries multiply token spend. The per-turn cost ceiling
  in Phase 5 is not optional; it lands with Phase 3, not after it.
- **Two schedulers.** Everything new goes in both `worker/src/schedule.ts` and
  `CRON_MANIFEST` — `tests/lib/worker-schedule-parity.test.ts` fails CI otherwise.
- **Migrations are not live because they are merged** (`docs/RELEASE.md`); the
  code must tolerate the pre-migration shape until the human-gated apply runs.
