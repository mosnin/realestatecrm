import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { normalizeArea, parseAreaQuery, type NormalizedArea } from '@/lib/areas';
import { missingResearchKeys } from '@/lib/area-analysis';
import { getOrCreateAreaReport } from '@/lib/area-report-store';
import { unscoped } from '@/lib/supabase-guard';


/**
 * POST /api/areas/analyze — Property IQ area research.
 *
 * Resolve the target area from ONE of (in priority order):
 *   - { propertyId }                         → the property's city/state/ZIP
 *   - { query: "Austin, TX 78704" }          → free-text parse
 *   - { city, stateRegion, postalCode }      → explicit parts
 * then return a fresh area report, researching + caching one if needed. The
 * report is reused across every property in the same area, so repeat calls for
 * the same ZIP are cheap.
 *
 * Graceful degradation: missing TAVILY_API_KEY / FIRECRAWL_API_KEY → 200 with
 * { status: 'not_configured', missing } so the UI shows a clear state.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Body {
  propertyId?: string;
  query?: string;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  forceRefresh?: boolean;
}

/** Resolve a property (own or assigned pool space) to its normalized area. */
async function areaFromProperty(
  spaceId: string,
  propertyId: string,
): Promise<NormalizedArea | null> {
  const { data } = await unscoped(supabase
    .from('Property'), 'post-fetch: caller verified parent scope before this id query')
    .select('city, "stateRegion", "postalCode"')
    .eq('id', propertyId)
    .or(`spaceId.eq.${spaceId},assignedSpaceId.eq.${spaceId}`)
    .maybeSingle();
  if (!data) return null;
  const row = data as { city: string | null; stateRegion: string | null; postalCode: string | null };
  return normalizeArea(row);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'No workspace' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Body;

  // Resolve the area.
  let area: NormalizedArea | null = null;
  if (body.propertyId) {
    area = await areaFromProperty(space.id, body.propertyId);
    if (!area) {
      return NextResponse.json(
        { status: 'error', error: 'That property has no city/state/ZIP to research yet.' },
        { status: 422 },
      );
    }
  } else if (typeof body.query === 'string' && body.query.trim()) {
    area = parseAreaQuery(body.query);
  } else {
    area = normalizeArea({
      city: body.city ?? null,
      stateRegion: body.stateRegion ?? null,
      postalCode: body.postalCode ?? null,
    });
  }

  if (!area) {
    return NextResponse.json(
      { status: 'error', error: 'Provide a ZIP, or a city and state, to research an area.' },
      { status: 422 },
    );
  }

  // Cheap not-configured check before the rate limiter.
  const missing = missingResearchKeys();
  if (missing.length > 0) return NextResponse.json({ status: 'not_configured', missing });

  // Rate limit the expensive research run (shared budget with property analyze
  // would be nice, but a separate, generous bucket is simpler and bounded).
  const { allowed } = await checkRateLimit(`area-analyze:${userId}`, 15, 60 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many area lookups. Please wait a bit and try again.' },
      { status: 429 },
    );
  }

  const outcome = await getOrCreateAreaReport(space.id, area, {
    forceRefresh: Boolean(body.forceRefresh),
  });

  if (outcome.status === 'not_configured') {
    return NextResponse.json({ status: 'not_configured', missing: outcome.missing });
  }
  if (outcome.status === 'no_evidence') {
    return NextResponse.json({ status: 'no_evidence', generatedAt: outcome.generatedAt });
  }
  if (outcome.status === 'error') {
    return NextResponse.json({ status: 'error', error: outcome.message }, { status: 502 });
  }

  return NextResponse.json({
    status: 'ok',
    cached: outcome.cached,
    report: outcome.report,
  });
}
