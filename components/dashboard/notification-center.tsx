'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Bell,
  PhoneIncoming,
  CalendarDays,
  Clock,
  Users,
  AlertCircle,
  Briefcase,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  description: string;
  href: string;
  createdAt: string;
  priority: 'high' | 'medium' | 'low';
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  new_lead: PhoneIncoming,
  upcoming_tour: CalendarDays,
  follow_up_due: Clock,
  waitlist: Users,
  tour_needs_action: Briefcase,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-muted-foreground',
};

export function NotificationCenter({ slug }: { slug: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

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
    const interval = setInterval(loadNotifications, 60_000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  const highCount = notifications.filter((n) => n.priority === 'high').length;
  const totalCount = notifications.length;

  const dropdown = open && mounted ? createPortal(
    <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)}>
      <div
        className="absolute right-4 md:right-8 top-12 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold">Notifications</span>
          <button onClick={() => setOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Bell size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">All caught up!</p>
              <p className="text-xs mt-0.5">No pending items right now.</p>
            </div>
          ) : (
            <div className="py-1">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] || AlertCircle;
                return (
                  <button
                    key={n.id}
                    onClick={() => navigate(n.href)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                  >
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                      n.priority === 'high' ? 'bg-red-100 dark:bg-red-900/20' :
                      n.priority === 'medium' ? 'bg-amber-100 dark:bg-amber-900/20' :
                      'bg-muted'
                    )}>
                      <Icon size={14} className={PRIORITY_COLORS[n.priority]} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{n.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="relative h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        title="Notifications"
      >
        <Bell size={15} />
        {totalCount > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full text-[10px] font-bold flex items-center justify-center px-1',
            highCount > 0
              ? 'bg-red-500 text-white'
              : 'bg-muted-foreground/20 text-muted-foreground'
          )}>
            {totalCount}
          </span>
        )}
      </button>
      {dropdown}
    </>
  );
}
