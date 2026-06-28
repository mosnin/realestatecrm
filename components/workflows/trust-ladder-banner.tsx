'use client';

/**
 * Trust-ladder banner — the "earned autonomy" moment, surfaced on the
 * Automations hub.
 *
 * It reads the realtor's REAL draft track record (GET /api/agent/draft-stats —
 * how their last 30 days of Chippi drafts actually landed) and, only when that
 * record has genuinely earned it, invites them to let Chippi start sending on
 * its own. No nagging: it shows nothing until the bar is cleared, and a dismiss
 * (remembered locally) keeps it quiet after a "not yet".
 *
 * Honest by construction: it doesn't flip any switch itself. Autonomy is a
 * per-automation choice the realtor already controls in the builder ("Draft
 * only" → "Auto + notify"), so the banner points there rather than taking an
 * action on the realtor's behalf. "Nothing sends without you" stays true until
 * the realtor decides otherwise — and they can take it back anytime.
 */

import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAPTION } from '@/lib/typography';
import {
  evaluateGraduation,
  laneStatsFromDraftStats,
} from '@/lib/trust-ladder';

const DISMISS_KEY = 'chippi-trust-ladder-dismissed-v1';

interface DraftStatsShape {
  approved: number;
  editedAndApproved: number;
  rejected: number;
}

export function TrustLadderBanner() {
  const [reason, setReason] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Respect a prior "not yet" — remembered locally, no server round-trip.
    let priorDismiss = false;
    try {
      priorDismiss = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* private mode / storage blocked — treat as not dismissed */
    }
    if (priorDismiss) {
      setDismissed(true);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/draft-stats', { signal: controller.signal });
        if (!res.ok) return;
        const stats = (await res.json()) as DraftStatsShape;
        const offer = evaluateGraduation('draft', laneStatsFromDraftStats(stats));
        if (offer.offer) setReason(offer.reason);
      } catch {
        /* non-critical — the banner simply doesn't show */
      }
    })();
    return () => controller.abort();
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (dismissed || !reason) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-400/40 bg-emerald-50/50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-950/20">
      <ShieldCheck
        size={18}
        className="mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-500"
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">Your drafts are landing well.</p>
        <p className={cn(CAPTION, 'leading-snug')}>{reason}</p>
        <p className={cn(CAPTION, 'leading-snug text-muted-foreground/80')}>
          Open any automation below and set it to “Auto + notify” to let it send on its own —
          you’ll still get a heads-up each time, and you can switch it back to drafts whenever
          you want.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not yet"
        className="flex-shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
