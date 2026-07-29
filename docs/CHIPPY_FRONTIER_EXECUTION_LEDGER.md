# Chippy Frontier Execution Ledger

Canonical handoff for the durable-agent/workspace initiative. Update after every material decision or milestone. Never add secrets, credential values, customer data, or production-derived payloads.

**Status:** active local implementation; no deployment
**Branch:** `codex/durable-agent-foundation`
**Baseline:** `46c58333b441e70223aaeac2daca03a49374e3e9`
**Detailed audit:** `Chippy_Autonomy_Durability_Audit_2026-07-27.md` in the audit task outputs
**Quality matrix:** [CHIPPY_FRONTIER_QUALITY_GATE.md](./CHIPPY_FRONTIER_QUALITY_GATE.md)
**Requirements/tests:** [CHIPPY_FRONTIER_TRACEABILITY.md](./CHIPPY_FRONTIER_TRACEABILITY.md)
**Notion:** [overview](https://app.notion.com/p/3aaa0db630cf81259b63e80e0065e0e7) · [evidence](https://app.notion.com/p/3aaa0db630cf817d98f6c86a87c2c75c) · [roadmap](https://app.notion.com/p/3aaa0db630cf8165a90bf08510fc6822) · [quality/control](https://app.notion.com/p/3aba0db630cf81eeb67bc71945f6dba2)

## North star

One elegant operating workspace where real-estate conversations become durable, inspectable work; restricted child tasks can continue independently; every consequential action is proposed and approved; artifacts, status, history, and recovery remain visible after navigation or process failure; voice controls the same task graph; isolated execution is granted as narrow capabilities, never as an unrestricted terminal.

The authoritative job row—not the browser, HTTP request, Redis key, agent loop, or sandbox—owns execution.

## Non-negotiable constraints

- Established paying-user product: additive migrations, compatible reads, feature flags, targeted regressions, dual-write/dual-read rollout.
- No production deployment, live infrastructure mutation, real customer data access, or outbound communication in this initiative.
- Unattended work: explicit pure-read allowlist; side effects become typed proposals.
- Run authority: short-lived signed, audience/tenant/run-bound capability grants; no prompt-only trust.
- Children: user/control-plane initiated only, bounded depth/quota, same tenant, capability subset, inherited denials.
- Sandbox: ephemeral, least privilege, declared mounts/egress/secrets/quotas, cooperative cancellation, artifact boundary.
- Voice: modern OpenAI Realtime through Modal-managed server capability; browser receives no provider credential.
- Models: preserve OpenRouter’s multi-model routing unless measured evidence supports a compatible change.
- Cost: local static/type/unit/integration checks first; batch deployment-ready changes; no remote build churn.
- Security gate: any unresolved material security issue is no-go.

## Verified baseline findings

Evidence labels: **SR** source review, **LT** local test, **UI** captured interaction, **RU** runtime unverified.

- Missing Redis can look like duplicate Composio delivery and return success. **SR**
- Autonomous/workflow failures can be acknowledged and advance schedule state. **SR**
- Browser-close continuation is request-bound, not reclaimable durable work. **SR**
- Modal timeout/HTTP success is conflated with durable acceptance/completion. **SR**
- Work Sessions used `requiresApproval === false` as a false read-only boundary. **SR**
- Autonomous “draft only” relied on prompting while real write/send tools existed. **SR**
- Replacement chat runs share stale Redis presence and can overlap. **SR**
- Schedules lack atomic occurrences/claims; lifecycle identity and callbacks are incomplete. **SR**
- Existing positives: webhook verification, bounded loops/concurrency, several durable records, SDK persistence retry, RLS hardening, Sentry monitors, Modal isolation primitives. **SR/LT**
- Production/runtime configuration, migrations, queues, provider behavior, and UI journeys remain unverified. **RU**

## Architecture decisions — append only

| ID | Decision | Rationale | Status |
|---|---|---|---|
| D001 | Durable external orchestration; ephemeral workers | Persistence and leases solve lifecycle loss; permanent sandboxes do not | accepted |
| D002 | Explicit unattended tool allowlist | Approval metadata is not a side-effect taxonomy | implemented locally |
| D003 | Typed proposals for unattended desired actions | Separates model intent from authority to execute | contract implemented locally |
| D004 | Signed run-policy claims at internal action boundaries | Worker bearer secret authenticates a process, not a run’s authority | shadow integration implemented locally |
| D005 | Additive `AgentJobRun` protocol and related tables | Backward-compatible path from existing conversations/Work Sessions | migration drafted locally |
| D006 | Child capability subset + inherited denials + depth 4 | Prevents arbitrary self-spawn and privilege escalation | DB guard drafted locally |
| D007 | Realtime voice through the server gateway | The provider credential stays server-side; voice becomes a tenant-scoped control surface for durable work | implemented locally; continuation capability remains feature-gated and staging-unverified |
| D008 | Default policy rollout is shadow until all trusted callers sign grants | Avoids breaking established paid-user flows; enforcement is a release gate | accepted |
| D009 | Current OpenRouter routing remains during foundation work | Avoid provider collapse and unrelated behavioral regression | accepted |
| D010 | Do not remove workflow watermark-on-returned-failure until occurrences and step idempotency ship together | Immediate whole-workflow retry can duplicate earlier successful actions | accepted compatibility hold |
| D011 | Signed-but-invalid/underprivileged grants are denied even in shadow mode | Shadow exception is only for genuinely absent legacy policy, never restricted callers | implemented locally |
| D012 | Voice write authority requires an approval-decision capability in addition to action capability | Voice is a control plane; ordinary conversation is not execution consent | implemented in policy contract |
| D013 | Keep the legacy Python Agents SDK seam frozen until a provider/cache compatibility harness exists | The repository pins a pre-1.0 SDK/provider adapter; an in-place upgrade could break OpenRouter routing, tracing, or cached prompt composition | accepted migration gate |
| D014 | Mint Python/Modal internal-action grants per call with one capability | Preserves run/tenant/subject binding without turning a process secret into broad authority; autonomous writes are stopped locally even while endpoints remain in shadow | implemented locally; runtime validation pending |
| D015 | Add schedule occurrences and step records as a disabled seam, not a cron rewrite | A durable occurrence/lease/fencing contract must be proven before it owns legacy schedule advancement | implemented locally; migration unrun and no executor wiring |
| D016 | Reject expired leases and changed step idempotency keys | An expired worker may not renew or complete work; a stable step key must not silently point at a changed effect | independently reviewed and implemented locally |

## Current architecture target

`Conversation/voice/event/schedule → durable inbox or AgentJobRun → atomic claim + lease → restricted worker or sandbox → ordered AgentRunEvent + proposal/artifact → signed terminal callback → user-visible replay`

Core additive records:

- `AgentJobRun`: hierarchy, mode, capabilities/denials, idempotency, lease, retry, cancellation, terminal state.
- `AgentRunEvent`: strictly ordered replay stream.
- `AgentActionProposal`: typed, reviewable consequential action.
- `AgentRunArtifact`: bounded output boundary.
- `ScheduleOccurrence`: unique materialized cadence occurrence.
- `AgentEventInbox`/`AgentOutbox`: durable ingress and publish recovery.

## Prioritized roadmap and gates

1. **Trust + honest semantics (active):** allowlist, proposals, policy claims, Redis failure, dispatch/workflow acknowledgement. Gate: focused tests + independent review; no material safety issue.
2. **Durable protocol:** migration validation, claim/heartbeat/terminal services, user-scoped read/control APIs, dual-write flags. Gate: disposable DB concurrency/fault tests.
3. **Execution adapters:** Modal 202 acceptance, run ID propagation, heartbeat, signed callback, cancellation. Gate: synthetic preview crash/replay tests.
4. **Workspace UX:** unified rail, task tree, status/activity/artifacts/approvals, search/filter/reopen. Gate: captured desktop/mobile/accessibility interaction evidence.
5. **Realtime voice control:** server gateway, restricted durable task tools, approval attribution, reconnect. Gate: current-doc conformance + synthetic end-to-end voice tests.
6. **Capability sandbox:** manifest, quotas, mounts, egress, secret scopes, artifact limits. Gate: isolation escape/egress/kill/quota tests.
7. **Observability/evals/cost:** run dashboards, traceability, provider/caching measurements, chaos gates. Gate: SLOs and release checklist ≥9 critical scores.

## Workstreams and ownership

| Workstream | Owner | State | Next proof |
|---|---|---|---|
| Architecture/security/release decisions | Sol lead | active | quality-gate re-audit |
| Trust boundary implementation | Sol lead | active | focused tests + independent Terra review |
| Durable SQL protocol | Sol lead | draft | disposable Postgres validation |
| Realtime/voice gateway | unassigned until foundation gate | designed | official-doc protocol review |
| Workspace UX | unassigned until durable read API | discovery | captured existing UI baseline |
| Prompt caching/provider audit | unassigned | pending | measured harness, not config inspection |

## Exact next safe actions

1. Start a disposable local Supabase/Postgres service and execute the additive migrations; prove role, tenant, unique-occurrence, lease-fencing, heartbeat, stale-worker, cancellation, retry, and step-idempotency invariants. Do not use remote data as a substitute.
2. Propagate the stable occurrence/step idempotency key into a small, explicitly selected provider-effect adapter and prove duplicate/replay behavior before enabling any occurrence executor.
3. Complete the Python/Modal caller inventory with runtime shadow telemetry and negative-path callback tests; keep policy enforcement disabled until the inventory and telemetry gates pass.
4. Add feature-flagged durable run read/control services without changing existing conversation responses.
5. Build a measured OpenRouter/Agents SDK/prompt-cache compatibility harness before any SDK or cache-composition migration.
6. Capture the current Chippy workspace UI only if an authenticated non-production/local surface is safely available; re-audit without advancing any critical score below 9.

## Anti-loop control

- **Last verified state:** Python/Modal grant propagation and disabled occurrence/step-idempotency seams passed focused and full local suites; TypeScript compilation and diff whitespace validation passed. Disposable database validation is blocked by unavailable local Docker/Postgres.
- **Duplicate-work check:** before each work item, inspect this ledger, `git diff`, current tests, and prior reviewer findings; do not reopen a closed lane without new evidence.
- **Autonomous loop stop conditions:** cancellation requested; terminal state; wall/cycle/token budget exhausted; tool or child quota exhausted; repeated observation; repeated no-progress; verification failure requiring input; approval required.
- **Retry rule:** retry only a persisted occurrence/job with remaining budget, explicit backoff, and idempotent completed steps. Never retry an entire side-effecting workflow merely because a watermark stayed due.
- **Escalate instead of retry:** material security ambiguity; migration/tenant invariant failure; missing durable correlation; unavailable authoritative dependency; repeated identical failure; required production/runtime evidence; any critical quality score below 9 at a stage boundary.
- **Rejected/repeated approaches:** permanent sandbox as durability; `requiresApproval === false` as read-only; prompt-only “draft mode”; unsigned run-mode body fields; timeout-as-acceptance; no-op status heartbeats; remote build churn; broad UI redesign; blind whole-workflow retries.

## Experiments and feature flags

| Flag | Default | Purpose | Rollback |
|---|---|---|---|
| `AGENT_RUN_POLICY_MODE` | `shadow` | observe legacy callers, then enforce signed grants | set `shadow`; unattended writes still must remain disabled |
| `DURABLE_AGENT_RUNS_ENABLED` | unset/off (planned) | dual-write new run protocol | disable new writer/reader, retain rows |
| `DURABLE_AGENT_WORKSPACE_ENABLED` | unset/off (planned) | new task workspace UI | return to legacy conversation/Work Session UI |
| `REALTIME_VOICE_GATEWAY_ENABLED` | unset/off (planned) | server-managed Realtime control plane | hide voice control, preserve text/task state |
| `CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED` | unset/off | let eligible chat and Realtime turns continue the completed private Workspace linked to their conversation | unset; existing Workspace Runs and chat/voice behavior remain intact |
| `DURABLE_SCHEDULE_OCCURRENCES_ENABLED` | unset/off | permit a future occurrence executor only after DB/provider fault gates | unset; legacy schedule behavior is untouched |

## Verification record — append only

| ID | Date | Evidence | Result |
|---|---|---|---|
| V001 | 2026-07-28 | `./node_modules/.bin/tsc --noEmit` after initial policy/schema edits | pass |
| V002 | 2026-07-28 | `pnpm typecheck` wrapper | blocked before typecheck by ignored dependency build-script policy; no source failure |
| V003 | 2026-07-28 | safe configuration-name review | Modal references `chippi-secrets`; OpenAI/OpenRouter env names and routing seams found; no value read |
| V004 | 2026-07-28 | focused policy/failure/state-machine suite | 108 tests passed across 10 files |
| V005 | 2026-07-28 | direct `tsc --noEmit` after V004 | pass |
| V006 | 2026-07-28 | independent Terra policy review | found caller-migration blocker, signed-token shadow fail-open, Redis claim window, retry-duplication risk, and dispatch skip; accepted and remediated/recorded |
| V007 | 2026-07-28 | independent migration review | found cross-tenant child references, parent capability drift, lease index, and lifecycle integrity gaps; migration revised, DB execution still pending |
| V008 | 2026-07-28 | `supabase db lint --local` | blocked: no local Postgres on 127.0.0.1:54322; no remote fallback used |
| V009 | 2026-07-28 | focused suite after team-message policy coverage | 111 tests passed across 11 files; direct `tsc --noEmit` and `git diff --check` passed |
| V010 | 2026-07-28 | Python/Modal caller inventory and focused grant suite | dispatcher, curated tools, tour-calendar mirror, and team-message caller paths now emit a per-call grant; 11 focused Python tests and `compileall` pass; no Modal runtime invoked |
| V011 | 2026-07-28 | disposable local database discovery | blocked: Supabase cannot reach Docker daemon; `pg_isready` reports no service on 127.0.0.1:54321 or :54322. No remote database was contacted. |
| V012 | 2026-07-28 | Python/Modal grant and TypeScript endpoint seam regression | 15 targeted Vitest tests, 11 focused Python tests, `tsc --noEmit`, and `git diff --check` pass; Python-issued grant verifies in TypeScript and tenant/subject mismatch is denied. |
| V013 | 2026-07-28 | full local regression after grant + occurrence seam | full Vitest suite and `agent/.venv/bin/python -m pytest -q agent/tests` pass (211 Python tests); expected fixture warnings only. |
| V014 | 2026-07-28 | durable occurrence/step pure-contract suite | 5 tests pass: tenant-scoped occurrence key, version drift refusal, completed-step replay skip, retry/dead-letter/cancel states, stale lease-generation refusal, and feature-off default. SQL RPC execution remains unverified. |
| V015 | 2026-07-29 | Loop 3 independent product/control review | rejected three drafts for unconditional capability exposure, incorrect chat retry identity, reload continuity, same-run panel staleness, false failure after durable acceptance, Realtime fail-closed regression, non-atomic retry conflict, and insufficient executable evidence; all findings were reworked before final acceptance |
| V016 | 2026-07-29 | Workspace continuation focused acceptance | 49 focused tests, direct `tsc --noEmit`, and `git diff --check` pass; independent reviewer accepted server-derived run selection, tenant/reserved denial, conditional chat/voice schemas, dual-event dedupe, transcript continuity, same-run refresh, and accepted-work truthfulness |
| V017 | 2026-07-29 | disposable socket-only PostgreSQL conflict test | one winning enqueue created one task; an equivalent normalized retry reused it; a changed-instruction retry raised the stable idempotency conflict; final task count remained one; temporary cluster was stopped and removed |
| V018 | 2026-07-29 | full local regression after Loop 3 | 568 Vitest files passed: 5,136 tests passed and 1 skipped; expected negative-fixture warnings only |

## Deployment and rollback notes

- No deployment is authorized.
- Migration is additive and must be reviewed/dry-run before preview.
- New lifecycle must dual-write while legacy readers remain functional.
- Enforce run policy only after every trusted caller propagates a signed grant and shadow telemetry is clean.
- Keep old Modal path behind a kill switch until 202/callback parity and crash recovery pass.
- Never delete run/event/proposal history during rollback.
- Remote builds are deferred; batch a deployment-ready change only after local gates.

## Blockers and assumptions

- Modal secret presence is inferred from configuration references; live secret contents were not accessed. Runtime availability is **RU**.
- OpenAI Realtime gateway and current API behavior require official-doc conformance and synthetic runtime validation.
- New migration has not been applied or executed against a database.
- Existing customer UI has not yet been interaction-audited in this implementation phase.
- Python autonomous callers mint/forward per-call grants for dispatcher, curated, tour-calendar, and team-message routes. Runtime Modal secret availability and end-to-end callback verification remain **RU**; `enforce` is still blocked on runtime validation and complete shadow telemetry.
- The Python reviewed-read list mirrors `lib/integrations/action-policy.ts`; it is a deliberate temporary duplicate. Add a parity/generation check before `enforce`, and treat any drift as a release gate failure.
- Returned-failed scheduled workflows still advance the legacy watermark intentionally until occurrence-based, resumable, idempotent step retry is implemented; this audit finding is not closed.
- `ScheduleOccurrence` and `ScheduleOccurrenceStep` now have a feature-off TypeScript/SQL contract with unique tenant-scoped occurrence identity, lease generation, expiry checks, cancellation, bounded retry, and stable step keys. The migration is unexecuted, no cron/executor calls it, and provider crash-after-effect-before-step-completion remains a release blocker.
- Python pins a pre-1.0 `openai-agents` range and uses a custom OpenRouter adapter; API currency, provider behavior, tracing, prompt-cache correctness/hit rate/latency/cost, and upgrade rollback remain unverified.
- Notion pages remain privately owned because the connector cannot grant access.

## Product discovery shortlist

Rank 1–5 (higher is better); risk is inverse (5 = low risk).

| Concept | Leverage | Feasibility | Risk | Dependency | Coherent slice |
|---|---:|---:|---:|---|---|
| Deal Command Thread: one durable task graph per live deal with next-best work, evidence, approvals, and artifacts | 5 | 4 | 4 | durable runs + existing Deal data | run timeline + proposal + artifact |
| Brokerage Pulse: tenant-safe rollup of stuck/at-risk work with drill-down delegation | 5 | 3 | 3 | broker permissions + child tasks | read-only pulse → scoped child investigation |
| Voice Floor Manager: ask status, delegate follow-up research, approve drafts, cancel/retry | 5 | 3 | 3 | voice gateway + run APIs | restricted control tools only |
| Transaction Room Artifact Pack: gather files, checklist gaps, deadlines, and draft a review packet | 5 | 4 | 4 | sandbox artifacts + existing documents/deals | pure-read gather → document artifact |
| Trigger-to-Trust Inbox: every external signal becomes explainable event → task/proposal with dedupe and provenance | 4 | 4 | 4 | durable inbox/outbox | Gmail/calendar event → proposal |

Do not add these as disconnected features. The durable task graph, proposal boundary, and artifact model are the shared product spine.

## Changelog — append only

- 2026-07-28: Created branch and staged plan; verified runtime credential/routing configuration names without reading secrets.
- 2026-07-28: Added explicit unattended read allowlist, typed proposal contract, signed run-policy primitives, and shadow endpoint checks.
- 2026-07-28: Corrected Redis/dispatch/workflow failure semantics locally.
- 2026-07-28: Added additive durable run/thread/event/proposal/artifact/occurrence/inbox/outbox migration draft.
- 2026-07-28: Direct local TypeScript check passed; no remote build or deployment.
- 2026-07-28: Added bounded autonomous-loop and restricted child-delegation policy with tests.
- 2026-07-28: Independent reviews found and drove fixes for signed-token shadow bypass, migration tenant integrity, parent permission drift, Redis configured-outage handling, and dispatch retry semantics.
- 2026-07-28: Preserved legacy workflow watermark behavior to avoid duplicating successful earlier steps; occurrence/idempotent retry remains a no-go dependency.
- 2026-07-28: Added focused team-message run-policy tests; 111 tests, direct TypeScript compilation, and diff checks pass. Recorded the SDK/provider/cache compatibility harness as a prerequisite to framework migration.
- 2026-07-28: Published the full Frontier Quality Gate and current execution-control checkpoint to the dedicated Notion workspace; overview, evidence, and roadmap pages were substantively updated and verified.
- 2026-07-28: Propagated narrow signed grants through Python/Modal internal integration and team-message callers; autonomous write attempts now stop locally before an HTTP call, while run-policy endpoint rollout remains shadow. Added 11 focused Python grant/correlation tests and compile validation.
- 2026-07-28: Independently hardened Python-issued grants with TypeScript compatibility and subject-binding checks at integration/message endpoints. Added a feature-off `ScheduleOccurrence`/step-idempotency seam with tenant-scoped occurrence keys, expiry/fencing checks, definition-version refusal, and stale-worker protection; legacy cron and watermark behavior remain unchanged. Disposable DB validation is blocked by unavailable local Docker/Postgres; full local regression and 211 Python tests pass.
- 2026-07-29: Removed the customer-facing Draft Mode label and shipped the feature-off Chippi Workspace path: a completed private Workspace Run can be continued from its right panel in a fresh no-network Modal VM with fixed inspect/apply/validate phases and private artifacts.
- 2026-07-29: Added the feature-off chat and OpenAI Realtime Voice control adapters for that same durable Workspace. The server derives the completed run from the authenticated tenant conversation; the model and browser never choose a run ID. Accepted voice work is persisted to the conversation and immediately refreshes the existing Workspace panel.
- 2026-07-29: The feedback loop rejected and repaired eight concrete defects before acceptance, including a database-level concurrent idempotency race. No production deployment, customer-data mutation, or outbound action occurred.
