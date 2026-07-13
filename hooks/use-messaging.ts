'use client';

/**
 * useMessagingRealtime — the browser half of brokerage messaging.
 *
 * Mirrors the graceful-degradation contract of the activity feed
 * (components/triggers/activity-live.tsx): we preflight GET /api/messages/token
 * ONCE. Anything but 200 (503 realtime-off, 401/403) → the hook stays inert and
 * the UI runs purely on its REST-loaded threads. No client, no socket, no retry
 * storm.
 *
 * When realtime IS configured we hold one Ably Realtime client and manage three
 * channel subscriptions:
 *   - presence  — enter the brokerage presence set + track who's online now
 *   - user lane — 'inbox'/'channel_added' pings (new message / added to a
 *                 channel) → the caller refetches + we widen the token
 *   - active    — the currently-open channel's 'message'/'read'/'typing' stream
 *
 * The token is capability-scoped to the caller's channels; opening a brand-new
 * DM/channel isn't in the token yet, so reauthorize() re-mints it before we
 * subscribe. Handlers are held in refs so re-renders don't churn subscriptions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';

const TOKEN_URL = '/api/messages/token';

export type PresenceSet = Set<string>;

export interface MessagingHandlers {
  onMessage: (channelId: string, message: Record<string, unknown>) => void;
  onRead: (channelId: string, data: { userId: string; lastReadMessageId: string; lastReadAt: string }) => void;
  onTyping: (channelId: string, data: { userId: string; name: string | null }) => void;
  /** Personal lane: a message arrived, or you were added to a channel. */
  onInbox: (payload: { channelId: string; kind: 'inbox' | 'channel_added' }) => void;
}

export function useMessagingRealtime(opts: {
  brokerageId: string | null;
  meId: string | null;
  meName: string | null;
  activeChannelId: string | null;
  handlers: MessagingHandlers;
}) {
  const { brokerageId, meId, meName, activeChannelId } = opts;
  const [available, setAvailable] = useState<boolean | null>(null);
  const [online, setOnline] = useState<PresenceSet>(new Set());
  const clientRef = useRef<Ably.Realtime | null>(null);
  const handlersRef = useRef(opts.handlers);
  handlersRef.current = opts.handlers;

  // ── Build the client once (preflight) ──────────────────────────────────────
  useEffect(() => {
    if (!brokerageId || !meId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(TOKEN_URL);
        if (cancelled) return;
        if (!res.ok) {
          setAvailable(false);
          return;
        }
        clientRef.current = new Ably.Realtime({ authUrl: TOKEN_URL });
        setAvailable(true);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
      try {
        clientRef.current?.close();
      } catch {
        /* best-effort */
      }
      clientRef.current = null;
    };
  }, [brokerageId, meId]);

  /** Re-mint the capability token so a newly-joined channel becomes reachable. */
  const reauthorize = useCallback(async () => {
    try {
      await clientRef.current?.auth.authorize();
    } catch {
      /* best-effort — the next reconnect re-auths anyway */
    }
  }, []);

  // ── Presence + personal user lane (persistent while mounted) ────────────────
  useEffect(() => {
    if (available !== true || !clientRef.current || !brokerageId || !meId) return;
    const client = clientRef.current;
    const presence = client.channels.get(`brokerage:${brokerageId}:presence`);
    const userLane = client.channels.get(`brokerage:${brokerageId}:user:${meId}`);

    const syncPresence = async () => {
      try {
        const members = await presence.presence.get();
        setOnline(new Set(members.map((m) => m.clientId).filter(Boolean) as string[]));
      } catch {
        /* ignore */
      }
    };
    const onPresence = () => void syncPresence();

    void presence.presence.subscribe(onPresence).catch(() => {});
    void presence.presence.enter({ name: meName ?? '' }).then(syncPresence).catch(() => {});

    const onInbox = (msg: Ably.Message) => {
      handlersRef.current.onInbox({
        channelId: (msg.data as { channelId?: string })?.channelId ?? '',
        kind: msg.name === 'channel_added' ? 'channel_added' : 'inbox',
      });
    };
    void userLane.subscribe('inbox', onInbox).catch(() => {});
    void userLane.subscribe('channel_added', onInbox).catch(() => {});

    return () => {
      try {
        presence.presence.unsubscribe(onPresence);
        void presence.presence.leave().catch(() => {});
        userLane.unsubscribe();
      } catch {
        /* best-effort */
      }
    };
  }, [available, brokerageId, meId, meName]);

  // ── Active channel stream ───────────────────────────────────────────────────
  useEffect(() => {
    if (available !== true || !clientRef.current || !brokerageId || !activeChannelId) return;
    const client = clientRef.current;
    const chan = client.channels.get(`brokerage:${brokerageId}:channel:${activeChannelId}`);
    const cid = activeChannelId;

    const onMessage = (msg: Ably.Message) => {
      const d = msg.data as { message?: Record<string, unknown> };
      if (d?.message) handlersRef.current.onMessage(cid, d.message);
    };
    const onRead = (msg: Ably.Message) => {
      handlersRef.current.onRead(cid, msg.data as { userId: string; lastReadMessageId: string; lastReadAt: string });
    };
    const onTyping = (msg: Ably.Message) => {
      handlersRef.current.onTyping(cid, msg.data as { userId: string; name: string | null });
    };

    // Attach; if the channel isn't in our token yet (a just-opened DM), a
    // capability error fires → re-mint and re-attach once.
    void chan.subscribe('message', onMessage).catch(() => {});
    void chan.subscribe('read', onRead).catch(() => {});
    void chan.subscribe('typing', onTyping).catch(() => {});
    const onFailed = (state: Ably.ChannelStateChange) => {
      if (state.current === 'failed') void reauthorize().then(() => chan.attach().catch(() => {}));
    };
    chan.on('failed', onFailed);
    chan.attach().catch(() => void reauthorize().then(() => chan.attach().catch(() => {})));

    return () => {
      try {
        chan.unsubscribe();
        chan.off(onFailed);
      } catch {
        /* best-effort */
      }
    };
  }, [available, brokerageId, activeChannelId, reauthorize]);

  return { realtimeAvailable: available === true, online, reauthorize };
}
