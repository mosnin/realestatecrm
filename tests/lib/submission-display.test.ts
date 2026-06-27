/**
 * getSubmissionDisplay turns a stored submission into the ordered label/value
 * rows the lead-detail panel renders. Two modes: dynamic (drive off the form
 * snapshot — honor section + question position order, skip empty answers, map
 * values through formatAnswerValue) and legacy (hardcoded ApplicationData fields,
 * booleans shown as Yes/No). Pin both, plus the empty short-circuit — a
 * regression scrambles or drops a real applicant's answers in the UI.
 */

import { describe, it, expect } from 'vitest';
import { getSubmissionDisplay } from '@/lib/form-versioning';

type Arg = Parameters<typeof getSubmissionDisplay>[0];

const snapshot = {
  version: 1,
  leadType: 'rental',
  sections: [
    {
      id: 's2', title: 'Second', position: 1,
      questions: [{ id: 'pets', type: 'select', label: 'Pets?', required: false, position: 0,
        options: [{ value: 'yes', label: 'Yes, a dog' }] }],
    },
    {
      id: 's1', title: 'First', position: 0,
      questions: [
        { id: 'qB', type: 'text', label: 'Last', required: false, position: 1 },
        { id: 'qA', type: 'text', label: 'First', required: false, position: 0 },
      ],
    },
  ],
};

describe('getSubmissionDisplay', () => {
  it('returns nothing when there is no application data', () => {
    expect(getSubmissionDisplay({ applicationData: null, formConfigSnapshot: null })).toEqual([]);
  });

  it('orders dynamic rows by section then question position, skipping empties', () => {
    const rows = getSubmissionDisplay({
      applicationData: { qA: 'Ada', qB: '', pets: 'yes' },
      formConfigSnapshot: snapshot as unknown as NonNullable<Arg['formConfigSnapshot']>,
    });
    // s1 (position 0) before s2 (position 1); within s1, qA (0) before qB (1);
    // qB is blank so it's dropped entirely.
    expect(rows.map((r) => r.label)).toEqual(['First', 'Pets?']);
    expect(rows[0]).toEqual({ label: 'First', value: 'Ada', sectionTitle: 'First' });
    // select value mapped through its option label
    expect(rows[1]).toEqual({ label: 'Pets?', value: 'Yes, a dog', sectionTitle: 'Second' });
  });

  it('falls back to legacy display when there is no snapshot (booleans -> Yes/No)', () => {
    const rows = getSubmissionDisplay({
      applicationData: { legalName: 'Ada Lovelace', priorEvictions: true, bankruptcy: false } as unknown as Arg['applicationData'],
      formConfigSnapshot: null,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Legal name']).toBe('Ada Lovelace');
    expect(byLabel['Prior evictions']).toBe('Yes');
    expect(byLabel['Bankruptcy']).toBe('No'); // false still shown (not skipped) as No
  });
});
