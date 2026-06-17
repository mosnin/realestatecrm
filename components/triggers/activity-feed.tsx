'use client';

/**
 * ActivityFeed (triggers) — the client surface for /chippi/triggers.
 *
 * NOTE: distinct from components/chippi/activity-feed.tsx, which renders
 * Chippi's OWN agent actions on /chippi/history. THIS feed is the connected-
 * app event stream: every Composio trigger delivery Chippi noticed (new email,
 * RSVP changed, deal moved, payment landed), newest first, with filter chips,
 * a live Ably overlay, and a "Manage what Chippi watches" toggle section.
 *
 * Data flow:
 *   - `initialEvents` are the server-rendered IntegrationEvent rows — the
 *     source of truth. The feed works fully with just these, even when
 *     realtime is off (the default: ABLY_API_KEY is unset in most envs).
 *   - Live updates are an OVERLAY. <ActivityLive> (lazy, client-only)
 *     subscribes to `space:${spaceId}:events` and prepends new events. If the
 *     Ably token route 503s or the SDK errors, it stays silent and the DB feed
 *     is untouched — never a crash, never an empty screen.
 *   - "Load older" keyset-paginates via /api/triggers/events?before=<iso>.
 *
 * Styling mirrors connected-apps-section + the other /chippi pages: Tailwind,
 * the app's card/list idioms, the muted/foreground vocabulary, status pills.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { SECTION_LABEL } from '@/lib/typography';
import { findIntegration } from '@/lib/integrations/catalog';
import type { IntegrationEventStatus } from '@/lib/types';
import type { TriggerStatus } from '@/lib/integrations/triggers';

// ── Types (shared with the page) ────────────────────────────────────────────

/** One row the feed renders. Mirrors `ActivityFeedEvent` (lib/integrations/
 *  events.ts) AND the Ably message payload, so a DB event and a live event
 *  render through the same component. */
export interface ActivityEvent {
  id?: string;
  connectionId: string | null;
  toolkit: string;
  eventType: string;
  title: string | null;
  actor: string | null;
  snippet: string | null;
  occurredAt: string;
  status: IntegrationEventStatus;
  deliveryId: string | null;
}

export interface ActivityConnection {
  id: string;
  toolkit: string;
  status: 'active' | 'pending' | 'expired' | 'revoked' | 'failed';
  label: string | null;
}

export interface ActivityTrigger {
  id: string;
  connectionId: string;
  triggerSlug: string;
  status: TriggerStatus;
  lastFiredAt: string | null;
}

// Lazy, client-only: the Ably SDK + its React hooks never run on the server,
// never ship in the initial bundle, and a missing/503 token route degrades to
// the DB feed. `ssr: false` keeps it out of SSR entirely.
const ActivityLive = dynamic(
  () => import('./activity-live').then((m) => m.ActivityLive),
  { ssr: false },
);

const PAGE_LIMIT = 50;

// ── Helpers ─────────────────────────────────────────────────────────────────

function toolkitName(toolkit: string): string {
  return findIntegration(toolkit)?.name ?? toolkit;
}

function toolkitIconUrl(toolkit: string): string | undefined {
  return findIntegration(toolkit)?.iconUrl;
}

/** A small, on-brand icon for an event's app. Falls back to a letter chip
 *  (same vocabulary as connected-apps-section's AppIcon) when no mark. */
function EventIcon({ toolkit }: { toolkit: string }) {
  const url = toolkitIconUrl(toolkit);
  const name = toolkitName(toolkit);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" aria-hidden className="w-5 h-5 object-contain flex-shrink-0" />;
  }
  return (
    <span
      aria-hidden
      className="w-5 h-5 rounded bg-muted text-muted-foreground inline-flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
    >
      {name[0]}
    </span>
  );
}

/** Status chip. 'captured'/'dispatched' read as normal activity; 'skipped'
 *  and 'failed' are quieter / amber so the realtor can tell signal from noise
 *  without it shouting. */
