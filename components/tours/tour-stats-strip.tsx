'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { STAT_NUMBER_COMPACT, TITLE_FONT, CAPTION } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { AnimatedNumber } from '@/components/motion/animated-number';

interface TourStats {
  toursThisWeek: number;
  conversionRate: number;
  noShowRate: number;
  avgConfirmTime: string;
}

interface TourStatsStripProps {
  tours: Array<{
    startsAt: string;
    status: string;
    sourceDealId: string | null;
    createdAt?: string;
  }>;
}

function computeStats(tours: TourStatsStripProps['tours']): TourStats {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const toursThisWeek = tours.filter((t) => {
    const d = new Date(t.startsAt);
    return d >= weekStart && d < weekEnd && t.status !== 'cancelled';
  }).length;

  const completed = tours.filter((t) => t.status === 'completed');
  const withDeals = completed.filter((t) => t.sourceDealId);
  const conversionRate = completed.length > 0 ? Math.round((withDeals.length / completed.length) * 100) : 0;

  const past = tours.filter((t) => new Date(t.startsAt) < now && t.status !== 'cancelled');
  const noShows = tours.filter((t) => t.status === 'no_show');
  const noShowRate = past.length > 0 ? Math.round((noShows.length / past.length) * 100) : 0;

  // Average time from creation to confirmation (rough proxy)
  const confirmed = tours.filter((t) => ['confirmed', 'completed'].includes(t.status));
  let avgConfirmTime = '—';
  if (confirmed.length > 0) {
    // Use time until tour as proxy
    const times = confirmed
      .map((t) => {
        const tourDate = new Date(t.startsAt);
        const created = t.createdAt ? new Date(t.createdAt) : null;
        if (!created) return null;
        return tourDate.getTime() - created.getTime();
      })
      .filter((t): t is number => t != null && t > 0);
    if (times.length > 0) {
      const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
      const avgDays = Math.round(avgMs / (1000 * 60 * 60 * 24));
      avgConfirmTime = avgDays <= 1 ? 'Same day' : `${avgDays}d avg`;
    }
  }

  return { toursThisWeek, conversionRate, noShowRate, avgConfirmTime };
}

export function TourStatsStrip({ tours }: TourStatsStripProps) {
  const reduced = useReducedMotion();
  const stats = computeStats(tours);

  const items: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: 'This Week',
      value: <AnimatedNumber value={stats.toursThisWeek} />,
    },
    {
      label: 'Conversion',
      value: <AnimatedNumber value={stats.conversionRate} format={(n) => `${Math.round(n)}%`} />,
    },
    {
      label: 'No-Show',
      value: <AnimatedNumber value={stats.noShowRate} format={(n) => `${Math.round(n)}%`} />,
    },
    { label: 'Lead Time', value: stats.avgConfirmTime },
  ];

  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      variants={reduced ? undefined : { animate: { transition: { staggerChildren: 0.06 } } }}
      initial={reduced ? false : 'initial'}
      animate="animate"
    >
      {items.map((item) => (
        <motion.div
          key={item.label}
          variants={
            reduced
              ? undefined
              : {
                  initial: { opacity: 0, y: 8 },
                  animate: { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } },
                }
          }
          // A whisper of lift on hover — the card reads as a live instrument,
          // not static chrome. Hairline brightens to register the focus.
          className="group flex flex-col items-start gap-1 rounded-xl border border-border/70 bg-background p-5 transition-colors duration-200 hover:border-border hover:bg-foreground/[0.015]"
        >
          <p
            className={`${STAT_NUMBER_COMPACT} leading-none`}
            style={TITLE_FONT}
          >
            {item.value}
          </p>
          <p className={CAPTION}>{item.label}</p>
        </motion.div>
      ))}
    </motion.div>
  );
}
