import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { exportSpaceData } from '@/lib/data-export';

/**
 * GDPR / CCPA data portability — export everything in the caller's workspace.
 *
 * Right to access + right to portability (Privacy Policy §11.1). The caller
 * gets a single machine-readable JSON file of their Space's data.
 *
 * Tenant scope is the whole point: the spaceId is derived from the session
 * (getSpaceForUser → owner's single Space) and never read from the request.
 * The per-table reads live in lib/data-export.ts (exportSpaceData), shared with
 * the admin DSAR export so the two can never drift. A body-supplied id would
 * be a cross-tenant leak; there is no body. Owner-only by design — an export
 * is the full book of business, so we don't extend it to brokerage admins
 * here (they have their own brokerage tooling).
 *
 * Heavy query — one read per table. Rate-limited to a handful per hour per
 * user so it can't be used to hammer the DB.
 */

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // A full export is a heavy fan-out of reads. Cap it tightly per user.
  const { allowed } = await checkRateLimit(`account:export:${userId}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'export already requested recently. try again in a little while.' },
      { status: 429 },
    );
  }

  // Scope is derived from the session, never from the request body.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The account/profile row for the owner — controller-held data about them.
  const { data: ownerRow } = await supabase
    .from('User')
    .select('id, email, name, avatar, bio, createdAt, accountType')
    .eq('id', space.ownerId)
    .maybeSingle();

  // The per-table, spaceId-scoped reads live in lib/data-export.ts — shared
  // with the admin DSAR export so the two surfaces can never drift.
  const data: Record<string, unknown> = {
    space: {
      id: space.id,
      slug: space.slug,
      name: space.name,
      emoji: space.emoji,
      createdAt: space.createdAt,
      brokerageId: space.brokerageId,
    },
    account: ownerRow ?? null,
    ...(await exportSpaceData(space.id)),
  };

  const payload = {
    exportedAt: new Date().toISOString(),
    spaceId: space.id,
    note:
      'this is a complete copy of your workspace data. document files are referenced by url/key; ' +
      'the binary contents live in storage and are not inlined here.',
    data,
  };

  void audit({
    actorClerkId: userId,
    action: 'ACCESS',
    resource: 'Space',
    resourceId: space.id,
    spaceId: space.id,
    req,
    metadata: { kind: 'data-export' },
  });

  const filename = `chippi-export-${space.slug}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
