/**
 * GET /api/integrations
 *
 * List the realtor's connections — one row per (toolkit, status) the
 * settings panel renders. Status is the source of truth: 'active' rows
 * appear with a green dot, 'expired' / 'failed' surface a Reconnect
 * affordance, 'revoked' rows are filtered out (no UI noise).
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { listConnections } from '@/lib/integrations/connections';
import { composioConfigured } from '@/lib/integrations/composio';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const all = await listConnections(space.id);
  // Drop revoked rows — they're audit-only, not realtor-facing.
  const visible = all.filter((c) => c.status !== 'revoked');

  return NextResponse.json({
    configured: composioConfigured(),
    connections: visible.map((c) => ({
      id: c.id,
      toolkit: c.toolkit,
      status: c.status,
      label: c.label,
      lastError: c.lastError,
      createdAt: c.createdAt,
    })),
  });
}
