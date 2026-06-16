/**
 * GET /api/triggers/events
 *
 * The activity feed's data source. Lists the caller's space's persisted
 * IntegrationEvent rows — the durable record of every Composio trigger
 * delivery Chippi noticed — newest first by `occurredAt`.
 *
 * Space-scoped: `getSpaceForUser` + `listEvents(spaceId)` is the privilege
 * boundary. A realtor only ever reads their own space's events; there is no
 * way to pass another space's id.
 *
 * Query params (all optional):
 *   ?limit=50        page size, clamped 1..100 (default 50)
 *   ?before=<iso>    keyset cursor — events strictly older than this occurredAt
 *   ?toolkit=gmail   filter to one connected app
 *   ?connectionId=…  filter to one connection
 *
 * Status shapes mirror the other authed routes: 401 (not signed in),
 * 403 (signed in but no space). Returns `{ events: [...] }`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { listEvents } from '@/lib/integrations/events';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = req.nextUrl;

  // Parse + clamp the page size. A garbage ?limit= falls back to the default
  // rather than 400ing — the feed should always render something.
  const rawLimit = Number(searchParams.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const before = searchParams.get('before') ?? undefined;
  const toolkit = searchParams.get('toolkit') ?? undefined;
  const connectionId = searchParams.get('connectionId') ?? undefined;

  const events = await listEvents({
    spaceId: space.id,
    limit,
    before,
    toolkit,
    connectionId,
  });

  return NextResponse.json({ events });
}
