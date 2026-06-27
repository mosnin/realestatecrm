/**
 * parseImmediateEvents reads AGENT_IMMEDIATE_EVENTS into the Set of events the
 * agent fires on immediately. Its safety posture is fail-OPEN-to-all: blank,
 * "all", or any unrecognized/garbled token defaults to the full event set
 * rather than silently dropping triggers — a realtor losing a "new_lead" ping
 * because of a typo'd env var would be worse than firing on everything. It also
 * returns a fresh Set each call so callers can't mutate the shared cache. Pin
 * the allowlist, the fail-to-all branches, and the defensive copy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTriggerEvent, parseImmediateEvents } from '@/lib/agent/trigger-policy';

const ALL = [
  'new_lead',
  'tour_completed',
  'deal_stage_changed',
  'application_submitted',
  'inbound_message',
  'goal_completed',
];

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('isTriggerEvent', () => {
  it('accepts known events and rejects anything else', () => {
    expect(isTriggerEvent('new_lead')).toBe(true);
    expect(isTriggerEvent('goal_completed')).toBe(true);
    expect(isTriggerEvent('exploded')).toBe(false);
    expect(isTriggerEvent('')).toBe(false);
  });
});

describe('parseImmediateEvents — fail-open-to-all', () => {
  it('defaults to ALL events for undefined, blank, or "all"', () => {
    expect([...parseImmediateEvents(undefined)].sort()).toEqual([...ALL].sort());
    expect([...parseImmediateEvents('   ')].sort()).toEqual([...ALL].sort());
    expect([...parseImmediateEvents('ALL')].sort()).toEqual([...ALL].sort());
  });

  it('defaults to ALL when any token is invalid (and warns once)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect([...parseImmediateEvents('new_lead,bogus')].sort()).toEqual([...ALL].sort());
    parseImmediateEvents('new_lead,bogus'); // same raw → warn not repeated
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('parseImmediateEvents — explicit selection', () => {
  it('parses a comma list of valid events, trimming whitespace', () => {
    expect([...parseImmediateEvents('new_lead, tour_completed')].sort()).toEqual(
      ['new_lead', 'tour_completed'].sort(),
    );
  });

  it('returns a fresh Set each call so the cache cannot be mutated', () => {
    const a = parseImmediateEvents('inbound_message');
    a.add('goal_completed'); // mutate the returned set
    const b = parseImmediateEvents('inbound_message');
    expect([...b]).toEqual(['inbound_message']); // unaffected by the mutation
    expect(a).not.toBe(b);
  });
});
