import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { deleteObjectsBestEffort, publicUrlToKey } from '@/lib/storage';
import { _sanitisePropertyBody as sanitise } from '@/app/api/properties/route';
import { tenantTable } from '@/lib/tenant-db';

async function resolve(userId: string, id: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data } = await tenantTable(supabase, 'Property', { spaceId: space.id })
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return { space, property: data };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolve(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Include linked deals + tours so the detail page can show usage.
  const [dealsResult, toursResult] = await Promise.all([
    tenantTable(supabase, 'Deal', { spaceId: ctx.space.id })
      .select('id, title, status, value, closeDate, stageId')
      .eq('propertyId', id)
      .order('updatedAt', { ascending: false })
      .limit(20),
    tenantTable(supabase, 'Tour', { spaceId: ctx.space.id })
      .select('id, guestName, startsAt, status')
      .eq('propertyId', id)
      .order('startsAt', { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    ...ctx.property,
    deals: dealsResult.data ?? [],
    tours: toursResult.data ?? [],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolve(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { out, errors } = sanitise(body, 'update');
  if (errors.length) return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
  if (Object.keys(out).length === 0) return NextResponse.json(ctx.property);

  const patch = { ...out, updatedAt: new Date().toISOString() };

  const { data, error } = await tenantTable(supabase, 'Property', { spaceId: ctx.space.id })
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A property with that MLS number already exists' }, { status: 409 });
    }
    logger.error('[properties/PATCH] update failed', { propertyId: id }, error);
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolve(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // `photos` is a JSONB array of public URLs (legacy schema decision).
  // Reverse each URL back to a Wasabi key so we can clean up the bucket
  // when the row is removed — otherwise listing photos for sold properties
  // survive forever in storage, EXIF and all.
  const rawPhotos = (ctx.property as { photos?: unknown }).photos;
  const photoUrls = Array.isArray(rawPhotos)
    ? rawPhotos.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  const photoKeys = photoUrls
    .map((u) => publicUrlToKey(u))
    .filter((k): k is string => Boolean(k));

  // Linked deals/tours get ON DELETE SET NULL'd — the link vanishes, the
  // deal/tour survives with its string address intact.
  const { error } = await tenantTable(supabase, 'Property', { spaceId: ctx.space.id })
    .delete()
    .eq('id', id);

  if (error) {
    logger.error('[properties/DELETE] failed', { propertyId: id }, error);
    return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 });
  }

  // Fire-and-forget the photo cleanup. Storage failure here orphans the
  // object; the nightly storage-gc sweeper catches it on its next pass.
  if (photoKeys.length > 0) {
    void deleteObjectsBestEffort(photoKeys).then((res) => {
      if (res.failed.length > 0) {
        logger.warn('[properties/DELETE] some photos failed to delete', {
          propertyId: id,
          spaceId: ctx.space.id,
          okCount: res.ok,
          failedCount: res.failed.length,
        });
      }
    });
  }

  return NextResponse.json({ ok: true });
}
