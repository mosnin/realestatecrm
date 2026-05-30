/**
 * Types for the daily brief — Chippi's 7am snapshot.
 *
 * The composer is a ranker over a list of Signals. Each integration the
 * realtor connects registers a new signal source; the composer is agnostic.
 * Phase A ships with three internal sources (pipeline, leads, calendar);
 * Phase B layers external integrations on top with no composer change.
 */

import type { Conversation } from '@/lib/types';

/**
 * What kind of action a signal asks the realtor to take. Each maps to a
 * single verb on the brief card; the realtor's morning brain reads the
 * tag once, knows what kind of decision is coming, then taps.
 */
export type SignalKind =
  /** Inbound message awaiting a reply. */
  | 'reply'
  /** Touch via phone — the contact prefers voice or has cooled to text. */
  | 'call'
  /** Upcoming meeting / tour, briefed with relevant context. */
  | 'prep'
  /** Deal review — a stage is slipping or a contingency is exposed. */
  | 'review'
  /** Document awaiting signature. */
  | 'sign'
  /** Acknowledge a win — closing, commission, milestone. */
  | 'celebrate';

/**
 * How urgent — 1 is "today, before noon," 3 is "this week, soon." The
 * composer sorts by urgency ascending, breaking ties on -confidence.
 */
export type SignalUrgency = 1 | 2 | 3;

/**
 * Which side of the data wall this signal came from. Internal sources
 * read Chippi's own Supabase tables; external sources read connected
 * integrations. Surfaced to the rendered Brief as a `sourcesUsed` array
 * so the realtor can see which integrations earned their slot.
 */
export type SignalSource =
  | 'pipeline'         // Chippi DB — Deal table, dealHealth signals
  | 'leads'            // Chippi DB — Contact table, leadScore + follow-ups
  | 'calendar'         // Chippi DB — Tour table
  | 'gmail'            // Phase B — Composio Gmail trigger feed
  | 'calendar_google'  // Phase B — Composio Google Calendar
  | 'slack'            // Phase B — Composio Slack
  | 'hubspot';         // Phase B — Composio HubSpot

/** The thing the card is about. `href` is the deep-link the surface opens. */
export interface SignalSubject {
  id: string;
  name: string;
  href: string;
}

/**
 * A drafted action the realtor can approve with one tap. Carries the
 * pre-staged content so the brief surface can render it inline without
 * a second round-trip.
 */
export type DraftedAction =
  | { kind: 'send-email'; subject: string; body: string; recipientId: string }
  | { kind: 'send-sms'; body: string; recipientId: string }
  | { kind: 'log-call'; recipientId: string }
  | { kind: 'open'; href: string };

/**
 * The atomic unit the composer ranks. Every signal source produces these
 * and returns them from `gather()`.
 */
export interface Signal {
  source: SignalSource;
  kind: SignalKind;
  urgency: SignalUrgency;
  /** 0-1. Floor at 0.7 — below this, the signal doesn't compete. */
  confidence: number;
  subject: SignalSubject;
  /** The receipt — one sentence the realtor can verify in their head. */
  evidence: string;
  draftedAction?: DraftedAction;
}

/**
 * A rendered card in the Brief. Lighter than Signal — what the UI reads.
 * The composer translates Signal → BriefCard during selection.
 */
export interface BriefCard {
  kind: SignalKind;
  source: SignalSource;
  subject: SignalSubject;
  evidence: string;
  draftedAction: DraftedAction | null;
}

/**
 * The full Brief — what gets persisted to the Brief.payload column and
 * read by the workspace surface.
 */
export interface Brief {
  /** The lead sentence. Title-serif on the surface. */
  headline: string;
  /** Optional second sentence — "Drafted a check-in. Three other things need you." */
  subheadline: string | null;
  /** 0-5 cards. Empty when no signals beat the confidence floor. */
  cards: BriefCard[];
  /** Closing prose, plain sentences. Null when there's nothing to say. */
  momentum: string | null;
  tomorrow: string | null;
  /**
   * Set ONLY when cards is empty AND momentum is empty. The right to say
   * nothing — Chippi offers an invitation instead of filler.
   */
  emptyState: { invitation: string } | null;
  sourcesUsed: SignalSource[];
}

/** The signal source contract. Each integration ships one of these. */
export interface SignalGatherer {
  source: SignalSource;
  /** Pull the realtor's signals from this source. May return []. */
  gather(spaceId: string): Promise<Signal[]>;
}

/**
 * Confidence floor — signals at or below this don't compete for slots.
 * Calibrated so a "kind of warm lead from a month ago" doesn't crowd
 * out a stuck deal with hard evidence.
 */
export const CONFIDENCE_FLOOR = 0.7;

/** Maximum cards per brief. Above this, the brain stops triaging. */
export const MAX_CARDS = 5;
