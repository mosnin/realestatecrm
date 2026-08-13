import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { getWorkspaceRun, requestWorkspaceRunCancellation } from '@/lib/workspace-runs/server';

export const runtime = 'nodejs';
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const run = await getWorkspaceRun(id, auth.space.id);
  return run ? NextResponse.json({ run }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string };
  if (body.action !== 'cancel') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  const cancelled = await requestWorkspaceRunCancellation(id, auth.space.id);
  return cancelled ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'This run already finished.' }, { status: 409 });
}
