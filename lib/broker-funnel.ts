/**
 * Brokerage funnel helpers — pure functions shared by the analytics surface.
 *
 * Kept out of the `'use client'` analytics component so the logic is unit
 * testable in the node environment without pulling framer-motion into the
 * test graph. Broker-only; no React, no I/O.
 */

export type FunnelStepKey = 'leadToTour' | 'tourToApp' | 'appToDeal';

export const FUNNEL_STEP_LABEL: Record<FunnelStepKey, string> = {
  leadToTour: 'Lead → tour',
  tourToApp: 'Tour → app',
  appToDeal: 'App → deal',
};

export interface FunnelShape {
  totalLeads: number;
  tours: number;
  applications: number;
  leadToTour: number;
  tourToApp: number;
  appToDeal: number;
}

/**
 * The weakest converting step among the three pass-throughs that actually
 * carry volume into them.
 *
 * A step with no inbound volume (e.g. zero tours feeding tour→app) isn't a
 * "leak" — it's just empty — so only steps whose SOURCE stage holds records
 * are judged. Ties resolve to the earliest step in pipeline order (lead→tour
 * before tour→app before app→deal), because fixing an earlier leak compounds
 * downstream. Returns null when there's nothing to judge yet.
 */
export function biggestLeak(a: FunnelShape): { key: FunnelStepKey; pct: number } | null {
  const candidates = (
    [
      { key: 'leadToTour', pct: a.leadToTour, source: a.totalLeads },
      { key: 'tourToApp', pct: a.tourToApp, source: a.tours },
      { key: 'appToDeal', pct: a.appToDeal, source: a.applications },
    ] as Array<{ key: FunnelStepKey; pct: number; source: number }>
  ).filter((c) => c.source > 0);
  if (candidates.length === 0) return null;
  // Stable sort keeps the declared (pipeline) order among equal pass-throughs.
  candidates.sort((x, y) => x.pct - y.pct);
  return { key: candidates[0].key, pct: candidates[0].pct };
}
