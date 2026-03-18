'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const stages = [
  { name: 'New', count: 12, pct: 100 },
  { name: 'Contacted', count: 8, pct: 66 },
  { name: 'Touring', count: 5, pct: 42 },
  { name: 'Applied', count: 3, pct: 25 },
  { name: 'Closed', count: 2, pct: 16 },
];

export function PipelineDiagram() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="rounded-2xl border border-border bg-card p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm font-bold text-foreground">Deal Pipeline</p>
        <p className="text-xs text-muted-foreground">30 active leads</p>
      </div>

      {/* Funnel bars */}
      <div className="space-y-2.5">
        {stages.map((stage, i) => (
          <motion.div
            key={stage.name}
            initial={{ opacity: 0, x: -20 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3"
          >
            <span className="text-xs font-medium text-muted-foreground w-[72px] shrink-0 text-right">
              {stage.name}
            </span>
            <div className="flex-1 h-9 rounded-lg bg-muted/40 overflow-hidden relative">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-lg bg-primary/15"
                initial={{ width: 0 }}
                animate={inView ? { width: `${stage.pct}%` } : {}}
                transition={{ duration: 0.9, delay: 0.15 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              />
              <div className="relative h-full flex items-center justify-between px-3">
                <span className="text-xs font-bold text-foreground">{stage.count}</span>
                <span className="text-[10px] text-muted-foreground">{stage.pct}%</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Conversion summary */}
      <div className="mt-6 pt-4 border-t border-border grid grid-cols-3 gap-4 text-center">
        {[
          { label: 'Conversion', value: '16%' },
          { label: 'Avg. Time', value: '12d' },
          { label: 'This Month', value: '+8' },
        ].map((stat) => (
          <div key={stat.label}>
            <p className="text-lg font-bold text-foreground">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
