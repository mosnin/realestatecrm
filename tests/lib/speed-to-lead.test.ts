/**
 * Behavioral tests for lib/analytics/speed-to-lead.ts — the pure
 * speed-to-lead math behind the realtor overview and broker analytics cards.
 *
 * Contract under test:
 *   - median/p90 use linear interpolation over touched leads only.
 *   - The FIRST event (message or sent draft) at/after Contact.createdAt
 *     wins; earlier-timestamped events (merged/backfilled rows) are ignored.
 *   - Chippi attribution counts a lead only when the WINNING event was the
 *     instant first-touch draft send.
 *   - Honest-display gate: meaningfulSpeedToLead() suppresses results with
 *     fewer than 3 touched leads.
 *   - formatSpeedToLead renders humane durations ("14m" / "2.3h" / "1.4d").
 */

import { describe, expect, it } from 'vitest';
import {
  computeSpeedToLead,
  formatSpeedToLead,
  lastNDaysWindow,
  meaningfulSpeedToLead,
  SPEED_TO_LEAD_MIN_TOUCHED,
  SPEED_TO_LEAD_WINDOW_DAYS,
  type SpeedToLeadDraftRow,
  type SpeedToLeadLeadRow,
  type SpeedToLeadMessageRow,
} from '@/lib/analytics/speed-to-lead';

const T0 = Date.parse('2026-07-01T00:00:00Z');
const iso = (offsetMinutes: number) => new Date(T0 + offsetMinutes * 60_000).toISOString();

const lead = (id: string, createdAtMin = 0): SpeedToLeadLeadRow => ({
  id,
  createdAt: iso(createdAtMin),
});
const msg = (
  contactId: string,
  atMin: number,
  firstTouch = false,
): SpeedToLeadMessageRow => ({ contactId, createdAt: iso(atMin), firstTouch });
const draft = (
  contactId: string,
  atMin: number,
  firstTouch = false,
): SpeedToLeadDraftRow => ({ contactId, sentAt: iso(atMin), firstTouch });

describe('computeSpeedToLead', () => {
  it('computes interpolated median and p90 over touched leads (even count)', () => {
    // Durations: 10, 20, 30, 40 minutes.
    const leads = [lead('a'), lead('b'), lead('c'), lead('d')];
    const messages = [msg('a', 10), msg('b', 20), msg('c', 30), msg('d', 40)];
    const r = computeSpeedToLead(leads, messages, []);
    expect(r.leadCount).toBe(4);
    expect(r.touchedCount).toBe(4);
    expect(r.medianMinutes).toBe(25); // avg of 20 and 30
    expect(r.p90Minutes).toBeCloseTo(37, 5); // 30 + 0.7 * (40 - 30)
  });

  it('computes exact median on odd counts and uses only the FIRST touch per lead', () => {
    const leads = [lead('a'), lead('b'), lead('c')];
    const messages = [
      msg('a', 5),
      msg('a', 500), // later message must not shift a's duration
      msg('b', 15),
      msg('c', 25),
    ];
    const r = computeSpeedToLead(leads, messages, []);
    expect(r.touchedCount).toBe(3);
    expect(r.medianMinutes).toBe(15);
    expect(r.p90Minutes).toBeCloseTo(23, 5); // 15 + 0.8 * (25 - 15)
  });

  it('counts untouched leads in leadCount but never in the distribution', () => {
    const leads = [lead('a'), lead('b'), lead('untouched')];
    const r = computeSpeedToLead(leads, [msg('a', 10), msg('b', 30)], []);
    expect(r.leadCount).toBe(3);
    expect(r.touchedCount).toBe(2);
    expect(r.medianMinutes).toBe(20);
  });

  it('ignores events timestamped before the lead existed (no negative durations)', () => {
    const leads = [lead('a', 60)]; // created at +60m
    const r = computeSpeedToLead(leads, [msg('a', 30)], [draft('a', 90)]);
    expect(r.touchedCount).toBe(1);
    expect(r.medianMinutes).toBe(30); // 90 - 60, not 30 - 60
  });

  it('returns an all-null/zero result when nothing was touched', () => {
    const r = computeSpeedToLead([lead('a')], [], []);
    expect(r).toEqual({
      leadCount: 1,
      touchedCount: 0,
      medianMinutes: null,
      p90Minutes: null,
      chippiFirstCount: 0,
    });
  });

  it('attributes a lead to Chippi only when the WINNING event is a first-touch send', () => {
    const leads = [lead('chippi-won'), lead('realtor-beat-chippi'), lead('manual-only')];
    const messages = [
      // Chippi's first-touch message lands first for this lead.
      msg('chippi-won', 4, true),
      msg('chippi-won', 200, false),
      // Realtor emailed before the first-touch draft went out.
      msg('realtor-beat-chippi', 10, false),
      msg('manual-only', 45, false),
    ];
    const drafts = [
      // First-touch draft sent AFTER the realtor's own email — must not count.
      draft('realtor-beat-chippi', 30, true),
    ];
    const r = computeSpeedToLead(leads, messages, drafts);
    expect(r.touchedCount).toBe(3);
    expect(r.chippiFirstCount).toBe(1);
  });

  it('counts a first touch that only exists as a sent AgentDraft (no transcript row)', () => {
    const leads = [lead('a')];
    const r = computeSpeedToLead(leads, [], [draft('a', 7, true)]);
    expect(r.touchedCount).toBe(1);
    expect(r.medianMinutes).toBe(7);
    expect(r.chippiFirstCount).toBe(1);
  });
});

describe('meaningfulSpeedToLead (honest-display gate)', () => {
  const base = {
    leadCount: 10,
    touchedCount: 3,
    medianMinutes: 12,
    p90Minutes: 40,
    chippiFirstCount: 2,
  };

  it('suppresses results with fewer than 3 touched leads', () => {
    expect(SPEED_TO_LEAD_MIN_TOUCHED).toBe(3);
    expect(meaningfulSpeedToLead({ ...base, touchedCount: 2 })).toBeNull();
    expect(meaningfulSpeedToLead(null)).toBeNull();
    expect(meaningfulSpeedToLead(undefined)).toBeNull();
    expect(
      meaningfulSpeedToLead({ ...base, medianMinutes: null, p90Minutes: null }),
    ).toBeNull();
  });

  it('passes through a result that clears the bar', () => {
    expect(meaningfulSpeedToLead(base)).toEqual(base);
  });
});

describe('formatSpeedToLead', () => {
  it('renders humane durations', () => {
    expect(formatSpeedToLead(0.4)).toBe('<1m');
    expect(formatSpeedToLead(14)).toBe('14m');
    expect(formatSpeedToLead(59.7)).toBe('1h'); // rounds up past the minute band
    expect(formatSpeedToLead(138)).toBe('2.3h');
    expect(formatSpeedToLead(120)).toBe('2h'); // no trailing ".0"
    expect(formatSpeedToLead(720)).toBe('12h');
    expect(formatSpeedToLead(2016)).toBe('1.4d');
    expect(formatSpeedToLead(60 * 24 * 12)).toBe('12d');
  });
});

describe('lastNDaysWindow', () => {
  it('spans the configured rolling window ending now', () => {
    const w = lastNDaysWindow();
    expect(w.to.getTime() - w.from.getTime()).toBe(
      SPEED_TO_LEAD_WINDOW_DAYS * 86_400_000,
    );
    expect(w.to.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
