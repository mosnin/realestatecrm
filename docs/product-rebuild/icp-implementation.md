# Autonomous client follow-through implementation

Built on `codex/autonomous-product-rebuild`, after `04a7b9841b783cd61120f81fee0ab3b26057e4f7`.

The product job is to keep a client moving: answer the reply, preserve the promise, get human help when necessary, and retain an honest record of what happened. This change extends the existing application and scheduler.

## Delivered behavior

- Today has one compact client-work panel. Configuration and creation forms open on demand. Dated commitments support automatic email/SMS or owner-handled work; handoffs have separate acceptance and completion, with a recorded outcome.
- Automatic commitments atomically create their existing ScheduledMessage job. Same-request retries cannot create extra sends. Cancellation locks the delivery row and refuses to claim success once a send is in progress. Actual sent receipts close automatic work; drafts and failures do not.
- Two ready-made, explicitly enabled automatic routines continue inbound conversations and follow up after completed tours. They run on existing workflow events, with automatic transport authority, original-recipient/channel bounds, and current pause/consent checks. They can record a human handoff but cannot schedule extra automatic messages. Existing overlapping automations are surfaced before enablement.
- Follow Up Boss supports searched/paged people, explicit selected-person linking/import, and an activity outbox that writes future communications, meetings and follow-ups as provider notes. Import does not start outreach. Private notes are excluded. Connection/link permissions are rechecked before writing; ambiguous writes are not retried blindly. A crashed claim becomes unconfirmed after 15 minutes. Each existing cron tick handles at most five notes alongside its scheduled-message work.
- Tour tools report local booking, external calendar confirmation, and unconfirmed delivery separately. A local tour is not evidence that property access or an agreement is confirmed.
- Existing application-wide upright sans-serif and cool-neutral styling are retained.

## Verification

- Full Vitest run: 758 files, 6,601 passed, 7 skipped. Three additional calendar-receipt cases then passed in the focused outcome suite (6 tests total).
- Production Next.js build passed using local placeholder credentials (no provider verification). A webpack cache write hit disk capacity; removing this checkout's generated `.next/cache` restored headroom and the build completed with exit 0.
- TypeScript passed. ESLint passed with existing repository warnings. Tenant-scope audit passed: 937 files, 127 registered tables. Repository contract suite: 52 passed.
- Both new SQL migrations were applied twice to disposable PostgreSQL 18.4 fixture tables. Behavioral assertions cover tenant rejection without an orphan send, idempotent save, changed-payload retry rejection, cancel-before/after claim, sent reconciliation, distinct human acceptance/completion, RPC permissions, exact-email linking, selected import, and activity-outbox restrictions. This fixture is not a production schema migration rehearsal. The relevant Contact field types were also checked against `supabase/schema.sql`.
- Browser QA used real new React components with synthetic in-memory API responses and a temporary local shell. Exercised accept, record outcome, create automatic commitment, cancel, coverage toggle, and link-to-People. Desktop screenshot: 1512px wide. Mobile: 390px wide, no horizontal overflow, upright sans-serif throughout the rendered panel. Screenshots were opened and visually inspected. Compared with the earlier Today concept: palette and typography retained; deliberate change is the compact client-work panel and collapsible controls.
- Temporary fixture route and local authentication bypass were removed; `middleware.ts` and `app/layout.tsx` restored unchanged. No customer outreach or provider write was performed by this verification.

## Release and remaining boundaries

Apply `20260919000000_client_commitments.sql` and `20260919010000_crm_follow_through.sql` through the repository's documented database release procedure before enabling these features. This change does not apply a production migration or deploy app code. Existing scheduled-message infrastructure must be healthy; no second cron system was added.

Authenticated staging and provider checks still need an actual linked test workspace: save/cancel a commitment, run reply and completed-tour events, inspect the outgoing provider receipt, and verify exactly one Follow Up Boss note after a logged activity. Confirm disconnection and pause behavior there before customer activation. A build with local placeholder credentials is compilation evidence only.

Follow Up Boss support here is selected import plus activity-note write-back. It does not ingest provider webhooks, synchronize all records bidirectionally, or send through the Follow Up Boss SMS API. Incoming coverage uses events already arriving in Chippi. Imported contacts do not gain messaging consent.

Human commitments belong to the workspace owner. This change does not implement a new brokerage-wide assignment/SLA engine. It also does not establish market fit, reduced churn, client receipt of a sent message, listing access, or signed buyer agreements. Existing overlap checks prevent ordinary preset conflicts but are not a global concurrency lock across unrelated automation editors.

## Visual evidence

- [Desktop](verification/follow-through-desktop.png)
- [Mobile](verification/follow-through-mobile.png)
- [Mobile creation form](verification/follow-through-mobile-form.png)
