/**
 * The composer — turns a list of Signals from all sources into one Brief.
 *
 * Single responsibility: ranking and selecting. Source-agnostic. Adding a
 * new integration is "add a new SignalGatherer to the sources array."
 * The composer doesn't change.
 *
 * The right to say nothing is the central rule. When fewer than one signal
 * beats the confidence floor, the composer returns a Brief with empty
 * cards and an `emptyState` invitation — *never* a brief padded with
 * filler that teaches the realtor to ignore tomorrow's edition.
 */

import {
  CONFIDENCE_FLOOR,
  MAX_CARDS,
  type Brief,
  type BriefCard,
  type Signal,
  type SignalGatherer,
  type SignalKind,
  type SignalSource,
} from './types';

import { pipelineSource } from './signal-sources/pipeline';
import { leadsSource } from './signal-sources/leads';
import { calendarSource } from './signal-sources/calendar';
import { draftsSource } from './signal-sources/drafts';

/**
 * The active source list. Phase A shipped three internal Chippi-DB
 * sources. Phase B layers more on — `drafts` (this PR) surfaces the
 * autonomous agent's pending AgentDraft rows; Gmail / Calendar-Google /
 * Slack / HubSpot follow as separate sources. The composer needs no
 * change as the list grows.
 */
const SOURCES: SignalGatherer[] = [pipelineSource, leadsSource, calendarSource, draftsSource];

/**
 * Rank rule: ascending urgency (1 = today, 3 = soon), then descending
 * confidence as the tiebreak. Signals at or below the floor are dropped
 * before this runs — only competitors enter the sort.
 */
function rankSignals(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    if (a.urgency !== b.urgency) return a.urgency - b.urgency;
    return b.confidence - a.confidence;
  });
}

/**
 * Pick the top N, deduplicating by subject.id. A single contact / deal
 * can produce signals from multiple sources (Gmail thread + overdue
 * follow-up from leads source for the same person); the realtor sees
 * one card per subject, leading with the highest-ranked angle.
 */
function selectCards(ranked: Signal[]): BriefCard[] {
  const seen = new Set<string>();
  const cards: BriefCard[] = [];

  for (const signal of ranked) {
    if (cards.length >= MAX_CARDS) break;
    if (seen.has(signal.subject.id)) continue;
    seen.add(signal.subject.id);
    cards.push({
      kind: signal.kind,
      source: signal.source,
      subject: signal.subject,
      evidence: signal.evidence,
      draftedAction: signal.draftedAction ?? null,
    });
  }

  return cards;
}

/**
 * The headline — one sentence, the loudest signal named explicitly.
 * Falls back to a calm neutral when there's just one card with no
 * specific subject pull.
 *
 * The brand voice rule: name a specific subject. "The Chen deal hasn't
 * moved in fourteen days." Not "1 deal is stuck."
 */
function composeHeadline(cards: BriefCard[]): { headline: string; subheadline: string | null } {
  if (cards.length === 0) return { headline: '', subheadline: null };

  const lead = cards[0];
  const headline = headlineForCard(lead);
  const others = cards.length - 1;
  const subheadline =
    others > 0
      ? `${others} other thing${others === 1 ? '' : 's'} need${others === 1 ? 's' : ''} you.`
      : null;

  return { headline, subheadline };
}

function headlineForCard(card: BriefCard): string {
  const { kind, subject, evidence } = card;
  switch (kind) {
    case 'review':
      // Pipeline review — usually a stuck deal.
      return `${subject.name}: ${evidence.toLowerCase()}.`;
    case 'prep':
      // Upcoming tour — "Reynolds tour at 10:00 AM."
      return `${subject.name} — ${evidence}.`;
    case 'call':
      return `Call ${subject.name}. ${evidence}`;
    case 'reply':
      return `Reach ${subject.name}. ${evidence}`;
    case 'sign':
      return `${subject.name} is awaiting signature.`;
    case 'celebrate':
      return `${subject.name}. ${evidence}`;
    default:
      return `${subject.name}. ${evidence}`;
  }
}

/**
 * What Chippi says when the realtor has nothing on fire. The right to
 * say nothing is the central design rule; this is its prose.
 */
function composeEmptyState(): { invitation: string } {
  return {
    invitation: 'Quiet morning. Nothing chasing you. Want me to start prospecting?',
  };
}

/**
 * The main entry. Reads from all signal sources for the given space,
 * ranks, selects, composes, returns one Brief.
 */
export async function composeBrief(spaceId: string): Promise<Brief> {
  const results = await Promise.allSettled(SOURCES.map((s) => s.gather(spaceId)));

  const allSignals: Signal[] = [];
  const sourcesUsed = new Set<SignalSource>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const source = SOURCES[i].source;
    if (result.status !== 'fulfilled') continue;
    if (result.value.length > 0) sourcesUsed.add(source);
    for (const signal of result.value) {
      if (signal.confidence > CONFIDENCE_FLOOR) allSignals.push(signal);
    }
  }

  const ranked = rankSignals(allSignals);
  const cards = selectCards(ranked);

  if (cards.length === 0) {
    return {
      headline: 'Quiet morning.',
      subheadline: null,
      cards: [],
      momentum: null,
      tomorrow: null,
      emptyState: composeEmptyState(),
      sourcesUsed: [...sourcesUsed],
    };
  }

  const { headline, subheadline } = composeHeadline(cards);

  return {
    headline,
    subheadline,
    cards,
    // Phase B will fill these. Phase A intentionally leaves them null
    // rather than fabricating prose without the data behind it.
    momentum: null,
    tomorrow: null,
    emptyState: null,
    sourcesUsed: [...sourcesUsed],
  };
}

// ── Exports for testing — the composer is the one piece worth locking ──

export const __internals = {
  rankSignals,
  selectCards,
  composeHeadline,
};
