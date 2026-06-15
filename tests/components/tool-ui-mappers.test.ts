/**
 * Unit tests for the Chippi → tool-ui data-mapping helpers.
 *
 * These assert the helpers produce payloads that PASS each component's
 * `safeParseSerializable*` validator (the contract the dispatch relies on),
 * map fields correctly, and keep DataTable rows primitives-only.
 */

import { describe, it, expect } from 'vitest';
import {
  buildContactsTable,
  buildDealsTable,
  buildPropertiesCarousel,
  propertySubtitle,
  wmoToConditionCode,
  buildOptionList,
  optionLabelMap,
  buildQuestionFlow,
  formatQuestionFlowAnswers,
  buildEmailDraft,
} from '@/components/ai/blocks/tool-results/tool-ui-mappers';
import { normalizeDealRows, normalizePropertyRows } from '@/components/ai/blocks/tool-results/normalize';
import { safeParseSerializableDataTable } from '@/components/tool-ui/data-table/schema';
import { safeParseSerializableItemCarousel } from '@/components/tool-ui/item-carousel/schema';
import { safeParseSerializableOptionList } from '@/components/tool-ui/option-list/schema';
import { safeParseSerializableQuestionFlow } from '@/components/tool-ui/question-flow/schema';
import { safeParseSerializableMessageDraft } from '@/components/tool-ui/message-draft/schema';

describe('buildContactsTable', () => {
  const contacts = [
    {
      id: 'c1',
      name: 'Sam Rivera',
      email: 'sam@example.com',
      phone: '555-0100',
      leadType: 'buyer',
      scoreLabel: 'hot',
      leadScore: 88,
      lastContactedAt: '2026-06-01T12:00:00.000Z',
    },
    { id: 'c2', name: 'Jordan Lee', email: null, phone: null, leadType: null, scoreLabel: null },
  ];

  it('passes the DataTable validator', () => {
    expect(safeParseSerializableDataTable(buildContactsTable(contacts))).not.toBeNull();
  });

  it('maps fields to primitives and normalizes status/leadType', () => {
    const t = buildContactsTable(contacts);
    expect(t.rowIdKey).toBe('id');
    expect(t.data[0]).toMatchObject({
      id: 'c1',
      name: 'Sam Rivera',
      email: 'sam@example.com',
      status: 'hot',
      leadType: 'Buyer',
      lastActivity: '2026-06-01T12:00:00.000Z',
    });
    // Missing score falls back to the 'unscored' badge key; nulls stay null.
    expect(t.data[1].status).toBe('unscored');
    expect(t.data[1].email).toBeNull();
    expect(t.data[1].leadType).toBeNull();
  });

  it('keeps every row value a primitive (no nested objects/Dates)', () => {
    for (const row of buildContactsTable(contacts).data) {
      for (const v of Object.values(row)) {
        const ok = v === null || ['string', 'number', 'boolean'].includes(typeof v);
        expect(ok).toBe(true);
      }
    }
  });

  it('has a relative-date format on the last-activity column', () => {
    const col = buildContactsTable(contacts).columns.find((c) => c.key === 'lastActivity');
    expect(col?.format).toEqual({ kind: 'date', dateFormat: 'relative' });
  });
});

describe('buildDealsTable', () => {
  const deals = [
    { id: 'd1', title: 'Maple St', value: 650000, stageName: 'Under Contract', status: 'active', contact_name: 'Sam', close_date: '2026-07-01' },
    { id: 'd2', title: 'Oak Ave', value: null, stageName: null, status: 'won', contactName: 'Jordan', closeDate: null },
  ];

  it('passes the DataTable validator', () => {
    expect(safeParseSerializableDataTable(buildDealsTable(deals))).not.toBeNull();
  });

  it('maps both contact field names and currency value', () => {
    const t = buildDealsTable(deals);
    expect(t.data[0]).toMatchObject({ title: 'Maple St', stage: 'Under Contract', status: 'active', value: 650000, contact: 'Sam', closeDate: '2026-07-01' });
    expect(t.data[1]).toMatchObject({ contact: 'Jordan', value: null, status: 'won' });
    const valueCol = t.columns.find((c) => c.key === 'value');
    expect(valueCol?.format).toEqual({ kind: 'currency', currency: 'USD', decimals: 0 });
  });
});

