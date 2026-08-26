import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import {
  createAdditionalWorkspace,
  listWorkspacesForUser,
  ownerHasPaidWorkspace,
} from '@/lib/workspaces';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { data: user } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', authResult.userId)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const [workspaces, canManage] = await Promise.all([
    listWorkspacesForUser(user.id),
    ownerHasPaidWorkspace(user.id, authResult.userId),
  ]);

  return NextResponse.json({
    workspaces,
    canCreate: canManage,
    canInvite: canManage,
  });
}

export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { allowed } = await checkRateLimit(`workspaces:create:${authResult.userId}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many workspaces created. Try again later.' }, { status: 429 });
  }

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const body = (read.data ?? {}) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name : '';

  const { data: user } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', authResult.userId)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const result = await createAdditionalWorkspace({
    ownerUserId: user.id,
    clerkUserId: authResult.userId,
    name,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ slug: result.slug, id: result.id });
}
