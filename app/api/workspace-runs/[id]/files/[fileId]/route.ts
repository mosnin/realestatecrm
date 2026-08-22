import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { tenantTable } from '@/lib/tenant-db';
export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string; fileId: string }> };
export async function GET(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug'); if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug); if (auth instanceof NextResponse) return auth;
  const { id, fileId } = await params;
  const { data: run } = await tenantTable(supabase, 'WorkspaceRun', { spaceId: auth.space.id }).select('status').eq('id', id).maybeSingle();
  // Artifact URLs are a completion capability, not a partial-progress view.
  // Missing and foreign runs are indistinguishable from an incomplete run.
  if (run?.status !== 'completed') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: rootMembership } = await tenantTable(supabase, 'WorkspaceRunFile', { spaceId: auth.space.id }).select('fileId').eq('runId', id).eq('id', fileId).maybeSingle();
  const { data: candidateTaskMembership } = rootMembership ? { data: null } : await tenantTable(supabase, 'WorkspaceRunTaskFile', { spaceId: auth.space.id }).select('fileId,taskId').eq('id', fileId).maybeSingle();
  const { data: task } = candidateTaskMembership ? await tenantTable(supabase, 'WorkspaceRunTask', { spaceId: auth.space.id }).select('id').eq('id', candidateTaskMembership.taskId).eq('runId', id).eq('status', 'completed').maybeSingle() : { data: null };
  const taskMembership = task ? candidateTaskMembership : null;
  const membership = rootMembership ?? taskMembership;
  if (!membership?.fileId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: file } = await tenantTable(supabase, 'File', { spaceId: auth.space.id }).select('storageKey').eq('id', membership.fileId).maybeSingle();
  if (!file?.storageKey) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.redirect(await getSignedDownloadUrl(file.storageKey, 300));
}