function StatusChip({ status }: { status: IntegrationEventStatus }) {
  const map: Record<IntegrationEventStatus, { label: string; cls: string }> = {
    captured: {
      label: 'Noticed',
      cls: 'bg-foreground/[0.05] text-muted-foreground',
    },
    dispatched: {
      label: 'Drafted',
      cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
    },
    skipped: {
      label: 'Passed',
      cls: 'bg-foreground/[0.05] text-muted-foreground',
    },
    failed: {
      label: 'Failed',
      cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 flex-shrink-0',
        cls,
      )}
    >
      {label}
    </span>
  );
}

/** Stable key + dedupe anchor for an event. Prefer deliveryId (the idempotency
 *  anchor shared by DB + Ably), fall back to id, then a composite. */
function eventKey(e: ActivityEvent): string {
  return e.deliveryId ?? e.id ?? `${e.toolkit}:${e.eventType}:${e.occurredAt}`;
}

// ── Feed row ────────────────────────────────────────────────────────────────

function FeedRow({ event }: { event: ActivityEvent }) {
  const name = toolkitName(event.toolkit);
  // Headline: the event title if we extracted one, else a humanised app line.
  const headline = event.title ?? `${name} activity`;
  return (
    <li className="group/row flex items-start gap-3 py-3 first:pt-0">
      <span className="pt-0.5">
        <EventIcon toolkit={event.toolkit} />
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {name}
          </span>
          <StatusChip status={event.status} />
          <span className="text-[11px] tabular-nums text-muted-foreground/70 ml-auto flex-shrink-0">
            {timeAgo(event.occurredAt)}
          </span>
        </div>
        <p className="text-sm text-foreground leading-snug truncate">{headline}</p>
        {event.actor && (
          <p className="text-xs text-muted-foreground truncate">{event.actor}</p>
        )}
        {event.snippet && (
          <p className="text-xs text-muted-foreground/90 leading-relaxed line-clamp-2">
            {event.snippet}
          </p>
        )}
      </div>
    </li>
  );
}

// ── Manage section ──────────────────────────────────────────────────────────

/** Map a connection's trigger rows to a single on/off state. Per-app
 *  granularity matches the existing pause helper (setPausedForConnection flips
 *  ALL triggers for a connection at once) and the settings panel's one-toggle-
 *  per-app contract. 'active' if any trigger is active; 'paused' if all are
 *  paused; 'failed' if registration broke; 'off' if nothing curated. */
type WatchState = 'off' | 'active' | 'paused' | 'failed';

function watchStateFor(triggers: ActivityTrigger[]): WatchState {
  if (triggers.length === 0) return 'off';
  if (triggers.some((t) => t.status === 'active')) return 'active';
  if (triggers.some((t) => t.status === 'paused')) return 'paused';
  if (triggers.some((t) => t.status === 'failed')) return 'failed';
  return 'off';
}

