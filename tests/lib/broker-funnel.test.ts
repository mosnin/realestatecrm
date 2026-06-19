import { describe, it, expect } from 'vitest';
import { biggestLeak, FUNNEL_STEP_LABEL } from '@/lib/broker-funnel';

describe('biggestLeak', () => {
  it('returns null when no stage carries any volume', () => {
    expect(
      biggestLeak({
        totalLeads: 0,
        tours: 0,
        applications: 0,
        leadToTour: 0,
        tourToApp: 0,
        appToDeal: 0,
      }),
    ).toBeNull();
  });

  it('names the lowest pass-through whose source stage has volume', () => {
    // lead→tour is worst at 20%; tour→app 50%; app→deal 80%.
    const leak = biggestLeak({
      totalLeads: 100,
      tours: 20,
      applications: 10,
      leadToTour: 20,
      tourToApp: 50,
      appToDeal: 80,
    });
    expect(leak).toEqual({ key: 'leadToTour', pct: 20 });
  });

  it('ignores an empty downstream step even if its rate reads 0%', () => {
    // No tours at all → tour→app (0%) and app→deal (0%) are empty, not leaks.
    // The only step with inbound volume is lead→tour, so it wins despite a
    // healthy-looking 0 elsewhere.
    const leak = biggestLeak({
      totalLeads: 50,
      tours: 0,
      applications: 0,
      leadToTour: 0,
      tourToApp: 0,
      appToDeal: 0,
    });
    expect(leak).toEqual({ key: 'leadToTour', pct: 0 });
  });

  it('breaks ties toward the earliest pipeline step', () => {
    // lead→tour and tour→app both at 40%, both carrying volume. The earlier
    // step wins because fixing it compounds downstream.
    const leak = biggestLeak({
      totalLeads: 100,
      tours: 40,
      applications: 16,
      leadToTour: 40,
      tourToApp: 40,
      appToDeal: 90,
    });
    expect(leak?.key).toBe('leadToTour');
  });

  it('selects a mid-funnel leak when it is genuinely the weakest', () => {
    const leak = biggestLeak({
      totalLeads: 100,
      tours: 80,
      applications: 8,
      leadToTour: 80,
      tourToApp: 10,
      appToDeal: 75,
    });
    expect(leak).toEqual({ key: 'tourToApp', pct: 10 });
  });

  it('exposes a human label for every step key', () => {
    expect(FUNNEL_STEP_LABEL.leadToTour).toBe('Lead → tour');
    expect(FUNNEL_STEP_LABEL.tourToApp).toBe('Tour → app');
    expect(FUNNEL_STEP_LABEL.appToDeal).toBe('App → deal');
  });
});
