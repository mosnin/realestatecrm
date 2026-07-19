/**
 * POST /api/drip/enroll — enroll one contact into one drip sequence.
 * GET  /api/drip/enroll — the space's enrollments, newest first (optionally
 *                          filtered by ?sequenceId= or ?contactId=), each row
 *                          joined with the enrolled contact's name/email so
 *                          the enrollment view never has to show a bare id.
 *
 * Owner-scoped: Clerk requireAuth → resolve the owner's Space → every query
 * scoped by spaceId. The actual "does this sequence belong to this space" /
 * "does this contact belong to this space" validation lives in
 * lib/drip/engine.ts's enrollContact (it re-checks under the same spaceId
 * this route resolved, so a sequenceId or contactId from another tenant can
 * never be threaded through) — this route only maps its typed outcome to the
 * right HTTP status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { enrollContact } from '@/lib/drip/engine';

export const runtime = 'nodejs';

const SELECT = 'id, sequenceId, contactId, enrolledAt, currentStep, status, stopReason, createdAt';
const MAX_LIST = 200;

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const sequenceId = searchParams.get('sequenceId');
  const contactId = searchParams.get('contactId');

  let query = supabase
    .from('DripEnrollment')
    .select(SELECT)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(MAX_LIST);
  if (sequenceId) query = query.eq('sequenceId', sequenceId);
  if (contactId) query = query.eq('contactId', contactId);

  const { data, error } = await query;
  if (error) {
    logger.error('[drip/enroll] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }

  const enrollments = (data ?? []) as unknown as Array<{ id: string; contactId: string }>;

  // Join contact display names in a second, spaceId-scoped query rather than
  // a PostgREST embed — DripEnrollment/Contact don't have a registered FK
  // relationship name to embed on, and a manual `.in()` lookup is simpler to
  // reason about here than teaching PostgREST a new join.
  const contactIds = Array.from(new Set(enrollments.map((e) => e.contactId).filter(Boolean)));
  let contactsById = new Map<string, { name: string | null; email: string | null }>();
  if (contactIds.length > 0) {
    const { data: contactRows, error: contactErr } = await supabase
      .from('Contact')
      .select('id, name, email')
      .eq('spaceId', space.id)
      .in('id', contactIds);
    if (contactErr) {
      logger.warn('[drip/enroll] contact join failed — returning enrollments without names', {
        spaceId: space.id,
      }, contactErr);
    } else {
      contactsById = new Map(
        ((contactRows ?? []) as unknown as Array<{ id: string; name: string | null; email: string | null }>).map(
          (c) => [c.id, { name: c.name, email: c.email }],
        ),
      );
    }
  }

  const enriched = enrollments.map((e) => {
    const contact = contactsById.get(e.contactId);
    return { ...e, contactName: contact?.name ?? null, contactEmail: contact?.email ?? null };
  });

  return NextResponse.json({ enrollments: enriched });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sequenceId = typeof body.sequenceId === 'string' ? body.sequenceId : '';
  const contactId = typeof body.contactId === 'string' ? body.contactId : '';

  if (!sequenceId || !contactId) {
    return NextResponse.json({ error: 'sequenceId and contactId are required.' }, { status: 400 });
  }

  const result = await enrollContact({ spaceId: space.id, sequenceId, contactId });

  switch (result.outcome) {
    case 'enrolled':
      return NextResponse.json({ enrollmentId: result.enrollmentId }, { status: 201 });
    case 'sequence_not_found':
      return NextResponse.json({ error: 'Sequence not found or inactive.' }, { status: 404 });
    case 'contact_not_found':
      return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
    case 'already_enrolled':
      return NextResponse.json({ error: 'Contact is already enrolled in this sequence.' }, { status: 409 });
    case 'failed':
    default:
      logger.error('[drip/enroll] enroll failed', { spaceId: space.id, sequenceId, contactId }, result.error);
      return NextResponse.json({ error: 'Enroll failed' }, { status: 500 });
  }
}
