# Chippi Workspace Launch Recovery — Acceptance Gate

## Decision

**NO-GO for application activation.** The additive, feature-off recovery slice
is accepted at the local and staging-database boundaries. It is not accepted at
the rendered experience or live worker boundary. No dimension below 8 is being
waived, rounded up, or hidden inside an average.

The July 30 experience scores described an undelivered concept. They are
historical evidence, not a current score for this implemented slice. The
Company OS upgrade archived that invalid retained work and now requires a fresh
reality audit before it can schedule anything.

Evidence labels: **LT** local test · **ST** dedicated staging database · **SR**
source review · **BLOCKED** required evidence could not be obtained.

## Evidence-backed scores

| Dimension | Score | Evidence | Acceptance reason |
|---|---:|---|---|
| Product alignment | 8.5 | SR | Directly closes browser-close and timeout continuity without adding a disconnected product surface. |
| Architecture coherence | 9.0 | SR/LT/ST | Database row and launch token own truth; HTTP, browser, and Modal remain observations. |
| Durable acceptance | 9.0 | LT/ST | Provider acceptance and immutable receipt share the fenced database transition. |
| Idempotency and concurrency | 9.0 | LT/ST | Duplicate claims and acceptance are fenced; attempt sequence is monotonic. |
| Cancellation authority | 9.0 | LT/ST | Cancelled work rejects stale failure and late recovery writes. |
| Tenant and role isolation | 9.0 | LT/ST | Tenant-bound functions, RLS, and explicit anon/authenticated revocation passed. |
| Failure truthfulness | 9.0 | LT/ST | Dependency errors surface; accepted-but-silent work becomes a visible terminal failure, not success. |
| Observability | 8.5 | LT/SR | Each cycle reports action counts, disabled candidates, maximum staleness, and duration. |
| Cost containment | 8.0 | SR/LT | Default-off, kill switch, 25-candidate ceiling, indexed scan, no provider call from the sweep. |
| Query and migration safety | 9.0 | ST | Additive migration, rollback-only fault matrix, FK and scan indexes, no new Supabase ERROR/WARN for this slice. |
| Test strength | 9.0 | LT/ST | 38 focused tests, 5,233 full-suite tests, 230 Python tests, negative contracts, TypeScript compile, and executed database fault matrix. |
| Rollback readiness | 9.0 | SR/LT | Unsetting the server recovery flag removes receipt reads and re-entry without deleting evidence. |
| Evidence integrity | 9.0 | LT/ST | Local, staging, runtime, browser, and production claims remain explicitly separated. |

## Not yet scored — activation blockers

These are not zeroes and are not passes. They remain **unaccepted** until the
required observation exists:

| Dimension | Required proof | Current blocker |
|---|---|---|
| Accessibility | Authenticated keyboard, focus, screen-reader, contrast, and mobile journey | Managed workspace cannot bind a local port (`EPERM`); no deployment was authorized. |
| Visual and brand quality | Desktop/mobile capture of every launch/recovery/failure state | No application build contains this slice. |
| Interaction quality | Launch → leave/reload → same-run recovery → cancellation | No authenticated non-customer runtime containing this slice. |
| Runtime reliability | Modal accept, crash-before-worker, callback, recovery, cancel race, duplicate-effect count | Application and Modal runtime deliberately undeployed. |
| Latency and operating cost | p50/p95/p99 acceptance/recovery, sweep cost, provider starts per run | Instrumentation exists; representative runtime samples do not. |

## Exact release gate

1. Commit the acceptance candidate and reconcile the staging migration list.
2. Make one cached staging application build with recovery still disabled.
3. Enable one non-customer space only and execute the interaction/runtime fault
   journey.
4. Record measurements and captured browser evidence.
5. Independently score every newly applicable dimension. Any score below 8 is
   rejection; the repository’s stricter customer-facing threshold remains 9.

Production, customer data, and the live `chippi` database were not touched.
