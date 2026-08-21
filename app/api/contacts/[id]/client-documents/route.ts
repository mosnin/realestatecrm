import { NextResponse, type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';
import { getSignedDownloadUrl } from '@/lib/storage';
import { tenantTable } from '@/lib/tenant-db';


export const runtime = 'nodejs';

/**
 * GET /api/contacts/[id]/client-documents — realtor lists the documents a
 * client uploaded through their portal. With &id=… returns a short-lived
 * signed download URL. Realtor auth via requireContactAccess.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: contactId } = await params;
  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  const docId = req.nextUrl.searchParams.get('id');
  if (docId) {
    const { data: doc } = await tenantTable(supabase, 'ClientDocument', { spaceId: auth.space.id })
      .select('fileKey')
      .eq('id', docId)
      .eq('contactId', contactId)
      .maybeSingle();
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const url = await getSignedDownloadUrl((doc as { fileKey: string }).fileKey);
    return NextResponse.json({ url });
  }

  const { data } = await tenantTable(supabase, 'ClientDocument', { spaceId: auth.space.id })
    .select('id, fileName, contentType, sizeBytes, uploadedBy, createdAt')
    .eq('contactId', contactId)
    .order('createdAt', { ascending: false });

  return NextResponse.json({ documents: data ?? [] });
}
