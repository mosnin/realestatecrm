import { NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { createMessagingTokenRequest } from '@/lib/realtime/ably';
import { channelIdsForUser } from '@/lib/messaging';

/**
 * GET /api/messages/token — mints a capability-scoped Ably TokenRequest for the
 * messaging client. Capabilities are computed from the caller's CURRENT
 * channel memberships (see createMessagingTokenRequest), so a private channel
 * is unreachable to non-members. The client re-calls this (authorize()) after
 * it opens a new DM / joins a channel to widen the grant.
 *
 *   403 — not a brokerage member (messaging is brokerage-only)
 *   503 — realtime not configured (ABLY_API_KEY unset) → client stays on its
 *         DB-loaded threads with no live overlay.
 */
export async function GET() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const channelIds = await channelIdsForUser(ctx.brokerage.id, ctx.dbUserId);
  const tokenRequest = await createMessagingTokenRequest(ctx.dbUserId, ctx.brokerage.id, channelIds);
  if (!tokenRequest) {
    return NextResponse.json({ error: 'realtime-unavailable' }, { status: 503 });
  }
  return NextResponse.json(tokenRequest);
}
