'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { Info, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion';
import { prefersReducedMotion } from '@/lib/motion/gsap';
import { Marquee, MarqueeContent, MarqueeFade, MarqueeItem } from '@/components/ui/marquee';

type Announcement = {
  id: string;
  title: string | null;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  linkUrl: string | null;
  linkLabel: string | null;
  dismissible: boolean;
};

const STYLES: Record<Announcement['severity'], { strip: string; icon: React.ElementType; iconColor: string }> = {
  info: {
    strip: 'bg-muted border-border text-foreground',
    icon: Info,
    iconColor: 'text-muted-foreground',
  },
  warning: {
    strip: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  critical: {
    strip: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-200',
    icon: AlertCircle,
    iconColor: 'text-red-600 dark:text-red-400',
  },
};

// A single announcement only earns a marquee if it's actually too long to
// read comfortably as a static line — short single notices ("Maintenance
// tonight") should never scroll.
const LONG_MESSAGE_THRESHOLD = 64;

function isLongAnnouncement(a: Announcement): boolean {
  const length = (a.title?.length ?? 0) + a.message.length + (a.linkLabel?.length ?? 0);
  return length > LONG_MESSAGE_THRESHOLD;
}

export function PlatformBanner() {
  const { isSignedIn, isLoaded } = useUser();
  const [items, setItems] = useState<Announcement[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    fetch('/api/platform/announcements')
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.announcements)) {
          setItems(data.announcements);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  function handleDismiss(id: string) {
    // Optimistic removal
    setItems((prev) => prev.filter((a) => a.id !== id));
    fetch('/api/platform/announcements/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ announcementId: id }),
    }).catch(() => {});
  }

  if (!isSignedIn || items.length === 0) return null;

  // Multiple announcements read better as one seamless ticker than as a
  // stack of stripes eating vertical space; a single long message also gets
  // the marquee treatment so it never clips. Reduced-motion users always get
  // the static, fully-readable stack instead.
  // Only marquee when there's genuinely more than a glance's worth: 3+ notices,
  // or any notice too long to sit still. Two short notices stack statically —
  // a ticker for a couple of words reads as showing off (Apple-restraint).
  const useMarquee = !reducedMotion && (items.length >= 3 || items.some(isLongAnnouncement));

  return (
    <Reveal variant="rise" duration={0.5} start="top 99%">
      <div data-platform-banner className="sticky top-0 z-[60] flex flex-col">
        {useMarquee ? (
          <Marquee className="w-full border-b border-border bg-muted">
            <MarqueeFade side="left" className="w-10 from-muted" />
            <MarqueeFade side="right" className="w-10 from-muted" />
            <MarqueeContent autoFill pauseOnHover speed={36} className="py-2">
              {items.map((a) => {
                const s = STYLES[a.severity];
                const Icon = s.icon;
                return (
                  <MarqueeItem
                    key={a.id}
                    className={cn(
                      'mx-2 flex flex-shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap',
                      s.strip,
                    )}
                  >
                    <Icon size={14} className={cn('flex-shrink-0', s.iconColor)} />
                    {a.title && <span className="font-semibold">{a.title}</span>}
                    <span>{a.message}</span>
                    {a.linkUrl && (
                      <Link
                        href={a.linkUrl}
                        className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:opacity-80"
                      >
                        {a.linkLabel || 'Learn more'}
                      </Link>
                    )}
                    {a.dismissible && (
                      <button
                        type="button"
                        onClick={() => handleDismiss(a.id)}
                        className="flex-shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
                        aria-label="Dismiss announcement"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </MarqueeItem>
                );
              })}
            </MarqueeContent>
          </Marquee>
        ) : (
          items.map((a) => {
            const s = STYLES[a.severity];
            const Icon = s.icon;
            return (
              <div
                key={a.id}
                className={cn('w-full border-b px-4 py-2.5 flex items-start gap-3', s.strip)}
                role="status"
              >
                <Icon size={16} className={cn('flex-shrink-0 mt-0.5', s.iconColor)} />
                <div className="flex-1 min-w-0 text-sm">
                  {a.title && <span className="font-semibold mr-1.5">{a.title}</span>}
                  <span>{a.message}</span>
                  {a.linkUrl && (
                    <Link
                      href={a.linkUrl}
                      className="ml-2 inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:opacity-80"
                    >
                      {a.linkLabel || 'Learn more'}
                    </Link>
                  )}
                </div>
                {a.dismissible && (
                  <button
                    type="button"
                    onClick={() => handleDismiss(a.id)}
                    className="flex-shrink-0 -mr-1 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    aria-label="Dismiss announcement"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </Reveal>
  );
}
