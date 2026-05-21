/**
 * GET  /api/folders — every folder in the current space (flat; the UI
 *                     builds the tree and the breadcrumb from parentId).
 * POST /api/folders — create a folder: { name, parentId? }.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('Folder')
    .select('id, name, parentId, createdAt')
    .eq('spaceId', space.id)
    .order('name', { ascending: true });

  if (error) {
    logger.error('[folders] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Failed to list folders' }, { status: 500 });
  }

  return NextResponse.json({ folders: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; parentId?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) {
    return NextResponse.json({ error: 'A folder name is required.' }, { status: 400 });
  }
  const parentId =
    typeof body.parentId === 'string' && body.parentId && body.parentId !== 'root'
      ? body.parentId
      : null;

  // A parent, if given, must belong to this space.
  if (parentId) {
    const { data: parent } = await supabase
      .from('Folder')
      .select('id')
      .eq('id', parentId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (!parent) {
      return NextResponse.json({ error: 'Parent folder not found.' }, { status: 400 });
    }
  }

  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from('Folder')
    .insert({ id, spaceId: space.id, userId, name, parentId })
    .select('id, name, parentId, createdAt')
    .single();

  if (error) {
    logger.error('[folders] create failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
