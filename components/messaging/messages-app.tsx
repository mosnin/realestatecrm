'use client';

/**
 * MessagesApp — the brokerage's real-time messaging surface (Slack-like).
 *
 * A two-pane client app: a left rail of channels + direct messages + the
 * brokerage roster (to start a DM), and a right-hand thread with a composer.
 * It loads everything over REST (/api/messages/*) and overlays live updates
 * from Ably via useMessagingRealtime — presence (online / last seen), new
 * messages, read receipts, and typing hints. When realtime is unconfigured the
 * REST data stands alone (a manual refresh still works).
 *
 * Mounted from both the realtor surface (/s/[slug]/messages) and the broker
 * surface (/broker/messages); the API resolves the caller's brokerage either
 * way, so the component itself is surface-agnostic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Hash,
  Lock,
  Plus,
  Send,
  Paperclip,
  X,
  FileText,
  Loader2,
  MessagesSquare,
  ChevronLeft,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { useMessagingRealtime } from '@/hooks/use-messaging';
import { toast } from 'sonner';

// ── Wire types (match the /api/messages responses) ───────────────────────────

type Role = 'broker_owner' | 'broker_admin' | 'realtor_member';
interface RosterMember {
  userId: string;
  name: string | null;
  email: string;
  avatar: string | null;
  role: Role;
  lastSeenAt: string | null;
}
interface ChannelRow {
  id: string;
  kind: 'channel' | 'dm';
  visibility: 'public' | 'private';
  name: string | null;
  topic: string | null;
  updatedAt: string;
}
interface ChannelSummary {
  channel: ChannelRow;
  otherMember: RosterMember | null;
  memberIds: string[];
  lastMessage: { id: string; body: string | null; kind: string; senderId: string | null; createdAt: string } | null;
  unreadCount: number;
  lastReadMessageId: string | null;
}
interface Attachment {
  fileId: string | null;
  name: string;
  url?: string | null;
  size: number | null;
  contentType: string | null;
}
interface Message {
  id: string;
  channelId: string;
  senderId: string | null;
  kind: string;
  body: string | null;
  attachments: Attachment[];
  metadata: Record<string, unknown>;
  createdAt: string;
  editedAt: string | null;
}
interface ReadCursor {
  userId: string;
  lastReadAt: string | null;
  lastReadMessageId: string | null;
}
interface Bootstrap {
  me: { userId: string; role: Role };
  brokerage: { id: string; name: string };
  canManage: boolean;
  channels: ChannelSummary[];
  roster: RosterMember[];
}

const initials = (m: { name: string | null; email: string }) =>
  (m.name || m.email || '?').trim().slice(0, 2).toUpperCase();

const displayName = (m: { name: string | null; email: string } | null | undefined) =>
  m ? m.name || m.email : 'Unknown';

const channelTitle = (c: ChannelSummary): string =>
  c.channel.kind === 'dm' ? displayName(c.otherMember) : c.channel.name || 'Channel';

// ── Root ──────────────────────────────────────────────────────────────────────

export function MessagesApp() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reads, setReads] = useState<ReadCursor[]>([]);
  const [typing, setTyping] = useState<Map<string, number>>(new Map());
  const [mobileThread, setMobileThread] = useState(false); // small screens: show list vs thread

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadChannels = useCallback(async (): Promise<Bootstrap | null> => {
    try {
      const res = await fetch('/api/messages/channels');
      if (!res.ok) {
        setLoadError(true);
        return null;
      }
      const json = (await res.json()) as Bootstrap;
      setData(json);
      return json;
    } catch {
      setLoadError(true);
      return null;
    }
  }, []);

  // Initial load + presence heartbeat.
  useEffect(() => {
    void loadChannels();
    void fetch('/api/messages/presence', { method: 'POST' }).catch(() => {});
    const hb = setInterval(() => {
      void fetch('/api/messages/presence', { method: 'POST' }).catch(() => {});
    }, 60_000);
    return () => clearInterval(hb);
  }, [loadChannels]);

  const activeSummary = useMemo(
    () => data?.channels.find((c) => c.channel.id === activeId) ?? null,
    [data, activeId],
  );

  // Load a thread's history + read cursors when the active channel changes.
  const openChannel = useCallback(async (id: string) => {
    setActiveId(id);
    setMobileThread(true);
    setMessages([]);
    setReads([]);
    try {
      const res = await fetch(`/api/messages/channels/${id}/messages`);
      if (!res.ok) return;
      const json = (await res.json()) as { messages: Message[]; reads: ReadCursor[] };
      setMessages(json.messages);
      setReads(json.reads);
      // Mark the newest message read.
      const last = json.messages[json.messages.length - 1];
      if (last) {
        void fetch(`/api/messages/channels/${id}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: last.id }),
        }).catch(() => {});
        // Optimistically clear the unread badge.
        setData((prev) =>
          prev
            ? {
                ...prev,
                channels: prev.channels.map((c) =>
                  c.channel.id === id ? { ...c, unreadCount: 0, lastReadMessageId: last.id } : c,
                ),
              }
            : prev,
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  // ── Realtime handlers ───────────────────────────────────────────────────────
  const handleMessage = useCallback(
    (channelId: string, raw: Record<string, unknown>) => {
      const msg = raw as unknown as Message;
      if (channelId === activeIdRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        // We're looking at it → mark read.
        void fetch(`/api/messages/channels/${channelId}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: msg.id }),
        }).catch(() => {});
      }
      // Re-sort + bump the sidebar; bump unread if not the active channel.
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          channels: prev.channels.map((c) =>
            c.channel.id === channelId
              ? {
                  ...c,
                  lastMessage: { id: msg.id, body: msg.body, kind: msg.kind, senderId: msg.senderId, createdAt: msg.createdAt },
                  unreadCount:
                    channelId === activeIdRef.current || msg.senderId === prev.me.userId
                      ? c.unreadCount
                      : c.unreadCount + 1,
                }
              : c,
          ),
        };
      });
    },
    [],
  );

  const handleRead = useCallback((channelId: string, d: { userId: string; lastReadMessageId: string; lastReadAt: string }) => {
    if (channelId !== activeIdRef.current) return;
    setReads((prev) => {
      const rest = prev.filter((r) => r.userId !== d.userId);
      return [...rest, { userId: d.userId, lastReadAt: d.lastReadAt, lastReadMessageId: d.lastReadMessageId }];
    });
  }, []);

  const handleTyping = useCallback((channelId: string, d: { userId: string }) => {
    if (channelId !== activeIdRef.current) return;
    setTyping((prev) => {
      const next = new Map(prev);
      next.set(d.userId, Date.now());
      return next;
    });
  }, []);

  const reauthRef = useRef<() => Promise<void>>(async () => {});
  const handleInbox = useCallback(
    async (payload: { channelId: string; kind: 'inbox' | 'channel_added' }) => {
      // Added to a new channel/DM → widen the token so we can subscribe to it.
      if (payload.kind === 'channel_added') await reauthRef.current();
      await loadChannels();
    },
    [loadChannels],
  );

  const { online, reauthorize } = useMessagingRealtime({
    brokerageId: data?.brokerage.id ?? null,
    meId: data?.me.userId ?? null,
    meName: null,
    activeChannelId: activeId,
    handlers: { onMessage: handleMessage, onRead: handleRead, onTyping: handleTyping, onInbox: handleInbox },
  });
  reauthRef.current = reauthorize;

  // Expire typing hints after 4s.
  useEffect(() => {
    if (typing.size === 0) return;
    const t = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [uid, ts] of next) {
          if (now - ts > 4000) {
            next.delete(uid);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(t);
  }, [typing]);

  const startDm = useCallback(
    async (userId: string) => {
      try {
        const res = await fetch('/api/messages/dm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!res.ok) return;
        const { channel } = (await res.json()) as { channel: ChannelRow };
        await reauthorize();
        await loadChannels();
        void openChannel(channel.id);
      } catch {
        /* ignore */
      }
    },
    [loadChannels, openChannel, reauthorize],
  );

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Messaging is for brokerage teams</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Join or create a brokerage to message your team in real time — direct messages, channels,
            presence, and shared files.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card">
      <ChannelRail
        data={data}
        activeId={activeId}
        online={online}
        onOpen={openChannel}
        onStartDm={startDm}
        onChannelCreated={async (id) => {
          await reauthorize();
          await loadChannels();
          void openChannel(id);
        }}
        className={cn('w-full sm:w-72', mobileThread && 'hidden sm:flex')}
      />
      <main className={cn('flex min-w-0 flex-1 flex-col', !mobileThread && 'hidden sm:flex')}>
        {activeSummary ? (
          <Thread
            key={activeSummary.channel.id}
            me={data.me}
            summary={activeSummary}
            messages={messages}
            reads={reads}
            typing={typing}
            roster={data.roster}
            online={online}
            onBack={() => setMobileThread(false)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessagesSquare className="h-8 w-8" />
            <p className="text-sm">Pick a conversation, or start one from your team on the left.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Left rail ───────────────────────────────────────────────────────────────

function ChannelRail({
  data,
  activeId,
  online,
  onOpen,
  onStartDm,
  onChannelCreated,
  className,
}: {
  data: Bootstrap;
  activeId: string | null;
  online: Set<string>;
  onOpen: (id: string) => void;
  onStartDm: (userId: string) => void;
  onChannelCreated: (id: string) => void;
  className?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const channels = data.channels.filter((c) => c.channel.kind === 'channel');
  const dms = data.channels.filter((c) => c.channel.kind === 'dm');
  const dmUserIds = new Set(dms.map((d) => d.otherMember?.userId).filter(Boolean));
  // Teammates you don't yet have a DM with — one tap to start one.
  const startables = data.roster.filter((m) => m.userId !== data.me.userId && !dmUserIds.has(m.userId));

  const createChannel = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/messages/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, visibility: 'public' }),
      });
      if (res.ok) {
        const { channel } = (await res.json()) as { channel: { id: string } };
        setNewName('');
        setCreating(false);
        onChannelCreated(channel.id);
      } else {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Couldn't create that channel. Try again.");
      }
    } catch {
      toast.error("Couldn't create that channel. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={cn('flex shrink-0 flex-col border-r border-border bg-card', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{data.brokerage.name}</p>
          <p className="text-[11px] text-muted-foreground">{online.size} online</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {/* Channels */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Channels</span>
            {data.canManage && (
              <button
                type="button"
                onClick={() => setCreating((v) => !v)}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="New channel"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {creating && (
            <div className="mb-2 flex gap-1.5 px-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createChannel()}
                placeholder="channel-name"
                className="h-7 text-xs"
                autoFocus
              />
              <Button size="xs" onClick={createChannel} disabled={busy || !newName.trim()}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
              </Button>
            </div>
          )}
          {channels.length === 0 && !creating && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No channels yet.</p>
          )}
          {channels.map((c) => (
            <RailRow
              key={c.channel.id}
              active={c.channel.id === activeId}
              unread={c.unreadCount}
              onClick={() => onOpen(c.channel.id)}
              icon={c.channel.visibility === 'private' ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
              title={channelTitle(c)}
              subtitle={c.lastMessage?.body ?? null}
            />
          ))}
        </div>

        {/* Direct messages */}
        <div className="mb-4">
          <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Direct messages
          </span>
          <div className="mt-1">
            {dms.map((c) => (
              <RailRow
                key={c.channel.id}
                active={c.channel.id === activeId}
                unread={c.unreadCount}
                onClick={() => onOpen(c.channel.id)}
                avatar={c.otherMember}
                online={c.otherMember ? online.has(c.otherMember.userId) : false}
                title={channelTitle(c)}
                subtitle={c.lastMessage?.body ?? null}
              />
            ))}
          </div>
        </div>

        {/* Teammates to start a DM with */}
        {startables.length > 0 && (
          <div>
            <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Team</span>
            <div className="mt-1">
              {startables.map((m) => (
                <RailRow
                  key={m.userId}
                  active={false}
                  unread={0}
                  onClick={() => onStartDm(m.userId)}
                  avatar={m}
                  online={online.has(m.userId)}
                  title={displayName(m)}
                  subtitle={roleLabel(m.role)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function RailRow({
  active,
  unread,
  onClick,
  icon,
  avatar,
  online,
  title,
  subtitle,
}: {
  active: boolean;
  unread: number;
  onClick: () => void;
  icon?: React.ReactNode;
  avatar?: RosterMember | null;
  online?: boolean;
  title: string;
  subtitle: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/60',
      )}
    >
      {avatar ? (
        <div className="relative shrink-0">
          <Avatar className="h-7 w-7">
            {avatar.avatar && <AvatarImage src={avatar.avatar} alt="" />}
            <AvatarFallback className="text-[10px]">{initials(avatar)}</AvatarFallback>
          </Avatar>
          {online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
          )}
        </div>
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px]', unread > 0 ? 'font-semibold text-foreground' : 'text-foreground')}>
          {title}
        </span>
        {subtitle && <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>}
      </span>
      {unread > 0 && (
        <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold tabular-nums text-background">
          {unread}
        </span>
      )}
    </button>
  );
}

// ── Right pane: thread + composer ───────────────────────────────────────────

function Thread({
  me,
  summary,
  messages,
  reads,
  typing,
  roster,
  online,
  onBack,
}: {
  me: { userId: string; role: Role };
  summary: ChannelSummary;
  messages: Message[];
  reads: ReadCursor[];
  typing: Map<string, number>;
  roster: RosterMember[];
  online: Set<string>;
  onBack: () => void;
}) {
  const rosterById = useMemo(() => new Map(roster.map((r) => [r.userId, r])), [roster]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDm = summary.channel.kind === 'dm';

  // Autoscroll to newest on message count change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // "Seen" for a DM: has the other member read up to the last message I sent?
  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].senderId === me.userId) return messages[i].id;
    return null;
  }, [messages, me.userId]);
  const otherRead =
    isDm && summary.otherMember
      ? reads.find((r) => r.userId === summary.otherMember!.userId)?.lastReadMessageId
      : null;
  const seenByOther = Boolean(lastMineId && otherRead && lastMineId === otherRead);

  const typingNames = Array.from(typing.keys())
    .filter((uid) => uid !== me.userId)
    .map((uid) => displayName(rosterById.get(uid) ?? null))
    .filter(Boolean);

  const headerSub = isDm
    ? summary.otherMember && online.has(summary.otherMember.userId)
      ? 'Active now'
      : summary.otherMember?.lastSeenAt
        ? `Last seen ${timeAgo(summary.otherMember.lastSeenAt)}`
        : 'Offline'
    : summary.channel.topic || `${summary.memberIds.length} members`;

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="sm:hidden -ml-1 rounded p-1 hover:bg-accent" aria-label="Back">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {isDm && summary.otherMember ? (
          <div className="relative">
            <Avatar className="h-8 w-8">
              {summary.otherMember.avatar && <AvatarImage src={summary.otherMember.avatar} alt="" />}
              <AvatarFallback className="text-[11px]">{initials(summary.otherMember)}</AvatarFallback>
            </Avatar>
            {online.has(summary.otherMember.userId) && (
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
            )}
          </div>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-muted-foreground">
            {summary.channel.visibility === 'private' ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{channelTitle(summary)}</p>
          <p className="truncate text-[11px] text-muted-foreground">{headerSub}</p>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {isDm ? `Say hello to ${displayName(summary.otherMember)}.` : 'No messages yet — start the conversation.'}
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const grouped = prev && prev.senderId === m.senderId && m.senderId !== null &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <MessageRow
              key={m.id}
              message={m}
              mine={m.senderId === me.userId}
              sender={m.senderId ? rosterById.get(m.senderId) ?? null : null}
              grouped={Boolean(grouped)}
            />
          );
        })}
      </div>

      {(typingNames.length > 0 || seenByOther) && (
        <div className="px-4 pb-1 text-[11px] text-muted-foreground">
          {typingNames.length > 0
            ? `${typingNames.slice(0, 2).join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing…`
            : seenByOther
              ? 'Seen'
              : null}
        </div>
      )}

      <Composer channelId={summary.channel.id} />
    </>
  );
}

function MessageRow({
  message,
  mine,
  sender,
  grouped,
}: {
  message: Message;
  mine: boolean;
  sender: RosterMember | null;
  grouped: boolean;
}) {
  return (
    <div className={cn('flex gap-2.5', grouped ? 'mt-0.5' : 'mt-3')}>
      <div className="w-8 shrink-0">
        {!grouped &&
          (mine ? null : sender ? (
            <Avatar className="h-8 w-8">
              {sender.avatar && <AvatarImage src={sender.avatar} alt="" />}
              <AvatarFallback className="text-[11px]">{initials(sender)}</AvatarFallback>
            </Avatar>
          ) : (
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-[11px]">?</AvatarFallback>
            </Avatar>
          ))}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-foreground">
              {mine ? 'You' : displayName(sender)}
            </span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(message.createdAt)}</span>
          </div>
        )}
        {message.body && (
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">{message.body}</p>
        )}
        {message.attachments?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {message.attachments.map((a, idx) => (
              <a
                key={idx}
                href={a.fileId ? `/api/messages/attachment?key=${encodeURIComponent(a.fileId)}` : (a.url ?? '#')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-foreground transition-colors hover:bg-muted"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="max-w-[180px] truncate">{a.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ channelId }: { channelId: string }) {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTyped = useRef(0);

  // Reset draft when switching channels.
  useEffect(() => {
    setValue('');
    setPending([]);
  }, [channelId]);

  const pingTyping = () => {
    const now = Date.now();
    if (now - lastTyped.current < 3000) return;
    lastTyped.current = now;
    void fetch(`/api/messages/channels/${channelId}/typing`, { method: 'POST' }).catch(() => {});
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/messages/upload', { method: 'POST', body: form });
        if (res.ok) {
          const att = (await res.json()) as Attachment;
          setPending((p) => [...p, att]);
        }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = async () => {
    const body = value.trim();
    if (!body && pending.length === 0) return;
    setSending(true);
    try {
      const res = await fetch(`/api/messages/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          kind: pending.length > 0 && !body ? 'file' : 'text',
          attachments: pending,
        }),
      });
      if (res.ok) {
        setValue('');
        setPending([]);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-border p-3">
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pending.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button type="button" onClick={() => setPending((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove">
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mb-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          aria-label="Attach a file"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <Textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            pingTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Write a message…"
          className="max-h-32 min-h-[38px] resize-none py-2"
        />
        <Button
          type="button"
          size="icon"
          onClick={() => void send()}
          disabled={sending || (!value.trim() && pending.length === 0)}
          className="mb-0.5"
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function roleLabel(role: Role): string {
  return role === 'broker_owner' ? 'Owner' : role === 'broker_admin' ? 'Admin' : 'Agent';
}
