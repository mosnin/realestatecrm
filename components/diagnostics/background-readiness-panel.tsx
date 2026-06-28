'use client';

/**
 * Background-readiness panel.
 *
 * Fetches /api/diagnostics/background on mount and renders a calm, scannable
 * checklist of background-execution prerequisites: an overall status pill plus
 * one row per check (status dot + label + detail + the actionable `fix` when
 * present). Reuses the house style from connected-apps-section — muted text,
 * small status dots, green/amber/red colour vocabulary.
 *
 * The point of this surface is reassurance as much as diagnosis: when the
 * executor is on the in-process fallback it reads as 'degraded' (amber, "works,
 * just bounded"), never as broken — so the realtor knows the background work
 * still happens.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SECTION_LABEL } from '@/lib/typography';

type ReadinessStatus = 'ok' | 'degraded' | 'missing';
type OverallStatus = 'ok' | 'degraded' | 'down';

interface ReadinessCheck {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  fix?: string;
}

interface BackgroundReadiness {
  overall: OverallStatus;
  checks: ReadinessCheck[];
}

const DOT_CLASS: Record<ReadinessStatus, string> = {
  ok: 'bg-green-500',
  degraded: 'bg-amber-500',
  missing: 'bg-red-500',
};

const OVERALL_LABEL: Record<OverallStatus, string> = {
  ok: 'Ready',
  degraded: 'Degraded',
  down: 'Needs setup',
};

const OVERALL_PILL: Record<OverallStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
  degraded: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400',
  down: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
};

export function BackgroundReadinessPanel() {
  const [report, setReport] = useState<BackgroundReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/diagnostics/background');
        if (!res.ok) {
          if (!cancelled) setError("Couldn't load background readiness.");
          return;
        }
        const data = (await res.json()) as BackgroundReadiness;
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setError("Couldn't reach the diagnostics service.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <p className={SECTION_LABEL}>Background readiness</p>
        {report && (
          <span
            className={cn(
              'inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5',
              OVERALL_PILL[report.overall],
            )}
          >
            {OVERALL_LABEL[report.overall]}
          </span>
        )}
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Checking what runs in the background…</p>
      )}

      {!loading && error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && report && (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60 px-4">
          {report.checks.map((check) => (
            <li key={check.key} className="flex items-start gap-3 py-3">
              <span
                aria-hidden
                className={cn(
                  'mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0',
                  DOT_CLASS[check.status],
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{check.label}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">
                  {check.detail}
                </p>
                {check.fix && (
                  <p className="mt-1 text-[12px] text-muted-foreground/80 leading-relaxed">
                    {check.fix}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
