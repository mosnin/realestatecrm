/**
 * CMA narrative — POST { slug, id } → { narrative: string | null }
 *
 * Generates a grounded, seller-facing pre-listing pitch from an existing CMA
 * report's frozen payload. Auth: requireSpaceOwner(slug) — the report is
 * loaded with `.eq('id', id).eq('spaceId', space.id)`, so a caller can only
 * generate a narrative for a report inside a workspace they own (the `.eq`
 * IS the security boundary; a cross-tenant id 404s).
 *
 * Honest UI: when the report's stats don't have enough data to defend a
 * valuation, this returns `{ narrative: null, reason: 'insufficient_data' }`
 * with NO LLM call — never presents a pitch built on thin data.
 *
 * Persistence: a successfully generated narrative is saved onto the report's
 * `narrative` / `narrativeUpdatedAt` columns (migration
 * supabase/migrations/20260904000000_cma_narrative.sql) via
 * persistCmaNarrative(), scoped by the same spaceId already verified above.
 * The packet export (app/api/cma/packet/[id]/route.ts) reads it back from
 * there. A persistence failure is logged but does not fail the response —
 * the narrative was already generated and billed; losing the cached copy is
 * recoverable (regenerate) and shouldn't discard a successful LLM call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  composeCmaNarrative,
  persistCmaNarrative,
  CmaNarrativeError,
} from '@/lib/cma-narrative';
import type { CmaPayload } from '@/lib/cma-types';

export const runtime = 'nodejs';

interface PostBody {
  slug?: string;
  id?: string;
}

interface ReportRow {
  id: string;
  spaceId: string;
  payload: CmaPayload;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slug = body.slug?.trim();
  const id = body.id?.trim();
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // LLM-backed generation — bound per-user like the other AI compose routes
  // (see app/api/agent/quick-draft/route.ts).
  const { allowed } = await checkRateLimit(`cma:narrative:${userId}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  }

  // Tenant scoping: the .eq('spaceId', space.id) IS the security boundary —
  // a report id from another workspace resolves to no row, never a 403 leak.
  const { data, error } = await supabase
    .from('CmaReport')
    .select('id, spaceId, payload')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    logger.error('[cma-narrative] load failed', { spaceId: space.id, id, err: error.message });
    return NextResponse.json({ error: 'Could not load the report.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const report = data as ReportRow;
  const payload = report.payload;
  if (!payload || !payload.stats) {
    return NextResponse.json({ error: 'This report has no analysis to narrate yet.' }, { status: 400 });
  }

  try {
    const narrative = await composeCmaNarrative(payload, {
      spaceId: space.id,
      brandName: space.name ?? null,
      signal: req.signal,
    });
    if (narrative === null) {
      return NextResponse.json({ narrative: null, reason: 'insufficient_data' });
    }

    // Best-effort: a persistence hiccup must never turn an already-successful
    // (and already-billed) generation into a failed response — see the
    // persistence note in the file header.
    try {
      const persisted = await persistCmaNarrative({ spaceId: space.id, id, narrative });
      if (!persisted) {
        logger.warn('[cma-narrative] generated but not persisted', { spaceId: space.id, id });
      }
    } catch (persistErr) {
      logger.warn('[cma-narrative] persist threw', {
        spaceId: space.id,
        id,
        err: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }

    return NextResponse.json({ narrative });
  } catch (err) {
    if (err instanceof CmaNarrativeError) {
      logger.warn('[cma-narrative] compose failed', { spaceId: space.id, id, err: err.message });
      return NextResponse.json(
        { error: 'Could not generate the narrative. Try again.' },
        { status: 502 },
      );
    }
    logger.error('[cma-narrative] unexpected failure', {
      spaceId: space.id,
      id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
