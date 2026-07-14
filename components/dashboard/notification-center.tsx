'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { SECTION_LABEL } from '@/lib/typography';

interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  createdAt: string;
  priority: 'high' | 'medium' | 'low';
}

export function NotificationCenter({ slug, spaceId }: { slug: string; spaceId?: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?slug=${encodeURIComponent(slug)}`);
      if (res.ok) setNotifications(await res.json());
    } catch {
      // silent
    }
  }, [slug]);

  useEffect(() => {
    loadNotifications();
    // Fallback polling every 5 minutes (realtime handles most updates)
    const interval = setInterval(loadNotifications, 300_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Realtime: refetch notifications when this space's Contact or Tour
  // rows change. The channel name includes spaceId so two tabs of the
  // same workspace each get their own channel (Supabase rejects
  // duplicate channel names on the same client) and the postgres_changes
  // filter is the defense-in-depth belt next to the RLS predicate — if
  // RLS is ever relaxed accidentally, the filter still scopes us.
  useEffect(() => {
    if (!spaceId) return; // No spaceId yet — skip Realtime, polling carries us.
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const channel = supabase
      .channel(`notification-center:${spaceId}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'Contact', filter: `spaceId=eq.${spaceId}` },
        () => { loadNotifications(); },
      )
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'Tour', filter: `spaceId=eq.${spaceId}` },
        () => { loadNotifications(); },
      )
      .on(
        // Durable agent-outcome records (swarm runs, first-touch drafts,
        // workflow sends, work sessions) written by lib/notifications.ts —
        // refetch so the badge reflects them without waiting for the poll.
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'AppNotification', filter: `spaceId=eq.${spaceId}` },
        () => { loadNotifications(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadNotifications, spaceId]);

  // Click a notification → mark it read (persisted) AND navigate to its target.
  // Optimistically remove it so it leaves the unread list and the badge drops
  // immediately; the persisted state keeps it gone on the next fetch.
  function handleOpenNotification(n: Notification) {
    setOpen(false);
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    void fetch(`/api/notifications?slug=${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: n.id, sourceCreatedAt: n.createdAt }),
    }).catch(() => {});
    router.push(n.href);
  }

  // X on a row → dismiss it (persisted) without navigating. Optimistic, but we
  // restore the row if the server rejects so a failed dismiss doesn't silently
  // "stick" and then reappear on the next poll with no explanation.
  function handleDismiss(n: Notification, e: React.MouseEvent) {
    e.stopPropagation();
    const prevList = notifications;
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    const params = new URLSearchParams({
      slug,
      key: n.id,
      sourceCreatedAt: n.createdAt,
    });
    fetch(`/api/notifications?${params.toString()}`, { method: 'DELETE' })
      .then((res) => { if (!res.ok) setNotifications(prevList); })
      .catch(() => setNotifications(prevList));
  }

  function handleMarkAllRead() {
    if (notifications.length === 0) return;
    const prevList = notifications;
    setNotifications([]);
    fetch(`/api/notifications?slug=${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
      .then((res) => { if (!res.ok) setNotifications(prevList); })
      .catch(() => setNotifications(prevList));
  }

  const highCount = notifications.filter((n) => n.priority === 'high').length;
  const totalCount = notifications.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={totalCount > 0 ? `${totalCount} notifications` : 'Notifications'}
          title="Notifications"
          className="relative h-8 w-8 flex items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors data-[state=open]:bg-foreground/[0.045] data-[state=open]:text-foreground"
        >
          <Bell size={14} strokeWidth={1.75} />
          {totalCount > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold leading-none inline-flex items-center justify-center tabular-nums ring-2 ring-background',
                highCount > 0
                  ? 'bg-foreground text-background'
                  : 'bg-foreground/15 text-foreground/70',
              )}
            >
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 sm:w-96 p-1.5 rounded-xl border border-border/70"
      >
        <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
          <p className={SECTION_LABEL}>Notifications</p>
          {totalCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {totalCount === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-sm">Nothing pressing.</p>
              <p className="text-xs mt-0.5">I&apos;m watching the pipeline.</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="group flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-foreground/[0.05]"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenNotification(n)}
                    className="flex flex-1 min-w-0 items-start gap-2.5 text-left active:scale-[0.99] transition-transform duration-150"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium leading-tight text-foreground truncate">
                        {n.title}
                      </span>
                      <span className="block text-[11px] leading-snug mt-0.5 text-muted-foreground/80 truncate">
                        {n.description}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDismiss(n, e)}
                    aria-label="Dismiss notification"
                    className="flex-shrink-0 -mr-0.5 mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all duration-150 hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X size={13} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
