/**
 * People add/edit dialog state — the edit modal used to mount empty and
 * PATCH blanks over the live contact on Save.
 */
import { describe, it, expect } from 'vitest';
import {
  contactEditorDefaults,
  contactFormResetValues,
  convertLeadTagPatch,
  parseChipList,
} from '@/lib/contact-form-state';

const EXISTING = {
  name: 'Jane Chen',
  email: 'jane@example.com',
  phone: '555-0100',
  budget: 750_000,
  preferences: '3 bed, west side',
  properties: ['12 Oak St', '4 Pine Ave'],
  address: '12 Oak St',
  notes: 'Pre-approved. Has a dog.',
  type: 'TOUR' as const,
  tags: ['hot', 'application-link', 'new-lead'],
};

describe('contactFormResetValues', () => {
  it('loads every editor field from an existing contact so Save cannot blank them', () => {
    const { values, properties } = contactFormResetValues(contactEditorDefaults(EXISTING));
    expect(values).toEqual({
      name: 'Jane Chen',
      email: 'jane@example.com',
      phone: '555-0100',
      budget: '750000',
      preferences: '3 bed, west side',
      address: '12 Oak St',
      notes: 'Pre-approved. Has a dog.',
      type: 'TOUR',
      tags: 'hot, application-link, new-lead',
    });
    expect(properties).toEqual(['12 Oak St', '4 Pine Ave']);
  });

  it('opens add/empty as blanks, not leftovers from a previous edit', () => {
    const { values, properties } = contactFormResetValues(undefined);
    expect(values.name).toBe('');
    expect(values.email).toBe('');
    expect(values.notes).toBe('');
    expect(values.tags).toBe('');
    expect(values.type).toBe('QUALIFICATION');
    expect(properties).toEqual([]);
  });

  it('tolerates null tags/properties arrays from the list API', () => {
    const { values, properties } = contactFormResetValues(
      contactEditorDefaults({ name: 'Sam', tags: null, properties: null }),
    );
    expect(values.name).toBe('Sam');
    expect(values.tags).toBe('');
    expect(properties).toEqual([]);
  });
});

describe('parseChipList', () => {
  it('splits and trims', () => {
    expect(parseChipList('  oak, pine ,  ')).toEqual(['oak', 'pine']);
  });
});

describe('convertLeadTagPatch', () => {
  it('sends only tags and drops lead-inbox markers', () => {
    expect(convertLeadTagPatch(EXISTING.tags)).toEqual({ tags: ['hot'] });
  });

  it('does not invent other contact fields that a full-row PATCH would wipe', () => {
    const patch = convertLeadTagPatch(['new-lead', 'buyer']);
    expect(Object.keys(patch)).toEqual(['tags']);
    expect(patch.tags).toEqual(['buyer']);
  });
});
