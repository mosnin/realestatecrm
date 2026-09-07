# Convex + Supabase: one autonomous follow-up routine

Deployment update: the dedicated `chippi-follow-up` Convex production backend has now been created, deployed, and manually configured. Authenticated HTTP verification passed. The production web callback is still absent and the pilot remains inactive. See [deployment and role audit](deployment-and-role-audit-2026-09-07.md). The setup and local receipt below describe the initial implementation.

## What is implemented

- Supabase remains authoritative for contacts, deals, memberships, credentials, saved instructions and the routine's nextRunAt. There is no customer-data migration.
- The hourly routine discovery tick hands one explicitly selected routine to Convex instead of running it directly. Convex stores only workspace/routine/slot references and execution state, schedules the callback, and claims it transactionally.
- The callback re-reads the tenant-scoped routine, current owner, banned status, subscription, and then uses the canonical runner. Existing pause/autonomy/tool authorization, Redis coordination, token accounting and delivery paths still apply.
- Each workspace/routine/slot has one job. Repeated cron ticks and callbacks do not create another execution. A six-minute watchdog marks unresolved execution as uncertain. Network failures and uncertain states never automatically resend.
- Completed/failed/skipped receipts advance the Supabase schedule on the next discovery tick with a compare-and-set on nextRunAt. Pending and uncertain jobs retain their slot. This is a dispatch-coordination pilot, not a migration of the schedule clock into Convex.
- Routines shows execution status through the existing authenticated Next.js API, refreshed every 15 seconds while visible. This is polling, not direct Convex WebSocket subscriptions. No Convex client provider or new login system is required.
- Run completion means the existing executor returned success, not recipient delivery or a booked appointment. Manual Run now is refused for the selected routine so it cannot bypass the coordinator; other routines retain their existing behavior.

## Connect and enable

1. Create/link a dedicated Convex project through Vercel. The signed-in Convex team rejected direct CLI creation with: "This team is managed by vercel. You may create new Convex projects in vercel."
2. Link this checkout using the resulting deployment configuration, then run `pnpm exec convex dev --once`. This generates official bindings and validates/pushes the backend. No cloud deployment has been verified by the local test suite.
3. Set Convex environment variables: `CHIPPI_APP_ORIGIN` to the intended HTTPS Chippi origin, plus two independently generated service secrets `CHIPPI_CONVEX_SECRET` and `CHIPPI_CALLBACK_SECRET`.
4. Set the matching two secrets and `CONVEX_HTTP_URL` (the Convex HTTP Actions *.convex.site origin) on the Chippi deployment. Never use NEXT_PUBLIC variables for these secrets.
5. Deploy both sides while leaving `CONVEX_FOLLOW_UP_ROUTINE_ID` empty. Ensure the existing release's Supabase migrations/worker dependencies are satisfied separately.
6. Use a controlled workspace and saved follow-up routine whose instructions and sending permissions are already approved. Set `CONVEX_FOLLOW_UP_ROUTINE_ID` to that routine ID. The implementation does not create instructions, import contacts, change permissions, or enable sending for existing customers.
7. Exercise the next scheduled slot with controlled recipients. Verify the exact job, canonical agent activity, actual provider delivery receipt, permission refusal, duplicate callback, and disconnected-provider behavior before selecting a customer routine.

## Recovery and rollback

Do not clear or change the selected routine ID while a queued, running or uncertain job exists: reverting to the old executor with the same due slot could repeat an action. Disable the routine in Supabase first, drain running work, inspect activity and provider receipts, and reconcile an uncertain job manually before advancing the routine schedule. Then clear the pilot selection to restore the old path. No automated retry or "resume anyway" button is exposed.

A schedule edit or deleted/disabled routine makes an old queued callback skip. Pause/permission changes are checked by the canonical runner. A job already sending may have irreversible external effects; disabling future work cannot recall a message.

## Verification boundaries

Behavior tests exercise Convex mutations/actions/HTTP authorization with convex-test, callback authorization and tenant-scoped execution with mocked Supabase, and the existing cron/runner paths. These are local runtime tests, not proof of a hosted Convex deployment or real email/SMS delivery. The Vercel-managed project provisioning and controlled provider acceptance remain required.

### Local verification receipt (2026-09-07)

- Full web suite: 765 files, 6,642 tests passed, 7 skipped.
- Convex backend behavior tests: 6 passed, including HTTP authentication, tenant partitioning, job deduplication, single claims, lost responses and terminal-state protection.
- Callback behavior tests: 11 passed, including tenant-scoped instruction loading, current owner resolution, suspension/subscription checks, replay refusal and injected-instruction rejection.
- Routine cron suite: 17 passed, including retained pending/uncertain slots and no fallback on coordinator failure.
- TypeScript and canonical Next lint passed (existing lint warnings).
- Mobile component preview: 390px viewport and content, no browser errors. Uses synthetic execution data.
- Production build passed with placeholder credentials after clearing this checkout's generated build cache (initial attempt hit local disk exhaustion). No live provider credentials were used.
