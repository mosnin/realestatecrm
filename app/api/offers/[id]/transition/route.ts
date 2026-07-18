/**
 * POST /api/offers/[id]/transition — the ONLY route that changes
 * Offer.status. Delegates to lib/offers.ts's `transition()`, which enforces
 * OFFER_TRANSITIONS and writes the matching OfferEvent row atomically with
 * the status change.
 *
 * Body: { to: OfferStatus, note?: string }
 *
 * - Cross-tenant / missing offer id → 404 (never 403 — no existence leak).
 * - Illegal move (e.g. draft → accepted) → 409 with the attempted from/to.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { readJsonWithLimit, parseOrBadRequest, BODY_LIMITS } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { transition, IllegalOfferTransitionError, OFFER_STATUSES } from '@/lib/offers';

export const runtime = 'nodejs';

const transitionSchema = z.object({
  to: z.enum(OFFER_STATUSES),
  note: z.string().trim().max(2000).nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const parsed = parseOrBadRequest(transitionSchema, read.data);
  if (!parsed.ok) return parsed.response;
  const { to, note } = parsed.data;

  try {
    const updated = await transition(space.id, id, to, note ?? null);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof IllegalOfferTransitionError) {
      return NextResponse.json(
        { error: `Cannot move an offer from "${err.from}" to "${err.to}"`, from: err.from, to: err.to },
        { status: 409 },
      );
    }
    logger.error('[offers/[id]/transition] failed', { offerId: id, to }, err);
    return NextResponse.json({ error: 'Failed to transition offer' }, { status: 500 });
  }
}
