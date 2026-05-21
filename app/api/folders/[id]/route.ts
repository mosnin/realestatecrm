/**
 * PATCH  /api/folders/[id] — rename a folder: { name }.
 * DELETE /api/folders/[id] — delete a folder. Its files and subfolders
 *                            reparent to root via ON DELETE SET NULL, so
 *                            nothing is lost.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) {
    return NextResponse.json({ error: 'A folder name is required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('Folder')
    .update({ name })
    .eq('id', id)
    .eq('spaceId', space.id)
    .select('id, name, parentId, createdAt')
    .maybeSingle();

  if (error) {
    logger.error('[folders/id] rename failed', { id }, error);
    return NextResponse.json({ error: 'Rename failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { error } = await supabase
    .from('Folder')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);

  if (error) {
    logger.error('[folders/id] delete failed', { id }, error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
