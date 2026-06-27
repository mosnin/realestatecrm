/**
 * mergePropertyFields folds AI-derived property facts into an existing record.
 * The cardinal rule: NEVER clobber a value the record already has — only fill
 * blanks — because the record may hold user-edited truth. It also rounds the
 * numeric fields, caps photos at 20, and only adopts photos when the record
 * has none. Pin all of that; a regression here corrupts saved properties.
 */

import { describe, it, expect } from 'vitest';
import { mergePropertyFields } from '@/lib/property-analysis';

type Rec = Parameters<typeof mergePropertyFields>[0];
type Fields = Parameters<typeof mergePropertyFields>[1];

const emptyRecord = (): Rec => ({
  propertyType: null,
  beds: null,
  baths: null,
  squareFeet: null,
  lotSizeSqft: null,
  yearBuilt: null,
  listPrice: null,
  listingUrl: null,
  photos: null,
} as unknown as Rec);

const fields = (over: Partial<Fields> = {}): Fields => ({
  beds: 3,
  baths: 2,
  squareFeet: 1234.6,
  lotSizeSqft: 5000.4,
  yearBuilt: 1999.7,
  propertyType: 'single_family',
  listPrice: 500000,
  listingUrl: 'http://example.com/listing',
  photoUrls: ['a.jpg', 'b.jpg'],
  ...over,
} as unknown as Fields);

describe('mergePropertyFields', () => {
  it('fills every blank field and rounds the numeric ones', () => {
    const patch = mergePropertyFields(emptyRecord(), fields());
    expect(patch).toMatchObject({
      beds: 3,
      baths: 2,
      squareFeet: 1235, // rounded
      lotSizeSqft: 5000, // rounded
      yearBuilt: 2000, // rounded
      propertyType: 'single_family',
      listPrice: 500000,
      listingUrl: 'http://example.com/listing',
      photos: ['a.jpg', 'b.jpg'],
    });
  });

  it('NEVER overwrites a value the record already has', () => {
    const record = { ...emptyRecord(), beds: 4, squareFeet: 2000, listingUrl: 'kept', photos: ['old.jpg'] } as Rec;
    const patch = mergePropertyFields(record, fields());
    expect(patch).not.toHaveProperty('beds');
    expect(patch).not.toHaveProperty('squareFeet');
    expect(patch).not.toHaveProperty('listingUrl');
    expect(patch).not.toHaveProperty('photos');
    // still fills the ones that WERE blank
    expect(patch.baths).toBe(2);
  });

  it('treats a blank string as empty and fills it', () => {
    const record = { ...emptyRecord(), listingUrl: '   ' } as Rec;
    expect(mergePropertyFields(record, fields()).listingUrl).toBe('http://example.com/listing');
  });

  it('skips a field the AI left null even when the record is blank', () => {
    const patch = mergePropertyFields(emptyRecord(), fields({ beds: null, listPrice: null }));
    expect(patch).not.toHaveProperty('beds');
    expect(patch).not.toHaveProperty('listPrice');
  });

  it('caps adopted photos at 20', () => {
    const many = Array.from({ length: 25 }, (_, i) => `p${i}.jpg`);
    const patch = mergePropertyFields(emptyRecord(), fields({ photoUrls: many }));
    expect(patch.photos).toHaveLength(20);
  });
});
