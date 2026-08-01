# Chippy Frontier Execution Ledger

Canonical handoff for the durable-agent/workspace initiative. Update after every material decision or milestone. Never add secrets, credential values, customer data, or production-derived payloads.

**Status:** capability A typed managed-workspace interpreter, capability B durable in-conversation specialist tree, the editable Workspace CSV → Workbench bridge, and feature-off Realtime Voice specialist status/cancellation are accepted locally. Durable base-Workspace launch receipts and stale-run recovery are verified locally and on the dedicated staging database; application activation remains NO-GO and not deployed.
**Branch:** `codex/chippi-research-workspace`
**Latest accepted product commit:** `90003e32d1daf91b4707a06ae7fac4284c89e72f`
**Cycle baseline for capability B:** `a00bb4999bfd1c4c5637bb43c869da7d87600d38`
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
| D017 | Managed Workspace continuation plans may select only closed typed operations whose commands, paths, artifacts, and limits are derived and revalidated by the server and fixed interpreter | Broadens useful Chippi work without granting arbitrary shell, host, network, or production authority | independently accepted locally; feature-off and runtime-unverified |
| D018 | Persist a bounded specialist task tree in the existing Chippi conversation, with 2–6 planner-normalized children, concurrency ceiling 6, maximum child depth 1, monotonic terminal hydration, tenant-scoped reload, cooperative cancellation, and one combined outcome | Gives the user a visible, controllable parallel work surface without granting children tools or treating a request timeout as execution truth | independently accepted locally in `14ff36a2`; activation NO-GO pending durable launch acknowledgement/reconciliation and live runtime proof |
| D019 | Let an authenticated user explicitly open a completed root/task Workspace CSV as one immutable, tenant-scoped Workbench source, then edit, version, revisit, and export it through the existing right panel | Turns the typed interpreter’s CSV output into a reusable deliverable without mutating the private source or inventing attachment provenance; repeated opens reuse one mapped artifact | independently accepted locally in `ebcbec6c`; feature-off, migration unapplied, and runtime-unverified |
| D020 | Let an attached authenticated Realtime Voice session ask for coarse status and explicitly cancel the latest conversation-bound specialist task without accepting a run ID or exposing task content to the provider | Makes voice a truthful floor-manager for the same durable specialist card while preserving tenant binding, provider-call idempotency, privacy, and a server-selected control target | independently accepted locally in `90003e32`; separate default-off flag, migration unapplied, and browser/provider runtime unverified |
| D021 | Treat a Modal `202`, timeout, and worker callback as separate observations backed by an immutable launch receipt, fenced launch token, bounded lease recovery, and visible continuity state | Closes the crash window where an accepted request could disappear or be retried as duplicate compute; the browser may leave without owning execution | acceptance candidate verified locally and on staging; feature remains default-off and application/runtime activation is NO-GO |

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
| Workspace UX | Sol controller + bounded Terra lane | capability B accepted locally | authenticated non-customer demo only after activation gates |
| Prompt caching/provider audit | unassigned | pending | measured harness, not config inspection |

## Exact next safe actions

1. Keep capability B and Workspace recovery application code inactive. The receipt/lease SQL now passes the staging fault matrix, but no application or Modal runtime was deployed with it.
2. Produce one cached staging application build only after this acceptance candidate is committed and the migration inventory is reconciled. Keep `CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED` unset during deployment.
3. In an authenticated non-customer staging browser, enable only the allowlisted space and prove launch → leave/reload → same-run recovery → cancellation, including visible status copy and no duplicate provider effect.
4. Record acceptance latency, recovery latency, candidate age, duplicate-effect count, sweep cost, and browser accessibility evidence. Enable recurring recovery only if every critical score is at least 9 and the kill switch is proven.
5. Before enabling the editable Workspace CSV bridge, apply its additive migration to a disposable current-schema database, prove two concurrent opens return one artifact, add the remaining run/source-file predicates to the RPC reuse query, then run the authenticated CSV → edit → save v2 → history → XLSX → repeated-open demo with the source unchanged.
6. Before enabling Realtime Voice floor-manager controls, apply `20260915000006_realtime_swarm_floor_manager.sql` only to a disposable current-schema database, verify compatibility with existing Swarm rows, then run an authenticated non-customer status → explicit cancel → card-refresh → reload demo. Keep raw task content out of provider output.
7. After those runtime gates, extend the same versioned deliverable contract to the grounded narrative artifact. The next substantial Voice target is bounded conversation-linked specialist redirect/retry with durable command receipts and no model-selected identifiers, contingent on capability-B durable launch acknowledgement/reconciliation.

