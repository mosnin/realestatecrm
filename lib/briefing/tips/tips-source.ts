/**
 * Tips source — runs every category, filters by cool-down, picks at
 * most one to surface in today's brief.
 *
 * Not a regular SignalGatherer because the output isn't "more cards
 * for the ranker." It's "the one tip that wins today's slot." The
 * composer calls this separately and assigns the result to Brief.tip.
 *
 * Selection rule (per the tips design):
 *   1. Named subject beats anonymous trend (single-subject > overdue_pileup, etc.)
 *   2. Magnitude — within named subjects, prefer higher confidence
 *   3. Recency — within ties, prefer the tip whose trigger is newest
 *      (proxied by confidence since we don't track trigger-onset dates)
 *   4. Cool-down filter applied before ranking
 *
 * The empty-state vs. bottom-of-brief decision is the COMPOSER's, not
 * this module's. This module just answers "what's the best earned tip
 * for this realtor right now, or null?"
 */

import { canFireTip, recordTipFired } from './cool-down';
import { ALL_TIP_CATEGORIES } from './tip-categories';
import type { Signal } from '../types';

/**
 * Anonymous-trend tip categories — the subject is "the realtor's own
 * funnel," not a specific entity, so cool-down keys on (category, null)
 * and ranking treats them below per-entity tips.
 *
 * `unworked_tag` is anonymous-by-prefix (`tag:*`) for legacy reasons —
 * its subject IS a tag name, but the cool-down treats the whole category
 * as one slot per realtor. Trend tips added in Phase C2 follow the same
 * rule when their subject is global (reply rate, tour conversion).
 */
const ANONYMOUS_TREND_CATEGORIES = new Set([
  'overdue_pileup',
  'unworked_tag',
  'reply_rate_decline',
  'tour_conversion_drop',
]);

function isAnonymousTrend(sig: Signal): boolean {
  if (!sig.tipCategory) return false;
  return ANONYMOUS_TREND_CATEGORIES.has(sig.tipCategory);
}

function resolveSubjectId(sig: Signal): string | null {
  return isAnonymousTrend(sig) ? null : sig.subject.id;
}

export async function pickBestTip(spaceId: string): Promise<Signal | null> {
  // Run every category in parallel — each is one Supabase call (some are
  // a few). The brief's per-realtor budget is generous.
  const results = await Promise.allSettled(ALL_TIP_CATEGORIES.map((fn) => fn(spaceId)));

  const candidates: Signal[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const signal of result.value) candidates.push(signal);
    }
  }

  if (candidates.length === 0) return null;

  // Apply cool-down filter. Cheap — at most ~10 candidates × 1 query each.
  const eligible: Signal[] = [];
  for (const sig of candidates) {
    if (!sig.tipCategory) continue;
    const ok = await canFireTip(spaceId, sig.tipCategory, resolveSubjectId(sig));
    if (ok) eligible.push(sig);
  }

  if (eligible.length === 0) return null;

  // Rank: named subjects > anonymous, then confidence desc.
  eligible.sort((a, b) => {
    const aAnon = isAnonymousTrend(a);
    const bAnon = isAnonymousTrend(b);
    if (!aAnon && bAnon) return -1;
    if (aAnon && !bAnon) return 1;
    return b.confidence - a.confidence;
  });

  const winner = eligible[0];

  // Record the fire BEFORE returning so concurrent compose ticks (rare
  // but possible) don't both pick the same tip and double-stamp.
  if (winner.tipCategory) {
    await recordTipFired(spaceId, winner.tipCategory, resolveSubjectId(winner));
  }

  return winner;
}

/**
 * Build the BriefCard shape for the surface from a tip Signal.
 * Tips render with a 'TIP' tag instead of the action verbs.
 */
export function tipToCard(signal: Signal): import('../types').BriefCard {
  return {
    kind: signal.kind,
    source: signal.source,
    subject: signal.subject,
    evidence: signal.evidence,
    draftedAction: signal.draftedAction ?? null,
  };
}
