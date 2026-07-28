import { describe, expect, it } from 'vitest';
import { deriveChildGrant, MAX_CHILDREN_PER_RUN } from '@/lib/agent/delegation-policy';

describe('durable child-task permission inheritance', () => {
  const parent = {
    depth: 1,
    grantedCapabilities: ['integration:read', 'task:create_child', 'task:manage'] as const,
    deniedCapabilities: ['integration:write'] as const,
  };

  it('allows only a restricted subset and inherits denials', () => {
    expect(
      deriveChildGrant({
        parent: {
          depth: parent.depth,
          grantedCapabilities: [...parent.grantedCapabilities],
          deniedCapabilities: [...parent.deniedCapabilities],
        },
        requestedCapabilities: ['integration:read'],
        additionalDenials: ['task:create_child'],
        existingChildren: 0,
      }),
    ).toEqual({
      depth: 2,
      grantedCapabilities: ['integration:read'],
      deniedCapabilities: ['integration:write', 'task:create_child'],
    });
  });

  it('rejects privilege escalation and child quota overflow', () => {
    expect(() =>
      deriveChildGrant({
        parent: {
          depth: parent.depth,
          grantedCapabilities: [...parent.grantedCapabilities],
          deniedCapabilities: [...parent.deniedCapabilities],
        },
        requestedCapabilities: ['integration:write'],
        existingChildren: 0,
      }),
    ).toThrow(/cannot gain/);
    expect(() =>
      deriveChildGrant({
        parent: {
          depth: parent.depth,
          grantedCapabilities: [...parent.grantedCapabilities],
          deniedCapabilities: [...parent.deniedCapabilities],
        },
        requestedCapabilities: ['integration:read'],
        existingChildren: MAX_CHILDREN_PER_RUN,
      }),
    ).toThrow(/quota/);
  });
});
