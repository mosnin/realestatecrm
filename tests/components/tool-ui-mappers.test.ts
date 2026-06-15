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
} from '@/components/ai/blocks/tool-results/tool-ui-mappers';
import { normalizeDealRows, normalizePropertyRows } from '@/components/ai/blocks/tool-results/normalize';
import { safeParseSerializableDataTable } from '@/components/tool-ui/data-table/schema';
import { safeParseSerializableItemCarousel } from '@/components/tool-ui/item-carousel/schema';

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
