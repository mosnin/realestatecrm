import 'server-only';
/**
 * Brokerage messaging — server-side data layer.
 *
 * All access is scoped to a Brokerage and gated on ChannelMember rows: a user
 * only ever touches channels they belong to. Isolation is enforced here in app
 * code on the service-role client (RLS is bypassed by that key and is
 * defense-in-depth only — see the 20260811 migration).
 *
 * The DB is the source of truth. Every write here also fires a best-effort Ably
 * publish (via lib/realtime/ably) so open clients update live; a dropped
 * publish never fails the write.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  publishMessageEvent,
  publishUserEvent,
} from '@/lib/realtime/ably';
import { unscoped } from '@/lib/supabase-guard';
import type {
  Channel,
  ChannelMessage,
  ChannelMessageKind,
  MessageAttachment,
  MessagingMember,
} from '@/lib/types';

/** Canonical, order-independent key for a DM's member set. */
export function dmKeyFor(userIds: string[]): string {
  return Array.from(new Set(userIds)).sort().join(':');
}

/** Snapshot of a channel plus the viewer's own membership/read state. */
export type ChannelSummary = {
  channel: Channel;
  /** For DMs: the OTHER participant (from the viewer's perspective). */
  otherMember: MessagingMember | null;
  memberIds: string[];
  lastMessage: Pick<ChannelMessage, 'id' | 'body' | 'kind' | 'senderId' | 'createdAt'> | null;
  unreadCount: number;
  lastReadMessageId: string | null;
};

const MAX_BODY = 8000;
const HISTORY_PAGE = 50;

/**
 * The channel IDs a user belongs to in a brokerage. Used to scope the Ably
 * token capability. Cheap — one indexed read.
 */
export async function channelIdsForUser(brokerageId: string, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('ChannelMember')
    .select('channelId, Channel!inner(brokerageId)')
    .eq('userId', userId)
    .eq('Channel.brokerageId', brokerageId);
  return (data ?? []).map((r) => (r as { channelId: string }).channelId);
}

/**
 * Load the viewer's membership of a channel, verifying the channel is in the
 * given brokerage. Returns null if the channel doesn't exist, is in another
 * brokerage, or the viewer isn't a member — the single access gate every
 * channel-scoped route calls first.
 */
export async function getMembership(
  brokerageId: string,
  channelId: string,
  userId: string,
): Promise<{ channel: Channel; memberId: string; lastReadMessageId: string | null } | null> {
  const { data: channel } = await supabase
    .from('Channel')
    .select('*')
    .eq('id', channelId)
    .eq('brokerageId', brokerageId)
    .maybeSingle();
  if (!channel) return null;

  const { data: member } = await supabase
    .from('ChannelMember')
    .select('id, lastReadMessageId')
    .eq('channelId', channelId)
    .eq('userId', userId)
    .maybeSingle();
  if (!member) return null;

  return {
    channel: channel as Channel,
    memberId: (member as { id: string }).id,
    lastReadMessageId: (member as { lastReadMessageId: string | null }).lastReadMessageId,
  };
}

/** Every brokerage member with their profile + last-seen (the roster). */
export async function rosterForBrokerage(brokerageId: string): Promise<MessagingMember[]> {
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId, role, User!inner(id, name, email, avatar, lastSeenAt)')
    .eq('brokerageId', brokerageId);
  if (!memberships) return [];
  return memberships.map((m) => {
    // PostgREST types embedded to-one relations as arrays; it's an object at
    // runtime. Normalize either shape.
    const rel = (m as unknown as { User: { name: string | null; email: string; avatar: string | null; lastSeenAt: string | null } | { name: string | null; email: string; avatar: string | null; lastSeenAt: string | null }[] }).User;
    const u = Array.isArray(rel) ? rel[0] : rel;
    return {
      userId: (m as { userId: string }).userId,
      role: (m as { role: MessagingMember['role'] }).role,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      lastSeenAt: u.lastSeenAt,
    };
  });
}

/**
 * List the channels a user belongs to, newest-activity first, each with the
 * last message, the viewer's unread count, and (for DMs) the other participant.
 */
