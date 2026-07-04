import { NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { touchLastSeen } from '@/lib/messaging';

/**
 * POST /api/messages/presence — heartbeat. Stamps the caller's lastSeenAt so
 * the brokerage roster can show "last seen" for members who are offline.
 * Called on an interval by the messaging client while it's mounted, and on
 * initial load. Live "online now" is derived from Ably presence, not this.
 */
export async function POST() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await touchLastSeen(ctx.dbUserId);
  return NextResponse.json({ ok: true });
}