describe('buildPropertiesCarousel', () => {
  const properties = [
    { id: 'p1', address: '12 Maple St', listPrice: 650000, beds: 3, baths: 2, image: 'https://cdn.example.com/p1.jpg' },
    { id: 'p2', address: '9 Oak Ave', listPrice: null, beds: null, baths: null, image: null },
  ];

  it('passes the ItemCarousel validator', () => {
    expect(safeParseSerializableItemCarousel(buildPropertiesCarousel(properties))).not.toBeNull();
  });

  it('builds subtitle and keeps only safe image URLs', () => {
    const c = buildPropertiesCarousel(properties, { withActions: true });
    expect(c.items[0]).toMatchObject({
      id: 'p1',
      name: '12 Maple St',
      subtitle: '$650,000 · 3bd/2ba',
      image: 'https://cdn.example.com/p1.jpg',
    });
    expect(c.items[0].actions).toEqual([{ id: 'view', label: 'View' }]);
    // No price/beds → no subtitle; null image → omitted; no actions when off.
    expect(c.items[1].subtitle).toBeUndefined();
    expect(c.items[1].image).toBeUndefined();
    const noActions = buildPropertiesCarousel(properties, { withActions: false });
    expect(noActions.items[0].actions).toBeUndefined();
  });

  it('drops relative / non-http image URLs', () => {
    const c = buildPropertiesCarousel([{ id: 'p3', address: 'X', image: '/relative/p.jpg' }]);
    expect(c.items[0].image).toBeUndefined();
    expect(safeParseSerializableItemCarousel(c)).not.toBeNull();
  });
});

describe('propertySubtitle', () => {
  it('omits absent pieces', () => {
    expect(propertySubtitle({ id: 'x', address: 'A' })).toBeUndefined();
    expect(propertySubtitle({ id: 'x', address: 'A', beds: 2 })).toBe('2bd');
    expect(propertySubtitle({ id: 'x', address: 'A', price: 500000 })).toBe('$500,000');
  });
});

describe('wmoToConditionCode', () => {
  it('maps representative WMO codes to the 13-value enum', () => {
    expect(wmoToConditionCode(0)).toBe('clear');
    expect(wmoToConditionCode(2)).toBe('partly-cloudy');
    expect(wmoToConditionCode(3)).toBe('overcast');
    expect(wmoToConditionCode(45)).toBe('fog');
    expect(wmoToConditionCode(55)).toBe('drizzle');
    expect(wmoToConditionCode(63)).toBe('rain');
    expect(wmoToConditionCode(65)).toBe('heavy-rain');
    expect(wmoToConditionCode(75)).toBe('snow');
    expect(wmoToConditionCode(95)).toBe('thunderstorm');
    expect(wmoToConditionCode(99)).toBe('hail');
    // Unknown code falls back to a sane default.
    expect(wmoToConditionCode(1234)).toBe('cloudy');
  });
});

describe('normalizers', () => {
  it('normalizeDealRows flattens both shapes', () => {
    expect(normalizeDealRows({ deals: [{ id: 'd1', title: 'A' }] })).toHaveLength(1);
    expect(normalizeDealRows({ match: 'single', deal: { id: 'd1', title: 'A' } })).toHaveLength(1);
    expect(normalizeDealRows({ match: 'none' })).toEqual([]);
    expect(normalizeDealRows(null)).toEqual([]);
  });

  it('normalizePropertyRows flattens both shapes', () => {
    expect(normalizePropertyRows({ properties: [{ id: 'p1', address: 'A' }] })).toHaveLength(1);
    expect(normalizePropertyRows({ match: 'single', property: { id: 'p1', address: 'A' } })).toHaveLength(1);
    expect(normalizePropertyRows({ match: 'none' })).toEqual([]);
    expect(normalizePropertyRows(undefined)).toEqual([]);
  });
});