export async function listChannels(
  brokerageId: string,
  userId: string,
): Promise<ChannelSummary[]> {
  // The viewer's memberships → the channels they can see.
  const { data: myMembers } = await supabase
    .from('ChannelMember')
    .select('channelId, lastReadMessageId, lastReadAt, Channel!inner(*)')
    .eq('userId', userId)
    .eq('Channel.brokerageId', brokerageId);
  if (!myMembers?.length) return [];

  const channels = myMembers
    .map((m) => {
      const rel = (m as unknown as { Channel: Channel | Channel[] }).Channel;
      return Array.isArray(rel) ? rel[0] : rel;
    })
    .filter((c): c is Channel => Boolean(c) && !c.archivedAt);
  const channelIds = channels.map((c) => c.id);
  if (!channelIds.length) return [];

  // All members of those channels (for DM counterpart + rosters).
  const { data: allMembers } = await supabase
    .from('ChannelMember')
    .select('channelId, userId')
    .in('channelId', channelIds);

  const memberIdsByChannel = new Map<string, string[]>();
  for (const row of allMembers ?? []) {
    const r = row as { channelId: string; userId: string };
    const arr = memberIdsByChannel.get(r.channelId) ?? [];
    arr.push(r.userId);
    memberIdsByChannel.set(r.channelId, arr);
  }

  // Roster for name/avatar lookup of DM counterparts.
  const roster = await rosterForBrokerage(brokerageId);
  const rosterById = new Map(roster.map((r) => [r.userId, r]));

  // Last message per channel + unread counts. Pull recent messages once.
  const { data: recentMsgs } = await unscoped(supabase
    .from('ChannelMessage'), 'post-fetch: caller verified parent scope before this id query')
    .select('id, channelId, body, kind, senderId, createdAt')
    .in('channelId', channelIds)
    .is('deletedAt', null)
    .order('createdAt', { ascending: false })
    .limit(channelIds.length * 40);

  const lastByChannel = new Map<string, ChannelSummary['lastMessage']>();
  const msgsByChannel = new Map<string, { id: string; createdAt: string }[]>();
  for (const row of recentMsgs ?? []) {
    const r = row as { id: string; channelId: string; body: string | null; kind: ChannelMessageKind; senderId: string | null; createdAt: string };
    if (!lastByChannel.has(r.channelId)) {
      lastByChannel.set(r.channelId, {
        id: r.id,
        body: r.body,
        kind: r.kind,
        senderId: r.senderId,
        createdAt: r.createdAt as unknown as Date,
      });
    }
    const arr = msgsByChannel.get(r.channelId) ?? [];
    arr.push({ id: r.id, createdAt: r.createdAt });
    msgsByChannel.set(r.channelId, arr);
  }

  const readState = new Map<string, { lastReadAt: string | null; lastReadMessageId: string | null }>();
  for (const m of myMembers) {
    const r = m as { channelId: string; lastReadAt: string | null; lastReadMessageId: string | null };
    readState.set(r.channelId, { lastReadAt: r.lastReadAt, lastReadMessageId: r.lastReadMessageId });
  }

  const summaries: ChannelSummary[] = channels.map((channel) => {
    const memberIds = memberIdsByChannel.get(channel.id) ?? [];
    const otherId = channel.kind === 'dm' ? memberIds.find((id) => id !== userId) ?? null : null;
    const read = readState.get(channel.id);
    const msgs = msgsByChannel.get(channel.id) ?? [];
    // Unread = messages after the viewer's read cursor (by createdAt), not
    // counting the viewer's own messages.
    let unread = 0;
    if (read?.lastReadAt) {
      unread = msgs.filter((m) => m.createdAt > read.lastReadAt!).length;
    } else {
      unread = msgs.length; // never read → everything is unread
    }
    return {
      channel,
      otherMember: otherId ? rosterById.get(otherId) ?? null : null,
      memberIds,
      lastMessage: lastByChannel.get(channel.id) ?? null,
      unreadCount: unread,
      lastReadMessageId: read?.lastReadMessageId ?? null,
    };
  });

  // Sort by last activity (last message, else channel.updatedAt) desc.
  summaries.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? a.channel.updatedAt;
    const bt = b.lastMessage?.createdAt ?? b.channel.updatedAt;
    return new Date(bt).getTime() - new Date(at).getTime();
  });
  return summaries;
}

