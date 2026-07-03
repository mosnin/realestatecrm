/**
 * Route-level test for `POST /api/contacts` — lead-source attribution.
 *
 * Verifies the manual contact-create path stamps a structured `source`:
 *   - defaults to 'manual' when the caller sends none
 *   - honors a valid explicit source (e.g. an API integration passing 'api')
 *   - falls back to 'manual' for an unrecognized source (never crashes)
 *   - captures the free-form sourceDetail
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// next/server's `after()` requires a real request scope and throws in Vitest.
// The POST now dispatches the lead_created workflow via after(); stub it to a
// no-op so the route reaches its 201 (the dispatch is covered by its own test).
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});
vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));
vi.mock('@/lib/vectorize', () => ({
  syncContact: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/notify', () => ({
  notifyNewContact: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/agent/fire-trigger', () => ({
  fireAgentTrigger: vi.fn(() => Promise.resolve()),
}));

// Supabase mock — records the Contact insert payload. The POST flow issues:
//   1. (optional) Contact dedupe select → ilike → limit → maybeSingle
//   2. Contact insert → select → single
let lastInsertValues: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    let isInsert = false;
    let insertValues: Record<string, unknown> | null = null;

    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      isInsert = true;
      insertValues = values;
      if (table === 'Contact') lastInsertValues = values;
      return chain;
    });
    // dedupe lookup: no existing contact → null
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.single = vi.fn(() => {
      if (table === 'Contact' && isInsert) {
        return Promise.resolve({ data: { id: 'contact_1', ...(insertValues ?? {}) }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/contacts/route';
import { requireSpaceOwner } from '@/lib/api-auth';

const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SPACE = { id: 'space_1', name: 'Acme' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  lastInsertValues = null;
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'user_1', space: SPACE } as never);
});

describe('POST /api/contacts — lead-source attribution', () => {
  it("defaults source to 'manual' when none is supplied", async () => {
    const res = await POST(makeReq({ slug: 'acme', name: 'Jane Doe' }));
    expect(res.status).toBe(201);
    expect(lastInsertValues).not.toBeNull();
    expect(lastInsertValues!.source).toBe('manual');
    expect(lastInsertValues!.sourceDetail).toBeNull();
  });

  it('honors a valid explicit source from the caller', async () => {
    await POST(makeReq({ slug: 'acme', name: 'API Lead', source: 'api' }));
    expect(lastInsertValues!.source).toBe('api');
  });

  it("falls back to 'manual' for an unrecognized source value", async () => {
    await POST(makeReq({ slug: 'acme', name: 'Weird', source: 'carrier_pigeon' }));
    expect(lastInsertValues!.source).toBe('manual');
  });

  it('captures sourceDetail when provided', async () => {
    await POST(
      makeReq({ slug: 'acme', name: 'Ref Lead', source: 'referral', sourceDetail: 'Bob Smith' }),
    );
    expect(lastInsertValues!.source).toBe('referral');
    expect(lastInsertValues!.sourceDetail).toBe('Bob Smith');
  });
});