describe('buildOptionList', () => {
  const input = {
    options: [
      { id: 'a', label: 'Residential', description: 'Buyers and sellers' },
      { id: 'b', label: 'Commercial' },
    ],
  };

  it('passes the OptionList validator (strict schema)', () => {
    expect(safeParseSerializableOptionList(buildOptionList(input))).not.toBeNull();
  });

  it('defaults selectionMode + a confirm action, drops absent descriptions', () => {
    const ol = buildOptionList(input);
    expect(ol.selectionMode).toBe('single');
    expect(ol.actions).toEqual([{ id: 'confirm', label: 'Confirm', variant: 'default' }]);
    expect(ol.options[0]).toEqual({ id: 'a', label: 'Residential', description: 'Buyers and sellers' });
    // No description key when absent (strict schema rejects undefined values).
    expect('description' in ol.options[1]).toBe(false);
  });

  it('clamps selection bounds and keeps custom actions', () => {
    const ol = buildOptionList({
      ...input,
      selectionMode: 'multi',
      minSelections: 0,
      maxSelections: 2,
      actions: [{ id: 'go', label: 'Go', variant: 'default' }],
    });
    expect(ol.minSelections).toBe(0);
    expect(ol.maxSelections).toBe(2);
    expect(ol.actions).toEqual([{ id: 'go', label: 'Go', variant: 'default' }]);
    expect(safeParseSerializableOptionList(ol)).not.toBeNull();
  });

  it('optionLabelMap maps ids to labels for the round-trip', () => {
    const m = optionLabelMap(input);
    expect(m.get('a')).toBe('Residential');
    expect(m.get('b')).toBe('Commercial');
  });
});

describe('buildQuestionFlow', () => {
  const steps = [
    {
      id: 'budget',
      title: 'Budget',
      options: [
        { id: 'lo', label: 'Under $500k' },
        { id: 'hi', label: '$500k+' },
      ],
    },
    {
      id: 'timeline',
      title: 'Timeline',
      description: 'When do they want to move?',
      options: [{ id: 'soon', label: '0-3 months' }],
      selectionMode: 'single' as const,
    },
  ];

  it('builds upfront mode and passes the validator', () => {
    const flow = buildQuestionFlow({ steps });
    expect(flow).not.toBeNull();
    expect(safeParseSerializableQuestionFlow(flow!)).not.toBeNull();
    expect(flow && 'steps' in flow).toBe(true);
  });

  it('builds progressive mode from a single step', () => {
    const flow = buildQuestionFlow({
      step: 2,
      title: 'Area',
      options: [{ id: 'n', label: 'North' }, { id: 's', label: 'South' }],
    });
    expect(flow).not.toBeNull();
    expect(flow && 'step' in flow && flow.step).toBe(2);
    expect(safeParseSerializableQuestionFlow(flow!)).not.toBeNull();
  });

  it('returns null when neither steps nor a complete progressive step is given', () => {
    expect(buildQuestionFlow({})).toBeNull();
    expect(buildQuestionFlow({ title: 'No options' })).toBeNull();
  });

  it('formats answers back to a single labelled line', () => {
    const line = formatQuestionFlowAnswers(steps, { budget: ['lo'], timeline: ['soon'] });
    expect(line).toBe('Answers — Budget: Under $500k; Timeline: 0-3 months');
  });

  it('skips unanswered steps when formatting', () => {
    expect(formatQuestionFlowAnswers(steps, { budget: ['hi'] })).toBe('Answers — Budget: $500k+');
    expect(formatQuestionFlowAnswers(steps, {})).toBe('No answers selected.');
  });
});

describe('buildEmailDraft', () => {
  it('passes the MessageDraft validator (email channel)', () => {
    const draft = buildEmailDraft({
      subject: 'Quick check-in',
      body: 'Hi Sam, just following up.',
      to: ['sam@example.com'],
      from: 'me@brokerage.com',
    });
    expect(draft.channel).toBe('email');
    expect(safeParseSerializableMessageDraft(draft)).not.toBeNull();
  });

  it('substitutes a placeholder recipient when none is given (schema needs >=1)', () => {
    const draft = buildEmailDraft({ subject: 'Hi', body: 'Body', to: [] });
    expect(draft.to).toEqual(['(recipient)']);
    expect(safeParseSerializableMessageDraft(draft)).not.toBeNull();
  });

  it('carries the outcome through for the receipt state', () => {
    const draft = buildEmailDraft({
      subject: 'Hi',
      body: 'Body',
      to: ['x@y.com'],
      outcome: 'sent',
    });
    expect(draft.outcome).toBe('sent');
    expect(safeParseSerializableMessageDraft(draft)).not.toBeNull();
  });

  it('omits empty cc/bcc and blank recipients', () => {
    const draft = buildEmailDraft({
      subject: 'Hi',
      body: 'Body',
      to: ['x@y.com', '  '],
      cc: [],
    });
    expect(draft.to).toEqual(['x@y.com']);
    expect('cc' in draft).toBe(false);
  });
});
