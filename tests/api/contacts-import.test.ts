/**
 * POST /api/contacts/import — bulk Contact writes. Caps and auth must fire
 * before any insert, and every row must land in the caller's space.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  requireSpaceOwner: vi.fn(),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  inserts: [] as Array<{ table: string; payload: unknown }>,
  insertError: null as { message: string } | null,
}));

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: (slug: string) => h.requireSpaceOwner(slug),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (key: string, limit: number, window: number) =>
    h.checkRateLimit(key, limit, window),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        h.inserts.push({ table, payload });
        return Promise.resolve({ error: h.insertError });
      },
    }),
  },
}));

import { POST } from '@/app/api/contacts/import/route';

const CALLER_SPACE = {
  id: 'space_caller',
  slug: 'jane',
  name: 'Jane',
  ownerId: 'u_caller',
};

function makeReq(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost/api/contacts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.requireSpaceOwner.mockReset();
  h.checkRateLimit.mockReset();
  h.checkRateLimit.mockResolvedValue({ allowed: true });
  h.inserts.length = 0;
  h.insertError = null;
  h.requireSpaceOwner.mockResolvedValue({
    userId: 'u_caller',
    space: CALLER_SPACE,
  });
});

describe('POST /api/contacts/import', () => {
  it('rejects oversized bodies before JSON parse or auth', async () => {
    const res = await POST(
      makeReq({ slug: 'jane', rows: [{ name: 'Pat' }] }, { 'content-length': '1048577' }),
    );
    expect(res.status).toBe(413);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.inserts).toHaveLength(0);
  });

  it('requires slug before auth or insert', async () => {
    const res = await POST(makeReq({ rows: [{ name: 'Pat' }] }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'slug required' });
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.inserts).toHaveLength(0);
  });

  it('requires a non-empty rows array before auth', async () => {
    const empty = await POST(makeReq({ slug: 'jane', rows: [] }));
    expect(empty.status).toBe(400);
    const missing = await POST(makeReq({ slug: 'jane' }));
    expect(missing.status).toBe(400);
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.inserts).toHaveLength(0);
  });

  it('rejects more than 500 rows before auth or insert', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ name: `Lead ${i}` }));
    const res = await POST(makeReq({ slug: 'jane', rows }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Maximum 500 rows per import' });
    expect(h.requireSpaceOwner).not.toHaveBeenCalled();
    expect(h.inserts).toHaveLength(0);
  });

  it('propagates requireSpaceOwner deny and does not insert', async () => {
    h.requireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await POST(makeReq({ slug: 'victim', rows: [{ name: 'Pat' }] }));
    expect(res.status).toBe(403);
    expect(h.checkRateLimit).not.toHaveBeenCalled();
    expect(h.inserts).toHaveLength(0);
  });

  it('rate-limits after auth and does not insert', async () => {
    h.checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(makeReq({ slug: 'jane', rows: [{ name: 'Pat' }] }));
    expect(res.status).toBe(429);
    expect(h.checkRateLimit).toHaveBeenCalledWith('import:u_caller', 5, 3600);
    expect(h.inserts).toHaveLength(0);
  });

  it('rejects nameless rows after auth and does not insert', async () => {
    const res = await POST(
      makeReq({
        slug: 'jane',
        rows: [{ name: '   ' }, { name: '', email: 'a@b.com' }],
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'No valid rows (name is required)',
    });
    expect(h.inserts).toHaveLength(0);
  });

  it('inserts only named rows into the caller space with sanitized fields', async () => {
    const longName = 'N'.repeat(240);
    const longPhone = '1'.repeat(30);
    const longEmail = `${'a'.repeat(250)}@x.com`;
    const longNotes = 'n'.repeat(6000);

    const res = await POST(
      makeReq({
        slug: 'jane',
        rows: [
          { name: '  skip me  ', phone: ' 555-0100 ', email: ' pat@x.com ' },
          { name: '   ' },
          {
            name: longName,
            phone: longPhone,
            email: longEmail,
            budget: '250000',
            type: 'TOUR',
            notes: longNotes,
          },
          { name: 'Bad type', type: 'HACK', budget: -5 },
        ],
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ created: 3 });
    expect(h.requireSpaceOwner).toHaveBeenCalledWith('jane');
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0]?.table).toBe('Contact');

    const rows = h.inserts[0]?.payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.spaceId === 'space_caller')).toBe(true);
    expect(rows.every((r) => r.source === 'import')).toBe(true);
    expect(rows.every((r) => r.scoringStatus === 'unscored')).toBe(true);

    expect(rows[0]).toMatchObject({
      name: 'skip me',
      phone: '555-0100',
      email: 'pat@x.com',
      type: 'QUALIFICATION',
      budget: null,
    });
    expect(rows[1]).toMatchObject({
      name: 'N'.repeat(200),
      phone: '1'.repeat(20),
      email: longEmail.slice(0, 254),
      budget: 250000,
      type: 'TOUR',
      notes: 'n'.repeat(5000),
    });
    expect(rows[2]).toMatchObject({
      name: 'Bad type',
      type: 'QUALIFICATION',
      budget: null,
    });
  });

  it('returns 500 when the scoped insert fails', async () => {
    h.insertError = { message: 'db down' };
    const res = await POST(makeReq({ slug: 'jane', rows: [{ name: 'Pat' }] }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Failed to import contacts' });
  });
});
