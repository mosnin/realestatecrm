/**
 * GET  /api/offers            — list the caller's space's offers.
 * GET  /api/offers?dealId=... — list only offers linked to that deal (still
 *                                spaceId-scoped — see listOffersForDeal in
 *                                lib/offers.ts). Powers the deal detail
 *                                page's Offers section.
 * POST /api/offers            — create an offer in the caller's space.
 *
 * Auth + scoping mirror the sibling deal routes (next-move, checklist):
 * requireAuth → getSpaceForUser(userId) derives the caller's own space —
 * spaceId is NEVER read from the request body or query string. See
 * lib/offers.ts for the scoped query implementation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { readJsonWithLimit, parseOrBadRequest, BODY_LIMITS } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { listOffers, listOffersForDeal, createOffer, OFFER_STATUSES } from '@/lib/offers';

export const runtime = 'nodejs';

const createOfferSchema = z.object({
  dealId: z.string().min(1).max(200).nullish(),
  propertyAddress: z.string().trim().max(300).nullish(),
  buyerName: z.string().trim().min(1, 'buyerName is required').max(200),
  amount: z.number().finite().nonnegative().nullish(),
  status: z.enum(OFFER_STATUSES).optional(),
  expiresAt: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: 'expiresAt must be a valid date' })
    .nullish(),
  terms: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().max(5000).nullish(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Optional deal filter for the deal detail page's Offers section. dealId
  // only narrows WITHIN the caller's own space (listOffersForDeal always
  // chains .eq('spaceId', space.id) too) — a dealId belonging to another
  // tenant simply yields an empty list, never that tenant's offers.
  const dealId = req.nextUrl.searchParams.get('dealId');

  try {
    const offers = dealId ? await listOffersForDeal(space.id, dealId) : await listOffers(space.id);
    return NextResponse.json(offers);
  } catch (err) {
    logger.error('[offers/GET] list failed', { spaceId: space.id, dealId }, err);
    return NextResponse.json({ error: 'Failed to load offers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const parsed = parseOrBadRequest(createOfferSchema, read.data);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const offer = await createOffer(space.id, {
      dealId: body.dealId ?? null,
      propertyAddress: body.propertyAddress ?? null,
      buyerName: body.buyerName,
      amount: body.amount ?? null,
      status: body.status,
      expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
      terms: body.terms ?? {},
      notes: body.notes ?? null,
    });
    return NextResponse.json(offer, { status: 201 });
  } catch (err) {
    logger.error('[offers/POST] create failed', { spaceId: space.id }, err);
    return NextResponse.json({ error: 'Failed to create offer' }, { status: 500 });
  }
}
