import { NextResponse } from 'next/server';
import { requireAuth, requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { inviteToWorkspace } from '@/lib/workspaces';
import { sendSpaceInvitation } from '@/lib/email';
import { tenantTable } from '@/lib/tenant-db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') ?? '';
  const result = await requireSpaceOwner(slug);
  if (result instanceof NextResponse) return result;

  const { data: members } = await tenantTable(supabase, 'SpaceMembership', {
    spaceId: result.space.id,
  })
    .select('id, userId, role, createdAt')
    .order('createdAt', { ascending: true });

  const memberRows = (members ?? []) as Array<{
    id: string;
    userId: string;
    role: string;
    createdAt: string;
  }>;
  const userIds = memberRows.map((m) => m.userId);
  const { data: users } = userIds.length
    ? await supabase.from('User').select('id, name, email').in('id', userIds)
    : { data: [] as { id: string; name: string | null; email: string }[] };

  const userById = new Map((users ?? []).map((u) => [u.id, u]));
  const { data: owner } = await supabase
    .from('User')
    .select('id, name, email')
    .eq('id', result.space.ownerId)
    .maybeSingle();

  const { data: invites } = await tenantTable(supabase, 'SpaceInvitation', {
    spaceId: result.space.id,
  })
    .select('id, email, role, status, expiresAt, createdAt')
    .eq('status', 'pending')
    .gt('expiresAt', new Date().toISOString())
    .order('createdAt', { ascending: false });

  return NextResponse.json({
    owner: owner
      ? { id: owner.id, name: owner.name, email: owner.email, role: 'owner' }
      : null,
    members: memberRows.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      name: userById.get(m.userId)?.name ?? null,
      email: userById.get(m.userId)?.email ?? '',
    })),
    invitations: invites ?? [],
  });
}

export async function POST(req: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { allowed } = await checkRateLimit(`workspaces:invite:${authResult.userId}`, 40, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many invitations. Try again in an hour.' }, { status: 429 });
  }

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const body = (read.data ?? {}) as { slug?: unknown; email?: unknown; role?: unknown };
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const email = typeof body.email === 'string' ? body.email : '';
  const role = body.role === 'admin' ? 'admin' : 'member';

  const spaceResult = await requireSpaceOwner(slug);
  if (spaceResult instanceof NextResponse) return spaceResult;

  const { data: actor } = await supabase
    .from('User')
    .select('id, name')
    .eq('clerkId', authResult.userId)
    .maybeSingle();
  if (!actor) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const invited = await inviteToWorkspace({
    spaceId: spaceResult.space.id,
    actorUserId: actor.id,
    clerkUserId: authResult.userId,
    email,
    role,
  });
  if (!invited.ok) return NextResponse.json({ error: invited.error }, { status: invited.status });

  try {
    await sendSpaceInvitation({
      toEmail: invited.email,
      workspaceName: spaceResult.space.name,
      inviterName: actor.name ?? 'A teammate',
      token: invited.token,
    });
  } catch (err) {
    console.error('[workspaces/invite] email failed', err);
  }

  return NextResponse.json({
    inviteUrl: invited.inviteUrl,
    email: invited.email,
  });
}
