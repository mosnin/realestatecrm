'use client';

/**
 * DispatchIslandDock — a floating, morphing status dock for the realtor's
 * dispatch console (/chippi/brief).
 *
 * Two cult-ui DynamicIsland widgets sit bottom-center, à la the iPhone
 * Dynamic Island: each shows a glanceable COLLAPSED summary and morphs to a
 * detailed EXPANDED state on tap.
 *
 *   ┌──────────────────────┐        ┌────────────────────────────┐
 *   │ ● Chippi · 6 today    │  tap → │ What I did                 │
 *   └──────────────────────┘        │ ───────────────────────    │
 *                                    │ I sent an SMS to Dana …    │
 *                                    │ I drafted a message for …  │
 *                                    └────────────────────────────┘
 *
 *   ┌──────────┐                     ┌────────────────────────────┐
 *   │ 🔔 3      │           tap   →   │ Notifications              │
 *   └──────────┘                     │ New lead · Dana Walters    │
 *                                    │ Tour today · 4pm …         │
 *                                    └────────────────────────────┘
 *
 * Both islands reuse the SAME live data sources the existing surfaces use:
 *   - Activity   → GET /api/agent/activity   (mirrors components/chippi/what-i-did.tsx)
 *   - Notifications → GET /api/notifications  (mirrors components/dashboard/notification-center.tsx)
 * and the same per-row presentation logic, so nothing about the underlying
 * data or actions changes — this is an additive, glanceable lens on top.
 *
 * ACCESSIBILITY / MOTION
 *   The shared DynamicIsland primitive (components/ui/dynamic-island.tsx)
 *   spring-morphs its width/height. We honour `prefers-reduced-motion`: when
 *   the user asks for reduced motion we DON'T mount the morphing island at
 *   all — we render a plain expandable panel with the identical content and
 *   the same expand/collapse semantics (no size spring, no blur/scale). Either
 *   way the trigger is a real <button> with aria-expanded, and Escape collapses.
 *   We never modify the shared primitive to achieve this.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import {
  Activity,
  Bell,
  Brain,
  CheckCircle2,
  ChevronRight,
  Mail,
  MessageSquare,
  StickyNote,
  X,
  PhoneIncoming,
  CalendarDays,
  Clock,
  Users,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DynamicContainer,
  DynamicIsland,
  DynamicIslandProvider,
  DynamicIslandSizePresets,
  SIZE_PRESETS,
  useDynamicIslandSize,
  type SizePresets,
} from '@/components/ui/dynamic-island';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

// ── Shared types (match the live API payloads) ───────────────────────────────

interface ActivityEntry {
  id: string;
  actionType: string;
  reasoning: string | null;
  createdAt: string;
  Contact: { id: string; name: string } | null;
  Deal: { id: string; title: string } | null;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  createdAt: string;
  priority: 'high' | 'medium' | 'low';
}

// ── Activity row meta (kept in sync with what-i-did.tsx) ─────────────────────

const ACTION_META: Record<string, { verb: string; icon: LucideIcon }> = {
  send_sms: { verb: 'sent an SMS to', icon: MessageSquare },
  send_email: { verb: 'sent an email to', icon: Mail },
  log_note: { verb: 'logged a note about', icon: StickyNote },
  create_draft_message: { verb: 'drafted a message for', icon: MessageSquare },
  message_drafted: { verb: 'drafted a message for', icon: MessageSquare },
  packet_drafted: { verb: 'drafted a property packet for', icon: MessageSquare },
  set_contact_follow_up: { verb: 'scheduled a follow-up with', icon: Bell },
  set_deal_follow_up: { verb: 'scheduled a deal follow-up on', icon: Bell },
  log_agent_observation: { verb: 'noted something about', icon: Brain },
  log_observation: { verb: 'noted something about', icon: Brain },
  store_memory: { verb: 'remembered something about', icon: Brain },
  update_lead_score: { verb: 'updated the score for', icon: Activity },
  update_deal_probability: { verb: 'updated the probability on', icon: Activity },
  create_follow_up_reminder: { verb: 'set a reminder for', icon: Bell },
  task_completed: { verb: 'marked a task done for', icon: CheckCircle2 },
};

function metaFor(actionType: string): { verb: string; icon: LucideIcon } {
  const hit = ACTION_META[actionType];
  if (hit) return hit;
  const phrase = actionType.replace(/_/g, ' ').trim();
  return {
    verb: phrase ? `ran ${phrase} on` : 'logged an action for',
    icon: CheckCircle2,
  };
}

const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
  new_lead: PhoneIncoming,
  upcoming_tour: CalendarDays,
  follow_up_due: Clock,
  waitlist: Users,
  tour_needs_action: Briefcase,
};

// Local time-of-day boundary: "today" = since local midnight. Mirrors how the
// dispatch console frames the day; keeps the collapsed count honest.
function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return d.getTime() >= start.getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────────────────────

export function DispatchIslandDock({ slug }: { slug: string }) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Activity — same call shape as components/chippi/what-i-did.tsx.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/activity?outcome=completed&limit=10', {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as ActivityEntry[];
          setActivity(Array.isArray(data) ? data : []);
        }
      } catch {
        // non-critical glance surface
      } finally {
        setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, []);

  // Notifications — same call shape as components/dashboard/notification-center.tsx.
  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = (await res.json()) as Notification[];
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent — polling / next mount recovers
    }
  }, [slug]);

  useEffect(() => {
    void loadNotifications();
    const interval = setInterval(loadNotifications, 300_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Dismiss a notification: optimistic removal + persisted DELETE, matching
  // the notification-center contract so behaviour stays identical.
  const dismissNotification = useCallback(
    (n: Notification) => {
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      const params = new URLSearchParams({ slug, key: n.id, sourceCreatedAt: n.createdAt });
      void fetch(`/api/notifications?${params.toString()}`, { method: 'DELETE' }).catch(() => {});
    },
    [slug],
  );

  // Mark a notification read when its link is followed (persisted), mirroring
  // notification-center's handleOpenNotification side-effect.
  const markRead = useCallback(
    (n: Notification) => {
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      void fetch(`/api/notifications?slug=${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: n.id, sourceCreatedAt: n.createdAt }),
      }).catch(() => {});
    },
    [slug],
  );

  const todayCount = activity.filter((a) => isToday(a.createdAt)).length;
  const unread = notifications.length;

  // Nothing to glance at yet → don't float an empty dock over the console.
  const showActivity = loaded && activity.length > 0;
  const showNotifications = unread > 0;
  if (!showActivity && !showNotifications) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
      aria-label="Dispatch status"
    >
      <SquircleClipDefs />
      <div className="pointer-events-auto flex flex-wrap items-end justify-center gap-3">
        {showActivity && (
          <ActivityIsland slug={slug} entries={activity} todayCount={todayCount} />
        )}
        {showNotifications && (
          <NotificationsIsland
            entries={notifications}
            onOpen={markRead}
            onDismiss={dismissNotification}
          />
        )}
      </div>
    </div>
  );
}

/**
 * SquircleClipDefs — companion SVG the shared DynamicIsland primitive expects
 * but doesn't ship with.
 *
 * On every size transition the primitive sets `clipPath: url(#squircle-<size>)`.
 * cult-ui's demo provides those <clipPath> defs separately; this app never
 * added them, so the reference would dangle — and a dangling clip-path makes
 * WebKit/Blink hide the element entirely (Firefox keeps it), which would make
 * the island vanish right after it finishes morphing.
 *
 * We register one clipPath per preset id, each a full-box path in
 * objectBoundingBox units (covers 0,0→1,1), so the clip never removes any
 * pixels. The island's own animated `border-radius` still rounds the corners —
 * we get the intended look with zero risk of the content disappearing, and
 * without touching the shared primitive.
 */
function SquircleClipDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      className="pointer-events-none absolute"
      style={{ position: 'absolute', width: 0, height: 0 }}
    >
      <defs>
        {Object.keys(DynamicIslandSizePresets).map((size) => (
          <clipPath key={size} id={`squircle-${size}`} clipPathUnits="objectBoundingBox">
            <path d="M0,0 H1 V1 H0 Z" />
          </clipPath>
        ))}
      </defs>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity island — the signature "live agent status" Dynamic Island
// ─────────────────────────────────────────────────────────────────────────────

function ActivityIsland({
  slug,
  entries,
  todayCount,
}: {
  slug: string;
  entries: ActivityEntry[];
  todayCount: number;
}) {
  const reduce = useReducedMotion();
  const summary = todayCount > 0 ? `${todayCount} today` : 'On the case';

  // Reduced-motion path: a plain expandable panel, no morphing island.
  if (reduce) {
    return (
      <StaticPanel
        ariaLabel="Chippi activity"
        collapsed={
          <span className="inline-flex items-center gap-2">
            <LiveDot reduced />
            <span className="font-medium text-white">Chippi</span>
            <span className="text-white/55">·</span>
            <span className="text-white/80 tabular-nums">{summary}</span>
          </span>
        }
      >
        <ActivityDetail slug={slug} entries={entries} />
      </StaticPanel>
    );
  }

  return (
    <DynamicIslandProvider initialSize={SIZE_PRESETS.COMPACT}>
      <ActivityIslandInner slug={slug} entries={entries} summary={summary} />
    </DynamicIslandProvider>
  );
}

