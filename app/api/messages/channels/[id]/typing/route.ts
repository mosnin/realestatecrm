import { NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { getMembership } from '@/lib/messaging';
import { publishMessageEvent } from '@/lib/realtime/ably';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/messages/channels/[id]/typing — broadcast a transient "typing"
 * ping to the channel. No DB write. The client throttles this (~every 3s while
 * typing); receivers show a "typing…" hint that auto-expires. Best-effort:
 * publishing goes through the server so clients stay subscribe-only on the
 * channel (they can never publish arbitrary messages).
 */
export async function POST(_req: Request, { params }: Params) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const membership = await getMembership(ctx.brokerage.id, id, ctx.dbUserId);
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await publishMessageEvent(ctx.brokerage.id, id, 'typing', {
    userId: ctx.dbUserId,
    name: ctx.membership.displayName ?? null,
  });
  return NextResponse.json({ ok: true });
}
