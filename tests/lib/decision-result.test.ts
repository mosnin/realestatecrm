/**
 * createDecisionResult builds the durable record emitted when a realtor confirms
 * a consequential tool-UI action — it must carry the stable envelope
 * (kind:"decision", version:1), map the chosen action's id/label onto
 * actionId/actionLabel, thread the decisionId + optional payload through, and
 * stamp a valid ISO `at`. The output is what the assistant reads back to narrate
 * what happened, so it must also satisfy DecisionResultSchema. Pin all of that.
 */

import { describe, it, expect } from 'vitest';
import {
  createDecisionResult,
  DecisionResultSchema,
} from '@/components/tool-ui/shared/schema';

describe('createDecisionResult', () => {
  it('builds the stable envelope and maps action id/label', () => {
    const result = createDecisionResult({
      decisionId: 'deploy-target',
      action: { id: 'prod', label: 'Deploy to production' },
    });
    expect(result).toMatchObject({
      kind: 'decision',
      version: 1,
      decisionId: 'deploy-target',
      actionId: 'prod',
      actionLabel: 'Deploy to production',
    });
  });

  it('threads an optional payload through, and omits it when absent', () => {
    const withPayload = createDecisionResult({
      decisionId: 'd1',
      action: { id: 'a', label: 'A' },
      payload: { tier: 'pro', seats: 3 },
    });
    expect(withPayload.payload).toEqual({ tier: 'pro', seats: 3 });

    const without = createDecisionResult({
      decisionId: 'd1',
      action: { id: 'a', label: 'A' },
    });
    expect(without.payload).toBeUndefined();
  });

  it('stamps a valid ISO `at` and produces a schema-valid record', () => {
    const result = createDecisionResult({
      decisionId: 'd1',
      action: { id: 'a', label: 'A' },
      payload: { ok: true },
    });
    expect(() => new Date(result.at).toISOString()).not.toThrow();
    expect(result.at).toBe(new Date(result.at).toISOString());
    expect(DecisionResultSchema.safeParse(result).success).toBe(true);
  });
});