function ActivityIslandInner({
  slug,
  entries,
  summary,
}: {
  slug: string;
  entries: ActivityEntry[];
  summary: string;
}) {
  const { expanded, collapse, expand } = useIslandToggle(
    SIZE_PRESETS.COMPACT,
    SIZE_PRESETS.TALL,
  );
  useEscapeToCollapse(expanded, collapse);

  return (
    <IslandFrame
      expanded={expanded}
      onToggle={expanded ? collapse : expand}
      ariaLabel="Chippi activity"
      id="dispatch-activity-island"
    >
      {expanded ? (
        <DynamicContainer className="flex h-full w-full flex-col px-1 py-1 text-left">
          <DockHeader title="What I did" onCollapse={collapse} />
          <ActivityDetail slug={slug} entries={entries} />
        </DynamicContainer>
      ) : (
        <DynamicContainer className="flex h-full w-full items-center gap-2 px-4 text-[13px] text-white">
          <LiveDot />
          <span className="font-medium">Chippi</span>
          <span className="text-white/55">·</span>
          <span className="text-white/80 tabular-nums">{summary}</span>
        </DynamicContainer>
      )}
    </IslandFrame>
  );
}

function ActivityDetail({ slug, entries }: { slug: string; entries: ActivityEntry[] }) {
  return (
    <ul className="mt-1 flex-1 divide-y divide-white/10 overflow-y-auto pr-0.5">
      {entries.slice(0, 6).map((entry) => {
        const { verb, icon: Icon } = metaFor(entry.actionType);
        const targetName = entry.Contact?.name ?? entry.Deal?.title ?? null;
        const targetHref = entry.Contact
          ? `/s/${slug}/contacts/${entry.Contact.id}`
          : entry.Deal
            ? `/s/${slug}/deals/${entry.Deal.id}`
            : null;

        const inner = (
          <>
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-400/15">
              <Icon size={12} className="text-emerald-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-snug text-white">
                I {verb}{' '}
                {targetName ? (
                  <span className="font-medium">{targetName}</span>
                ) : (
                  <span className="italic text-white/60">a contact</span>
                )}
              </span>
              {entry.reasoning && (
                <span className="mt-0.5 block truncate text-[11px] italic text-white/45">
                  {entry.reasoning}
                </span>
              )}
            </span>
            <span className="flex-shrink-0 text-[10px] tabular-nums text-white/45">
              {timeAgo(entry.createdAt)}
            </span>
            {targetHref && (
              <ChevronRight size={12} className="ml-0.5 flex-shrink-0 text-white/30" />
            )}
          </>
        );

        return (
          <li key={entry.id}>
            {targetHref ? (
              <Link
                href={targetHref}
                className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-2 transition-colors hover:bg-white/[0.06]"
              >
                {inner}
              </Link>
            ) : (
              <span className="flex items-center gap-2.5 px-1 py-2">{inner}</span>
            )}
          </li>
        );
      })}
      <li className="pt-1.5">
        <Link
          href={`/s/${slug}/chippi/activity`}
          className="block py-1 text-center text-[11px] font-medium text-white/55 transition-colors hover:text-white"
        >
          See all activity &rarr;
        </Link>
      </li>
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications island
// ─────────────────────────────────────────────────────────────────────────────

function NotificationsIsland({
  entries,
  onOpen,
  onDismiss,
}: {
  entries: Notification[];
  onOpen: (n: Notification) => void;
  onDismiss: (n: Notification) => void;
}) {
  const reduce = useReducedMotion();
  const count = entries.length;
  const hasHigh = entries.some((n) => n.priority === 'high');

  if (reduce) {
    return (
      <StaticPanel
        ariaLabel={`${count} notifications`}
        collapsed={
          <span className="inline-flex items-center gap-2">
            <Bell size={14} className={hasHigh ? 'text-orange-300' : 'text-white/80'} />
            <span className="tabular-nums text-white">{count > 9 ? '9+' : count}</span>
          </span>
        }
      >
        <NotificationDetail entries={entries} onOpen={onOpen} onDismiss={onDismiss} />
      </StaticPanel>
    );
  }

  return (
    <DynamicIslandProvider initialSize={SIZE_PRESETS.COMPACT}>
      <NotificationsIslandInner
        entries={entries}
        count={count}
        hasHigh={hasHigh}
        onOpen={onOpen}
        onDismiss={onDismiss}
      />
    </DynamicIslandProvider>
  );
}

function NotificationsIslandInner({
  entries,
  count,
  hasHigh,
  onOpen,
  onDismiss,
}: {
  entries: Notification[];
  count: number;
  hasHigh: boolean;
  onOpen: (n: Notification) => void;
  onDismiss: (n: Notification) => void;
}) {
  const { expanded, collapse, expand } = useIslandToggle(
    SIZE_PRESETS.COMPACT,
    SIZE_PRESETS.TALL,
  );
  useEscapeToCollapse(expanded, collapse);

  // Collapse automatically once the list empties (all opened / dismissed) so a
  // hollow island never lingers expanded.
  useEffect(() => {
    if (expanded && count === 0) collapse();
  }, [expanded, count, collapse]);

  return (
    <IslandFrame
      expanded={expanded}
      onToggle={expanded ? collapse : expand}
      ariaLabel={`${count} notifications`}
      id="dispatch-notifications-island"
    >
      {expanded ? (
        <DynamicContainer className="flex h-full w-full flex-col px-1 py-1 text-left">
          <DockHeader title="Notifications" onCollapse={collapse} />
          <NotificationDetail entries={entries} onOpen={onOpen} onDismiss={onDismiss} />
        </DynamicContainer>
      ) : (
        <DynamicContainer className="flex h-full w-full items-center justify-center gap-2 px-4 text-[13px] text-white">
          <Bell size={14} className={hasHigh ? 'text-orange-300' : 'text-white/80'} />
          <span className="font-medium tabular-nums">{count > 9 ? '9+' : count}</span>
          <span className="text-white/55">{count === 1 ? 'alert' : 'alerts'}</span>
        </DynamicContainer>
      )}
    </IslandFrame>
  );
}

function NotificationDetail({
  entries,
  onOpen,
  onDismiss,
}: {
  entries: Notification[];
  onOpen: (n: Notification) => void;
  onDismiss: (n: Notification) => void;
}) {
  return (
    <ul className="mt-1 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
      {entries.map((n) => {
        const Icon = NOTIFICATION_ICONS[n.type] ?? AlertCircle;
        return (
          <li
            key={n.id}
            className="group flex items-start gap-2.5 rounded-lg px-1 py-2 transition-colors hover:bg-white/[0.06]"
          >
            <Link
              href={n.href}
              onClick={() => onOpen(n)}
              className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg',
                  n.priority === 'high'
                    ? 'bg-red-400/15'
                    : n.priority === 'medium'
                      ? 'bg-amber-400/15'
                      : 'bg-white/[0.08]',
                )}
              >
                <Icon
                  size={13}
                  className={cn(
                    n.priority === 'high'
                      ? 'text-red-300'
                      : n.priority === 'medium'
                        ? 'text-amber-300'
                        : 'text-white/70',
                  )}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight text-white">
                  {n.title}
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-snug text-white/55">
                  {n.description}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => onDismiss(n)}
              aria-label="Dismiss notification"
              className="-mr-0.5 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-white/35 opacity-0 transition-all hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X size={13} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared chrome
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IslandFrame — the morphing DynamicIsland plus a full-bleed toggle button.
 *
 * The shared primitive renders the dark squircle and runs the size spring; we
 * layer a clickable surface inside that toggles expand/collapse. The button is
 * the collapsed-state affordance (the whole island taps to open); when
 * expanded the header carries an explicit close control and the body becomes
 * interactive (links/dismiss), so the wrapper only handles open.
 */
function IslandFrame({
  children,
  expanded,
  onToggle,
  ariaLabel,
  id,
}: {
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  ariaLabel: string;
  id: string;
}) {
  return (
    <DynamicIsland id={id}>
      {expanded ? (
        children
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={`${ariaLabel} — expand`}
          className="flex h-full w-full items-center justify-center rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          {children}
        </button>
      )}
    </DynamicIsland>
  );
}

function DockHeader({ title, onCollapse }: { title: string; onCollapse: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-1 pb-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
        {title}
      </span>
      <button
        type="button"
        onClick={onCollapse}
        aria-label="Collapse"
        aria-expanded
        className="flex h-6 w-6 items-center justify-center rounded-md text-white/45 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <X size={13} />
      </button>
    </div>
  );
}

/** A small live-status dot. Pulses unless reduced motion is requested. */
function LiveDot({ reduced = false }: { reduced?: boolean }) {
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0">
      {!reduced && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

/**
 * StaticPanel — the reduced-motion fallback. Same dark-island look and the
 * same collapsed↔expanded content, but a plain CSS show/hide with no size
 * spring, blur, or scale. Keeps the feature usable and on-brand without any
 * vestibular motion. Built without the DynamicIsland primitive so no spring
 * animation runs at all.
 */
function StaticPanel({
  collapsed,
  children,
  ariaLabel,
}: {
  collapsed: React.ReactNode;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const collapse = useCallback(() => setOpen(false), []);
  useEscapeToCollapse(open, collapse);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-label={`${ariaLabel} — expand`}
        className="flex h-11 items-center rounded-full border border-white/10 bg-black px-4 text-[13px] text-white shadow-md outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        {collapsed}
      </button>
    );
  }

  return (
    <div className="flex max-h-[60vh] w-[min(20rem,calc(100vw-2rem))] flex-col rounded-3xl border border-white/10 bg-black p-2 text-left shadow-xl">
      {children}
    </div>
  );
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * useIslandToggle — reliable two-state expand/collapse for a DynamicIsland.
 *
 * The provider's guarded `setSize` skips a transition whenever the target
 * equals `previousSize`, which is exactly what happens on the SECOND tap of a
 * two-state toggle (COMPACT→EXPANDED leaves previousSize=COMPACT, so the
 * EXPANDED→COMPACT collapse would be ignored). We instead drive the reducer
 * via the context's `dispatch` — a first-class part of the DynamicIsland API —
 * so a toggle is always honoured. We still no-op when already at the target to
 * avoid redundant dispatches.
 */
function useIslandToggle(collapsedSize: SizePresets, expandedSize: SizePresets) {
  const { state, dispatch } = useDynamicIslandSize();
  const expanded = state.size === expandedSize;

  const setSize = useCallback(
    (newSize: SizePresets) => {
      if (state.size !== newSize) dispatch({ type: 'SET_SIZE', newSize });
    },
    [state.size, dispatch],
  );
  const collapse = useCallback(() => setSize(collapsedSize), [setSize, collapsedSize]);
  const expand = useCallback(() => setSize(expandedSize), [setSize, expandedSize]);

  return { expanded, collapse, expand };
}

/** Escape collapses an expanded island. No-op while collapsed. */
function useEscapeToCollapse(active: boolean, collapse: () => void) {
  const collapseRef = useRef(collapse);
  collapseRef.current = collapse;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
