# Background worker — Cloudflare Workers + Queues

The `worker/` package is a Cloudflare Worker: the production scheduler and
job processor for Chippi. It runs on Cloudflare's infrastructure, independent
of Vercel, of any browser tab, and of the app's serverless functions.

```
┌────────────┐ POST /enqueue (lib/queue.ts) ┌──────────────────┐
│ Vercel app │ ───────────────────────────▶ │ Cloudflare Worker │
│ (Next.js)  │                              │  + CF Queues      │
│            │ ◀──────────────────────────── │  chippi-jobs      │
└────────────┘  executes via HTTPS+secrets  │  chippi-dlq (DLQ) │
     ▲  /api/cron/* (Bearer CRON_SECRET)    └──────────────────┘
     ▲  /api/worker/execute (Bearer WORKER_SECRET)   ▲ */5 master trigger
                                                     └ worker/src/schedule.ts
```

- **Recurring jobs** — a single `*/5` scheduled trigger fires the Worker;
  it matches every job in `worker/src/schedule.ts` against the **window since
  the last processed tick** (`src/cron-match.ts`) and enqueues one
  **Cloudflare Queues** message per due job. Window (not exact-instant)
  matching is what makes a best-effort trigger safe: a `0 9 * * *` job whose
  09:00 tick lands at 09:03 still runs. Per-job messages mean per-job retries
  (exponential backoff, `max_retries`), each enqueue is isolated so one
  failure can't drop its siblings, and exhausted jobs land in the
  `chippi-dlq` dead-letter queue instead of vanishing. Each tick invokes the
  app route, which owns the actual work, its kill-switches, and its Sentry
  monitoring.
- **Missed-tick recovery** — with the optional `STATE` KV namespace bound, the
  Worker stores a watermark of the last fully-enqueued tick, so a *skipped*
  trigger (not just a late one) is recovered on the next firing, capped at 6h
  of catch-up. Without KV it falls back to a fixed 5-minute window, which
  still recovers delayed triggers. The watermark only advances when every due
  job was enqueued, so a partial tick retries its stragglers.
- **Heartbeat** — every firing calls the app's `worker-heartbeat` task
  **directly** (not through the queue), recording the tick in Redis. This is
  the app's only proof the Cloudflare trigger actually fires; the
  background-readiness page reports a tick older than 20 minutes as **down**.
  A reachable Worker whose cron trigger is disabled is still a dead
  scheduler, and only this catches it.
- **Task offload** — app code calls `enqueueWorkerTask(name, payload)`
  (`lib/queue.ts`) → Worker `/enqueue` → Cloudflare Queue → consumer executes
  the handler registered in `lib/jobs/tasks.ts` via `/api/worker/execute`.
  Supports `delaySeconds` (up to 12h) for scheduled one-offs.
- **Caching** — `lib/redis-cache.ts` (Vercel side) uses `REDIS_URL`
  (Upstash or any managed Redis) for cache-aside reads. Tenant-scoped keys
  always.
- **Liveness** — `GET <worker>/health` returns status + the recurring-job
  count; `workerHealth()` in `lib/queue.ts` reads it. Trigger and queue
  activity are visible in the Cloudflare dashboard and via `wrangler tail`.

## Deploying the worker

Prereqs: a Cloudflare account and `wrangler` logged in (`npx wrangler login`).
Cloudflare Queues requires the Workers **Paid** plan ($5/mo).

From `worker/`:

```sh
pnpm install
npx wrangler queues create chippi-jobs
npx wrangler queues create chippi-dlq
npx wrangler secret put CRON_SECRET     # same value as the Vercel project
npx wrangler secret put WORKER_SECRET   # generate: openssl rand -hex 32
npx wrangler deploy
```

**Recommended — missed-tick recovery.** Create the KV namespace and bind it as
`STATE` so a *skipped* trigger is recovered rather than dropped:

```sh
npx wrangler kv namespace create chippi-worker-state
# paste the printed id into wrangler.toml:
#   [[kv_namespaces]]
#   binding = "STATE"
#   id = "<printed id>"
npx wrangler deploy
```

Then on **Vercel** (Production env):

- `WORKER_URL` — the deployed Worker URL (e.g.
  `https://chippi-worker.<account>.workers.dev`, or a custom domain/route)
- `WORKER_SECRET` — same value as the Worker secret
- `REDIS_URL` — optional, enables the Redis cache

`APP_BASE_URL` is set in `wrangler.toml` (default `https://www.usechippi.com`).

## Verifying it actually works

**The authoritative check is the app's background-readiness page** (admin
diagnostics): the "Background scheduler (Cloudflare worker)" row is green only
when the Worker is reachable, carries the expected job count, AND has recorded
a master tick in the last 20 minutes. It reports `down` — loudly — when the
trigger stops firing. Everything below is for drilling into *why*.

- `curl https://<worker-url>/health` → `{"ok":true,"scheduledJobs":23,...}`
  (proves it's deployed and reachable — NOT that its trigger fires).
- `npx wrangler tail` shows `master tick … (window from …) — enqueued N/M due
  of 23` within 5 minutes, then `tick cron-lead-sla ok` etc.
- The matching `/api/cron/*` invocations appear in Vercel function logs.
- If the readiness page says the trigger has stopped: check Cloudflare
  dashboard → Workers → chippi-worker → Triggers (the cron schedule can be
  disabled independently of the Worker being deployed).
- Cloudflare dashboard → Workers → chippi-worker → Triggers/Queues shows
  cron firings, queue depth, retries, and DLQ contents.
- Queue round-trip: from any server context run
  `enqueueWorkerTask('noop', { ping: 1 })` — `wrangler tail` shows
  `task noop ok`.

## Adding a background task

1. Register a handler in `lib/jobs/tasks.ts` (app side — full lib/* access,
   normal tenant-scoping rules; payloads must carry spaceId/brokerageId).
2. Enqueue from app code: `enqueueWorkerTask('yourTask', { spaceId, ... })`.

## Adding/changing a recurring job

Edit BOTH `worker/src/schedule.ts` and `CRON_MANIFEST` in
`lib/inngest/cron-functions.ts` — `tests/lib/worker-schedule-parity.test.ts`
fails CI if they drift, and `tests/lib/worker-cron-match.test.ts` enforces
that every minute field aligns to the */5 master tick. Redeploy the worker
(`npx wrangler deploy`).

## Notes

- The Worker is the production scheduler. Inngest cron mirrors register only
  if `INNGEST_CRONS_ENABLED` is set. **Never set `INNGEST_CRONS_ENABLED`
  while the Worker is deployed**: both carry the same job list, so every
  recurring job would fire twice (duplicate reminders, duplicate sends). The
  readiness page reports that combination as `down`.
- `vercel.json` is **not** cron-empty. It keeps exactly three idempotent
  recovery routes (`workspace-run-recovery`, `work-session-action-recovery`,
  `conversation-turn-recovery`) as a belt-and-suspenders rail if a Worker
  deploy is stale. Do not add more Vercel crons — `tests/lib/worker-schedule-parity.test.ts`
  pins that list. The readiness page reports extra Vercel crons as `down`.
- Inngest still carries the event-driven functions (scheduled posts, Composio
  triggers, work sessions) until those are migrated onto the tasks queue.
- The Worker holds no DB credentials and no service-role key — it only calls
  the app over HTTPS with the two bearer secrets, so the tenant-scoping
  boundary stays entirely inside the app.
