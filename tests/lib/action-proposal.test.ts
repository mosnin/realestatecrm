import { describe, expect, it } from 'vitest';
import { parseAgentActionProposal } from '@/lib/agent/action-proposal';

describe('agent action proposal contract', () => {
  const valid = {
    version: 1 as const,
    kind: 'external_message' as const,
    action: 'GMAIL_SEND_EMAIL',
    arguments: { to: 'synthetic@example.invalid', subject: 'Draft only' },
    rationale: 'A reply may move the synthetic deal forward.',
    risk: 'high' as const,
    expectedEffect: 'Send one email after explicit approval.',
    reversible: false,
    dedupeKey: 'synthetic-email-1',
  };

  it('accepts a typed reviewable proposal', () => {
    expect(parseAgentActionProposal(valid)).toMatchObject(valid);
  });

  it('rejects execution-shaped output without rationale and dedupe identity', () => {
    const { rationale: _rationale, dedupeKey: _dedupeKey, ...unsafe } = valid;
    expect(() => parseAgentActionProposal(unsafe)).toThrow();
  });
});
