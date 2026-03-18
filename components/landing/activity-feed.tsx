'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { UserPlus, Star, Phone, CalendarCheck, FileCheck } from 'lucide-react';

const activities = [
  { icon: UserPlus, text: 'Jordan Reyes submitted application', time: 'Just now', accent: true },
  { icon: Star, text: 'Lead scored: 92 — Priority: Hot', time: '1m ago', accent: true },
  { icon: Phone, text: 'Follow-up call scheduled with Ava Thompson', time: '8m ago', accent: false },
  { icon: CalendarCheck, text: 'Tour confirmed — 2BR Midtown, Unit 4A', time: '22m ago', accent: false },
  { icon: FileCheck, text: 'Application approved — Nina Patel', time: '1h ago', accent: false },
];

export function ActivityFeed() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm font-bold text-foreground">Activity</p>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Live</span>
        </div>
      </div>

      <div className="space-y-1">
        {activities.map((item, i) => (
          <motion.div
            key={item.text}
            initial={{ opacity: 0, x: -12 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.4, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/40 transition-colors"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              item.accent ? 'bg-primary/10' : 'bg-muted'
            }`}>
              <item.icon size={14} className={item.accent ? 'text-primary' : 'text-muted-foreground'} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground leading-snug">{item.text}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
