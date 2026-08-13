'use client';

/**
 * FloorRoster — the live half of the broker Floor: every agent on the
 * brokerage with a real-time online dot (Ably presence) and a durable
 * last-seen fallback, plus a one-click door into Messages.
 *
 * Presence reuses useMessagingRealtime with no-op message handlers — the
 * hook already owns the token preflight + graceful degradation, so when
 * realtime is unconfigured this renders the same roster with last-seen
 * timestamps only (no dots, no errors).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { useMessagingRealtime } from '@/hooks/use-messaging';
import {
  BROKER_CONTROL,
  BROKER_DIVIDED_LIST,
  BROKER_PANEL,
  BROKER_ROW,
} from '@/components/broker/premium';

export interface FloorMember {
  userId: string;
  name: string | null;
  email: string;
  avatar: string | null;
  role: 'broker_owner' | 'broker_admin' | 'realtor_member';
  lastSeenAt: string | null;
}

const ROLE_LABEL: Record<FloorMember['role'], string> = {
  broker_owner: 'Owner',
  broker_admin: 'Admin',
  realtor_member: 'Agent',
};

const NOOP_HANDLERS = {
  onMessage: () => {},
  onRead: () => {},
  onTyping: () => {},
  onInbox: () => {},
};

export function FloorRoster({
  brokerageId,
  meId,
  members,
}: {
  brokerageId: string;
  meId: string;
  members: FloorMember[];
}) {
  const { online } = useMessagingRealtime({
    brokerageId,
    meId,
    meName: null,
    activeChannelId: null,
    handlers: NOOP_HANDLERS,
  });

  // Online first, then most-recently seen — the floor reads top-down as
  // "who can I reach right now."
  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      const aOn = online.has(a.userId) ? 1 : 0;
      const bOn = online.has(b.userId) ? 1 : 0;
      if (aOn !== bOn) return bOn - aOn;
      const aSeen = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const bSeen = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return bSeen - aSeen;
    });
  }, [members, online]);

  const onlineCount = members.filter((m) => online.has(m.userId)).length;

  return (
    <section className={cn(BROKER_PANEL, 'p-0 sm:p-0')} data-broker-surface="floor-roster">
      <div className="flex items-baseline justify-between border-b chippi-dashboard-divider px-5 py-4 sm:px-7">
        <h2 className="text-sm font-semibold text-foreground">Your floor</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {onlineCount} of {members.length} online
        </span>
      </div>
      <ul className={cn(BROKER_DIVIDED_LIST, 'px-5 pb-2 sm:px-7')}>
        {sorted.map((m) => {
          const isOnline = online.has(m.userId);
          const isMe = m.userId === meId;
          return (
            <li key={m.userId} className={cn(BROKER_ROW, 'items-center')}>
              <div className="relative shrink-0">
                <Avatar className="h-8 w-8">
                  {m.avatar && <AvatarImage src={m.avatar} alt="" />}
                  <AvatarFallback className="text-[11px]">
                    {(m.name || m.email).trim().slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card',
                    isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/30',
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {m.name || m.email}
                  {isMe && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {ROLE_LABEL[m.role]}
                  {' · '}
                  {isOnline
                    ? 'Active now'
                    : m.lastSeenAt
                      ? `Last seen ${timeAgo(m.lastSeenAt)}`
                      : 'Not seen yet'}
                </p>
              </div>
              {!isMe && (
                <Link
                  href="/broker/messages"
                  className={cn(BROKER_CONTROL, 'min-h-8 gap-1.5 px-3 text-xs')}
                >
                  <MessagesSquare className="h-3.5 w-3.5" />
                  Message
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