/** Message history for a channel, oldest→newest within a newest-first page. */
export async function listMessages(
  channelId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<ChannelMessage[]> {
  const limit = Math.min(opts.limit ?? HISTORY_PAGE, HISTORY_PAGE);
  let q = unscoped(supabase
    .from('ChannelMessage'), 'post-fetch: caller verified parent scope before this id query')
    .select('*')
    .eq('channelId', channelId)
    .is('deletedAt', null)
    .order('createdAt', { ascending: false })
    .limit(limit);
  if (opts.before) q = q.lt('createdAt', opts.before);
  const { data } = await q;
  const rows = (data ?? []) as ChannelMessage[];
  return rows.reverse(); // return oldest→newest for rendering
}

/**
 * Find-or-create the DM channel between the viewer and another brokerage
 * member. Idempotent via the (brokerageId, dmKey) unique index. Returns the
 * channel + whether it was newly created (so the caller can notify the other
 * member to re-authorize their realtime token).
 */
export async function ensureDmChannel(
  brokerageId: string,
  userId: string,
  otherUserId: string,
  createdById: string,
): Promise<{ channel: Channel; created: boolean }> {
  const key = dmKeyFor([userId, otherUserId]);

  const { data: existing } = await supabase
    .from('Channel')
    .select('*')
    .eq('brokerageId', brokerageId)
    .eq('dmKey', key)
    .maybeSingle();
  if (existing) return { channel: existing as Channel, created: false };

  const { data: created, error } = await supabase
    .from('Channel')
    .insert({ brokerageId, kind: 'dm', visibility: 'private', dmKey: key, createdById })
    .select('*')
    .single();
  // Lost the race (another request created it first) → fetch the winner.
  if (error || !created) {
    const { data: raced } = await supabase
      .from('Channel')
      .select('*')
      .eq('brokerageId', brokerageId)
      .eq('dmKey', key)
      .maybeSingle();
    if (raced) return { channel: raced as Channel, created: false };
    throw new Error('Failed to open direct message');
  }

  const channel = created as Channel;
  const { error: memberError } = await supabase.from('ChannelMember').insert([
    { channelId: channel.id, userId, role: 'member' },
    { channelId: channel.id, userId: otherUserId, role: 'member' },
  ]);
  if (memberError) {
    await unscoped(supabase.from('Channel'), 'post-fetch: caller verified parent scope before this id query').delete().eq('id', channel.id);
    logger.error('[messaging] failed to create DM memberships', { brokerageId, channelId: channel.id }, memberError);
    throw new Error('Failed to open direct message');
  }
  return { channel, created: true };
}

/** Create a named group channel with the given initial members (+ creator as owner). */
export async function createNamedChannel(
  brokerageId: string,
  createdById: string,
  opts: { name: string; topic?: string | null; visibility?: 'public' | 'private'; memberIds: string[] },
): Promise<Channel> {
  const { data, error } = await supabase
    .from('Channel')
    .insert({
      brokerageId,
      kind: 'channel',
      visibility: opts.visibility ?? 'public',
      name: opts.name,
      topic: opts.topic ?? null,
      createdById,
    })
    .select('*')
    .single();
  if (error || !data) {
    logger.error('[messaging] failed to insert channel', { brokerageId }, error);
    throw new Error('Failed to create channel');
  }
  const channel = data as Channel;

  const memberSet = Array.from(new Set([createdById, ...opts.memberIds]));
  const { error: memberError } = await supabase.from('ChannelMember').insert(
    memberSet.map((uid) => ({
      channelId: channel.id,
      userId: uid,
      role: uid === createdById ? 'owner' : 'member',
    })),
  );
  if (memberError) {
    await unscoped(supabase.from('Channel'), 'post-fetch: caller verified parent scope before this id query').delete().eq('id', channel.id);
    logger.error('[messaging] failed to create channel memberships', { brokerageId, channelId: channel.id }, memberError);
    throw new Error('Failed to create channel');
  }
  return channel;
}

/**
 * Post a message to a channel (caller has already verified membership).
 * Writes the row, bumps the channel's updatedAt, then publishes to the
 * channel's Ably lane and pings every member's personal lane for unread badges.
 */
export async function postMessage(
  channel: Channel,
  senderId: string,
  input: { body?: string | null; kind?: ChannelMessageKind; attachments?: MessageAttachment[]; metadata?: Record<string, unknown> },
): Promise<ChannelMessage> {
  const kind = input.kind ?? 'text';
  const body = (input.body ?? '').slice(0, MAX_BODY) || null;
  const attachments = input.attachments ?? [];

  const { data, error } = await supabase
    .from('ChannelMessage')
    .insert({
      channelId: channel.id,
      brokerageId: channel.brokerageId,
      senderId,
      kind,
      body,
      attachments,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error || !data) throw new Error('Failed to send message');
  const message = data as ChannelMessage;

  await unscoped(supabase.from('Channel'), 'post-fetch: caller verified parent scope before this id query').update({ updatedAt: new Date().toISOString() }).eq('id', channel.id);

  // Sender has implicitly read their own message.
  await supabase
    .from('ChannelMember')
    .update({ lastReadAt: message.createdAt, lastReadMessageId: message.id })
    .eq('channelId', channel.id)
    .eq('userId', senderId);

  // Live fan-out is best-effort inside the publisher, but await its completion
  // so the serverless invocation cannot be suspended before Ably receives it.
  await publishMessageEvent(channel.brokerageId, channel.id, 'message', {
    message: serializeMessage(message),
  });
  // Ping other members' personal lanes so their channel list re-sorts + badges,
  // and clients that don't yet have this channel in-token re-authorize.
  const { data: members } = await supabase
    .from('ChannelMember')
    .select('userId')
    .eq('channelId', channel.id);
  const inboxPublishes: Promise<void>[] = [];
  for (const m of members ?? []) {
    const uid = (m as { userId: string }).userId;
    if (uid === senderId) continue;
    inboxPublishes.push(
      publishUserEvent(channel.brokerageId, uid, 'inbox', { channelId: channel.id }),
    );
  }
  await Promise.all(inboxPublishes);

  return message;
}

/** Advance the viewer's read cursor and broadcast a read receipt. */
export async function markRead(
  channel: Channel,
  userId: string,
  messageId: string,
): Promise<void> {
  const { data: msg } = await unscoped(supabase
    .from('ChannelMessage'), 'post-fetch: caller verified parent scope before this id query')
    .select('id, createdAt')
    .eq('id', messageId)
    .eq('channelId', channel.id)
    .maybeSingle();
  if (!msg) return;
  const createdAt = (msg as { createdAt: string }).createdAt;

  await supabase
    .from('ChannelMember')
    .update({ lastReadAt: createdAt, lastReadMessageId: messageId })
    .eq('channelId', channel.id)
    .eq('userId', userId);

  await publishMessageEvent(channel.brokerageId, channel.id, 'read', {
    userId,
    lastReadMessageId: messageId,
    lastReadAt: createdAt,
  });
}

/** Members of a channel with their read cursors — powers "Seen by". */
export async function channelReadState(
  channelId: string,
): Promise<{ userId: string; lastReadAt: string | null; lastReadMessageId: string | null }[]> {
  const { data } = await supabase
    .from('ChannelMember')
    .select('userId, lastReadAt, lastReadMessageId')
    .eq('channelId', channelId);
  return (data ?? []) as { userId: string; lastReadAt: string | null; lastReadMessageId: string | null }[];
}

/** Touch the caller's presence timestamp (heartbeat). */
export async function touchLastSeen(userId: string): Promise<void> {
  await supabase.from('User').update({ lastSeenAt: new Date().toISOString() }).eq('id', userId);
}

/** JSON-safe message shape for the wire (Dates → ISO strings). */
export function serializeMessage(m: ChannelMessage): Record<string, unknown> {
  return {
    id: m.id,
    channelId: m.channelId,
    senderId: m.senderId,
    kind: m.kind,
    body: m.body,
    attachments: m.attachments ?? [],
    metadata: m.metadata ?? {},
    createdAt: m.createdAt,
    editedAt: m.editedAt ?? null,
  };
}
