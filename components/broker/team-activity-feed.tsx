'use client';

import { useEffect, useState } from 'react';
import { PhoneIncoming, Briefcase, CalendarCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
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
  const reduce = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/broker/team-activity', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setActivities(d.activities ?? []))
      .catch((err) => { if (err.name !== 'AbortError') setActivities([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  // Loading: a calm hairline-divided skeleton that mirrors the real row
  // geometry (icon chip + two text lines) so the feed doesn't reflow when the
  // data lands. The chip matches the resting icon-chip below.
  if (loading) {
    return (
      <ul className="divide-y divide-border/60" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-start gap-3 py-3">
            <div className="h-7 w-7 shrink-0 rounded-full bg-muted/60 animate-pulse" />
            <div className="flex-1 space-y-1.5 pt-1">
              <div
                className="h-3 bg-muted/40 animate-pulse rounded"
                style={{ width: `${72 - i * 8}%` }}
              />
              <div className="h-2.5 w-1/4 bg-muted/25 animate-pulse rounded" />
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
      initial={reduce ? false : 'initial'}
      animate="enter"
    >
      {activities.map((item) => {
        const Icon = TYPE_ICON[item.type] ?? Briefcase;
        return (
          <motion.li
            key={item.id}
            variants={reduce ? undefined : STAGGER_ITEM}
            className="group/act flex items-center gap-3 py-3"
          >
            {/* The category glyph rides in a quiet chip that warms on hover —
                a faint affordance that the row is alive, staying neutral-first
                (no decorative color) per the surface's own rule. */}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground transition-colors group-hover/act:bg-foreground/[0.06] group-hover/act:text-foreground">
              <Icon size={13} aria-hidden />
            </span>
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
