/**
 * Client-portal tour lookup — email ILIKE wildcard IDOR.
 *
 * Contact emails were escaped; Tour.guestEmail was not. A verified client
 * whose address contains `_` (or `%`) therefore pulled every matching tour
 * across tenants — property addresses, times, realtor identity, contact ids —
 * and `/api/clients/book` treated those realtor slugs as "already engaged".
 *
 * The mock implements ILIKE: an unescaped pattern returns the foreign tour;
 * an escaped pattern does not.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const VICTIM_TOUR = {
  id: 'tour_victim',
  propertyAddress: '999 Secret Lane',
  startsAt: '2026-08-01T17:00:00.000Z',
  status: 'scheduled',
  spaceId: 'space_victim',
  contactId: 'contact_victim',
  guestEmail: 'jane.doe@example.com',
  Space: { name: 'Victim Realty', slug: 'victim-realty' },
};

function sqlIlike(value: string, pattern: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      re += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
      continue;
    }
    if (c === '%') {
      re += '.*';
      continue;
    }
    if (c === '_') {
      re += '.';
      continue;
    }
    re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i').test(value);
}

const ilikeByTable: Record<string, string> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.ilike = vi.fn((column: string, value: string) => {
      ilikeByTable[`${table}.${column}`] = value;
      return chain;
    });
    chain.order = vi.fn(() => chain);
    const resolve = () => {
      if (table === 'Tour') {
        const pattern = ilikeByTable['Tour.guestEmail'];
        const hit = pattern ? sqlIlike(VICTIM_TOUR.guestEmail, pattern) : false;
        return { data: hit ? [VICTIM_TOUR] : [], error: null };
      }
      return { data: [], error: null };
    };
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolve()));
    chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(ok, err);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { getClientPortalData } from '@/lib/client-portal-data';

beforeEach(() => {
  for (const k of Object.keys(ilikeByTable)) delete ilikeByTable[k];
});

describe('getClientPortalData — tour guestEmail ILIKE IDOR', () => {
  it('does not return another person\'s tour when `_` would wildcard-match their guestEmail', async () => {
    const data = await getClientPortalData('jane_doe@example.com');
    expect(data.tours).toEqual([]);
    expect(data.contactIds).toEqual([]);
    expect(ilikeByTable['Tour.guestEmail']).toBe('jane\\_doe@example.com');
  });

  it('still returns the tour for an exact (case-insensitive) email match', async () => {
    const data = await getClientPortalData('Jane.Doe@example.com');
    expect(data.tours).toHaveLength(1);
    expect(data.tours[0].id).toBe('tour_victim');
    expect(data.tours[0].propertyAddress).toBe('999 Secret Lane');
  });
});
