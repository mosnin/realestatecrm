import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminCapability } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/admin';
import { exportSpaceData } from '@/lib/data-export';

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/users/[id]/export
 *
 * Admin-triggered DSAR (data-subject access request) export. Fulfils GDPR/CCPA
 * "right to access + portability" on behalf of a user: an authorized admin
 * downloads the COMPLETE tenant-scoped footprint of the target user's workspace
 * as a single JSON file.
 *
 * This is a PRIVILEGED cross-tenant data read, so it is:
 *   - capability-gated on 'users:export' (super_admin or admin_support only),
 *   - rate-limited per admin (a full fan-out of reads),
 *   - AUDITED via logAdminAction (action='dsar_export') with the admin's IP —
 *     every DSAR export leaves a first-class trail on who read whose data.
 *
 * Tenant correctness: the spaceId is resolved from the admin-supplied user id
 * (target user → their owned Space) and the reader (lib/data-export.ts) scopes
 * every table to that one spaceId. The reader is shared with the self-service
 * export so the two can never drift.
 */
export async function GET(req: NextRequest, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requireAdminCapability>>;
  try {
    admin = await requireAdminCapability('users:export');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // A full export is a heavy fan-out of reads. Cap it per admin.
  const { allowed } = await checkRateLimit(`admin:export:${admin.clerkUserId}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  // Resolve the target user from the admin-supplied id.
  const { data: userRow, error: userErr } = await supabase
    .from('User')
    .select('id, clerkId, email, name, avatar, bio, createdAt, accountType')
    .eq('id', id)
    .maybeSingle();
  if (userErr) {
    console.error('[admin/users/export] user lookup failed', userErr);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const target = userRow as {
    id: string;
    clerkId: string;
    email: string;
    name: string | null;
    avatar: string | null;
    bio: string | null;
    createdAt: string;
    accountType: string | null;
  };

  // Resolve the target's workspace — the export root. Space.ownerId is UNIQUE.
  const { data: spaceRow, error: spaceErr } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, ownerId, brokerageId, createdAt')
    .eq('ownerId', target.id)
    .limit(1)
    .maybeSingle();
  if (spaceErr) {
    console.error('[admin/users/export] space lookup failed', spaceErr);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!spaceRow) {
    return NextResponse.json(
      { error: 'This user has no workspace to export.' },
      { status: 404 },
    );
  }
  const space = spaceRow as {
    id: string;
    slug: string;
    name: string;
    emoji: string | null;
    ownerId: string;
    brokerageId: string | null;
    createdAt: string;
  };

  // Audit the privileged read BEFORE returning the payload — the access is
  // recorded whether or not the client keeps the download. Captures the admin's
  // IP (via req) for SOC2 access investigations.
  await logAdminAction({
    actor: admin.clerkUserId,
    action: 'dsar_export',
    target: target.id,
    req,
    details: {
      email: target.email,
      clerkId: target.clerkId,
      spaceId: space.id,
      slug: space.slug,
    },
  });

  // Shared reader — identical to what the user's own export returns.
  const scoped = await exportSpaceData(space.id);

  const payload = {
    exportedAt: new Date().toISOString(),
    exportKind: 'admin-dsar',
    exportedBy: admin.clerkUserId,
    spaceId: space.id,
    subject: {
      userId: target.id,
      email: target.email,
      clerkId: target.clerkId,
    },
    note:
      'DSAR export — a complete copy of the workspace data. Document files are ' +
      'referenced by url/key; the binary contents live in storage and are not ' +
      'inlined here.',
    data: {
      space: {
        id: space.id,
        slug: space.slug,
        name: space.name,
        emoji: space.emoji,
        createdAt: space.createdAt,
        brokerageId: space.brokerageId,
      },
      account: {
        id: target.id,
        email: target.email,
        name: target.name,
        avatar: target.avatar,
        bio: target.bio,
        createdAt: target.createdAt,
        accountType: target.accountType,
      },
      ...scoped,
    },
  };

  const filename = `chippi-dsar-${space.slug}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
