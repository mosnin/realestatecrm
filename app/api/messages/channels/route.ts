import { NextResponse } from 'next/server';
import { getBrokerMemberContext, canManageRoles } from '@/lib/permissions';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import {
  listChannels,
  rosterForBrokerage,
  createNamedChannel,
} from '@/lib/messaging';
import { publishUserEvent } from '@/lib/realtime/ably';

/**
 * GET /api/messages/channels — the messaging sidebar payload: the caller's
 * channels + DMs (with unread counts, last message, DM counterpart), the full
 * brokerage roster (for starting DMs + presence), and the caller's identity.
 */
export async function GET() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [channels, roster] = await Promise.all([
    listChannels(ctx.brokerage.id, ctx.dbUserId),
    rosterForBrokerage(ctx.brokerage.id),
  ]);

  return NextResponse.json({
    me: { userId: ctx.dbUserId, role: ctx.membership.role },
    brokerage: { id: ctx.brokerage.id, name: ctx.brokerage.name },
    canManage: canManageRoles(ctx.membership.role),
    // ChannelSummary is already JSON-safe (DB timestamps come back as ISO
    // strings); hand it straight to the client.
    channels,
    roster,
  });
}

/**
 * POST /api/messages/channels — create a named group channel. Only owners/
 * admins can create channels (canManageRoles); realtor members use DMs +
 * existing channels. Members are notified to re-authorize their realtime token.
 */
export async function POST(req: Request) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!canManageRoles(ctx.membership.role)) {
    return NextResponse.json({ error: 'Only owners and admins can create channels' }, { status: 403 });
  }

  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const { name, topic, visibility, memberIds } = (read.data ?? {}) as {
    name?: string;
    topic?: string;
    visibility?: string;
    memberIds?: string[];
  };

  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';
  if (!cleanName) return NextResponse.json({ error: 'Channel name is required' }, { status: 400 });
  const vis = visibility === 'private' ? 'private' : 'public';

  // Validate the requested members belong to this brokerage.
  const roster = await rosterForBrokerage(ctx.brokerage.id);
  const rosterIds = new Set(roster.map((r) => r.userId));
  const requested = Array.isArray(memberIds) ? memberIds.filter((id) => rosterIds.has(id)) : [];
  // A public channel includes the whole brokerage; a private one only the picks.
  const initialMembers = vis === 'public' ? roster.map((r) => r.userId) : requested;

  const channel = await createNamedChannel(ctx.brokerage.id, ctx.dbUserId, {
    name: cleanName,
    topic: typeof topic === 'string' ? topic.trim().slice(0, 200) : null,
    visibility: vis,
    memberIds: initialMembers,
  });

  for (const uid of new Set([...initialMembers, ctx.dbUserId])) {
    if (uid === ctx.dbUserId) continue;
    void publishUserEvent(ctx.brokerage.id, uid, 'channel_added', { channelId: channel.id });
  }

  return NextResponse.json({ channel }, { status: 201 });
}
