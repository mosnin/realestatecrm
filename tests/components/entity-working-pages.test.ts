import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()}),useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/s/test/contacts'}));
import { ContactTable } from '@/components/contacts/contact-table';
import { PropertyListGrid } from '@/components/properties/property-list-grid';
import type { Property } from '@/lib/types';
it('keeps People focused on attention and retains add/search and optional reporting',()=>{
  const html = renderToStaticMarkup(React.createElement(ContactTable,{slug:'test',summary:React.createElement('p',null,'Report content')}));
  expect(html).toMatch(/<h1[^>]*>People<\/h1>/);
  expect(html).toContain('Needs attention');expect(html).toContain('All people');expect(html).toContain('Add person');
  expect(html).toMatch(/<details[^>]*>/);expect(html).toContain('Contact directory');
});
it('renders searchable property inventory with exact fractional facts and no false verification',()=>{
  const property = {id:'one',address:'101 Example',unitNumber:null,city:null,stateRegion:null,photos:[],beds:3,baths:2.5,squareFeet:1800,listPrice:550000,listingStatus:'active',analyzedAt:'2026-09-01',analysis:null} as unknown as Property;
  const html = renderToStaticMarkup(React.createElement(PropertyListGrid,{slug:'test',properties:[property]}));
  expect(html).toContain('Search properties');expect(html).toContain('Property status');expect(html).toContain('Gallery view');
  expect(html).toContain('2.5ba');expect(html).toContain('$550,000');expect(html).toContain('no saved evidence');
  expect(html).toContain('/s/test/properties/one');expect(html).not.toContain('Market ready');
});
