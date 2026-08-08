# Background worker (workers + Redis)

The `worker/` package is an always-on Node service — the production scheduler
and job processor for Chippi. It runs independently of Vercel, of any browser
tab, and of any serverless scheduler. If the worker is up, background work
runs. Period.

```
┌────────────┐  enqueue (lib/queue.ts)  ┌─────────┐  consume   ┌──────────────┐
│ Vercel app │ ───────────────────────▶ │  Redis  │ ─────────▶ │    worker    │
│ (Next.js)  │                          │ (BullMQ)│            │ (always-on)  │
│            │ ◀──────────────────────────────────────────────  │              │
└────────────┘   executes via HTTPS + secrets                  └──────────────┘
     ▲   /api/cron/* (Bearer CRON_SECRET)      recurring jobs (worker/src/schedule.ts)
     ▲   /api/worker/execute (Bearer WORKER_SECRET)   queued tasks (chippi-tasks)
```

- **Recurring jobs** — every entry in `worker/src/schedule.ts` becomes a
  BullMQ repeatable job in Redis (upserted on worker boot, stale ones
  removed). Each tick calls the app route, which owns the actual work, its
  kill-switches, and its Sentry monitoring. Failures retry 3× with
  exponential backoff and are visible in the queue history.
- **Task offload** — app code calls `enqueueWorkerTask(name, payload)`
  (`lib/queue.ts`); the worker consumes `chippi-tasks` and executes the
  handler registered in `lib/jobs/tasks.ts` via `/api/worker/execute`.
- **Caching** — `lib/redis-cache.ts` shares the same Redis (`cacheGet` /
  `cacheSet` / `cacheDel`, always tenant-scoped keys).
- **Liveness** — the worker refreshes `chippi:worker:heartbeat` every 30s
  (90s TTL); `workerHeartbeat()` in `lib/queue.ts` reads it.

## Deploying the worker

Any host that runs a Node 20+ process continuously works. Railway is the
fastest path:

1. **Redis**: create a Redis instance (Railway Redis add-on, Upstash, or any
   managed Redis). Copy its connection URL.
2. **Service**: create a new Railway/Render/Fly service from this repo.
   - Root directory: `worker`
   - Install: `pnpm install` · Start: `pnpm start`
3. **Env vars on the worker service** (it refuses to boot if any is missing):
   - `REDIS_URL` — from step 1
   - `APP_BASE_URL` — `https://www.usechippi.com`
   - `CRON_SECRET` — same value as the Vercel project
   - `WORKER_SECRET` — generate one (`openssl rand -hex 32`)
4. **Env vars on Vercel** (Production):
   - `REDIS_URL` — same as the worker (enables enqueue + cache + heartbeat)
   - `WORKER_SECRET` — same as the worker
5. Deploy. The worker log must show
   `[worker] 23 recurring jobs scheduled` and `[worker] up — …`.

## Verifying it actually works

- Worker logs print `[worker] tick /api/cron/lead-sla ok` within 15 minutes
  of boot (lead-sla runs every 15 min).
- Vercel function logs show the corresponding `/api/cron/*` invocations.
- Queue round-trip: from any server context run
  `enqueueWorkerTask('noop', { ping: 1 })` — the worker log shows
  `task noop ok`.
- `workerHeartbeat()` returns a timestamp less than 90s old.

## Adding a background task

1. Register a handler in `lib/jobs/tasks.ts`.
2. Enqueue it from app code: `enqueueWorkerTask('yourTask', { spaceId, ... })`.
   Payloads must carry tenant scope; handlers follow the same `spaceId`
   scoping rules as any request path.

## Adding/changing a recurring job

Edit BOTH `worker/src/schedule.ts` and `CRON_MANIFEST` in
`lib/inngest/cron-functions.ts` — `tests/lib/worker-schedule-parity.test.ts`
fails CI if they drift. Redeploy the worker; it reconciles schedulers on boot.

## Notes

- Vercel cron and Inngest cron are OFF: `vercel.json` declares no `crons`,
  and the Inngest cron mirrors register only if `INNGEST_CRONS_ENABLED` is
  set. Exactly one scheduler is live at a time — no double-ticking.
- Inngest still carries the event-driven functions (scheduled posts, Composio
  triggers, work sessions) until those are migrated onto the tasks queue.
- The worker holds no DB credentials and no service-role key — it only calls
  the app over HTTPS with the two bearer secrets, so the tenant-scoping
  boundary stays entirely inside the app.