## Anti-loop control

- **Last verified state:** durable base-Workspace launch recovery has immutable attempt receipts, fenced acceptance, action-bound recovery candidates, a 25-run ceiling, candidate-age and cycle-duration telemetry, default-off/kill-switch rollout, status/alert semantics, exact worker-attempt callback binding, enabled-space query scoping, and fail-closed dependency reads. Thirty-eight focused tests, the full 581-file Vitest suite (5,233 passed; 1 skipped), all 230 agent Python tests, and TypeScript compilation pass. The dedicated `chippistaging` database accepted the additive migration and a rollback-only fault matrix proved claim contention, duplicate acceptance, token mismatch denial, accepted-silent failure, cancellation precedence, lease renewal, recovery action selection, enabled-space isolation, RLS, and role revocation. The application, Modal runtime, production database, customer data, and production deployment were not touched.
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
| `CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED` | unset/off | expose conversation-bound specialist status/cancel tools only in attached Realtime sessions | unset; legacy Voice tools and persisted specialist state remain intact |
| `CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED` | unset/off | let eligible chat and Realtime turns continue the completed private Workspace linked to their conversation | unset; existing Workspace Runs and chat/voice behavior remain intact |
| `CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED` | unset/off | expose durable launch receipts and allow the bounded stale-run reconciler to re-enter existing idempotent phases | unset; no receipt read or recovery sweep occurs, and existing Workspace behavior remains intact |
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
| V019 | 2026-07-29 | staging-only Supabase migration and idempotency canary | applied `workspace_run_task_idempotency_conflict` to project `xaumaqkwswkxnlecbypt`; an equivalent normalized retry reused completed task `66d53f1b-4bbd-498b-9d50-ee19af27ddeb`, a changed-instruction retry was rejected, and the key still owns exactly one unchanged task |
| V020 | 2026-07-29 | single cached Vercel staging deployment | deployment `dpl_59dz3PCUz45zia2bSkV5BL1uHNRj` reached `READY` and stable staging alias `chippistaging-mosnins-projects.vercel.app`; root/session requests met the existing authentication boundary and no runtime error cluster was reported. An authenticated microphone/chat interaction remains unverified because no authenticated staging browser session was used. |
| V021 | 2026-07-29 | corrected 100× Product Loop cycle 1: typed managed-workspace interpreter | accepted after the independent reviewer rejected and the implementation lane repaired five material issues: migration/rollback compatibility, atomic enqueue regression, legacy in-flight completion, repeated-continuation validation, and pre-upload manifest validation. Controller verification passed 13 focused tests, 50 Workspace/chat/voice tests, 3 Python interpreter-demo tests, 222 agent tests, direct TypeScript compilation, diff hygiene, and the full 568-file Vitest suite (5,139 passed; 1 skipped). Markdown, numerically sorted CSV, and structured JSON artifacts are visible through the existing task/panel contract. No database, Modal runtime, deployment, customer data, or external system was touched. |
| V022 | 2026-07-29 | corrected 100× Product Loop cycle 2: durable specialist task tree | the independent reviewer first rejected non-absorbing terminal hydration, worker cancellation races, terminal cancel response mismatch, partial plan visibility, and swallowed child exceptions. Follow-up review also caught partial-snapshot member loss, missing `DATABASE_URL` activation truth, synchronous timeout-as-ack, and a GET/SSE terminal-result race. The implementation lane repaired all findings; final independent Sol review accepted with no remaining acceptance blocker. Focused acceptance passed 18 Vitest tests and 8 pytest tests. Controller regression passed the full 572-file Vitest suite (5,157 passed; 1 skipped), all 230 agent Python tests, direct `tsc --noEmit`, and `git diff --check`. No database, Modal, deployment, Vercel build, customer data, communication, or external provider runtime was touched. |
| V023 | 2026-07-29 | capability-B evidence scan | local corpus evidence supported shared state, progress, termination, and verification for reliable multi-agent work. Official OpenAI product evidence supported parallel agents, visible progress/direction, stop controls, and editable artifacts. The required local Neon packet lookup was attempted and blocked because no authorized `DATABASE_URL` or runtime descriptor was available; no external acquisition was repeated and no database was contacted. |
| V024 | 2026-07-29 | corrected 100× Product Loop cycle 3: completed Workspace CSV → editable Workbench | accepted product commit `ebcbec6c` adds an explicit Open in Workbench action for completed root/task CSVs, a tenant/source mapping with atomic reuse, distinct workspace-file provenance, bounded private-object streaming, truthful version receipts, and the existing edit/save/history/XLSX journey. Independent review rejected seven concrete defects; the same bounded implementation lane repaired all of them and the reviewer accepted with no remaining P0–P2 finding. Controller verification passed 14 focused Vitest files / 99 tests, direct TypeScript compilation, diff hygiene, and package-manager cleanliness. The reviewer separately passed 17 files / 110 tests. The migration remains unapplied; database concurrency, private storage, browser interaction, staging, and production are unverified. |
| V025 | 2026-07-29 | cycle-3 product evidence refresh | the local corpus and current source contracts showed the typed CSV was downloadable but not an editable Workspace deliverable. Current official OpenAI evidence supported parallel durable work, conversation-persistent editable blocks/canvas, version history/diffs, and Realtime function controls. The required Neon lookup was attempted through the connected resource search and returned `INVALID_ARGUMENT` twice; no raw database call or duplicate acquisition followed. |
| V026 | 2026-07-29 | corrected 100× Product Loop cycle 4: Realtime Voice specialist floor manager | accepted product commit `90003e32` links future specialist runs to their conversation and adds independently default-off `get_specialist_status` and `cancel_specialist_task` Realtime tools. The model/browser never selects a run; provider-facing output is an exact coarse allowlist. Cancellation uses a tenant/conversation/call receipt, a database call-time cutoff, terminal-only fallback, atomic state/event/receipt writes, and truthful retry outcomes. Independent review first rejected private task content exposure and a concurrent newer-run misclassification; the same implementation lane repaired both and the reviewer accepted with no P0–P3 finding. Controller verification passed 12 focused files / 68 tests, the full 577-file Vitest suite (5,215 passed; 1 skipped), direct TypeScript compilation, shell syntax, and diff hygiene. A disposable PostgreSQL 18 socket-only forced-race proof verified cutoff binding, receipt reuse, later-run survival, distinct-call cancellation, and exactly one event; the cluster was removed. Migration application to the actual environment, browser interaction, live Realtime provider, staging, and production remain unverified. |
| V027 | 2026-08-01 | durable base-Workspace launch recovery acceptance candidate | 8 focused files / 38 tests, the full 581-file Vitest suite (5,233 passed; 1 skipped), all 230 agent Python tests, Python compile validation, and direct `tsc --noEmit` pass. The additive receipt/recovery migration, tenant-FK index, and enabled-space recovery scope were applied only to Supabase project `xaumaqkwswkxnlecbypt` (`chippistaging`). A transaction-rollback fault matrix passed duplicate claim fencing, duplicate acceptance, token mismatch denial, exact worker-attempt callback binding, receipt idempotency, accepted-silent failure, cancellation authority, two monotonic lease attempts, plan/execute candidate selection, enabled-space isolation, age telemetry, RLS, role revocation, and index presence. Supabase advisors found no ERROR/WARN tied to the new table/functions; the intentional service-only table has an informational no-policy notice, and newly created indexes are informationally unused until runtime. |
| V028 | 2026-08-01 | rendered experience validation attempt | blocked before application startup because the managed workspace denied both `0.0.0.0:3010` and `127.0.0.1:3010` with `EPERM`. No browser, screenshot, responsive, keyboard, or authenticated interaction claim was made; the experience gate remains NO-GO. |
| V029 | 2026-08-01 | Company OS project-instance repair | controller-governed upgrade archived obsolete schema-5 work/quality/adaptation state and produced schema 8 / core 2.5. The installed controller passed all 98 tests. The fresh audit is intentionally fail-closed at `reality_audit`: zero active work, scheduling disabled, runtime fabric unconfigured, and protected-launcher prerequisite unmet. No quality score or autonomous readiness was fabricated. |
| V030 | 2026-08-01 | staging migration inventory reconciliation | the connected Supabase migration inventory for dedicated project `xaumaqkwswkxnlecbypt` contains `workspace_launch_receipts`, `workspace_launch_receipt_space_index`, and `workspace_recovery_allowlist_scope`. This was a read-only reconciliation; production was not queried or changed. |

