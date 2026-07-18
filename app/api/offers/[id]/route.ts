/**
 * GET    /api/offers/[id] — one offer + its status-history timeline.
 * PATCH  /api/offers/[id] — update non-status fields (buyer, amount, terms…).
 * DELETE /api/offers/[id] — remove a still-draft offer (no history to lose).
 *
 * Status changes go through POST /api/offers/[id]/transition, NOT this
 * PATCH — that route is the only place OFFER_TRANSITIONS is enforced and an
 * OfferEvent is written.
 *
 * Tenant scoping: getOffer()/updateOffer()/deleteDraftOffer() (lib/offers.ts)
 * all chain `.eq('spaceId', space.id)`. A cross-tenant id is indistinguishable
 * from a missing one — every miss here is a 404, never a 403 (no existence
 * leak).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { readJsonWithLimit, parseOrBadRequest, BODY_LIMITS } from '@/lib/validation';
import { logger } from '@/lib/logger';
import { getOffer, updateOffer, deleteDraftOffer, listOfferEvents } from '@/lib/offers';

export const runtime = 'nodejs';

const updateOfferSchema = z.object({
  dealId: z.string().min(1).max(200).nullish(),
  propertyAddress: z.string().trim().max(300).nullish(),
  buyerName: z.string().trim().min(1).max(200).optional(),
  amount: z.number().finite().nonnegative().nullish(),
  expiresAt: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: 'expiresAt must be a valid date' })
    .nullish(),
  terms: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().max(5000).nullish(),
});

async function resolveSpace(userId: string) {
  return getSpaceForUser(userId);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolveSpace(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const offer = await getOffer(space.id, id);
    if (!offer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const events = await listOfferEvents(space.id, id);
    return NextResponse.json({ offer, events });
  } catch (err) {
    logger.error('[offers/[id]/GET] failed', { offerId: id }, err);
    return NextResponse.json({ error: 'Failed to load offer' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolveSpace(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const parsed = parseOrBadRequest(updateOfferSchema, read.data);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const updated = await updateOffer(space.id, id, {
      ...('dealId' in body ? { dealId: body.dealId ?? null } : {}),
      ...('propertyAddress' in body ? { propertyAddress: body.propertyAddress ?? null } : {}),
      ...(body.buyerName !== undefined ? { buyerName: body.buyerName } : {}),
      ...('amount' in body ? { amount: body.amount ?? null } : {}),
      ...('expiresAt' in body
        ? { expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null }
        : {}),
      ...(body.terms !== undefined ? { terms: body.terms } : {}),
      ...('notes' in body ? { notes: body.notes ?? null } : {}),
    });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    logger.error('[offers/[id]/PATCH] failed', { offerId: id }, err);
    return NextResponse.json({ error: 'Failed to update offer' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolveSpace(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const existing = await getOffer(space.id, id);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft offers can be deleted — withdraw it instead' },
        { status: 409 },
      );
    }
    await deleteDraftOffer(space.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[offers/[id]/DELETE] failed', { offerId: id }, err);
    return NextResponse.json({ error: 'Failed to delete offer' }, { status: 500 });
  }
}
