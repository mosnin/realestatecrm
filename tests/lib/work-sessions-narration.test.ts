/**
 * Narration + mid-run replanning helpers — pure functions, so these tests
 * pin the exact contracts the engine and strip rely on:
 *   - humanizeToolCall always returns a presentable line (known map or the
 *     underscores→spaces fallback), never the raw tool name.
 *   - parseNewSteps extracts NEW_STEP directives in order, dedupes
 *     case-insensitively, caps additions, and ALWAYS strips directive lines
 *     from the stored text (a clipped directive must not leak into reports).
 */

import { describe, it, expect } from 'vitest';
import { humanizeToolCall, parseNewSteps } from '@/lib/work-sessions/narration';

describe('humanizeToolCall', () => {
  it('uses the friendly line for known tools', () => {
    expect(humanizeToolCall('find_person')).toBe('Looking up a contact…');
    expect(humanizeToolCall('stage_message_draft')).toBe('Writing a draft…');
    expect(humanizeToolCall('read_session_report')).toBe('Reading an earlier report…');
  });

  it('falls back to a capitalized, de-underscored line for unknown tools', () => {
    expect(humanizeToolCall('get_contact_activity')).toBe('Get contact activity…');
    expect(humanizeToolCall('weather')).toBe('Weather…');
  });
});

describe('parseNewSteps', () => {
  it('returns the text untouched when there are no directives', () => {
    const finding = 'Three hot leads have gone quiet: Dana, Chris, and Lee.';
    expect(parseNewSteps(finding)).toEqual({ text: finding, newSteps: [] });
  });

  it('extracts directives in order and strips them from the text', () => {
    const { text, newSteps } = parseNewSteps(
      'Found two stale deals.\nNEW_STEP: Review the Maple St deal\nNEW_STEP: Check the Hendersons\n',
    );
    expect(newSteps).toEqual(['Review the Maple St deal', 'Check the Hendersons']);
    expect(text).toBe('Found two stale deals.');
    expect(text).not.toContain('NEW_STEP');
  });

  it('dedupes case-insensitively', () => {
    const { newSteps } = parseNewSteps(
      'NEW_STEP: Pull comps\nSome finding\nNEW_STEP: pull comps',
    );
    expect(newSteps).toEqual(['Pull comps']);
  });

  it('caps additions but still strips every directive line', () => {
    const { text, newSteps } = parseNewSteps(
      'Findings here.\nNEW_STEP: One\nNEW_STEP: Two\nNEW_STEP: Three',
      2,
    );
    expect(newSteps).toEqual(['One', 'Two']);
    expect(text).toBe('Findings here.');
    expect(text).not.toContain('Three');
  });

  it('handles directives mid-text and collapses leftover blank runs', () => {
    const { text, newSteps } = parseNewSteps(
      'Part one.\n\nNEW_STEP: Follow the lead\n\nPart two.',
    );
    expect(newSteps).toEqual(['Follow the lead']);
    expect(text).toBe('Part one.\n\nPart two.');
  });

  it('truncates very long titles to 120 chars', () => {
    const long = 'x'.repeat(200);
    const { newSteps } = parseNewSteps(`NEW_STEP: ${long}`);
    expect(newSteps[0]).toHaveLength(120);
  });
});
