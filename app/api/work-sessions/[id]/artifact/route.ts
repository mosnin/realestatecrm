import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/work-sessions/[id]/artifact?slug= — download the session's
 * deliverable. Owner-gated, then 302 to a short-lived signed URL (the file is
 * private in storage; it also appears on the Files page like any document).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: session } = await supabase
    .from('WorkSession')
    .select('artifactFileId')
    .eq('id', id)
    .eq('spaceId', auth.space.id)
    .maybeSingle();
  const fileId = (session as { artifactFileId: string | null } | null)?.artifactFileId;
  if (!fileId) return NextResponse.json({ error: 'No artifact yet.' }, { status: 404 });

  const { data: file } = await supabase
    .from('File')
    .select('storageKey')
    .eq('id', fileId)
    .eq('spaceId', auth.space.id)
    .maybeSingle();
  const key = (file as { storageKey: string } | null)?.storageKey;
  if (!key) return NextResponse.json({ error: 'Artifact file missing.' }, { status: 404 });

  const signed = await getSignedDownloadUrl(key, 300);
  return NextResponse.redirect(signed);
}
