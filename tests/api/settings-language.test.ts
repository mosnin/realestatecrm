/**
 * Account language preference route — the setting that lets a US-English
 * account switch to Spanish/Russian. Asserts the auth gate, input validation,
 * the User-row update scoped by clerkId, the explicit preference cookie, and the
 * pre-migration honesty contract (cookie still set, persisted:false — never a
 * 500 while prod is ahead of the language-column migration).
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextResponse } from 'next/server';

const authState: { userId: string | null } = { userId: 'clerk_user_1' };
vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () =>
    authState.userId
      ? { userId: authState.userId }
      : NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  ),
}));

const db = {
  storedLanguage: 'en' as string | null,
  updateError: null as { message: string } | null,
  lastUpdate: null as Record<string, unknown> | null,
  lastEq: null as [string, string] | null,
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'User') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { language: db.storedLanguage } }),
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async (col: string, val: string) => {
            db.lastUpdate = values;
            db.lastEq = [col, val];
            return { error: db.updateError };
          },
        }),
      };
    },
  },
}));

import { GET, POST } from '@/app/api/settings/language/route';

const post = (body: unknown) =>
  POST(
    new Request('http://t/api/settings/language', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  authState.userId = 'clerk_user_1';
  db.storedLanguage = 'en';
  db.updateError = null;
  db.lastUpdate = null;
  db.lastEq = null;
});

describe('GET /api/settings/language', () => {
  it('requires auth', async () => {
    authState.userId = null;
    expect((await GET()).status).toBe(401);
  });

  it('returns the stored language', async () => {
    db.storedLanguage = 'es';
    expect(await (await GET()).json()).toEqual({ language: 'es' });
  });

  it('defaults to en for missing/invalid stored values', async () => {
    db.storedLanguage = null;
    expect(await (await GET()).json()).toEqual({ language: 'en' });
    db.storedLanguage = 'klingon';
    expect(await (await GET()).json()).toEqual({ language: 'en' });
  });
});

describe('POST /api/settings/language', () => {
  it('requires auth', async () => {
    authState.userId = null;
    expect((await post({ language: 'es' })).status).toBe(401);
  });

  it('rejects unknown languages and garbage bodies', async () => {
    expect((await post({ language: 'xx' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(db.lastUpdate).toBeNull();
  });

  it('updates the User row scoped by the session clerkId and pins the cookie', async () => {
    const res = await post({ language: 'es' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, persisted: true });
    expect(db.lastUpdate).toEqual({ language: 'es' });
    expect(db.lastEq).toEqual(['clerkId', 'clerk_user_1']);
    expect(res.headers.get('set-cookie')).toContain('chippi_lang_pref=es');
  });

  it('pre-migration: DB error still sets the cookie and reports persisted:false', async () => {
    db.updateError = { message: 'column "language" does not exist' };
    const res = await post({ language: 'ru' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, persisted: false });
    expect(res.headers.get('set-cookie')).toContain('chippi_lang_pref=ru');
  });
});
