/**
 * Unit tests for `shapeProposals` — the pure shaping/sanitization layer.
 * No DB, no network. Walks the registry only via getTool, which is real.
 *
 * Covers: empty/garbage input, allowlist enforcement, dedupe, MAX cap,
 * mutates flag mapping.
 */
import { describe, it, expect } from 'vitest';
import { shapeProposals, MAX_PROPOSALS } from '@/lib/chippi/post-tour';

describe('shapeProposals', () => {
  it('returns [] for non-object input', () => {
    expect(shapeProposals(null)).toEqual([]);
    expect(shapeProposals('nope')).toEqual([]);
    expect(shapeProposals(42)).toEqual([]);
  });

  it('returns [] for malformed proposal arrays', () => {
    expect(shapeProposals({ proposals: 'wrong' })).toEqual([]);
    expect(shapeProposals({ wrong_key: [] })).toEqual([]);
  });

  it('drops tools outside the post-tour allowlist', () => {
    const out = shapeProposals({
      proposals: [
        { tool: 'find_property', args: {} }, // not on allowlist
        { tool: 'pipeline_summary', args: {} }, // not on allowlist
        { tool: 'log_call', args: { personId: 'abc12345', summary: 'Tour' } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].tool).toBe('log_call');
  });

  it('de-dupes identical (tool, args) pairs across orderings', () => {
    const out = shapeProposals({
      proposals: [
        { tool: 'log_call', args: { personId: 'p1', summary: 'X' } },
        { tool: 'log_call', args: { summary: 'X', personId: 'p1' } }, // same content, different key order
        { tool: 'log_call', args: { personId: 'p1', summary: 'Y' } }, // different summary, kept
      ],
    });
    expect(out.map((o) => o.args.summary)).toEqual(['X', 'Y']);
  });

  it('caps at MAX_PROPOSALS', () => {
    const proposals = Array.from({ length: 10 }, (_, i) => ({
      tool: 'note_on_person',
      args: { personId: `p${i}`, content: `note ${i}` },
    }));
    const out = shapeProposals({ proposals });
    expect(out.length).toBe(MAX_PROPOSALS);
  });

  it('flags mutating tools and read-only tools correctly', () => {
    const out = shapeProposals({
      proposals: [
        { tool: 'log_call', args: { personId: 'p1', summary: 'X' } }, // mutating
        { tool: 'draft_email', args: { personId: 'p1', intent: 'check-in' } }, // read-only
      ],
    });
    expect(out).toHaveLength(2);
    expect(out.find((o) => o.tool === 'log_call')?.mutates).toBe(true);
    expect(out.find((o) => o.tool === 'draft_email')?.mutates).toBe(false);
  });

  it('produces a summary string for each proposal', () => {
    const out = shapeProposals({
      proposals: [
        { tool: 'mark_person_hot', args: { personId: '12345678abcd', why: 'wants to offer' } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBeTruthy();
    expect(out[0].summary.length).toBeGreaterThan(0);
  });
});
