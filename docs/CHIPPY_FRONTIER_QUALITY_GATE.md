# Chippy Frontier Quality Gate

No stage advances unless every applicable **critical** dimension is at least **9/10**. Security is no-go with any unresolved material issue. Every score below 9 has an owner/remedy/verification below. Scores are evidence, not optimism.

Evidence: **SR** source review · **LT** local test · **UI** captured interaction · **RU** unverified runtime assumption.
Current stage assessed: **A — trust boundary + durable protocol foundation**.

Owner codes: **SOL** architecture/security lead · **ENG** implementation · **UX** product design/accessibility · **OPS** runtime/observability.
Remedy codes are defined after the matrix.

| Category / dimension | Critical | Score | Evidence | Gap plan |
|---|:---:|---:|---|---|
| Product — brokerage relevance |  | 8 | SR | SOL/P1/T1 |
| Product — differentiated value |  | 7 | SR | SOL/P1/T1 |
| Product — proactive leverage |  | 7 | SR | SOL/P1/T1 |
| Product — workflow completion | ✓ | 5 | SR | ENG/R1/T2 |
| Product — agent trust | ✓ | 5 | SR | SOL/R2/T3 |
| Product — strategic coherence |  | 8 | SR | SOL/P1/T1 |
| Experience — first-run clarity |  | 4 | RU | UX/U1/T4 |
| Experience — conversation quality |  | 6 | SR/RU | UX/U2/T5 |
| Experience — task visibility | ✓ | 6 | SR | ENG/U3/T4 |
| Experience — sidebar/workspace IA |  | 5 | SR/RU | UX/U3/T4 |
| Experience — mobile/responsive viability |  | 4 | RU | UX/U4/T4 |
| Experience — accessibility | ✓ | 4 | RU | UX/U4/T4 |
| Experience — error/empty/loading states |  | 6 | SR | UX/U5/T4 |
| Experience — cognitive load |  | 5 | RU | UX/U3/T4 |
| Experience — interaction latency | ✓ | 5 | SR/RU | ENG/E1/T6 |
| Experience — visual craft |  | 5 | RU | UX/U6/T4 |
| Experience — brand cohesion |  | 6 | RU | UX/U6/T4 |
| Human — agency/consent | ✓ | 6 | SR | SOL/R2/T3 |
| Human — explainability | ✓ | 6 | SR | UX/U7/T4 |
| Human — reversibility | ✓ | 5 | SR | ENG/R3/T7 |
| Human — interruption/resumption | ✓ | 4 | SR | ENG/R1/T2 |
| Human — confidence calibration |  | 5 | SR/RU | SOL/A1/T8 |
| Human — escalation behavior | ✓ | 6 | SR | SOL/A1/T8 |
| Human — user control | ✓ | 6 | SR | UX/U7/T4 |
| Agent — planning quality |  | 6 | SR/LT | SOL/A2/T8 |
| Agent — task decomposition |  | 6 | SR/LT | SOL/A2/T8 |
| Agent — delegation quality | ✓ | 3 | SR | SOL/A3/T9 |
| Agent — context/memory relevance |  | 6 | SR | ENG/A4/T8 |
| Agent — tool selection | ✓ | 5 | SR/LT | ENG/R2/T3 |
| Agent — artifact quality |  | 6 | SR/LT | UX/A5/T10 |
| Agent — continuous-run continuity | ✓ | 3 | SR | ENG/R1/T2 |
| Agent — recovery | ✓ | 4 | SR | ENG/R1/T2 |
| Agent — calibration |  | 5 | SR/RU | SOL/A1/T8 |
| Agent — anti-hallucination safeguards | ✓ | 5 | SR | SOL/A1/T8 |
| Reliability — durable state | ✓ | 5 | SR; migration unrun | ENG/R1/T2 |
| Reliability — idempotency | ✓ | 5 | SR | ENG/R4/T11 |
| Reliability — retries | ✓ | 5 | SR | ENG/R1/T2 |
| Reliability — ordering | ✓ | 5 | SR; migration unrun | ENG/R5/T11 |
| Reliability — concurrency | ✓ | 4 | SR | ENG/R5/T11 |
| Reliability — cancellation | ✓ | 4 | SR | ENG/R3/T7 |
| Reliability — observability | ✓ | 6 | SR | OPS/O1/T12 |
| Reliability — failure acknowledgement | ✓ | 8 | SR/LT | ENG/R6/T13 |
| Reliability — disaster/rollback readiness | ✓ | 6 | SR | OPS/O2/T14 |
| Security — tenant isolation | ✓ | 7 | SR/LT | SOL/S1/T15 |
| Security — authentication/authorization | ✓ | 6 | SR; policy shadow | SOL/S2/T3 |
| Security — least privilege | ✓ | 5 | SR; edits untested | SOL/S2/T3 |
| Security — prompt-injection resistance | ✓ | 4 | SR | SOL/S3/T16 |
| Security — secret handling | ✓ | 7 | SR | SOL/S4/T17 |
| Security — data minimization | ✓ | 5 | SR | SOL/S5/T17 |
| Security — auditability | ✓ | 6 | SR | OPS/O1/T12 |
| Security — sandbox isolation | ✓ | 3 | SR/RU | SOL/S6/T18 |
| Integration — tool schema quality |  | 7 | SR/LT | ENG/I1/T19 |
| Integration — permission model | ✓ | 5 | SR; edits untested | SOL/S2/T3 |
| Integration — connector health | ✓ | 5 | SR/RU | OPS/I2/T20 |
| Integration — action confirmation | ✓ | 5 | SR | UX/U7/T4 |
| Integration — idempotency/callback integrity | ✓ | 3 | SR | ENG/R4/T11 |
| Integration — degraded-mode behavior | ✓ | 5 | SR | ENG/I2/T20 |
| Efficiency — model/token cost |  | 6 | SR/RU | ENG/E2/T21 |
| Efficiency — latency | ✓ | 5 | SR/RU | ENG/E1/T6 |
| Efficiency — queue/worker efficiency |  | 5 | SR/RU | OPS/E3/T22 |
| Efficiency — cache/dedup effectiveness |  | 6 | SR/LT/RU | ENG/E2/T21 |
| Efficiency — Vercel build/runtime cost |  | 7 | SR | OPS/E4/T23 |
| Efficiency — data/query efficiency |  | 6 | SR | ENG/E5/T24 |
| Efficiency — operational complexity |  | 5 | SR | SOL/E6/T25 |
| Engineering — test depth | ✓ | 8 | LT | ENG/Q1/T26 |
| Engineering — regression coverage | ✓ | 8 | LT | ENG/Q1/T26 |
| Engineering — migration safety | ✓ | 5 | SR; unrun | ENG/Q2/T15 |
| Engineering — maintainability |  | 7 | SR | ENG/Q3/T27 |
| Engineering — documentation |  | 8 | SR | SOL/Q4/T27 |
| Engineering — feature flags | ✓ | 7 | SR | ENG/Q5/T28 |
| Engineering — release readiness | ✓ | 3 | SR/RU | SOL/Q6/T29 |

