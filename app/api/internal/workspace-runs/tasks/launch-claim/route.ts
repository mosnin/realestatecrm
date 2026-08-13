import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
function authorized(req: NextRequest, raw: string): boolean {
  const secret = process.env.CHIPPI_WORKSPACE_CALLBACK_SECRET; const sent = req.headers.get('x-chippy-workspace-signature') ?? '';
  if (!secret || !sent) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return sent.length === expected.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}
export async function POST(req: NextRequest) {
  const raw = await req.text(); if (!authorized(req, raw)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { task_id?: unknown; space_id?: unknown; launch_token?: unknown }; try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const taskId = typeof body.task_id === 'string' ? body.task_id : ''; const spaceId = typeof body.space_id === 'string' ? body.space_id : ''; const token = typeof body.launch_token === 'string' ? body.launch_token : '';
  if (!taskId || !spaceId || !token) return NextResponse.json({ error: 'Invalid launch claim' }, { status: 400 });
  const { data: won, error } = await supabase.rpc('accept_workspace_run_task_launch', { p_task_id: taskId, p_space_id: spaceId, p_token: token });
  if (error) return NextResponse.json({ error: 'Could not claim launch' }, { status: 500 });
  return NextResponse.json({ accepted: true, won: won === true }, { status: 202 });
}