function ManageSection({
  connections,
  triggersByConnection,
  onToggle,
  busyConnectionId,
}: {
  connections: ActivityConnection[];
  triggersByConnection: Map<string, ActivityTrigger[]>;
  onToggle: (connectionId: string, currentlyPaused: boolean) => void;
  busyConnectionId: string | null;
}) {
  // Only connected (active) apps with at least one curated trigger get a
  // toggle — surfacing "off" apps would be noise (nothing to watch).
  const rows = connections
    .filter((c) => c.status === 'active')
    .map((c) => ({ connection: c, triggers: triggersByConnection.get(c.id) ?? [] }))
    .filter(({ triggers }) => triggers.length > 0);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3 pt-4 border-t border-border/60">
      <p className={SECTION_LABEL}>Manage what Chippi watches</p>
      <ul className="divide-y divide-border/60">
        {rows.map(({ connection, triggers }) => {
          const state = watchStateFor(triggers);
          const isPaused = state === 'paused';
          const isFailed = state === 'failed';
          const busy = busyConnectionId === connection.id;
          return (
            <li key={connection.id} className="flex items-center gap-3 py-3 first:pt-0">
              <EventIcon toolkit={connection.toolkit} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium truncate">
                  {toolkitName(connection.toolkit)}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {isFailed
                    ? "Couldn't tune in. Try reconnecting in Settings."
                    : isPaused
                      ? 'Quiet here.'
                      : 'Chippi is listening.'}
                </p>
              </div>
              {!isFailed && (
                <button
                  type="button"
                  onClick={() => onToggle(connection.id, isPaused)}
                  disabled={busy}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {busy && <Loader2 size={12} className="animate-spin" />}
                  {isPaused ? 'Turn on' : 'Pause'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Filter chips ────────────────────────────────────────────────────────────

function FilterChips({
  connections,
  active,
  onSelect,
}: {
  connections: ActivityConnection[];
  active: string | null;
  onSelect: (toolkit: string | null) => void;
}) {
  // One chip per distinct connected toolkit, plus "All".
  const toolkits = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of connections) {
      if (c.status !== 'active') continue;
      if (seen.has(c.toolkit)) continue;
      seen.add(c.toolkit);
      out.push(c.toolkit);
    }
    return out;
  }, [connections]);

  if (toolkits.length < 2) return null; // nothing to filter between

  const chip = (label: string, value: string | null) => {
    const selected = active === value;
    return (
      <button
        key={value ?? '__all'}
        type="button"
        onClick={() => onSelect(value)}
        className={cn(
          'inline-flex items-center h-7 px-3 rounded-full text-xs font-medium transition-colors',
          selected
            ? 'bg-foreground text-background'
            : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chip('All', null)}
      {toolkits.map((tk) => chip(toolkitName(tk), tk))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function ActivityFeed({
  spaceId,
  initialEvents,
  connections,
  triggers,
}: {
  spaceId: string;
  initialEvents: ActivityEvent[];
  connections: ActivityConnection[];
  triggers: ActivityTrigger[];
}) {
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [toolkitFilter, setToolkitFilter] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // true once a page returns < PAGE_LIMIT (no older rows to fetch).
  const [reachedEnd, setReachedEnd] = useState(initialEvents.length < PAGE_LIMIT);

  // Trigger state lives here so the manage toggles update optimistically.
  const [triggerState, setTriggerState] = useState<ActivityTrigger[]>(triggers);
  const [busyConnectionId, setBusyConnectionId] = useState<string | null>(null);

  // Dedupe set of keys already in the feed — Ably can redeliver, and a live
  // event may also be in the next "load more" page. Held in a ref so the live
  // callback (stable) reads the latest without re-subscribing.
  const seenKeys = useRef<Set<string>>(new Set(initialEvents.map(eventKey)));

  const triggersByConnection = useMemo(() => {
    const map = new Map<string, ActivityTrigger[]>();
    for (const t of triggerState) {
      const arr = map.get(t.connectionId) ?? [];
      arr.push(t);
      map.set(t.connectionId, arr);
    }
    return map;
  }, [triggerState]);

  // Prepend a live event (from Ably), deduped by key. Stable identity so the
  // live subscription never tears down on a re-render.
  const handleLiveEvent = useCallback((incoming: ActivityEvent) => {
    const key = eventKey(incoming);
    if (seenKeys.current.has(key)) return;
    seenKeys.current.add(key);
    setEvents((prev) => [incoming, ...prev]);
  }, []);

  const visibleEvents = useMemo(() => {
    if (!toolkitFilter) return events;
    return events.filter((e) => e.toolkit === toolkitFilter);
  }, [events, toolkitFilter]);

  const loadMore = useCallback(async () => {
    if (loadingMore || reachedEnd) return;
    setLoadingMore(true);
    try {
      // Cursor = oldest event currently loaded. We paginate the full stream
      // (no toolkit param) so the keyset stays consistent regardless of the
      // active client-side filter.
      const oldest = events[events.length - 1]?.occurredAt;
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (oldest) params.set('before', oldest);
      const res = await fetch(`/api/triggers/events?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { events: ActivityEvent[] };
      const batch = data.events ?? [];
      const fresh = batch.filter((e) => {
        const key = eventKey(e);
        if (seenKeys.current.has(key)) return false;
        seenKeys.current.add(key);
        return true;
      });
      if (batch.length < PAGE_LIMIT) setReachedEnd(true);
      if (fresh.length > 0) setEvents((prev) => [...prev, ...fresh]);
    } catch {
      // Swallow — the realtor keeps what's already loaded.
    } finally {
      setLoadingMore(false);
    }
  }, [events, loadingMore, reachedEnd]);

  // Pause / resume Chippi's watch on a connection. Reuses the EXISTING route
  // (PATCH /api/integrations/[id] → setPausedForConnection); per-app
  // granularity, optimistic with rollback — same contract as the settings
  // connected-apps panel.
  const handleToggle = useCallback(
    async (connectionId: string, currentlyPaused: boolean) => {
      const target = !currentlyPaused;
      const nextStatus: TriggerStatus = target ? 'paused' : 'active';
      const prevStatus: TriggerStatus = currentlyPaused ? 'paused' : 'active';
      setBusyConnectionId(connectionId);
      // Optimistic flip of every trigger row for this connection.
      setTriggerState((prev) =>
        prev.map((t) => (t.connectionId === connectionId ? { ...t, status: nextStatus } : t)),
      );
      try {
        const res = await fetch(`/api/integrations/${connectionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paused: target }),
        });
        if (!res.ok) {
          setTriggerState((prev) =>
            prev.map((t) =>
              t.connectionId === connectionId ? { ...t, status: prevStatus } : t,
            ),
          );
        }
      } catch {
        setTriggerState((prev) =>
          prev.map((t) =>
            t.connectionId === connectionId ? { ...t, status: prevStatus } : t,
          ),
        );
      } finally {
        setBusyConnectionId(null);
      }
    },
    [],
  );

  const hasConnections = connections.some((c) => c.status === 'active');
  const hasEvents = events.length > 0;

  // ── Empty state: no connected apps ──────────────────────────────────────────
  // Prompt to connect. (Relative href: the page is /s/[slug]/chippi/triggers,
  // so ../../settings resolves to /s/[slug]/settings.)
  if (!hasConnections && !hasEvents) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center space-y-2">
        <p className="text-sm text-foreground">Connect an app to see activity here.</p>
        <p className="text-xs text-muted-foreground">
          Chippi watches your inbox, calendar, CRM and more — and surfaces what matters.
        </p>
        <a
          href="../../settings?tab=connections"
          className="inline-flex items-center h-8 px-3.5 mt-1 rounded-full text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
        >
          Connect apps
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live overlay — lazy, client-only, self-degrading. Renders nothing
          visible; just prepends new events. Safe when realtime is off. */}
      <ActivityLive spaceId={spaceId} onEvent={handleLiveEvent} />

      <FilterChips
        connections={connections}
        active={toolkitFilter}
        onSelect={setToolkitFilter}
      />

      {hasEvents ? (
        <>
          {visibleEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
              <p className="text-xs text-muted-foreground">
                Nothing from {toolkitFilter ? toolkitName(toolkitFilter) : 'this app'} yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {visibleEvents.map((e) => (
                <FeedRow key={eventKey(e)} event={e} />
              ))}
            </ul>
          )}

          {/* Load older — only when not filtering (the cursor paginates the
              full stream) and there may be older rows. */}
          {!toolkitFilter && !reachedEnd && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {loadingMore && <Loader2 size={12} className="animate-spin" />}
                {loadingMore ? 'Loading…' : 'Load older'}
              </button>
            </div>
          )}
        </>
      ) : (
        // Connected apps, but no events captured yet.
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
          <p className="text-sm text-foreground">Chippi is watching.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Events will appear here as they happen across your connected apps.
          </p>
        </div>
      )}

      <ManageSection
        connections={connections}
        triggersByConnection={triggersByConnection}
        onToggle={(id, paused) => void handleToggle(id, paused)}
        busyConnectionId={busyConnectionId}
      />
    </div>
  );
}
