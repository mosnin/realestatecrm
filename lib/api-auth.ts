/**
 * API authentication helpers — replace repeated auth boilerplate in every route.
 *
 * Usage:
 *   const result = await requireSpaceOwner(slug);
 *   if (result instanceof NextResponse) return result;
 *   const { userId, space } = result;
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { Space } from '@/lib/types';

/** Returns { userId } or a 401 NextResponse. */
export async function requireAuth(): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return { userId };
}

/**
 * Verifies the calling user owns the given workspace slug.
 * Returns { userId, space } or a 4xx NextResponse.
 */
export async function requireSpaceOwner(
  slug: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { userId, space };
}

/**
 * Verifies the calling user owns the space that a contact belongs to.
 * Returns { userId, space, contactSpaceId } or a 4xx NextResponse.
 */
export async function requireContactAccess(
  contactId: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { data: rows, error } = await supabase
    .from('Contact')
    .select('spaceId')
    .eq('id', contactId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!rows || !rows.spaceId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || rows.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { userId, space };
}
