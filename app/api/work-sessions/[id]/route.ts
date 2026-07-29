import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { kickPlan, kickExecute } from '@/lib/work-sessions/kick';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * GET   /api/work-sessions/[id]?slug= — one session.
 * PATCH /api/work-sessions/[id]?slug= — the realtor's three controls:
 *   { action: 'approve' }            awaiting_approval → running (+ execute)
 *   { action: 'answer', answer }     awaiting_input → planning (+ re-plan)
 *   { action: 'cancel' }             any active state → cancelled
 * Every transition is guarded on the CURRENT status so a stale button can't
 * restart a finished run.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data } = await supabase
    .from('WorkSession')
    .select('*')
    .eq('id', id)
    .eq('spaceId', auth.space.id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ session: data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const { action, answer } = (read.data ?? {}) as { action?: string; answer?: string };

  const { data: session } = await supabase
    .from('WorkSession')
    .select('id, status, workspaceRunId')
    .eq('id', id)
    .eq('spaceId', auth.space.id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const status = (session as { status: string }).status;

  if (action === 'approve') {
    if (status !== 'awaiting_approval') {
      return NextResponse.json({ error: 'This session is not waiting for approval.' }, { status: 409 });
    }
    await supabase
      .from('WorkSession')
      .update({ status: 'running', updatedAt: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'awaiting_approval');
    await kickExecute(id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'answer') {
    if (status !== 'awaiting_input') {
      return NextResponse.json({ error: 'This session is not waiting for an answer.' }, { status: 409 });
    }
    const cleanAnswer = typeof answer === 'string' ? answer.trim().slice(0, 1000) : '';
    if (!cleanAnswer) return NextResponse.json({ error: 'Type an answer first.' }, { status: 400 });
    await supabase
      .from('WorkSession')
      .update({ answer: cleanAnswer, question: null, status: 'planning', updatedAt: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'awaiting_input');
    await kickPlan(id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'cancel') {
    if (!['planning', 'awaiting_approval', 'awaiting_input', 'running'].includes(status)) {
      return NextResponse.json({ error: 'This session already finished.' }, { status: 409 });
    }
    const { data: cancelled, error: cancelError } = await supabase.rpc('cancel_workspace_run_and_session', { p_session_id: id, p_space_id: auth.space.id });
    if (cancelError || !cancelled) return NextResponse.json({ error: 'This session already finished.' }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
