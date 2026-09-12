# Reliability, accountable handoffs, and dashboard refinement

This change continues the existing Chippi application. It preserves routes, customer features, public marketing pages, wordmark/cookie assets, and the Mac wrapper.

## Delivered

- Reviewed all ten screenshots in the owner's private `openai_dash` Google Drive folder. Adapted their flush navigation, neutral selected state, persistent search, compact controls, restrained typography, divided metrics, and flat bordered surfaces. Orange remains the app accent. Removed animated dashboard backgrounds on agent, team, and broker Today screens. Private reference screenshots are not committed.
- Brokerage routines now carry a workspace ID and resolve owner authority again in the Python worker. The autonomous runner selects brokerage tools and excludes personal memories, profile, intake prompts, triggers, and integrations from brokerage context.
- Dispatchers validate response bodies and run IDs. HTTP 200 errors are failures. Missing, malformed, or lost acknowledgements remain unresolved and are not automatically replayed. The reconciler requires a completed trajectory with the exact workspace and run ID; unrelated drafts/activity cannot confirm a run.
- Automatic runs share the Python worker's Redis run lock and UTC daily token counter. Missing coordination or an exhausted budget refuses the run; releasing a lock is conditional on ownership.
- Automatic saved routines use the canonical TypeScript runner even when Modal is configured. Workspace pause/review policy is respected. Incoming event content never becomes an automatic-action grant. Native tool authorization and destructive-action boundaries remain enforced.
- Lead assignment is one locked database transaction: authorization, source scope, target membership, clone, original metadata, and dated handoff. Same-target retries return the existing copy; a different target conflicts. Failed updates roll back the clone and handoff.
- New assignments enter the existing Follow-through desk with an owner and the brokerage's first-response deadline. Agents accept and record outcomes there. Brokerage Today shows open handoff acceptance and overdue states. Existing SLA nudges/escalations continue.
- Sending settings now show seven-day durable outcomes: scheduled messages with a sending receipt, completed handoffs, failed runs needing attention, and currently overdue commitments. Missing database results are unavailable, never displayed as zero.

## Release dependencies

1. Apply prior follow-through migrations (`20260919000000`, `20260919010000`) and then `20260920000000_atomic_broker_assignment.sql` through the human-operated procedure in `docs/RELEASE.md`. The new assignment caller intentionally has no unsafe two-write fallback. Do not deploy that caller before the migration.
2. Deploy the updated Python worker alongside the web release. Older workers do not echo a run receipt and cannot perform brokerage routine dispatch correctly.
3. Keep the existing KV/Redis runtime configured for automatic runs. The TypeScript routine path now refuses to run without shared coordination.
4. Exercise real provider credentials, permissions, and receipt paths in the intended deployment before claiming production acceptance. Local fixtures do not prove outbound SMS/email delivery, OAuth, or customer retention.

## Scope and limits

A confirmed run means that execution finished, not that a client received a message. Human handoff completion is a recorded human outcome. Scheduled-message counts represent acknowledged sending, not delivery/read receipts. These counts cover those workflows, not every possible communication channel.

This does not migrate legacy assignments into handoffs, enable new customer sending permissions, or promise elimination of churn. Brokerage routines expose an explicit catalog of team reads and deal-review flags. Team-wide announcements, reassignment, routing changes, role changes and offboarding remain interactive; a model cannot self-confirm them in a background run. Mac distribution still needs Developer ID signing/notarization. No production data migration or deployment is part of this local verification.

## Verification receipt

- Full web suite: 763 files passed; 6,621 tests passed and 7 skipped.
- Python agent suite: 244 tests passed, including database-derived brokerage authority and run-lock receipt forwarding.
- TypeScript check and production build passed. Build used placeholder provider credentials; it is not an authenticated provider test.
- Canonical `next lint` completed with existing warnings. A broader `eslint .` invocation additionally encounters existing test-file rule/configuration errors outside this patch; changed agent helper files were checked separately with `--no-ignore`.
- All 52 release contract checks passed. Tenant scope audit scanned 940 files and 127 registered tables with no unscoped call sites.
- PostgreSQL fixture: migration reapplies, same-target retry is idempotent, competing target conflicts, unauthorized/cross-tenant requests refuse, source-update failure rolls back the copy, and the handoff has its assigned workspace and deadline. Two concurrent connections returned the same clone with one replay receipt.
- Browser: real components in the existing isolated preview, synthetic data. Desktop and mobile Today, disclosure, mobile Apps/Escape, Deals navigation, broker error state; no browser errors. Mobile viewport/document widths both 390px; action queue starts at 532px. Light/dark screenshots checked; no italic app text. This is not live Clerk/provider acceptance.
- Public marketing and brand asset files were unchanged by this patch.
