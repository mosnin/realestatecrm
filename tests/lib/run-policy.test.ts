import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  mayExecuteIntegrationAction,
  runPolicyEnforcementMode,
  signRunPolicy,
  verifyRunPolicy,
} from '@/lib/agent/run-policy';

const SECRET = 'test-run-policy-secret-with-at-least-32-bytes';

beforeEach(() => {
  vi.stubEnv('AGENT_RUN_POLICY_SECRET', SECRET);
  vi.stubEnv('AGENT_RUN_POLICY_MODE', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function token(overrides: Record<string, unknown> = {}) {
  return signRunPolicy({
    runId: '6c60314e-1f04-4aa3-bf68-e6253fdfa25f',
    spaceId: 'space-1',
    subject: 'user-1',
    mode: 'unattended',
    capabilities: ['integration:read'],
    depth: 0,
    nonce: 'nonce-with-enough-entropy-123',
    ...overrides,
  });
}

describe('signed run policy', () => {
  it('verifies a valid tenant-bound grant', () => {
    const result = verifyRunPolicy(token(), {
      spaceId: 'space-1',
      requiredCapability: 'integration:read',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects tampering, cross-space use, and missing capabilities', () => {
    const good = token();
    expect(verifyRunPolicy(`${good}x`, { spaceId: 'space-1' })).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(verifyRunPolicy(good, { spaceId: 'space-2' })).toMatchObject({
      ok: false,
      reason: 'scope_mismatch',
    });
    expect(
      verifyRunPolicy(good, { spaceId: 'space-1', requiredCapability: 'integration:write' }),
    ).toMatchObject({ ok: false, reason: 'scope_mismatch' });
  });

  it('rejects expired grants', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'));
    const issued = token({ ttlSeconds: 30 });
    vi.setSystemTime(new Date('2026-07-28T12:01:00Z'));
    expect(verifyRunPolicy(issued, { spaceId: 'space-1' })).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('never lets unattended mode execute integration writes', () => {
    const verified = verifyRunPolicy(
      token({ capabilities: ['integration:read', 'integration:write'] }),
      { spaceId: 'space-1' },
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(mayExecuteIntegrationAction(verified.claims, 'read')).toBe(true);
    expect(mayExecuteIntegrationAction(verified.claims, 'write')).toBe(false);
  });

  it('requires explicit rollout opt-in for enforcement', () => {
    expect(runPolicyEnforcementMode()).toBe('shadow');
    vi.stubEnv('AGENT_RUN_POLICY_MODE', 'enforce');
    expect(runPolicyEnforcementMode()).toBe('enforce');
  });

  it('fails closed on an invalid rollout mode', () => {
    vi.stubEnv('AGENT_RUN_POLICY_MODE', 'enfore');
    expect(() => runPolicyEnforcementMode()).toThrow(/Invalid AGENT_RUN_POLICY_MODE/);
  });

  it('allows voice writes only with both write authority and an approval decision grant', () => {
    const withoutDecision = verifyRunPolicy(
      token({ mode: 'voice_control', capabilities: ['integration:write'] }),
      { spaceId: 'space-1' },
    );
    expect(withoutDecision.ok).toBe(true);
    if (withoutDecision.ok) {
      expect(mayExecuteIntegrationAction(withoutDecision.claims, 'write')).toBe(false);
    }

    const approvedVoice = verifyRunPolicy(
      token({
        mode: 'voice_control',
        capabilities: ['integration:write', 'proposal:decide'],
      }),
      { spaceId: 'space-1' },
    );
    expect(approvedVoice.ok).toBe(true);
    if (approvedVoice.ok) {
      expect(mayExecuteIntegrationAction(approvedVoice.claims, 'write')).toBe(true);
    }
  });
});