## Deployment and rollback notes

- The accepted Loop 3 commit is deployed to the dedicated Chippi staging project only. Production/customer deployment remains unauthorized.
- The capability A typed interpreter added after Loop 3 is local and feature-off only; its migration and Modal/callback runtime have not been applied or invoked.
- Capability B commit `14ff36a2` is local-only and not deployed. It has no new activation flag of its own, so application/Modal deployment is prohibited until the explicit NO-GO gates below are closed.
- Realtime Voice floor-manager commit `90003e32` is local-only, separately default-off, and not deployed. Its additive migration is unapplied outside the disposable proof; do not enable it until the authenticated non-customer runtime demo and capability-B activation gates pass.
- The additive Workspace continuation migration is applied to staging only; the production database is untouched.
- The additive base-Workspace launch-receipt/recovery migration is applied to `chippistaging` only. Its application code is not deployed or enabled; production is untouched.
- New lifecycle must dual-write while legacy readers remain functional.
- Enforce run policy only after every trusted caller propagates a signed grant and shadow telemetry is clean.
- Keep old Modal path behind a kill switch until 202/callback parity and crash recovery pass.
- Never delete run/event/proposal history during rollback.
- Remote builds are deferred; batch a deployment-ready change only after local gates.

## Blockers and assumptions

