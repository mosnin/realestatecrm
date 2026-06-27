/**
 * fallbackHeuristic derives a sidebar conversation title from the user's first
 * message when no model-generated title is available. It strips the workspace
 * @-mention prefix, HTML/control noise, leading filler ("hi", "can you"...),
 * caps to ~6 words / 50 chars, trims trailing punctuation, and capitalizes the
 * first letter while preserving proper-noun casing. Pin those — a regression
 * makes every chat in the sidebar read "New conversation" or a noisy fragment.
 */

import { describe, it, expect } from 'vitest';
import { fallbackHeuristic } from '@/lib/ai-tools/chippi-voice';

describe('fallbackHeuristic', () => {
  it('falls back to "New conversation" for empty / whitespace / noise-only input', () => {
    expect(fallbackHeuristic('')).toBe('New conversation');
    expect(fallbackHeuristic('   ')).toBe('New conversation');
    expect(fallbackHeuristic('<p></p>')).toBe('New conversation');
  });

  it('strips the @-mention "(Referencing: ...)" prefix', () => {
    expect(fallbackHeuristic('(Referencing: [Contact: Sarah])\n\nDraft a follow-up')).toBe('Draft a follow-up');
  });

  it('drops leading filler, including stacked openers', () => {
    expect(fallbackHeuristic('hi can you schedule a tour')).toBe('Schedule a tour');
    expect(fallbackHeuristic('please find my hottest leads')).toBe('Find my hottest leads');
  });

  it('strips HTML, collapses whitespace, trims trailing punctuation', () => {
    expect(fallbackHeuristic('  Draft   an <b>offer</b> now?  ')).toBe('Draft an offer now');
  });

  it('caps to at most 6 words', () => {
    const t = fallbackHeuristic('compare these seven different homes in the area today');
    expect(t.split(' ').length).toBeLessThanOrEqual(6);
  });

  it('capitalizes the first letter but preserves proper-noun casing', () => {
    expect(fallbackHeuristic('email Sarah about Manhattan')).toBe('Email Sarah about Manhattan');
  });

  it('hard-caps an overlong run at 50 chars', () => {
    const t = fallbackHeuristic('supercalifragilisticexpialidocioussupercalifragilisticexpialidocious');
    expect(t.length).toBeLessThanOrEqual(50);
  });
});
