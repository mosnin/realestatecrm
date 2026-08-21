import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { getSignedDownloadUrl, deleteObject } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * GET /api/documents/[id]
 *
 * Returns a short-lived signed URL for downloading the file. The bucket
 * is private, so we never hand out a public URL — the caller fetches
 * directly from Supabase storage with the signed URL.
 *
 * Legacy compatibility: any ContactDocument row created before the
 * Supabase-Storage migration has a `storageKey` that begins with
 * `data:` (the file inlined as a base64 data URL). For those rows we
 * return the data URL directly so old documents stay readable.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Scope first: a foreign document id must 404 with no PII. Looking the
  // row up unscoped and then checking contact access leaked existence
  // (and held victim metadata) before the gate ran.
  const { data: doc, error } = await tenantTable(supabase, 'ContactDocument', {
    spaceId: space.id,
  })
    .select('id, contactId, fileName, fileType, storageKey')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('[documents/id] lookup failed', { id }, error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Legacy path: file stored inline as a data URL. Hand back as-is.
  if (typeof doc.storageKey === 'string' && doc.storageKey.startsWith('data:')) {
    return NextResponse.json({
      url: doc.storageKey,
      fileName: doc.fileName,
      fileType: doc.fileType,
      legacy: true,
    });
  }

  let signedUrl: string;
  try {
    signedUrl = await getSignedDownloadUrl(doc.storageKey, 60 * 5); // 5 min — enough for a download click.
  } catch (signError) {
    logger.error('[documents/id] signed URL failed', { id }, signError as Error);
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
  }

  return NextResponse.json({
    url: signedUrl,
    fileName: doc.fileName,
    fileType: doc.fileType,
  });
}

/**
 * DELETE /api/documents/[id]
 *
 * Removes both the storage object and the metadata row. We delete the DB
 * row first so the UI never shows a dangling entry pointing at missing
 * bytes; the storage delete is best-effort (a tiny amount of leaked
 * bytes is preferable to a broken-looking download in the UI).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const { data: doc, error } = await tenantTable(supabase, 'ContactDocument', {
    spaceId: space.id,
  })
    .select('id, contactId, spaceId, storageKey')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('[documents/id] delete lookup failed', { id }, error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: dbError } = await tenantTable(supabase, 'ContactDocument', {
    spaceId: space.id,
  })
    .delete()
    .eq('id', id);

  if (dbError) {
    logger.error('[documents/id] delete failed', { id }, dbError);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }

  // Storage cleanup only for non-legacy rows — legacy data URLs aren't in a bucket.
  if (typeof doc.storageKey === 'string' && !doc.storageKey.startsWith('data:')) {
    await deleteObject(doc.storageKey).catch((err) => {
      logger.warn('[documents/id] storage cleanup failed', { id, path: doc.storageKey }, err);
    });
  }

  return NextResponse.json({ ok: true });
}
