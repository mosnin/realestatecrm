/**
 * The only Vercel crons allowed while the Cloudflare Worker is the
 * production scheduler. Each route is idempotent (recovery keys / leases).
 * `tests/lib/worker-schedule-parity.test.ts` pins vercel.json to this list.
 */

export const VERCEL_SAFETY_RAIL_CRONS = [
  { id: 'cron-workspace-run-recovery', path: '/api/cron/workspace-run-recovery', schedule: '*/5 * * * *' },
  { id: 'cron-work-session-action-recovery', path: '/api/cron/work-session-action-recovery', schedule: '*/5 * * * *' },
  { id: 'cron-conversation-turn-recovery', path: '/api/cron/conversation-turn-recovery', schedule: '*/5 * * * *' },
] as const;