## Remedy and verification catalog

Every sub-9 row references one entry here; re-audit records must cite the resulting evidence.

- **P1:** validate the five product slices with existing domain surfaces and captured user workflows. **T1:** product review + synthetic journey acceptance.
- **R1:** implement job claim/lease/heartbeat/retry/terminal callback and recovery. **T2:** disposable DB/process-kill fault matrix.
- **R2:** enforce explicit capability allowlists and typed proposals end to end. **T3:** malicious-tool/policy-token route tests + independent security review.
- **R3:** implement cooperative cancel/supersede and reversible proposals. **T7:** concurrent cancel/retry state-machine tests.
- **R4:** use durable idempotency keys at ingress, occurrence, and side effect. **T11:** duplicate/replay/concurrency tests.
- **R5:** ordered events and atomic occurrence/job claims. **T11:** lock/lease/sequence contention tests.
- **R6:** propagate failures without acknowledgement/watermark advance. **T13:** focused route tests.
- **U1–U7:** interaction/IA/accessibility/feedback/visual/consent design remedies. **T4:** captured local/preview desktop+mobile keyboard/screen-reader journeys; **T5:** conversation rubric.
- **A1–A5:** eval-driven calibration, decomposition, bounded delegation, context selection, artifact rubrics. **T8–T10:** real-path eval cases with trace assertions.
- **O1:** run-ID logs, metrics, traces, dashboards, DLQ. **T12:** operator reconstruction drill.
- **O2:** dual-read/write flags, rollback rehearsal, retained history. **T14:** preview rollback exercise.
- **S1:** tenant-scoped queries/RLS/parent-child guards. **T15:** disposable DB role matrix.
- **S2:** signed grants, denial defaults, user-bound approval. **T3:** forged/expired/scope mismatch tests.
- **S3:** untrusted content separation + tool/action policy. **T16:** prompt-injection adversarial suite.
- **S4/S5:** Modal-only provider credential, redaction, retention, minimal payloads. **T17:** secret/log/payload static and runtime scan.
- **S6:** sandbox manifests, default-deny egress/mounts/secrets/quotas. **T18:** escape/egress/resource/cancellation tests.
- **I1:** versioned tool schemas and consistent error contracts. **T19:** registry/provider contract tests.
- **I2:** observable connector readiness/degraded queues. **T20:** dependency outage drills.
- **E1:** eliminate extra model/HTTP hops and measure p50/p95/p99. **T6:** instrumented synthetic latency benchmark.
- **E2:** measure prompt-cache correctness/hit rate/tokens/latency/cost by provider. **T21:** cache A/B harness.
- **E3:** bounded fair queues and ephemeral worker utilization. **T22:** backlog/fairness/load test.
- **E4:** local-first validation and batched builds. **T23:** build-cost budget record.
- **E5:** indexed bounded queries and cursor pagination. **T24:** query plans/load fixtures.
- **E6:** consolidate lifecycle authority and adapters. **T25:** architecture complexity review.
- **Q1:** focused regression, integration, fault, and UI suites. **T26:** traceability report.
- **Q2:** additive migration dry-run/rollback/role checks. **T15:** disposable DB validation.
- **Q3/Q4:** cohesive modules, typed contracts, current handoff docs. **T27:** independent maintainability/doc review.
- **Q5:** dual-write/read and UX/worker kill switches. **T28:** flag matrix tests.
- **Q6:** clear all critical ≥9, security no-go, runtime evidence, rollback rehearsal. **T29:** final release checklist.

## Stage result

**Stage A: NO-GO / does not advance.** No material change is deployment-ready. Critical security, durable state, continuity, callback integrity, migration safety, and release-readiness scores are below 9. Current work is a local foundation requiring focused tests, disposable database validation, caller migration, independent review, and a full re-audit.

## Re-audit history — append only

- 2026-07-28 / baseline + initial local foundation: matrix created. No UI score has UI evidence; all visual/interaction claims remain deliberately low/unverified. Stage A no-go.
- 2026-07-28 / focused re-audit: 111 targeted tests across 11 files, TypeScript compilation, and diff validation passed; independent policy and migration reviews completed. Failure acknowledgement and local regression evidence improved to 8, but caller propagation, database execution, workflow occurrence idempotency, sandbox, voice, UI interaction, and runtime gates keep Stage A no-go.
