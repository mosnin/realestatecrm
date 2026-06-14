/**
 * GET /api/ai/attachments/[id] — short-lived signed URL for a chat attachment.
 *
 * The transcript persists attachment blocks with only stable metadata (id /
 * filename / mime). Signed URLs expire, so they are never stored — the user-
 * message renderer calls this endpoint to mint a fresh URL when it needs to
 * show an image thumbnail. Space-scoped: a foreign id 404s.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getSignedDownloadUrl } from '@/lib/storage';

export const runtime = 'nodejs';

/** 5 minutes — long enough to render the thumbnail, short enough that a
 *  leaked URL isn't a durable read on the file. */
const SIGNED_URL_TTL_SECONDS = 60 * 5;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { data: row, error } = await supabase
    .from('Attachment')
    .select('id, spaceId, storagePath, filename, mimeType')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    logger.error('[ai/attachments/id] lookup failed', { id }, error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!row || !row.storagePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let url: string;
  try {
    url = await getSignedDownloadUrl(row.storagePath, SIGNED_URL_TTL_SECONDS);
  } catch (err) {
    logger.error('[ai/attachments/id] signed URL failed', { id }, err as Error);
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
  }

  return NextResponse.json({ url, filename: row.filename, mimeType: row.mimeType });
}
