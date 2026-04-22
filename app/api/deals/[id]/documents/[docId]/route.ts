import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

const BUCKET = 'deal-documents';

async function resolveDoc(userId: string, dealId: string, docId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: doc } = await supabase
    .from('DealDocument')
    .select('*')
    .eq('id', docId)
    .eq('dealId', dealId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!doc) return null;
  return { space, doc };
}

/**
 * GET returns a short-lived signed URL for the file. Documents are private, so
 * we never hand out a public URL — the caller downloads directly via Supabase.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, docId } = await params;
  const ctx = await resolveDoc(userId, id, docId);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(ctx.doc.storagePath, 60 * 5); // 5 minutes is enough for a download click.

  if (error || !data?.signedUrl) {
    logger.error('[deals/docs] signed URL failed', { dealId: id, docId }, error);
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, label: ctx.doc.label });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, docId } = await params;
  const ctx = await resolveDoc(userId, id, docId);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete the DB row first; the storage delete is best-effort. If the storage
  // delete fails we tolerate a small amount of leaked bytes rather than leave
  // a dangling row pointing at deleted bytes (which would show a broken
  // download link in the UI).
  const { error: dbError } = await supabase
    .from('DealDocument')
    .delete()
    .eq('id', docId)
    .eq('dealId', id)
    .eq('spaceId', ctx.space.id);

  if (dbError) {
    logger.error('[deals/docs] delete failed', { dealId: id, docId }, dbError);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }

  await supabase.storage.from(BUCKET).remove([ctx.doc.storagePath]).catch((err) => {
    logger.warn('[deals/docs] storage cleanup failed', { dealId: id, docId, path: ctx.doc.storagePath }, err);
  });

  return NextResponse.json({ ok: true });
}
