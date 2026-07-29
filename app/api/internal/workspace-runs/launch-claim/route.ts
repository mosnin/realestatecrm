import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

function authorized(req: NextRequest, raw: string): boolean {
  const secret = process.env.CHIPPI_WORKSPACE_CALLBACK_SECRET;
  const sent = req.headers.get('x-chippy-workspace-signature') ?? '';
  if (!secret || !sent) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

/** Modal's fast acceptor calls this before spawning. Only the current lease
 * token wins; duplicate HTTP delivery receives 202 but never spawns twice. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!authorized(req, raw)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { run_id?: unknown; space_id?: unknown; launch_token?: unknown };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const runId = typeof body.run_id === 'string' ? body.run_id : '';
  const spaceId = typeof body.space_id === 'string' ? body.space_id : '';
  const token = typeof body.launch_token === 'string' ? body.launch_token : '';
  if (!runId || !spaceId || !token) return NextResponse.json({ error: 'Invalid launch claim' }, { status: 400 });
  const { data: won, error } = await supabase.rpc('accept_workspace_launch', { p_run_id: runId, p_space_id: spaceId, p_token: token });
  if (error) return NextResponse.json({ error: 'Could not claim launch' }, { status: 500 });
  return NextResponse.json({ accepted: true, won: won === true }, { status: 202 });
}
