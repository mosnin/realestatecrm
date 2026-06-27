/**
 * tipToCard projects a tip Signal down to the BriefCard the surface renders.
 * The surface contract requires draftedAction to be present as `null` (not
 * `undefined`) when a tip has no one-tap action — otherwise the inline action
 * row reads an absent key and can mis-render. It also drops the ranking-only
 * fields (confidence, urgency, tipCategory) that are Chippi's reasoning, not the
 * realtor's. Pin the field projection and the undefined→null normalization.
 */

import { describe, it, expect } from 'vitest';
import { tipToCard } from '@/lib/briefing/tips/tips-source';
import type { Signal } from '@/lib/briefing/types';

const baseTip: Signal = {
  source: 'tips',
  kind: 'tip',
  urgency: 3,
  confidence: 0.82,
  subject: { id: 'tag:warm', name: 'Warm leads', href: '/contacts?tag=warm' },
  evidence: '4 warm leads have had no touch in 9 days.',
  tipCategory: 'segment_neglect',
};

describe('tipToCard', () => {
  it('copies the renderable fields and normalizes a missing action to null', () => {
    expect(tipToCard(baseTip)).toEqual({
      kind: 'tip',
      source: 'tips',
      subject: { id: 'tag:warm', name: 'Warm leads', href: '/contacts?tag=warm' },
      evidence: '4 warm leads have had no touch in 9 days.',
      draftedAction: null, // undefined on the Signal must become explicit null
    });
  });

  it('passes a present draftedAction through unchanged', () => {
    const withAction: Signal = {
      ...baseTip,
      draftedAction: { kind: 'open', href: '/contacts?tag=warm' },
    };
    expect(tipToCard(withAction).draftedAction).toEqual({ kind: 'open', href: '/contacts?tag=warm' });
  });

  it('does not carry over ranking-only fields', () => {
    const card = tipToCard(baseTip) as unknown as Record<string, unknown>;
    expect(card).not.toHaveProperty('confidence');
    expect(card).not.toHaveProperty('urgency');
    expect(card).not.toHaveProperty('tipCategory');
  });
});
