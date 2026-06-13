/**
 * After-Close signal source — reads the realtor's relationship book for the
 * two retention moments worth a morning card:
 *
 *   1. A past client whose closing ANNIVERSARY is coming up (~14 days out).
 *      The anniversary call is the single highest-ROI sphere touch a realtor
 *      makes; missing it is the difference between a repeat client and a
 *      stranger who used you once.
 *   2. A sphere contact with a DUE scheduled touch (nextTouchAt <= now) —
 *      a quarterly check-in, market update, or outreach the realtor (or the
 *      sphere sweep) already decided to make.
 *
 * Brokerage-routed contacts (brokerageId !== null) are excluded — those are
 * the brokerage's queue, not on this realtor's desk. Same convention as the
 * leads source this is modeled on.
 *
 * Reuses the 'leads' SignalSource tag: these are Contact-table signals, same
 * as the leads source, and the brief's `sourcesUsed` groups them honestly
 * under the realtor's book of people. No new source enum to maintain.
 *
 * Confidence calibration:
 *   - Closing anniversary inside 7 days:                 0.90
 *   - Closing anniversary inside 14 days:                0.84
 *   - Scheduled touch overdue (nextTouchAt in the past): 0.86
 *   - Scheduled touch due today:                         0.82
 */

import { supabase } from '@/lib/supabase';
import type { Signal, SignalGatherer, SignalKind } from '../types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ANNIVERSARY_WINDOW_DAYS = 14;

type ContactRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationshipStage: string | null;
  lastClosedAt: string | null;
  nextTouchAt: string | null;
};

/**
 * Days from `now` until the next month/day anniversary of `closedAt`,
 * wrapping the year boundary. Returns null if the date is unparseable.
 *
 * Compared on UTC month/day only — an anniversary is a calendar date, not a
 * 365-day count, so leap years and timezones don't shift "it's been a year."
 */
function daysUntilAnniversary(closedAt: string | null, now: Date): number | null {
  if (!closedAt) return null;
  const closed = new Date(closedAt);
  if (isNaN(closed.getTime())) return null;

  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), closed.getUTCMonth(), closed.getUTCDate());
  if (next < todayUTC) {
    next = Date.UTC(now.getUTCFullYear() + 1, closed.getUTCMonth(), closed.getUTCDate());
  }
  return Math.round((next - todayUTC) / MS_PER_DAY);
}

/** Whole days since `dateString` (negative = in the future). Null if unparseable. */
function daysSince(dateString: string | null, now: Date): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thenUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((todayUTC - thenUTC) / MS_PER_DAY);
}

export const afterCloseSource: SignalGatherer = {
  source: 'leads',
  async gather(spaceId: string): Promise<Signal[]> {
    const now = new Date();

    const { data, error } = await supabase
      .from('Contact')
      .select('id, name, phone, email, relationshipStage, lastClosedAt, nextTouchAt')
      .eq('spaceId', spaceId)
      .is('brokerageId', null)
      .in('relationshipStage', ['past_client', 'dormant', 'referral_target']);

    if (error || !data) return [];

    const signals: Signal[] = [];

    for (const contact of data as ContactRow[]) {
      const subject = {
        id: contact.id,
        name: contact.name,
        href: `/contacts/${contact.id}`,
      };
      // Anniversary call wants the phone; a quiet sphere note can go either way.
      const channel: SignalKind = contact.phone ? 'call' : 'reply';

      // ── A scheduled touch that's come due wins the card for this person ──
      const touchDays = daysSince(contact.nextTouchAt, now);
      if (touchDays !== null && touchDays >= 0) {
        const overdue = touchDays > 0;
        signals.push({
          source: 'leads',
          kind: channel,
          urgency: overdue ? 1 : 2,
          confidence: overdue ? 0.86 : 0.82,
          subject,
          evidence: overdue
            ? `Sphere touch was due ${touchDays} day${touchDays === 1 ? '' : 's'} ago.`
            : 'Sphere touch is due today.',
          draftedAction: { kind: 'open', href: `/contacts/${contact.id}` },
        });
        continue;
      }

      // ── Otherwise, a closing anniversary inside the window ──
      const annivDays = daysUntilAnniversary(contact.lastClosedAt, now);
      if (annivDays !== null && annivDays >= 0 && annivDays <= ANNIVERSARY_WINDOW_DAYS) {
        const soon = annivDays <= 7;
        const whenPhrase =
          annivDays === 0
            ? 'today'
            : annivDays === 1
              ? 'tomorrow'
              : `in ${annivDays} days`;
        signals.push({
          source: 'leads',
          kind: channel,
          urgency: soon ? 1 : 3,
          confidence: soon ? 0.9 : 0.84,
          subject,
          evidence: `Closing anniversary ${whenPhrase}. A past client worth a hello.`,
          draftedAction: { kind: 'open', href: `/contacts/${contact.id}` },
        });
      }
    }

    return signals;
  },
};
