/**
 * parseTriggerEventLog reads a stored trigger-event log line (JSON) back into a
 * typed record for the automation activity view. It must hard-validate untrusted
 * stored strings: required event + at strings, a status from the closed set, and
 * nullable contact/deal ids defaulting to null. Anything malformed returns null
 * rather than throwing — a regression would crash the activity feed on bad data.
 */

import { describe, it, expect } from 'vitest';
import { parseTriggerEventLog } from '@/lib/agent/trigger-events';

describe('parseTriggerEventLog', () => {
  it('parses a well-formed line and defaults nullable ids', () => {
    const r = parseTriggerEventLog(JSON.stringify({ event: 'lead.created', status: 'queued', at: '2026-06-27T00:00:00Z' }));
    expect(r).toEqual({ event: 'lead.created', contactId: null, dealId: null, status: 'queued', at: '2026-06-27T00:00:00Z' });
  });

  it('keeps provided contact/deal ids', () => {
    const r = parseTriggerEventLog(
      JSON.stringify({ event: 'deal.moved', contactId: 'c1', dealId: 'd1', status: 'replayed', at: 't' }),
    );
    expect(r).toMatchObject({ contactId: 'c1', dealId: 'd1', status: 'replayed' });
  });

  it('accepts every status in the closed set', () => {
    for (const status of ['deduped', 'queued', 'queued_modal', 'replayed']) {
      expect(parseTriggerEventLog(JSON.stringify({ event: 'e', status, at: 't' }))?.status).toBe(status);
    }
  });

  it('returns null for an unknown status', () => {
    expect(parseTriggerEventLog(JSON.stringify({ event: 'e', status: 'exploded', at: 't' }))).toBeNull();
  });

  it('returns null when required fields are missing or wrong-typed', () => {
    expect(parseTriggerEventLog(JSON.stringify({ status: 'queued', at: 't' }))).toBeNull(); // no event
    expect(parseTriggerEventLog(JSON.stringify({ event: 'e', status: 'queued' }))).toBeNull(); // no at
    expect(parseTriggerEventLog(JSON.stringify({ event: 42, status: 'queued', at: 't' }))).toBeNull(); // event not string
  });

  it('returns null on non-JSON or non-object input (never throws)', () => {
    expect(parseTriggerEventLog('not json')).toBeNull();
    expect(parseTriggerEventLog('null')).toBeNull();
    expect(parseTriggerEventLog('"a string"')).toBeNull();
    expect(parseTriggerEventLog('[1,2,3]')).toBeNull();
  });
});
