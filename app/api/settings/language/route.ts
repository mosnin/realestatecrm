/**
 * Account language preference.
 *
 * GET  → { language }               — the signed-in user's stored language.
 * POST { language } → { ok, persisted } — store it and pin the explicit
 *   language preference cookie
 *   cookie so the logged-out site (and the geo middleware) immediately follow
 *   the explicit choice on this browser; the DB row makes it portable across
 *   devices and is the future source for in-app/email language.
 *
 * The User row is the per-user boundary (`.eq('clerkId', userId)` from the
 * authenticated session — User is account-scoped, not a spaceId tenant table).
 *
 * Migration resilience: the `language` column ships in
 * 20260905000000_user_locale_fields.sql, which is applied via the human-gated
 * workflow — this route must not 500 while prod is ahead of the migration.
 * If the column isn't live yet, the cookie is still set and we report
 * `persisted: false` honestly instead of pretending the account was updated.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { DEFAULT_LANG, LANG_COOKIE, isLang } from '@/lib/i18n/markets';

const LANG_COOKIE_OPTS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const,
};

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { data } = await supabase
      .from('User')
      .select('language')
      .eq('clerkId', authResult.userId)
      .maybeSingle<{ language: string | null }>();
    const language = isLang(data?.language) ? data!.language : DEFAULT_LANG;
    return NextResponse.json({ language });
  } catch {
    // Column not migrated yet (or transient DB issue) — default, don't break.
    return NextResponse.json({ language: DEFAULT_LANG });
  }
}

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => ({}));
  const language: unknown = (body as { language?: unknown }).language;
  if (!isLang(language)) {
    return NextResponse.json({ error: 'Invalid language.' }, { status: 400 });
  }

  let persisted = false;
  try {
    const { error } = await supabase
      .from('User')
      .update({ language })
      .eq('clerkId', authResult.userId);
    persisted = !error;
  } catch {
    persisted = false; // pre-migration prod: cookie still applies below
  }

  const res = NextResponse.json({ ok: true, persisted });
  // Explicit choice → pin the same preference cookie middleware honors.
  res.cookies.set(LANG_COOKIE, language, LANG_COOKIE_OPTS);
  return res;
}
