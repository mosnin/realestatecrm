/**
 * test-run sampleContext scrubbing (FIX 5 — untrusted request JSON).
 *
 * scrubSampleContext layers a caller-supplied sampleContext over the synthetic
 * one, but ALWAYS forces entity ids (contact/lead/deal .id) back to the
 * synthetic 'sample' id — a caller can shape the run's data but can never point
 * it at a contact/lead/deal id it doesn't own. Anything that isn't a plain
 * object falls back to the synthetic context untouched.
 */

import { describe, it, expect } from 'vitest';
import { scrubSampleContext } from '@/lib/workflows/sample-context';
import type { WorkflowContext } from '@/lib/workflows/actions';

const synthetic: WorkflowContext = {
  event: { type: 'lead_created' },
  lead: { id: 'sample', name: 'Sample Lead', score: 85 },
  contact: { id: 'sample', name: 'Sample Lead' },
};

describe('scrubSampleContext', () => {
  it('forces the synthetic id even when the caller supplies a foreign contact.id', () => {
    const out = scrubSampleContext(
      { contact: { id: 'victim-contact-123', name: 'Mallory' } },
      synthetic,
    );
    // The foreign id never survives — the synthetic 'sample' id is used.
    expect((out.contact as Record<string, unknown>).id).toBe('sample');
    // Non-id fields the caller supplied DO come through.
    expect((out.contact as Record<string, unknown>).name).toBe('Mallory');
  });

  it('forces the synthetic id on lead and deal too', () => {
    const out = scrubSampleContext(
      { lead: { id: 'foreign-lead', score: 99 }, deal: { id: 'foreign-deal', stage: 'offer' } },
      synthetic,
    );
    expect((out.lead as Record<string, unknown>).id).toBe('sample');
    expect((out.lead as Record<string, unknown>).score).toBe(99);
    // synthetic had no deal, so the forced id is undefined (no foreign id leaks).
    expect((out.deal as Record<string, unknown>).id).toBeUndefined();
    expect((out.deal as Record<string, unknown>).stage).toBe('offer');
  });

  it('lets the caller override non-id fields (event etc.)', () => {
    const out = scrubSampleContext({ event: { type: 'lead_created', score: 50 } }, synthetic);
    expect((out.event as Record<string, unknown>).score).toBe(50);
    // Untouched entities keep the synthetic id.
    expect((out.contact as Record<string, unknown>).id).toBe('sample');
  });

  it('falls back to the synthetic context for non-object overrides', () => {
    expect(scrubSampleContext(undefined, synthetic)).toBe(synthetic);
    expect(scrubSampleContext('nope', synthetic)).toBe(synthetic);
    expect(scrubSampleContext(['array'], synthetic)).toBe(synthetic);
    expect(scrubSampleContext(null, synthetic)).toBe(synthetic);
  });
});
