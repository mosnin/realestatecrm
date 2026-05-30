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

  // Apply cool-down filter. Cheap — at most ~6 candidates × 1 query each.
  const eligible: Signal[] = [];
  for (const sig of candidates) {
    if (!sig.tipCategory) continue;
    // Trend tips use null subjectId; single-subject tips use the real id.
    const subjectId = sig.subject.id.startsWith('tag:') || sig.tipCategory === 'overdue_pileup'
      ? null
      : sig.subject.id;
    const ok = await canFireTip(spaceId, sig.tipCategory, subjectId);
    if (ok) eligible.push(sig);
  }

  if (eligible.length === 0) return null;

  // Rank: named subjects > anonymous, then confidence desc.
  eligible.sort((a, b) => {
    const aNamed = a.tipCategory !== 'overdue_pileup' && !a.subject.id.startsWith('tag:');
    const bNamed = b.tipCategory !== 'overdue_pileup' && !b.subject.id.startsWith('tag:');
    if (aNamed && !bNamed) return -1;
    if (!aNamed && bNamed) return 1;
    return b.confidence - a.confidence;
  });

  const winner = eligible[0];

  // Record the fire BEFORE returning so concurrent compose ticks (rare
  // but possible) don't both pick the same tip and double-stamp.
  if (winner.tipCategory) {
    const subjectId = winner.subject.id.startsWith('tag:') || winner.tipCategory === 'overdue_pileup'
      ? null
      : winner.subject.id;
    await recordTipFired(spaceId, winner.tipCategory, subjectId);
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
