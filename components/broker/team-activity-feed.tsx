'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { timeAgo } from '@/lib/formatting';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';
import { BROKER_DIVIDED_LIST, BROKER_ROW } from '@/components/broker/premium';

interface ActivityItem {
  id: string;
  type: 'lead' | 'deal' | 'tour';
  actor: string;
  action: string;
  entity: string;
  timestamp: string;
}

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
  // geometry (two text lines) so the feed doesn't reflow when the data lands.
  if (loading) {
    return (
      <ul className={BROKER_DIVIDED_LIST} aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className={BROKER_ROW}>
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
      className={BROKER_DIVIDED_LIST}
      variants={STAGGER_CONTAINER}
      initial={reduce ? false : 'initial'}
      animate="enter"
    >
      {activities.map((item) => (
        <motion.li
          key={item.id}
          variants={reduce ? undefined : STAGGER_ITEM}
          className={BROKER_ROW}
        >
          <p className="text-sm leading-snug">
            <span className="font-medium">{item.actor}</span>{' '}
            <span className="text-muted-foreground">{item.action}</span>{' '}
            <span className="font-medium">{item.entity}</span>
            <span className="text-muted-foreground">
              {' '}&mdash; {timeAgo(item.timestamp)}
            </span>
          </p>
        </motion.li>
      ))}
    </motion.ul>
  );
}
