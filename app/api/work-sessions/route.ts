import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limit';
import { kickPlan } from '@/lib/work-sessions/kick';

export const runtime = 'nodejs';

const MAX_GOAL = 1000;

/**
 * GET  /api/work-sessions?slug= — recent sessions (active first), for the
 *      workspace strip. Live updates ride Supabase Realtime; this is the
 *      initial load + reconnect catch-up.
 * POST /api/work-sessions — start one: { slug, goal, autonomy?, allowQuestions?,
 *      conversationId? }. Creates the row and kicks planning in the background.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  const { data } = await supabase
    .from('WorkSession')
    .select('*')
    .eq('spaceId', auth.space.id)
    .order('createdAt', { ascending: false })
    .limit(20);
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const body = (read.data ?? {}) as {
    slug?: string; goal?: string; autonomy?: string; allowQuestions?: boolean; conversationId?: string;
  };
  if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(body.slug);
  if (auth instanceof NextResponse) return auth;

  const goal = typeof body.goal === 'string' ? body.goal.trim().slice(0, MAX_GOAL) : '';
  if (goal.length < 10) {
    return NextResponse.json({ error: 'Describe the goal in a sentence or two.' }, { status: 400 });
  }

  // A background run is real compute — cap starts, and one active session at
  // a time keeps the mental model (and the bill) simple.
  const rl = await checkRateLimit(`work-sessions:${auth.space.id}`, 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many sessions this hour.' }, { status: 429 });
  }
  const { count: active } = await supabase
    .from('WorkSession')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', auth.space.id)
    .in('status', ['planning', 'awaiting_approval', 'awaiting_input', 'running']);
  if ((active ?? 0) >= 2) {
    return NextResponse.json(
      { error: 'Two sessions are already in flight — let one finish (or cancel it) first.' },
      { status: 409 },
    );
  }

  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from('WorkSession')
    .insert({
      id,
      spaceId: auth.space.id,
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
      goal,
      autonomy: body.autonomy === 'just_go' ? 'just_go' : 'plan_first',
      allowQuestions: body.allowQuestions !== false,
    })
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Could not start the session.' }, { status: 500 });
  }

  await kickPlan(id);
  return NextResponse.json({ session: data }, { status: 201 });
}
