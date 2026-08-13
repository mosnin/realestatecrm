/**
 * Recurring jobs the worker keeps alive — one entry per background job the
 * product depends on (lead SLAs, reminders, briefings, billing reconciles…).
 *
 * The Cloudflare Worker's 5-minute master trigger (wrangler.toml) checks
 * every entry against the current UTC instant (src/cron-match.ts), enqueuing a
 * Cloudflare Queues message per due job. `pattern` is a 5-field crontab
 * evaluated in UTC — the same cadence contract the app's route monitors
 * (Sentry check-ins) expect. Every minute field must align to 5-minute
 * boundaries (the master tick's cadence) — a test enforces this.
 *
 * PARITY: tests/lib/worker-schedule-parity.test.ts (in the app package) pins
 * this list against the app's CRON_MANIFEST — add/change jobs in both places
 * or CI fails loudly. The `path` is the app route the tick invokes with
 * `Authorization: Bearer ${CRON_SECRET}`; the route owns the actual work,
 * its kill-switch flags, and its Sentry monitoring.
 */

export interface RecurringJob {
  /** Stable job id — appears in queue messages and worker logs. */
  id: string;
  /** App route the tick invokes. */
  path: string;
  /** 5-field crontab, UTC. */
  pattern: string;
}

export const RECURRING_JOBS: readonly RecurringJob[] = [
  { id: 'cron-lead-sla', path: '/api/cron/lead-sla', pattern: '*/15 * * * *' },
  { id: 'cron-follow-up-reminders', path: '/api/cron/follow-up-reminders', pattern: '0 9 * * *' },
  { id: 'cron-deal-checklist-reminders', path: '/api/cron/deal-checklist-reminders', pattern: '0 8 * * *' },
  { id: 'cron-tour-reminders', path: '/api/cron/tour-reminders', pattern: '*/15 * * * *' },
  { id: 'cron-broker-weekly-report', path: '/api/cron/broker-weekly-report', pattern: '0 9 * * 1' },
  { id: 'cron-agent-sweep', path: '/api/cron/agent-sweep', pattern: '0 */4 * * *' },
  { id: 'cron-agent-run-reconcile', path: '/api/cron/agent-run-reconcile', pattern: '*/15 * * * *' },
  { id: 'cron-agent-tasks', path: '/api/cron/agent-tasks', pattern: '*/15 * * * *' },
  { id: 'cron-workspace-run-recovery', path: '/api/cron/workspace-run-recovery', pattern: '*/5 * * * *' },
  { id: 'cron-work-session-action-recovery', path: '/api/cron/work-session-action-recovery', pattern: '*/5 * * * *' },
  { id: 'cron-conversation-turn-recovery', path: '/api/cron/conversation-turn-recovery', pattern: '*/5 * * * *' },
  { id: 'cron-routines', path: '/api/cron/routines', pattern: '0 * * * *' },
  { id: 'cron-workflows', path: '/api/cron/workflows', pattern: '0 * * * *' },
  { id: 'cron-scheduled-messages', path: '/api/cron/scheduled-messages', pattern: '*/15 * * * *' },
  { id: 'cron-broker-routines', path: '/api/cron/broker-routines', pattern: '0 * * * *' },
  { id: 'cron-draft-outcomes', path: '/api/cron/draft-outcomes', pattern: '0 3 * * *' },
  { id: 'cron-sweep-paused-runs', path: '/api/cron/sweep-paused-runs', pattern: '0 4 * * *' },
  { id: 'cron-cleanup', path: '/api/cron/cleanup', pattern: '0 3 * * *' },
  { id: 'cron-storage-gc', path: '/api/cron/storage-gc', pattern: '0 5 * * *' },
  { id: 'cron-seat-reconcile', path: '/api/cron/seat-reconcile', pattern: '30 4 * * *' },
  { id: 'cron-daily-briefing', path: '/api/cron/daily-briefing', pattern: '0 * * * *' },
  { id: 'cron-notification-digest', path: '/api/cron/notification-digest', pattern: '0 8 * * *' },
  { id: 'cron-next-moves', path: '/api/cron/next-moves', pattern: '0 10 * * *' },
  { id: 'cron-extraction-backfill', path: '/api/cron/extraction-backfill', pattern: '15 * * * *' },
  { id: 'cron-review-nudge', path: '/api/cron/review-nudge', pattern: '30 16 * * *' },
  { id: 'cron-drip-tick', path: '/api/drip/tick', pattern: '*/30 * * * *' },
];
