# Workspace and agent acceptance — September 8, 2026

Baseline: `mosnin/realestatecrm`, `codex/autonomous-product-rebuild`,
`96f7d0b6caa2b667081e1d9935c4ce8e5fc9011b` (PR #612, unmerged).

## Verified

- Baseline application: 799 test files, 6,809 passing tests, seven skipped;
  TypeScript and lint pass (existing warnings).
- Tenant scope scanner: 964 files, 128 registered tables, no unscoped call sites.
- Script suite: 55 passing checks. Cloudflare worker TypeScript passes.
- All 22 `tests/postgres/*.sh` suites pass against isolated local Postgres,
  including concurrency, cancellation, lease recovery, atomic finalization,
  duplicate-launch fencing, and historical migration compatibility.
- Baseline GitHub CI completed successfully: application production build,
  agent Python, browser suite, repository map, and Workforce database/tests/
  build/browser job. Run: https://github.com/mosnin/realestatecrm/actions/runs/34288749278
- Actual Google sign-in on production reached the existing brokerage dashboard.
  Production still displays older navigation and duplicated dollar prefixes;
  the prefix corrections are already present on this branch.
- Actual Google sign-in on the exact main-project preview reached the solo
  workspace's Today page. People, Deals, Properties, and Settings loaded.
  Required relationship validation worked. No CRM test record was saved.
  Preview: https://chippi-qfdvbk90s-mosnins-projects.vercel.app
- Solo settings show no active subscription. Team/Workforce functionality is
  not activated in this preview, so this is not acceptance of team membership,
  sharing, persistent machines, or billing-backed provider execution.

## Bugs reproduced and corrected locally

1. Today Work launch: one read-only goal generated repeated user/error pairs
   when `/api/ai/task` rejected the preview account for insufficient credits.
   The server could leave its accepted turn pending before execution began;
   both immediate queue draining and polling redispatched it. The hook now
   prevents automatic retry of that failed turn in the mounted driver and
   waits for explicit retry. Successful/cancelled outcomes can continue the
   queue. Explicit retry retains the turn id, request id, and Work mode.
   Five real-hook/real-stream-runner tests reproduce HTTP 402/429/503,
   network rejection, and a truncated stream. All five fail on the baseline
   and pass with the correction. These tests mock HTTP responses, not the hook.
2. The People form labeled buyer and seller amounts as monthly budgets.
   Labels now follow the selected relationship: Purchase budget, Target sale
   price, or Monthly rental budget. Stored values and existing records are
   unchanged.

The failed Work goal was read-only; no customer communication was requested.
No provider execution, scheduling, or CRM changes were observed. Leaving the
conversation stopped the observed duplicate launch loop. A funded test account
is still needed for completed provider work; no credits were purchased.

## Deployment and remaining gates

- Main-project baseline preview is Ready.
- Staging deployment `dpl_ACXatqXXi9CWaS2U8S2aY3xQL9pC` failed with
  `BUILD_FAILED: Resource provisioning failed`, before application build output.
  A single same-revision redeploy, `dpl_CaTvEMgxofbUbkaa63SQ51vUgQZr`, also
  reached Error. This does not establish an application build defect.
- Sharing migration and production flag activation remain outstanding;
  follow the documented release workflow and real membership/revocation checks.
- No claim of full paid-account, multi-role, provider, Mac-app, or production
  acceptance follows from these checks. Unsaved draft preservation and full
  team ownership/handoff workflows remain separate implementation work.
- A final local suite attempt exhausted disk space. Generated output in this
  checkout and the failed run's temporary transform cache were cleared before
  retrying; customer data and other projects were not removed.

Final corrected-code validation: 800 test files, 6,814 passing tests, seven
skipped; TypeScript, lint, and diff whitespace checks pass. The corrected-code
provider/browser and hosted build checks are not implied by baseline CI above.

## Follow-up acceptance

Revision `096da3e7d393672afbfd1260402e31e1a128163b` completed all GitHub CI
jobs, including the production build. Its main preview is Ready at
https://chippi-ifxt8arn4-mosnins-projects.vercel.app . Authenticated browser
checks on that revision confirmed all three relationship-specific budget
labels. A new read-only Today goal received one rate-limit error and remained
at one user message and one error when rechecked, with explicit Try again
available. No provider completion is claimed.

A follow-up regression exposed an additional navigation case: unmounting and
returning to the conversation retried the pending rejected turn once. Retry
blocks now live beside the tab's stream runner, separately from transcript
records consumed by history refresh. Returning restores explicit retry's saved
turn identity without dispatching it. A real-hook regression covers unmount,
history consumption, remount, polling, and manual retry; it failed before the
fix. This is in-tab navigation protection, not durable cross-device rejection
state. Reloaded/new browser runtimes still reconcile against the server queue.
The follow-up code passes TypeScript, lint, and all 800 test files: 6,815 tests
passed and seven skipped. Its hosted deployment acceptance is still separate.
