import { describe, expect, it } from 'vitest';
import { groundedPropertyFields, mergePropertyFields } from '@/lib/property-analysis';
import type { AnalyzedFields } from '@/lib/types';
const fields = {beds:3,baths:2.5,listPrice:550000,photoUrls:['https://example.test/photo.jpg'],listingUrl:'https://example.test/listing'} as AnalyzedFields;
describe('property canonical facts',()=>{
  it('does not fill a price or other fact from an unconsulted model citation',()=>{
    const grounded = groundedPropertyFields(fields,{beds:'https://example.test/listing',listPrice:'https://invented.test' },[{url:'https://example.test/listing',title:'Listing'}]);
    expect(grounded.beds).toBe(3);expect(grounded.baths).toBeNull();expect(grounded.listPrice).toBeNull();expect(grounded.photoUrls).toEqual([]);
  });
  it('preserves fractional bathrooms and human overrides',()=>{
    const grounded = groundedPropertyFields(fields,{baths:'https://example.test/listing'},[{url:'https://example.test/listing',title:'Listing'}]);
    const empty = {beds:null,baths:null,squareFeet:null,lotSizeSqft:null,yearBuilt:null,propertyType:null,listPrice:600000,listingUrl:null,photos:[]};
    const patch = mergePropertyFields(empty,grounded);
    expect(patch.baths).toBe(2.5);expect(patch).not.toHaveProperty('listPrice');
  });
});
