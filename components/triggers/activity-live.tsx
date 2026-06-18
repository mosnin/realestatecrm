'use client';

/**
 * ActivityLive — the live overlay for the triggers ActivityFeed.
 *
 * Loaded lazily + client-only (next/dynamic ssr:false) so the Ably SDK never
 * runs on the server, never ships in the initial bundle, and a realtime-off
 * environment costs nothing. It renders NOTHING visible; its only job is to
 * subscribe to `space:${spaceId}:events` and hand each new event to the parent
 * via `onEvent`, which prepends + dedupes.
 *
 * GRACEFUL DEGRADATION is the whole point of this file:
 *   - ABLY_API_KEY is unset in most envs, so GET /api/ably/token returns 503.
 *     We preflight that route ONCE. On anything but 200 we render null and
 *     never instantiate Ably — no client, no socket, no retry storm. The
 *     parent's DB-loaded feed is the complete experience.
 *   - When realtime IS configured, we build a Realtime client pointed at the
 *     token authUrl (the browser never sees ABLY_API_KEY) and subscribe. Any
 *     connection/channel error is swallowed via the hook's error callbacks.
 *   - The client is closed on unmount.
 *
 * Mirrors the channel + message contract documented in lib/realtime/ably.ts:
 * channel `space:${spaceId}:events`, message name `integration_event`.
 */

import { useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';
import { AblyProvider, ChannelProvider, useChannel } from 'ably/react';
import type { IntegrationEventStatus } from '@/lib/types';
import type { ActivityEvent } from './activity-feed';

const TOKEN_URL = '/api/ably/token';

function channelName(spaceId: string): string {
  return `space:${spaceId}:events`;
}

/**
 * Coerce an Ably message's `data` into an ActivityEvent. The publisher
 * (lib/realtime/ably.ts via the Inngest handler) sends
 * `{ toolkit, eventType, title, actor, snippet, occurredAt, status,
 *    connectionId, deliveryId }`. We defensively normalise: a malformed
 * message is dropped (returns null) rather than crashing the feed.
 */
function toActivityEvent(data: unknown): ActivityEvent | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const toolkit = typeof d.toolkit === 'string' ? d.toolkit : null;
  const eventType = typeof d.eventType === 'string' ? d.eventType : null;
  if (!toolkit || !eventType) return null;
  const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const status: IntegrationEventStatus =
    d.status === 'captured' ||
    d.status === 'dispatched' ||
    d.status === 'skipped' ||
    d.status === 'failed'
      ? d.status
      : 'captured';
  return {
    connectionId: asString(d.connectionId),
    toolkit,
    eventType,
    title: asString(d.title),
    actor: asString(d.actor),
    snippet: asString(d.snippet),
    occurredAt: asString(d.occurredAt) ?? new Date().toISOString(),
    status,
    deliveryId: asString(d.deliveryId),
  };
}

/** Inner subscriber — only mounted once we have a live Ably client + a
 *  ChannelProvider above it. Errors are swallowed so realtime hiccups never
 *  surface as a crash. */
function ChannelSubscriber({
  spaceId,
  onEvent,
}: {
  spaceId: string;
  onEvent: (e: ActivityEvent) => void;
}) {
  useChannel(
    {
      channelName: channelName(spaceId),
      // Swallow — the DB feed stands alone; realtime is decoration.
      onConnectionError: () => {},
      onChannelError: () => {},
    },
    'integration_event',
    (msg) => {
      const event = toActivityEvent(msg.data);
      if (event) onEvent(event);
    },
  );
  return null;
}

export function ActivityLive({
  spaceId,
  onEvent,
}: {
  spaceId: string;
  onEvent: (e: ActivityEvent) => void;
}) {
  // null = preflighting, false = realtime off (render nothing), true = live.
  const [available, setAvailable] = useState<boolean | null>(null);
  const clientRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Preflight the token route ONCE. 200 → realtime is configured; build the
    // client. Anything else (503 realtime-off, 401/403, network) → stay dark.
    (async () => {
      try {
        const res = await fetch(TOKEN_URL);
        if (cancelled) return;
        if (!res.ok) {
          setAvailable(false);
          return;
        }
        // Build the Realtime client. It authenticates via the SAME authUrl, so
        // the browser never touches ABLY_API_KEY. autoConnect default = true.
        clientRef.current = new Ably.Realtime({ authUrl: TOKEN_URL });
        setAvailable(true);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();

    return () => {
      cancelled = true;
      // Tear down the socket so we don't leak a connection across navigations.
      try {
        clientRef.current?.close();
      } catch {
        // ignore — best-effort cleanup.
      }
      clientRef.current = null;
    };
  }, [spaceId]);

  // Realtime off or still preflighting → render nothing. The DB feed is whole.
  if (available !== true || !clientRef.current) return null;

  return (
    <AblyProvider client={clientRef.current}>
      <ChannelProvider channelName={channelName(spaceId)}>
        <ChannelSubscriber spaceId={spaceId} onEvent={onEvent} />
      </ChannelProvider>
    </AblyProvider>
  );
}
