import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string; fileId: string }> };
export async function GET(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug'); if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug); if (auth instanceof NextResponse) return auth;
  const { id, fileId } = await params;
  const { data: run } = await supabase.from('WorkspaceRun').select('status').eq('id', id).eq('spaceId', auth.space.id).maybeSingle();
  // Artifact URLs are a completion capability, not a partial-progress view.
  if (run?.status !== 'completed') return NextResponse.json({ error: 'Workspace files are available after completion.' }, { status: 404 });
  const { data: membership } = await supabase.from('WorkspaceRunFile').select('fileId').eq('runId', id).eq('id', fileId).eq('spaceId', auth.space.id).maybeSingle();
  if (!membership?.fileId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: file } = await supabase.from('File').select('storageKey').eq('id', membership.fileId).eq('spaceId', auth.space.id).maybeSingle();
  if (!file?.storageKey) return NextResponse.json({ error: 'File unavailable' }, { status: 404 });
  return NextResponse.redirect(await getSignedDownloadUrl(file.storageKey, 300));
}
