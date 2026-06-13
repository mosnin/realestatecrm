/**
 * Coach signal source — a proactive GCI-pace nudge.
 *
 * Chippi quietly does the realtor's commission math each morning and, when the
 * month is tracking behind, points at the three best levers to pull TODAY: the
 * highest-leadScore active contacts not yet worked. The coach never speaks in
 * its own channel — it speaks only here, as one earned briefing tip, in the
 * brand's calm voice.
 *
 * The pace number (COMPUTED, never stored):
 *   wonThisMonth   = sum(GCI) of deals closed-won this calendar month
 *   weightedOpen   = sum(GCI * probability/100) over open deals  (expected $)
 *   paceThisMonth  = wonThisMonth + weightedOpen
 *
 * GCI per deal is lib/commissions.ts math: value * commissionRate / 100. When a
 * deal has no commissionRate we fall back to DEFAULT_COMMISSION_RATE so an
 * unfilled rate doesn't zero the deal out of a heuristic that isn't accounting.
 *
 * The target is the realtor's own trailing 3-month won-GCI average (their book,
 * not an invented quota). With no closed history we use a gentle baseline so a
 * brand-new realtor is never told they're "behind" on day one.
 *
 * Confidence 0.8 — high enough to surface as the bottom tip when something more
 * urgent isn't already on the brief, low enough that a real "call this hot
 * lead" card outranks it.
 */

import { supabase } from '@/lib/supabase';
import { computeCommission } from '@/lib/commissions';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';
import type { Signal, SignalGatherer } from '../types';

/** Heuristic commission rate (percent) when a deal leaves the field null. */
const DEFAULT_COMMISSION_RATE = 2.5;
/** Gentle monthly GCI floor when the realtor has no closed history to learn from. */
const BASELINE_MONTHLY_TARGET = 5000;
/** Only nudge when pace is meaningfully behind — under 70% of target. */
const BEHIND_RATIO = 0.7;
/** How many leads to name as the levers to pull. */
const TOP_N = 3;

type DealRow = {
  value: number | null;
  commissionRate: number | null;
  probability: number | null;
  status: string;
  closedAt: string | null;
};

type ContactRow = {
  id: string;
  name: string;
  leadScore: number | null;
};

/** GCI for one deal, with a default rate when the deal's rate is null. */
function dealGci(value: number | null, rate: number | null): number {
  const effectiveRate = rate ?? DEFAULT_COMMISSION_RATE;
  return computeCommission(value, effectiveRate, []).gci;
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export const coachSource: SignalGatherer = {
  source: 'tips',
  async gather(spaceId: string): Promise<Signal[]> {
    const now = new Date();
    const monthStart = startOfMonthUtc(now);
    // Trailing window for the self-learned target: last 3 full-ish months.
    const trailingStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));

    const { data: dealData, error: dealErr } = await supabase
      .from('Deal')
      .select('value, commissionRate, probability, status, closedAt')
      .eq('spaceId', spaceId);
    if (dealErr || !dealData) return [];

    const deals = dealData as DealRow[];

    let wonThisMonth = 0;
    let weightedOpen = 0;
    let trailingWon = 0;

    for (const d of deals) {
      const gci = dealGci(d.value, d.commissionRate);
      if (gci <= 0) continue;

      if (d.status === 'won' && d.closedAt) {
        const closed = new Date(d.closedAt);
        if (!Number.isNaN(closed.getTime())) {
          if (closed >= monthStart) wonThisMonth += gci;
          if (closed >= trailingStart && closed < monthStart) trailingWon += gci;
        }
      } else if (d.status === 'active') {
        const prob = d.probability ?? 0;
        weightedOpen += (gci * prob) / 100;
      }
    }

    const paceThisMonth = wonThisMonth + weightedOpen;

    // Target: trailing 3-month average won GCI, or the baseline if no history.
    const trailingMonthlyAvg = trailingWon / 3;
    const target = trailingMonthlyAvg > 0 ? trailingMonthlyAvg : BASELINE_MONTHLY_TARGET;

    // Not behind enough to say anything — the right to stay quiet.
    if (paceThisMonth >= target * BEHIND_RATIO) return [];

    // ── Behind. Name the best levers: top active contacts by leadScore. ────
    const { data: contactData, error: contactErr } = await supabase
      .from('Contact')
      .select('id, name, leadScore')
      .eq('spaceId', spaceId)
      .is('brokerageId', null)
      .in('type', ['QUALIFICATION', 'TOUR', 'APPLICATION', 'LEASE_REVIEW'])
      .not('leadScore', 'is', null)
      .order('leadScore', { ascending: false })
      .limit(TOP_N);
    if (contactErr) return [];

    const top = (contactData ?? []).filter(
      (c): c is ContactRow => (c.leadScore ?? 0) >= HOT_LEAD_THRESHOLD,
    );
    // No hot leads to point at means there's no concrete, honest action — and a
    // tip with no lever is just nagging. Stay quiet.
    if (top.length === 0) return [];

    const names = top.map((c) => c.name).filter(Boolean);
    const namedList =
      names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;

    const gap = target - paceThisMonth;
    const evidence =
      `This month is pacing at ${formatUsd(paceThisMonth)} against ${formatUsd(target)}, ` +
      `about ${formatUsd(gap)} short. Touching ${namedList} today is the fastest way to close the gap.`;

    return [
      {
        source: 'tips',
        kind: 'tip',
        urgency: 3,
        confidence: 0.8,
        subject: {
          id: top[0].id,
          name: 'GCI pace is behind',
          href: `/contacts/${top[0].id}`,
        },
        evidence,
        tipCategory: 'gci_pace',
        draftedAction: { kind: 'open', href: `/contacts/${top[0].id}` },
      },
    ];
  },
};
