import { NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { ensureDmChannel, rosterForBrokerage } from '@/lib/messaging';
import { publishUserEvent } from '@/lib/realtime/ably';
import { logger } from '@/lib/logger';

/**
 * POST /api/messages/dm — open (or reuse) a direct message with another member
 * of the same brokerage. Body: { userId }. Idempotent — returns the existing
 * DM channel if one already exists. On first creation, the other participant is
 * pinged to re-authorize their realtime token so they receive the DM live.
 */
export async function POST(req: Request) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const { userId: otherUserId } = (read.data ?? {}) as { userId?: string };
  if (typeof otherUserId !== 'string' || !otherUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  if (otherUserId === ctx.dbUserId) {
    return NextResponse.json({ error: 'Cannot DM yourself' }, { status: 400 });
  }

  // The target must be a member of the caller's brokerage.
  const roster = await rosterForBrokerage(ctx.brokerage.id);
  if (!roster.some((r) => r.userId === otherUserId)) {
    return NextResponse.json({ error: 'That person is not in your brokerage' }, { status: 404 });
  }

  let channel, created;
  try {
    ({ channel, created } = await ensureDmChannel(
      ctx.brokerage.id,
      ctx.dbUserId,
      otherUserId,
      ctx.dbUserId,
    ));
  } catch (error) {
    logger.error('[messages/dm] DM creation failed', { brokerageId: ctx.brokerage.id }, error);
    return NextResponse.json(
      { error: 'Direct messages are temporarily unavailable. Please try again.' },
      { status: 503 },
    );
  }

  if (created) {
    await publishUserEvent(ctx.brokerage.id, otherUserId, 'channel_added', {
      channelId: channel.id,
    });
  }

  return NextResponse.json({ channel }, { status: created ? 201 : 200 });
}
