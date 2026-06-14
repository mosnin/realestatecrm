/**
 * Guards the displayed annual prices (the /pricing monthly/annual toggle reads
 * these). The actual charge comes from the Stripe annual price id; this keeps
 * the ADVERTISED number pinned to "10% off 12× monthly, rounded" so the page
 * can't silently drift from what the Stripe annual prices were created at.
 */

import { describe, it, expect } from 'vitest';
import { PLANS, ANNUAL_DISCOUNT_RATE, annualPriceFor } from '@/lib/plans';

describe('annual pricing (display)', () => {
  it('discount rate is 10%', () => {
    expect(ANNUAL_DISCOUNT_RATE).toBe(0.1);
  });

  it('annualPriceFor = round(monthly * 12 * 0.9) for every paid plan', () => {
    for (const p of Object.values(PLANS)) {
      if (p.priceMonthly === 0) continue; // Free has no paid annual
      expect(annualPriceFor(p.id)).toBe(Math.round(p.priceMonthly * 12 * 0.9));
    }
  });

  it('matches the exact V2 annual amounts set up in Stripe', () => {
    expect(annualPriceFor('solo')).toBe(1048);
    expect(annualPriceFor('pro')).toBe(2128);
    expect(annualPriceFor('team')).toBe(5368);
    expect(annualPriceFor('team_plus')).toBe(9688);
  });

  it('is a real discount — cheaper than paying monthly for a year', () => {
    for (const p of Object.values(PLANS)) {
      if (p.priceMonthly === 0) continue;
      expect(annualPriceFor(p.id)).toBeLessThan(p.priceMonthly * 12);
    }
  });
});