- Modal secret presence is inferred from configuration references; live secret contents were not accessed. Runtime availability is **RU**.
- Capability B activation remains **NO-GO**. Base Workspace now has a staged short-acceptance receipt/recovery contract, but the specialist-tree launcher, live Modal execution, authenticated reload/cancellation journey, and provider duplicate-effect proof remain runtime-unverified.
- OpenAI Realtime gateway and current API behavior require official-doc conformance and synthetic runtime validation.
- The Workspace continuation task/idempotency migrations have been executed against the dedicated staging database. The separate durable schedule-occurrence migration remains unexecuted outside disposable local PostgreSQL.
- Existing customer UI has not yet been interaction-audited in this implementation phase.
- Python autonomous callers mint/forward per-call grants for dispatcher, curated, tour-calendar, and team-message routes. Runtime Modal secret availability and end-to-end callback verification remain **RU**; `enforce` is still blocked on runtime validation and complete shadow telemetry.
- The Python reviewed-read list mirrors `lib/integrations/action-policy.ts`; it is a deliberate temporary duplicate. Add a parity/generation check before `enforce`, and treat any drift as a release gate failure.
- Returned-failed scheduled workflows still advance the legacy watermark intentionally until occurrence-based, resumable, idempotent step retry is implemented; this audit finding is not closed.
- Typed multi-artifact callbacks validate the complete manifest before upload and publish atomically at the database boundary. A storage failure after an earlier private object upload can leave an invisible orphan object; add compensating deletion or a single staged manifest boundary before treating storage cleanup as complete.
- Rollback from an enabled typed-interpreter release must first gate off new continuations and drain typed in-flight tasks before older application bytes are restored. The new migration preserves legacy rows and completion, but old application bytes do not understand typed tasks.
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
- 2026-08-01: Added and staging-validated feature-off Workspace launch receipts, bounded stale-run recovery, candidate-age/duration telemetry, fail-closed receipt reads, accessible continuity status, and the tenant foreign-key index. Production and application deployment remain untouched.
- 2026-07-28: Preserved legacy workflow watermark behavior to avoid duplicating successful earlier steps; occurrence/idempotent retry remains a no-go dependency.
- 2026-07-28: Added focused team-message run-policy tests; 111 tests, direct TypeScript compilation, and diff checks pass. Recorded the SDK/provider/cache compatibility harness as a prerequisite to framework migration.
- 2026-07-28: Published the full Frontier Quality Gate and current execution-control checkpoint to the dedicated Notion workspace; overview, evidence, and roadmap pages were substantively updated and verified.
- 2026-07-28: Propagated narrow signed grants through Python/Modal internal integration and team-message callers; autonomous write attempts now stop locally before an HTTP call, while run-policy endpoint rollout remains shadow. Added 11 focused Python grant/correlation tests and compile validation.
- 2026-07-28: Independently hardened Python-issued grants with TypeScript compatibility and subject-binding checks at integration/message endpoints. Added a feature-off `ScheduleOccurrence`/step-idempotency seam with tenant-scoped occurrence keys, expiry/fencing checks, definition-version refusal, and stale-worker protection; legacy cron and watermark behavior remain unchanged. Disposable DB validation is blocked by unavailable local Docker/Postgres; full local regression and 211 Python tests pass.
- 2026-07-29: Removed the customer-facing Draft Mode label and shipped the feature-off Chippi Workspace path: a completed private Workspace Run can be continued from its right panel in a fresh no-network Modal VM with fixed inspect/apply/validate phases and private artifacts.
- 2026-07-29: Added the feature-off chat and OpenAI Realtime Voice control adapters for that same durable Workspace. The server derives the completed run from the authenticated tenant conversation; the model and browser never choose a run ID. Accepted voice work is persisted to the conversation and immediately refreshes the existing Workspace panel.
- 2026-07-29: The feedback loop rejected and repaired eight concrete defects before acceptance, including a database-level concurrent idempotency race. No production deployment, customer-data mutation, or outbound action occurred.
- 2026-07-29: Applied the atomic Workspace continuation idempotency replacement to the dedicated staging database, proved equivalent retry reuse and changed-instruction rejection without creating a second task, and deployed accepted commit `abf30a2f` once to the cached Vercel staging target. Production and customer data remain untouched.
- 2026-07-29: Replaced the paused, wrong-checkout recurring review with an active 25-minute Chippi product loop. A cycle only counts substantial visible agent/chat capability as progress, requires independent rejection/acceptance and controller inspection, and is forbidden from triggering Vercel builds or production/customer changes.
- 2026-07-29: Completed corrected 100× Product Loop cycle 1 locally. The feature-off Workspace continuation now executes 2–3 server-validated typed operations in the existing fresh, bounded, no-network Modal VM and can return a grounded Markdown report, bounded/sorted comps CSV, and structured JSON action register. The existing Workspace panel shows operation types, fixed commands, live status/events, cancellation, reload-persisted state, and artifact links. An independent Sol review rejected five defects; the same bounded Terra implementation lane repaired them, the controller added a fail-closed legacy discriminator and exact typed-operation count, and Sol accepted the final diff.
- 2026-07-29: Completed corrected 100× Product Loop cycle 2 in accepted product commit `14ff36a2`. From the existing conversation, a persisted specialist-task block can represent 2–6 bounded depth-1 specialists, show truthful member progress and results, recover the tree and combined outcome after reload, and cooperatively stop active work. The independent review rejected four successive classes of lifecycle/race defects before final acceptance; all were repaired and covered by executable reducer, route, launch-observer, planner-bound, and Python transition tests. Activation remains NO-GO; no deployment or external runtime was invoked.
- 2026-07-29: Completed corrected 100× Product Loop cycle 3 in accepted product commit `ebcbec6c`. A completed Workspace or continuation CSV now has an explicit, feature-off Open in Workbench path that creates or reuses one tenant-scoped immutable copy in the existing right panel; the user can edit cells, save new versions, revisit history, and export XLSX without changing the source. Independent review rejected kill-switch, download-boundary, provenance, database-error, source-identity, rate-limit, and source-schema defects before final acceptance. No migration, database, storage runtime, browser runtime, deployment, customer data, communication, or provider call occurred.
- 2026-07-29: Completed corrected 100× Product Loop cycle 4 in accepted product commit `90003e32`. An attached Realtime Voice session can ask for coarse status and explicitly cancel the latest conversation-linked specialist task; the existing card refreshes from durable state. Independent review rejected private task text crossing the provider boundary and a concurrent newer-run receipt race; both were repaired and proven with a forced disposable PostgreSQL interleaving before acceptance. The capability and migration remain feature-off/unapplied, and no browser, provider, remote database, deployment, customer data, communication, or production system was touched.

## Corrected 100× Product Loop — exact next action

Do not activate or deploy capability B, the Workspace CSV → Workbench bridge, or Realtime Voice floor-manager controls. First close capability B’s short durable accepted/queued launch acknowledgement, run-ID reconciliation, `DATABASE_URL`/atomic transition, reload, and cancel/completion-race gates. Separately validate both unapplied product migrations against a disposable current schema, including the CSV RPC’s exact `runId`/`sourceFileId` reuse predicates. Then, only in an explicitly authorized authenticated non-customer runtime, run the persisted specialist-tree Voice status → explicit cancel → card refresh → reload demo and the complete CSV edit/version/export journey. The next substantial product slice is bounded conversation-linked specialist redirect/retry with durable command receipts and no model-selected identifiers; do not start it until the launch/reconciliation dependency is addressed. Stop on any mismatch and do not advance to production.
