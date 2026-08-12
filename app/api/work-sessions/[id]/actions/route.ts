import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { decideAction } from '@/lib/work-sessions/actions';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * GET  /api/work-sessions/[id]/actions?slug= — the session's proposed/decided
 *   actions (the approval queue + audit trail), oldest first.
 * POST /api/work-sessions/[id]/actions?slug= — decide ONE action:
 *   { actionId, decision: 'approve' | 'deny' }
 *   Approve executes the real tool with the space-owner context and records
 *   the result; deny records the decision. Both are logged immutably on the
 *   WorkSessionAction row. Every read/write is scoped by the owner's spaceId.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data } = await supabase
    .from('WorkSessionAction')
    .select('*')
    .eq('sessionId', id)
    .eq('spaceId', auth.space.id)
    .order('createdAt', { ascending: true });
  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const { actionId, decision } = (read.data ?? {}) as { actionId?: string; decision?: string };

  if (typeof actionId !== 'string' || !actionId) {
    return NextResponse.json({ error: 'actionId required.' }, { status: 400 });
  }
  if (decision !== 'approve' && decision !== 'deny') {
    return NextResponse.json({ error: "decision must be 'approve' or 'deny'." }, { status: 400 });
  }

  const terminal = await decideAction({
    sessionId: id,
    actionId,
    decision,
    spaceId: auth.space.id,
    decidedByUserId: auth.userId,
  });

  if (terminal === null) {
    // Not found in this space, or already decided (idempotent double-click).
    return NextResponse.json(
      { error: 'This action was already decided or does not exist.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, status: terminal });
}
