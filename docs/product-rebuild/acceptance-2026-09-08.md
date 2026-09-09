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

## Durable rejection, form recovery, and accountable team work

This follow-up extends PR #612 from baseline
`0653217f34b5a7bf91d93d061f92d64fd16c96aa`. It does not mark the complete
product rebuild or production acceptance finished.

- Known credit, subscription, daily-budget and rate-limit rejections now settle
  the exact pending ConversationTurn as failed. Space, conversation, request,
  message, turn ID and pending status must all match. Running/completed work
  wins over the rejection update. Database persistence failures are logged;
  network failures before the server receives a request still need client
  recovery. A fresh-runtime hook test verifies that a saved failed turn stays
  visible in the queue and is not automatically redispatched.
- People, new Deals, and Properties now protect unsaved changes and recover
  tab-local drafts after navigation/reload. Storage keys come from authenticated
  actor/workspace identity. Recovery expires after 24 hours and does not restore
  an edit over changed server defaults. Save and explicit discard clear the
  recovery copy. Storage failures are visible. This is same-tab recovery, not
  cross-device draft synchronization or protection for every form in the app.
- New-deal retries retain a successfully created property's ID when the later
  deal request fails, avoiding another property creation on an ordinary retry.
  This does not reconcile a lost HTTP response after an unknown server commit.
- Team work has an assignee, due date, acknowledgment, completion, cancellation,
  manager reassignment and visible overdue status. Only the assignee can
  acknowledge/complete; members can assign to themselves, managers to current
  members. Updates use a version check, and reads/writes bind the team scope.
  Open/completed filtering happens before pagination. Collaborator names are
  available to team members without exposing billing or account details.
  Chippi can read this work through its bounded team tool catalog.
- The team page uses the existing application theme, orange actions and
  sans-serif typography. The logged-out site and Cadre source are unchanged.
- Isolated PostgreSQL migration/lifecycle tests now have their own CI job.

### Evidence and remaining gates

- Final local web gate: TypeScript and lint pass (existing lint warnings);
  807 test files pass, with 6,853 tests passed and seven skipped. All 55 script
  checks pass. The tenant scanner checks 967 files and 129 registered tables
  without an unscoped call site. Hosted checks for this follow-up are separate.
- All 23 isolated PostgreSQL shell suites pass locally. The new migration was
  applied twice to a disposable database; RLS/client privileges, team filtering,
  stale-version rejection and invalid status constraints were checked.
- The actual team React component was exercised in Chrome with synthetic API
  data: acknowledge -> complete -> completed list. Desktop styling was inspected.
  This is browser component acceptance, not a real team-account/provider test.
- The existing Mac tests pass (four XCTest cases). A debug, ad-hoc-signed app
  and ZIP were built with `CHIPPI_BUILD_CONFIGURATION=debug ./package.sh`.
  The app launches, loads Chippi sign-in, opens Google's OAuth sign-in and
  returns using native Back. There is no signed-in WKWebView session available;
  authenticated Mac workflows remain unverified. No valid Developer ID signing
  identity exists on this machine, so this is not a notarized customer release.
- Staging deployment `dpl_FnSbacCmaWmsJ6emWE8odHv4uTPM` was rechecked:
  `BUILD_FAILED`, `Resource provisioning failed`, no build log events. The main
  preview for the baseline is Ready. No production schema/configuration change
  or customer message was made by this follow-up.
- Apply `20260922000000_team_work_items.sql` through `docs/RELEASE.md` before
  activating the team surface. It requires both `CHIPPI_WORKFORCE_ENABLED` and
  `CHIPPI_TEAM_CRM_ENABLED`, plus the earlier collaboration-team migrations.

Still outstanding from the broader requested scope: delegated CRM edits with
explicit write grants; brokerage-owned record sharing; automatic escalation
and team work mutations by Chippi; broader draft coverage; populated, hosted
multi-role/provider acceptance; and Mac authenticated/distribution acceptance.
Existing action-retention reporting is present in `/admin/cohorts`; actual
customer receipts and retention improvement have not been verified.

## Brokerage-owned sharing and authenticated draft acceptance

Revision `bee2bf2aa80c233b237719d3b250dd1617b477ad` passed all GitHub checks,
including the new disposable PostgreSQL job and production build. Its main
preview is Ready at https://chippi-cy1q8h1ke-mosnins-projects.vercel.app .
Authenticated Google sign-in reached the solo workspace. Unsaved People text
and a Property address survived browser Back/Forward. The synthetic drafts
were discarded; no CRM record was saved. The listing discard confirmation
blocked the browser extension twice; native Chrome inspection resolved it
and verified the return to the empty Properties list. This was a browser-control
interruption, not evidence of a failed application discard.

Brokerage-owned record sharing is now implemented locally in a separate grant
table. A current manager can explicitly share selected records with a team
sponsored by that brokerage. Assignment and team-admin status alone do not
authorize this. Reads recheck grantor account status, team membership,
brokerage management authority, active grant and current record ownership.
Deals bind through their workspace's brokerage. Joined metadata and private
fields do not appear in the response. Team members see the selected records
alongside existing personal shares. Revocation removes future visibility.

This extension defaults off with `CHIPPI_BROKERAGE_TEAM_SHARING_ENABLED=false`,
so existing shared-record reads do not require its table before migration.
Apply `20260923000000_brokerage_team_record_sharing.sql` through the documented
release workflow, then enable that flag after the membership/ownership checks.
It also requires the existing Workforce/team CRM flags. The new migration
passes twice-applied disposable PostgreSQL checks; no production application
is implied. There are now 24 local SQL fixtures (the prior 23 plus this one).

Brokerage-sharing coverage includes 14 behavioral storage/authority cases,
API actor/account binding, and the real shared-record React component's
brokerage selection/share/revoke flow with mocked HTTP. Local TypeScript and
lint pass; the full web suite passes 808 files, 6,870 tests, with seven skipped.
The tenant scanner checks 969 files and 130 registered tables. The People
form also now displays recovery/storage-failure status, which was missing
from its actual rendered header.

This closes the implementation gap for read-only brokerage-owned sharing,
not delegated record editing or live team/provider acceptance. Those remain
outstanding alongside automatic escalation and agent-initiated team mutations.
