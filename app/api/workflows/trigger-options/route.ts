/**
 * GET /api/workflows/trigger-options — the connected-app picker data for the
 * workflow builder's `integration_event` trigger.
 *
 * Owner-scoped, mirroring /api/workflows: Clerk requireAuth → resolve the
 * owner's Space → list that space's ACTIVE connections and their curated
 * trigger events. Returns `{ connections }` (possibly empty — the builder
 * degrades to a "connect an app first" hint plus free-text fallback).
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import { listAvailableTriggerEvents } from '@/lib/integrations/trigger-catalog';

export const runtime = 'nodejs';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const connections = await listAvailableTriggerEvents(space.id);
    return NextResponse.json({ connections });
  } catch (error) {
    logger.error('[workflows] trigger-options failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}
