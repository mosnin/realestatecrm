/**
 * The brokerage intake page (/apply/b/[brokerageId]) renders IntakeChat with a
 * `brokerageId`. Before this fix, IntakeChat always POSTed to the per-realtor
 * /api/public/apply route, which keys off `slug` and ignores `brokerageId` —
 * so brokerage-only logic (auto-assignment via routeBrokerageLead, the broker
 * dashboard notification, and the 'brokerage-lead' tag) never ran for leads
 * applying through the brokerage URL.
 *
 * resolveApplyEndpoint is the wiring that fixes it: a brokerage intake must
 * hit the dedicated brokerage endpoint, a per-realtor intake the per-realtor
 * one. These tests pin that routing decision without rendering the component
 * (mirrors tests/components/batch-approve-payload.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { resolveApplyEndpoint } from '@/components/intake-chat/intake-chat';

describe('resolveApplyEndpoint', () => {
  it('routes brokerage intakes to the dedicated brokerage endpoint (the core fix)', () => {
    expect(resolveApplyEndpoint('7db980fd-026c-46da-b2b2-29875eb083f5')).toBe(
      '/api/public/apply/brokerage',
    );
  });

  it('routes per-realtor intakes to the per-realtor endpoint', () => {
    expect(resolveApplyEndpoint(undefined)).toBe('/api/public/apply');
    expect(resolveApplyEndpoint(null)).toBe('/api/public/apply');
  });

  it("treats an empty-string brokerageId as 'no brokerage' (per-realtor)", () => {
    // A falsy brokerageId must never be coerced into the brokerage path —
    // the brokerage route would 400 on an invalid id, breaking submission.
    expect(resolveApplyEndpoint('')).toBe('/api/public/apply');
  });
});
