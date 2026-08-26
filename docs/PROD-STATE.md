# Production state checklist

Fill this in against the live `chippi` project (`yomlpfhlbphvxepsjttm`) and
staging (`chippistaging`). Code in git is not proof that prod has the same
schema, secrets, or flags. Re-run after every release.

Values: `ok` / `missing` / `unverified`. Date every row you change.

## Database

| Check | How | Prod | Staging | Notes |
|---|---|---|---|---|
| Migration tracking table exists | `pnpm db:status` / `supabase_migrations.schema_migrations` | unverified | unverified | June 2026 audit said prod had none |
| `20260805000400` anon-deny applied | `pnpm db:status` | unverified | unverified | **Stop new signups if missing** — public anon key could read Contact/Deal/Tour |
| `20260805000500` remaining FK indexes | `pnpm db:status` | unverified | unverified | |
| Drip / offers / browser_control* / CMA narrative | `docs/RELEASE.md` six-file list | unverified | unverified | Do not enable UI that needs unapplied schema |
| Drift vs git | `supabase db diff --linked --schema public` | unverified | unverified | Empty diff = match |

## Schedulers (exactly one cron rail)

| Check | How | Prod | Notes |
|---|---|---|---|
| Worker reachable | `GET $WORKER_URL/health` | unverified | |
| Worker tick < 20 min | `/admin/observability` Background readiness | unverified | Historical silent-scheduler failure |
| `INNGEST_CRONS_ENABLED` unset | Vercel env | unverified | Worker + Inngest crons = double send |
| Vercel safety-rail only | `vercel.json` has exactly the three recovery routes | ok in git | Worker still owns the full job list; those three are idempotent belt-and-suspenders |
| KV `STATE` watermark bound | `wrangler.toml` | unverified | Missed-tick recovery |
| DLQ watched | Cloudflare Queues `chippi-dlq` | unverified | Replay is audited in admin |

## Money

| Check | How | Prod | Notes |
|---|---|---|---|
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Vercel env | unverified | |
| Solo + Pro monthly + annual price IDs | Vercel env vs `lib/plans.ts` | unverified | |
| Team / Team Plus prices | Only if selling Team | unverified | Annual needs add-on annual too (`isAnnualAvailable`) |
| One Solo checkout reconcilable | Staging then prod canary | unverified | Webhook → Space plan + cadence, not stale metadata |
| One Pro checkout reconcilable | same | unverified | |
| `CREDITS_ENFORCED` not `false` | Vercel env | unverified | Default ON |
| OpenRouter usage accounting | `OPENROUTER_API_KEY` + one chat `ChatUsage.cost` | unverified | |

## Tenant isolation

| Check | How | Prod | Notes |
|---|---|---|---|
| `TENANT_GUARD=1` | Vercel env | unverified | Observe first |
| `TENANT_GUARD_ENFORCE` | Vercel env | unverified | Flip only after a clean Sentry week |
| Anon PostgREST cannot read Contact | curl with `NEXT_PUBLIC_SUPABASE_ANON_KEY` | unverified | Must 401 / empty after `20260805000400` |

## Feature flags (keep off until Phase 5)

| Flag | Expected prod | Actual |
|---|---|---|
| `CHIPPI_RESEARCH_WORKSPACE_ENABLED` / public twin | unset / false | unverified |
| `CHIPPI_WORKSPACE_RUNS_ENABLED` / public twin | unset / false | unverified |
| `NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED` | unset / false | unverified |
| `REALTIME_VOICE_GATEWAY_ENABLED` | unset / 0 | unverified |
| `ACCOUNT_DELETION_HARD_DELETE` | unset / false until `docs/DATA-DELETION.md` signed | unverified |
| `DURABLE_SCHEDULE_OCCURRENCES_ENABLED` | unset / false | unverified |

## Other rails

| Check | Prod |
|---|---|
| `CRON_SECRET` matches Worker | unverified |
| `AGENT_INTERNAL_SECRET`, `MODAL_CHAT_URL`, `MODAL_WEBHOOK_URL` | unverified |
| `TAVILY_API_KEY` **and** `FIRECRAWL_API_KEY` (or leave Analyze degraded) | unverified |
| `COMPOSIO_API_KEY` + webhook verified < 7 days | unverified |
| `REDIS_URL` + Upstash KV | unverified |

## Last filled

- Date:
- By:
- Admin readiness overall:
