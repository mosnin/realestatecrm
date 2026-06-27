/**
 * brokerageEntityId namespaces a brokerage-level Composio connection so a
 * broker's PERSONAL Gmail (entity = bare userId) and their BROKERAGE Gmail
 * don't collide on one Composio entity. The shape `brokerage:<brokerageId>:
 * <userId>` must be deterministic (connect route + OAuth callback resolve to
 * the same entity) and must never equal the bare userId. Pin both — a
 * regression cross-wires two people's inboxes.
 */

import { describe, it, expect } from 'vitest';
import { brokerageEntityId } from '@/lib/integrations/brokerage-entity';

describe('brokerageEntityId', () => {
  it('builds the brokerage:<brokerageId>:<userId> shape', () => {
    expect(brokerageEntityId({ brokerageId: 'brk_1', userId: 'usr_9' })).toBe('brokerage:brk_1:usr_9');
  });

  it('is deterministic for the same inputs', () => {
    const a = brokerageEntityId({ brokerageId: 'b', userId: 'u' });
    const b = brokerageEntityId({ brokerageId: 'b', userId: 'u' });
    expect(a).toBe(b);
  });

  it('never collides with the bare userId (the realtor-flow entity)', () => {
    const userId = 'usr_9';
    expect(brokerageEntityId({ brokerageId: 'brk_1', userId })).not.toBe(userId);
  });

  it('distinguishes different brokerages for the same user', () => {
    const u = 'usr_9';
    expect(brokerageEntityId({ brokerageId: 'brk_1', userId: u })).not.toBe(
      brokerageEntityId({ brokerageId: 'brk_2', userId: u }),
    );
  });
});
