import { NextRequest, NextResponse, after } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  analyzeProperty,
  missingResearchKeys,
  type PropertyRecord,
} from '@/lib/property-analysis';
import { normalizeArea } from '@/lib/areas';
import { getOrCreateAreaReport } from '@/lib/area-report-store';
import { unscoped } from '@/lib/supabase-guard';
import { tenantTable } from '@/lib/tenant-db';


/**
 * POST /api/properties/[id]/analyze
 *
 * Web-research the specific property at this record's address (Tavily + Firecrawl),
 * have the LLM structure the grounded findings, fill EMPTY Property columns with
 * the found values (never overwriting human-entered ones), and persist the full
 * structured result into Property.analysis with Property.analyzedAt.
 *
 * Graceful degradation: when TAVILY_API_KEY or FIRECRAWL_API_KEY is missing this
 * returns 200 with { status: 'not_configured', missing } so the UI can render a
 * clear "research not configured" state instead of an error.
 *
 * Runs on Node (the research clients are server-only) with an extended max
 * duration since the pipeline does several upstream calls within its own budget.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const SELECT =
  'id, spaceId, assignedSpaceId, address, unitNumber, city, stateRegion, postalCode, ' +
  'mlsNumber, propertyType, beds, baths, squareFeet, lotSizeSqft, yearBuilt, listPrice, ' +
  'listingStatus, listingUrl, photos, notes';

interface PropertyRow extends PropertyRecord {
  spaceId: string;
  assignedSpaceId: string | null;
}

/** Resolve the property + authorize the caller (own space OR assigned pool space). */
async function resolve(userId: string, id: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data } = await unscoped(supabase
    .from('Property'), 'post-fetch: caller verified parent scope before this id query')
    .select(SELECT)
    .eq('id', id)
    .or(`spaceId.eq.${space.id},assignedSpaceId.eq.${space.id}`)
    .maybeSingle();
  if (!data) return null;
  return { space, property: data as unknown as PropertyRow };
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolve(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Early, cheap "not configured" check so an unconfigured deploy never even
  // hits the rate limiter — the realtor just sees the clear state.
  const missing = missingResearchKeys();
  if (missing.length > 0) {
    return NextResponse.json({ status: 'not_configured', missing });
  }

  // Rate limit the expensive research run — per user, generous but bounded.
  const { allowed } = await checkRateLimit(`property-analyze:${userId}`, 10, 60 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many analyses. Please wait a bit and try again.' },
      { status: 429 },
    );
  }

  const outcome = await analyzeProperty(ctx.property);

  if (outcome.status === 'not_configured') {
    return NextResponse.json({ status: 'not_configured', missing: outcome.missing });
  }
  if (outcome.status === 'error') {
    return NextResponse.json({ status: 'error', error: outcome.message }, { status: 502 });
  }
  if (outcome.status === 'no_evidence') {
    // Still record the attempt so the UI shows "Analyzed <date> — no data found".
    await persist(id, ctx.property.spaceId, ctx.space.id, {}, {
      noEvidence: true,
      analyzedAt: outcome.analyzedAt,
    });
    return NextResponse.json({ status: 'no_evidence', analyzedAt: outcome.analyzedAt });
  }

  // status === 'ok' — persist the fill-empty patch + the full analysis blob.
  const updated = await persist(id, ctx.property.spaceId, ctx.space.id, outcome.patch, {
    analysis: outcome.analysis,
    analyzedAt: outcome.analysis.analyzedAt,
  });
  if (!updated) {
    return NextResponse.json({ status: 'error', error: 'Failed to save analysis' }, { status: 500 });
  }

  // Property IQ auto-enrich: warm the area report for this property's
  // neighborhood in the background so it's ready the moment the realtor opens
  // Area IQ. Non-blocking and best-effort — the property analysis already
  // succeeded; a failed area warm-up never affects this response. Reuses the
  // cache, so analyzing several listings in one ZIP only researches it once.
  const area = normalizeArea({
    city: ctx.property.city,
    stateRegion: ctx.property.stateRegion,
    postalCode: ctx.property.postalCode,
  });
  if (area) {
    const ownerSpaceId = ctx.property.spaceId;
    after(async () => {
      try {
        await getOrCreateAreaReport(ownerSpaceId, area);
      } catch (err) {
        logger.warn('[properties/analyze] area auto-enrich failed', { propertyId: id }, err);
      }
    });
  }

  return NextResponse.json({
    status: 'ok',
    analysis: outcome.analysis,
    filled: Object.keys(outcome.patch),
    property: updated,
  });
}

/**
 * Persist the column patch (fill-empty values) + the analysis blob in one
 * update. Scoped by the property's owning spaceId so a pool property updates its
 * canonical row, not the assignee's. Returns the updated row, or null on error.
 */
async function persist(
  id: string,
  ownerSpaceId: string,
  _callerSpaceId: string,
  patch: Record<string, unknown>,
  extra: { analysis?: unknown; analyzedAt: string; noEvidence?: boolean },
) {
  const update: Record<string, unknown> = {
    ...patch,
    analyzedAt: extra.analyzedAt,
    updatedAt: new Date().toISOString(),
  };
  // Only write the analysis blob when we have one (no_evidence leaves it as-is
  // but still stamps analyzedAt so the UI shows the attempt).
  if (extra.analysis !== undefined) update.analysis = extra.analysis;

  const { data, error } = await tenantTable(supabase, 'Property', { spaceId: ownerSpaceId })
    .update(update)
    .eq('id', id)
    .select(`${SELECT}, analysis, analyzedAt`)
    .single();

  if (error) {
    logger.error('[properties/analyze] persist failed', { propertyId: id }, error);
    return null;
  }
  return data;
}
