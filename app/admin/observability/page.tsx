/**
 * app/admin/observability/page.tsx — Sentry-backed Observability page.
 *
 * One idea: "Is anything on fire, and what?"
 *
 * Server component — fetches Sentry data at render time, passes it to
 * ObservabilityClient. The client handles the refresh affordance via
 * /api/admin/observability.
 */

import { requireAdmin } from '@/lib/admin';
import {
  sentryConfigured,
  listIssues,
  getEventStats,
} from '@/lib/sentry-api';
import { ObservabilityClient } from './observability-client';
import { BackgroundReadinessPanel } from '@/components/diagnostics/background-readiness-panel';
import { cn } from '@/lib/utils';
import { pluralize } from '@/lib/formatting';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';

export const dynamic = 'force-dynamic';

export default async function ObservabilityPage() {
  await requireAdmin();

  const configured = sentryConfigured();

  // Fetch in parallel; both are graceful on failure.
  const [issuesResult, stats] = configured
    ? await Promise.all([listIssues(), getEventStats()])
    : [null, null];
  const issuesAvailable = issuesResult !== null;
  const issues = issuesResult ?? [];

  const unresolvedCount = issues.filter((i) => i.status === 'unresolved').length;

  const statusSentence = !configured
    ? 'Sentry is not connected — set the three env vars to enable this view.'
    : !issuesAvailable
    ? 'Sentry issue data is unavailable — monitoring health cannot be confirmed.'
    : unresolvedCount === 0
    ? 'No unresolved issues. All clear.'
    : `${unresolvedCount} unresolved ${pluralize(unresolvedCount, 'issue')} in the last 14 days.`;

  return (
    <div className="space-y-8 pb-12">
      {/* ── Page header (status-sentence pattern) ──────────────────────── */}
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>System.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Observability
        </h1>
        <p className={BODY_MUTED}>{statusSentence}</p>
      </header>

      {/* ── Client component ────────────────────────────────────────────── */}
      <ObservabilityClient
        configured={configured}
        issuesAvailable={issuesAvailable}
        issues={issues}
        stats={stats}
        fetchedAt={new Date().toISOString()}
      />

      {/* ── Background-execution infra readiness (admin-only) ──────────── */}
      <BackgroundReadinessPanel />
    </div>
  );
}
