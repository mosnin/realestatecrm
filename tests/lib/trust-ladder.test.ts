/**
 * Unit tests for the trust ladder — the pure decision that turns a lane's track
 * record into a graduation offer (or not). The whole point is that autonomy is
 * EARNED and SAFE: the offer must be conservative (never on a thin or shaky
 * record) and must respect a prior dismissal.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateGraduation,
  nextAutonomy,
  previousAutonomy,
  autonomyLabel,
  laneStatsFromDraftStats,
  type LaneStats,
} from '@/lib/trust-ladder';

const clean = (approvedUnchanged: number): LaneStats => ({
  approvedUnchanged,
  edited: 0,
  rejected: 0,
});

describe('ladder rungs', () => {
  it('climbs draft → notify → auto', () => {
    expect(nextAutonomy('draft')).toBe('notify');
    expect(nextAutonomy('notify')).toBe('auto');
    expect(nextAutonomy('auto')).toBeNull();
  });
  it('descends for take-it-back', () => {
    expect(previousAutonomy('auto')).toBe('notify');
    expect(previousAutonomy('notify')).toBe('draft');
    expect(previousAutonomy('draft')).toBeNull();
  });
  it('labels each rung', () => {
    expect(autonomyLabel('draft')).toMatch(/draft/i);
    expect(autonomyLabel('auto')).toMatch(/autonomous/i);
  });
});

describe('laneStatsFromDraftStats — bridges real draft feedback', () => {
  it('maps the draft-stats shape onto lane stats', () => {
    const ls = laneStatsFromDraftStats({ approved: 9, editedAndApproved: 1, rejected: 0 });
    expect(ls).toEqual({ approvedUnchanged: 9, edited: 1, rejected: 0, dismissedOffer: false });
  });

  it('real draft feedback flows straight into a graduation decision', () => {
    const ls = laneStatsFromDraftStats({ approved: 10, editedAndApproved: 0, rejected: 0 });
    expect(evaluateGraduation('draft', ls).offer).toBe(true);
  });

  it('carries a dismissal through', () => {
    const ls = laneStatsFromDraftStats({ approved: 20, editedAndApproved: 0, rejected: 0 }, true);
    expect(evaluateGraduation('draft', ls).offer).toBe(false);
  });
});

describe('evaluateGraduation — offers when earned', () => {
  it('offers draft → notify after enough clean approvals', () => {
    const o = evaluateGraduation('draft', clean(8));
    expect(o.offer).toBe(true);
    expect(o.from).toBe('draft');
    expect(o.to).toBe('notify');
    expect(o.reason).toMatch(/8/);
    expect(o.reason).toMatch(/take it back/i);
  });

  it('offers notify → auto once notify is trusted', () => {
    const o = evaluateGraduation('notify', clean(12));
    expect(o.offer).toBe(true);
    expect(o.to).toBe('auto');
  });
});

describe('evaluateGraduation — withholds when not earned', () => {
  it('no offer below the approval threshold', () => {
    expect(evaluateGraduation('draft', clean(7)).offer).toBe(false);
  });

  it('no offer when the edit rate is too high (drafts not landing)', () => {
    // 8 unchanged but 4 edited → editRate 0.33 > 0.2.
    const o = evaluateGraduation('draft', { approvedUnchanged: 8, edited: 4, rejected: 0 });
    expect(o.offer).toBe(false);
  });

  it('no offer when drafts are being rejected', () => {
    const o = evaluateGraduation('draft', { approvedUnchanged: 10, edited: 0, rejected: 3 });
    expect(o.offer).toBe(false);
  });

  it('never offers past the top rung', () => {
    expect(evaluateGraduation('auto', clean(100)).offer).toBe(false);
    expect(evaluateGraduation('auto', clean(100)).to).toBeNull();
  });

  it('respects a prior dismissal', () => {
    const o = evaluateGraduation('draft', { ...clean(20), dismissedOffer: true });
    expect(o.offer).toBe(false);
  });

  it('a small edit rate within tolerance still offers', () => {
    // 9 unchanged, 1 edited → editRate 0.1 ≤ 0.2, no rejects.
    const o = evaluateGraduation('draft', { approvedUnchanged: 9, edited: 1, rejected: 0 });
    expect(o.offer).toBe(true);
  });

  it('config overrides the thresholds', () => {
    // Raise the bar to 20 — 8 no longer qualifies.
    const o = evaluateGraduation('draft', clean(8), { minApprovedUnchanged: 20 });
    expect(o.offer).toBe(false);
  });
});
