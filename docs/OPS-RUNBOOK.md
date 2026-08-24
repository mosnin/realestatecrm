# Ops runbook

One page for on-call and support. Privileged actions go through admin
step-up and `AuditLog`.

## On-call stack

1. `/admin/observability` — Sentry issues + Background readiness
2. Sentry project — cron check-ins, tenant-guard hits
3. Cloudflare Workers → Triggers / Queues / `chippi-dlq`
4. Modal dashboard — agent / chat functions
5. Stripe dashboard — webhook 5xx

Page when any of these is true:

- Worker last tick older than 20 minutes (readiness row is `down`)
- Stripe webhook 5xx burst
- Modal callback 503 (`AGENT_INTERNAL_SECRET` mismatch or app down)
- `TENANT_GUARD` enforce hits (unscoped tenant read)
- Credit grant cron (`seat-reconcile` / monthly grant) failing
- Daily ChatUsage cost > 3× a space's pro-rated credit grant (`/admin/agent-stats`)
- Account deletion: Clerk gone, DB sweep failed

## Scheduler

Production cron rail is the Cloudflare Worker (`docs/WORKER.md`). Inngest
is events only.

- **Never** set `INNGEST_CRONS_ENABLED` while `WORKER_URL` is set.
- `vercel.json` keeps three **idempotent** recovery routes as a safety rail
  (`workspace-run-recovery`, `work-session-action-recovery`,
  `conversation-turn-recovery`). Do not add more Vercel crons.
- Missed ticks: bind KV `STATE` on the Worker; readiness uses Redis for the
  heartbeat.

If readiness is down: Cloudflare → Worker → Triggers (cron can be disabled
independently of the deploy). Then `wrangler tail`.

## Support recipes

| Job | Where |
|---|---|
| Refund / cancel / grant credits | `/admin/billing` or user account panel — step-up required |
| DSAR export | `/admin/users/[id]` → export. Same tables as self-serve. |
| Replay a dead letter | `/api/admin/dlq/[eventId]` — audited |
| Disable a workspace | `/admin/spaces` |
| Reset a stuck send / turn | `/admin/observability` + conversation-turn recovery cron; kill switches `CRON_CONVERSATION_TURN_RECOVERY_DISABLED=1` |
| Impersonate / inspect | `/admin/users/[id]` — every action is `ADMIN_ACTION` |
| Hard-delete | Off by default. See `docs/DATA-DELETION.md`. Do not flip `ACCOUNT_DELETION_HARD_DELETE` from a support ticket. |

## Release

- App: Vercel on merge to `main`
- DB: human-gated **DB Migrate (production)** workflow (`docs/RELEASE.md`)
- Agent: `.github/workflows/deploy-agent.yml` on `agent/**`
- Worker: `cd worker && npx wrangler deploy` (not automatic)

Code rollback does not roll back schema. Prefer add-before-remove migrations.

After migrate: `pnpm db:status`, then screenshot `/admin/observability`.

## Emergency kill switches

| Env | Effect |
|---|---|
| `CREDITS_ENFORCED=false` | Credit gate off — workflows run free |
| `INNGEST_CRONS_ENABLED` | **Do not** combine with Worker |
| `CRON_WORKSPACE_RUN_RECOVERY_DISABLED=1` | Pause workspace recovery |
| `CRON_CONVERSATION_TURN_RECOVERY_DISABLED=1` | Pause turn recovery |
| `WORK_SESSION_ACTIONS_DISABLED=1` | Disable work-session proposals |
| Research / Workspace / Workbench / Voice flags | Leave unset in prod until `docs/FEATURE-FREEZE.md` says otherwise |
