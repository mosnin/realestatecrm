'use client';

import { useEffect, useState } from 'react';
import { PhoneIncoming, Briefcase, CalendarCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { timeAgo } from '@/lib/formatting';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';

interface ActivityItem {
  id: string;
  type: 'lead' | 'deal' | 'tour';
  actor: string;
  action: string;
  entity: string;
  timestamp: string;
}

// Neutral-first (STYLESHEET.md): the activity category reads from a quiet
// glyph, not a decorative color dot. The old emerald/blue/amber dots — blue
// isn't even a palette tone — broke the same neutral-first rule the analytics
// surface is built on. A muted lucide icon keeps the row scannable without
// painting the feed.
const TYPE_ICON: Record<ActivityItem['type'], typeof PhoneIncoming> = {
  lead: PhoneIncoming,
  deal: Briefcase,
  tour: CalendarCheck,
};

export function TeamActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/broker/team-activity', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setActivities(d.activities ?? []))
      .catch((err) => { if (err.name !== 'AbortError') setActivities([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <ul className="divide-y divide-border/60">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-start gap-3 py-3">
            <div className="mt-0.5 h-3.5 w-3.5 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 bg-muted/30 animate-pulse rounded" />
              <div className="h-2.5 w-1/3 bg-muted/20 animate-pulse rounded" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-3">
        Quiet — no team activity yet.
      </p>
    );
  }

  return (
    <motion.ul
      className="divide-y divide-border/60"
      variants={STAGGER_CONTAINER}
      initial="initial"
      animate="enter"
    >
      {activities.map((item) => {
        const Icon = TYPE_ICON[item.type] ?? Briefcase;
        return (
          <motion.li
            key={item.id}
            variants={STAGGER_ITEM}
            className="flex items-start gap-3 py-3"
          >
            <Icon
              size={14}
              className="mt-0.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm leading-snug">
              <span className="font-medium">{item.actor}</span>{' '}
              <span className="text-muted-foreground">{item.action}</span>{' '}
              <span className="font-medium">{item.entity}</span>
              <span className="text-muted-foreground">
                {' '}&mdash; {timeAgo(item.timestamp)}
              </span>
            </p>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
