/**
 * trigger-ops guards the operator-grade agent endpoints (read/clear the trigger
 * log, replay events, edit config) — no realtor UI calls them. triggerOpsEnabled
 * is a feature flag defaulting ON; triggerOpsAuthorized FAILS CLOSED: with no
 * secret configured the endpoints are LOCKED (not left open). Pin the flag
 * parsing and especially the fail-closed default + header matching — a regression
 * exposes a destructive surface to every signed-in user.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { triggerOpsEnabled, triggerOpsAuthorized } from '@/lib/agent/trigger-ops';

const ENABLED = process.env.AGENT_TRIGGER_OPS_ENABLED;
const SECRET = process.env.AGENT_TRIGGER_OPS_SECRET;

afterEach(() => {
  if (ENABLED === undefined) delete process.env.AGENT_TRIGGER_OPS_ENABLED;
  else process.env.AGENT_TRIGGER_OPS_ENABLED = ENABLED;
  if (SECRET === undefined) delete process.env.AGENT_TRIGGER_OPS_SECRET;
  else process.env.AGENT_TRIGGER_OPS_SECRET = SECRET;
});

const req = (headers: Record<string, string>) => new Request('http://x.test/ops', { headers });

describe('triggerOpsEnabled', () => {
  it('defaults ON when the env var is unset', () => {
    delete process.env.AGENT_TRIGGER_OPS_ENABLED;
    expect(triggerOpsEnabled()).toBe(true);
  });

  it('parses truthy values (case-insensitive, trimmed)', () => {
    for (const v of ['1', 'true', 'YES', ' on ']) {
      process.env.AGENT_TRIGGER_OPS_ENABLED = v;
      expect(triggerOpsEnabled()).toBe(true);
    }
  });

  it('treats anything else as OFF', () => {
    for (const v of ['0', 'false', 'no', 'off', 'maybe']) {
      process.env.AGENT_TRIGGER_OPS_ENABLED = v;
      expect(triggerOpsEnabled()).toBe(false);
    }
  });
});

describe('triggerOpsAuthorized', () => {
  it('FAILS CLOSED when no secret is configured (endpoints locked)', () => {
    delete process.env.AGENT_TRIGGER_OPS_SECRET;
    expect(triggerOpsAuthorized(req({ 'x-agent-ops-secret': 'anything' }))).toBe(false);
    expect(triggerOpsAuthorized(req({}))).toBe(false);
  });

  it('authorizes a matching x-agent-ops-secret header', () => {
    process.env.AGENT_TRIGGER_OPS_SECRET = 's3cret';
    expect(triggerOpsAuthorized(req({ 'x-agent-ops-secret': 's3cret' }))).toBe(true);
    expect(triggerOpsAuthorized(req({ 'x-agent-ops-secret': 'wrong' }))).toBe(false);
  });

  it('authorizes a matching Bearer authorization header', () => {
    process.env.AGENT_TRIGGER_OPS_SECRET = 's3cret';
    expect(triggerOpsAuthorized(req({ authorization: 'Bearer s3cret' }))).toBe(true);
    expect(triggerOpsAuthorized(req({ authorization: 'Bearer nope' }))).toBe(false);
  });

  it('denies when no auth header is present', () => {
    process.env.AGENT_TRIGGER_OPS_SECRET = 's3cret';
    expect(triggerOpsAuthorized(req({}))).toBe(false);
  });
});
