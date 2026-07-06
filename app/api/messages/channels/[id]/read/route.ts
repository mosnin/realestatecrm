import { NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { getMembership, markRead } from '@/lib/messaging';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/messages/channels/[id]/read — advance the caller's read cursor to
 * a message and broadcast a read receipt. Body: { messageId }.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const membership = await getMembership(ctx.brokerage.id, id, ctx.dbUserId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const { messageId } = (read.data ?? {}) as { messageId?: string };
  if (typeof messageId !== 'string' || !messageId) {
    return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
  }

  await markRead(membership.channel, ctx.dbUserId, messageId);
  return NextResponse.json({ ok: true });
}
