/**
 * Unit tests for `shapeProposals` — the pure shaping/sanitization layer.
 * No DB, no network. Walks the registry only via getTool, which is real.
 *
 * Covers: empty/garbage input, allowlist enforcement, dedupe, MAX cap,
 * mutates flag mapping. Also covers humanSummary formatting + the batched
 * attachHumanSummaries helper (with a fake supabase client).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shapeProposals,
  MAX_PROPOSALS,
  formatHumanSummary,
  attachHumanSummaries,
  prettifyWhen,
  type ProposedAction,
} from '@/lib/chippi/post-tour';

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

// ─── humanSummary formatting ─────────────────────────────────────────────

function makeProposal(tool: string, args: Record<string, unknown>): ProposedAction {
  return {
    tool: tool as ProposedAction['tool'],
    args,
    summary: 'unused',
    mutates: true,
  };
}

const PEOPLE = new Map([
  ['p1', 'Sam Chen'],
  ['p2', 'Jordan Bell'],
]);
const DEALS = new Map([['d1', '412 Elm']]);

describe('formatHumanSummary', () => {
  it('log_call uses the contact name and quotes the summary', () => {
    const s = formatHumanSummary(
      makeProposal('log_call', { personId: 'p1', summary: 'loved it' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Log Sam Chen\'s call: "loved it"');
  });

  it('log_meeting includes the location when present', () => {
    const s = formatHumanSummary(
      makeProposal('log_meeting', { personId: 'p1', summary: 'walkthrough', location: '412 Elm' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Log Sam Chen\'s meeting at 412 Elm: "walkthrough"');
  });

  it('note_on_person uses the contact name', () => {
    const s = formatHumanSummary(
      makeProposal('note_on_person', { personId: 'p1', content: 'wife worried about schools' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Note on Sam Chen: "wife worried about schools"');
  });

  it('note_on_deal uses the deal title', () => {
    const s = formatHumanSummary(
      makeProposal('note_on_deal', { dealId: 'd1', content: 'price talk' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Note on 412 Elm: "price talk"');
  });

  it('mark_person_hot uses the contact name and the reason', () => {
    const s = formatHumanSummary(
      makeProposal('mark_person_hot', { personId: 'p1', why: 'made offer' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Mark Sam Chen hot — made offer');
  });

  it('mark_person_cold uses the contact name and the reason', () => {
    const s = formatHumanSummary(
      makeProposal('mark_person_cold', { personId: 'p2', why: 'lost interest' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Mark Jordan Bell cold — lost interest');
  });

  it('set_followup prettifies an ISO date and uses the contact name', () => {
    const s = formatHumanSummary(
      makeProposal('set_followup', { personId: 'p1', when: '2026-05-08' }),
      PEOPLE,
      DEALS,
    );
    // "May 8" within the same year — no year suffix.
    expect(s).toBe('Follow up with Sam Chen on May 8');
  });

  it('set_followup capitalises a weekday phrase', () => {
    const s = formatHumanSummary(
      makeProposal('set_followup', { personId: 'p1', when: 'friday' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Follow up with Sam Chen on Friday');
  });

  it('draft_email reads naturally', () => {
    const s = formatHumanSummary(
      makeProposal('draft_email', { personId: 'p1', intent: 'check-in' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Draft a check-in email to Sam Chen');
  });

  it('draft_sms reads naturally', () => {
    const s = formatHumanSummary(
      makeProposal('draft_sms', { personId: 'p2', intent: 'reach-out' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Draft a reach-out text to Jordan Bell');
  });

  it('returns null when the person id resolves to no name', () => {
    const s = formatHumanSummary(
      makeProposal('log_call', { personId: 'unknown', summary: 'x' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBeNull();
  });
});

describe('prettifyWhen', () => {
  it('renders ISO same-year as "Mon D"', () => {
    expect(prettifyWhen('2026-05-08', new Date('2026-01-01'))).toBe('May 8');
  });
  it('includes the year on cross-year dates', () => {
    expect(prettifyWhen('2027-01-12', new Date('2026-05-01'))).toBe('Jan 12, 2027');
  });
  it('capitalises bare weekdays', () => {
    expect(prettifyWhen('next tuesday')).toBe('Next Tuesday');
    expect(prettifyWhen('friday')).toBe('Friday');
  });
});

describe('attachHumanSummaries', () => {
  it('does ONE Contact read and ONE Deal read for the whole batch', async () => {
    // Tally the queries the helper issues.
    const queriesByTable: Record<string, number> = { Contact: 0, Deal: 0 };
    const fakeSupabase = {
      from(table: string) {
        queriesByTable[table] = (queriesByTable[table] ?? 0) + 1;
        const builder = {
          _data: [] as Array<Record<string, unknown>>,
          select(_cols: string) { return builder; },
          eq(_col: string, _val: unknown) { return builder; },
          in(_col: string, ids: string[]) {
            if (table === 'Contact') {
              builder._data = ids
                .filter((id) => PEOPLE.has(id))
                .map((id) => ({ id, name: PEOPLE.get(id)! }));
            } else if (table === 'Deal') {
              builder._data = ids
                .filter((id) => DEALS.has(id))
                .map((id) => ({ id, title: DEALS.get(id)! }));
            }
            return Promise.resolve({ data: builder._data, error: null });
          },
        };
        return builder;
      },
    };

    const proposals: ProposedAction[] = [
      makeProposal('log_call', { personId: 'p1', summary: 'loved it' }),
      makeProposal('mark_person_hot', { personId: 'p2', why: 'made offer' }),
      makeProposal('set_followup', { personId: 'p1', when: '2026-05-08' }),
      makeProposal('note_on_deal', { dealId: 'd1', content: 'price talk' }),
    ];

    const out = await attachHumanSummaries(fakeSupabase as never, 'space_1', proposals);

    expect(queriesByTable.Contact).toBe(1);
    expect(queriesByTable.Deal).toBe(1);

    expect(out[0].humanSummary).toContain('Sam Chen');
    expect(out[1].humanSummary).toContain('Jordan Bell');
    expect(out[2].humanSummary).toContain('Sam Chen');
    expect(out[3].humanSummary).toContain('412 Elm');
  });

  it('skips reads for tables it doesn\'t need', async () => {
    const calls: string[] = [];
    const fakeSupabase = {
      from(table: string) {
        calls.push(table);
        return {
          select() { return this; },
          eq() { return this; },
          in() { return Promise.resolve({ data: [], error: null }); },
        };
      },
    };
    const out = await attachHumanSummaries(
      fakeSupabase as never,
      'space_1',
      [makeProposal('log_call', { personId: 'p1', summary: 'x' })],
    );
    expect(calls).toEqual(['Contact']); // no Deal read needed
    expect(out).toHaveLength(1);
  });

  it('returns proposals unchanged when none reference any id', async () => {
    const fakeSupabase = { from: vi.fn() };
    const out = await attachHumanSummaries(
      fakeSupabase as never,
      'space_1',
      [makeProposal('log_call', { summary: 'no person id' })],
    );
    expect(fakeSupabase.from).not.toHaveBeenCalled();
    expect(out[0].humanSummary).toBeUndefined();
  });

  it('falls back gracefully when an id has no resolved row', async () => {
    const fakeSupabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return Promise.resolve({ data: [], error: null }); },
        };
      },
    };
    const out = await attachHumanSummaries(
      fakeSupabase as never,
      'space_1',
      [makeProposal('log_call', { personId: 'missing', summary: 'x' })],
    );
    expect(out[0].humanSummary).toBeUndefined();
  });
});
