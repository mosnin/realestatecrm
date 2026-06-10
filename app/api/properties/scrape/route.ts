import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { apifyConfigured, runPropertyScrape } from '@/lib/apify';

/**
 * Realtor-only: scrape a public listing URL via Apify into a Property prefill.
 *
 * Token-gated — returns `{ configured: false }` when APIFY_TOKEN is unset so the
 * form can show a quiet "connect Apify" hint instead of erroring. Persists
 * nothing: the realtor reviews the prefill and saves through the normal create
 * flow. Scraping runs an actor per call, so it's rate-limited per space.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Honest degradation when the integration isn't configured for this env.
  if (!apifyConfigured()) return NextResponse.json({ configured: false });

  if (!/^https?:\/\//i.test(url) || url.length > 2000) {
    return NextResponse.json({ error: 'Enter a valid listing URL' }, { status: 400 });
  }

  const { allowed } = await checkRateLimit(`property-scrape:${space.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many imports — try again later.' }, { status: 429 });
  }

  const prefill = await runPropertyScrape(url);
  if (!prefill) {
    return NextResponse.json({ configured: true, prefill: null, error: "Couldn't read that listing." });
  }
  return NextResponse.json({ configured: true, prefill });
}
