/**
 * Unit tests for the curated-trigger guard that stops a silently-dead
 * integration_event workflow from being saved — a workflow whose toolkit/event
 * isn't one we subscribe with Composio could never match a live delivery, so it
 * must be rejected at save time, not discovered as "it never fires".
 */

import { describe, it, expect } from 'vitest';
import {
  isCuratedTriggerEvent,
  validateIntegrationTrigger,
} from '@/lib/integrations/trigger-catalog';
import { CURATED_TRIGGERS } from '@/lib/integrations/triggers';
import type { WorkflowDefinition } from '@/lib/workflows/schema';

const draft = { type: 'draft_message', config: { channel: 'sms', instruction: 'hi' } } as const;

function def(trigger: WorkflowDefinition['trigger']): WorkflowDefinition {
  return { trigger, conditions: { op: 'and', rules: [] }, actions: [draft], autonomy: 'draft' };
}

// A real curated pair to anchor the tests (gmail's new-message slug).
const GMAIL_SLUG = CURATED_TRIGGERS.gmail?.[0] ?? 'GMAIL_NEW_GMAIL_MESSAGE';

describe('isCuratedTriggerEvent', () => {
  it('accepts a real curated toolkit/event pair', () => {
    expect(isCuratedTriggerEvent('gmail', GMAIL_SLUG)).toBe(true);
  });
  it('rejects an unknown toolkit', () => {
    expect(isCuratedTriggerEvent('not-a-real-app', GMAIL_SLUG)).toBe(false);
  });
  it('rejects a slug that isn’t curated for that toolkit', () => {
    expect(isCuratedTriggerEvent('gmail', 'new_message')).toBe(false);
    expect(isCuratedTriggerEvent('gmail', GMAIL_SLUG.toLowerCase())).toBe(false);
  });
});

describe('validateIntegrationTrigger', () => {
  it('passes a non-integration trigger through (returns null)', () => {
    expect(validateIntegrationTrigger(def({ type: 'lead_created', config: {} }))).toBeNull();
    expect(
      validateIntegrationTrigger(def({ type: 'lead_score_threshold', config: { min: 80 } })),
    ).toBeNull();
  });

  it('passes a curated integration_event', () => {
    expect(
      validateIntegrationTrigger(
        def({ type: 'integration_event', config: { toolkit: 'gmail', event: GMAIL_SLUG } }),
      ),
    ).toBeNull();
  });

  it('rejects a typo’d / non-curated event with a realtor-facing message', () => {
    const msg = validateIntegrationTrigger(
      def({ type: 'integration_event', config: { toolkit: 'gmail', event: 'new_message' } }),
    );
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/new_message/);
    expect(msg).toMatch(/fire/i);
  });

  it('rejects an unknown toolkit', () => {
    expect(
      validateIntegrationTrigger(
        def({ type: 'integration_event', config: { toolkit: 'madeup', event: GMAIL_SLUG } }),
      ),
    ).toBeTruthy();
  });
});
