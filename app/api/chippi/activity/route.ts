/**
 * GET /api/chippi/activity — the unified "what Chippi did" timeline.
 *
 * Owner-scoped, mirroring /api/workflows: Clerk requireAuth → resolve the
 * caller's Space → call getUnifiedActivity scoped to space.id. There is no way
 * to read another space's feed: the spaceId handed to the query is the caller's
 * own, and every source query inside the query layer carries an `.eq('spaceId')`
 * guard. A user with no space gets a 403.
 *
 * Query params (all optional):
 *   limit    — page size (default 50, capped 100 by the query layer)
 *   before   — ISO cursor; return items strictly before this instant
 *   kinds    — comma list of ActivityKind to include
 *   statuses — comma list of ActivityStatus to include
 *   since    — ISO lower bound (inclusive) on occurredAt
 *   until    — ISO upper bound (inclusive) on occurredAt
 *   search   — case-insensitive substring over title+summary
 *
 * Returns { items, nextCursor }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import { getUnifiedActivity } from '@/lib/activity/query';
import type { ActivityKind, ActivityStatus } from '@/lib/activity/types';

export const runtime = 'nodejs';

const KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'agent_action',
  'agent_dispatch',
  'draft',
  'workflow_run',
  'scheduled_message',
  'integration_event',
  'routine_run',
  'outbound_message',
]);

const STATUSES: ReadonlySet<ActivityStatus> = new Set<ActivityStatus>([
  'success',
  'pending',
  'failed',
  'skipped',
  'info',
]);

/** Parse a comma-separated param, keeping only values in `allowed`. */
function parseList<T extends string>(
  raw: string | null,
  allowed: ReadonlySet<T>,
): T[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is T => allowed.has(s as T));
  return values.length > 0 ? values : undefined;
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const params = req.nextUrl.searchParams;

  const limitRaw = params.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  try {
    const result = await getUnifiedActivity({
      spaceId: space.id,
      limit: Number.isFinite(limit) ? limit : undefined,
      before: params.get('before') ?? undefined,
      kinds: parseList<ActivityKind>(params.get('kinds'), KINDS),
      statuses: parseList<ActivityStatus>(params.get('statuses'), STATUSES),
      since: params.get('since') ?? undefined,
      until: params.get('until') ?? undefined,
      search: params.get('search') ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    logger.error('[chippi/activity] load failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}
