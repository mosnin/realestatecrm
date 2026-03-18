'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface Signal {
  label: string;
  value: number; /* 0–100 */
}

interface ScoreRingProps {
  score: number;
  label: string;
  tier: string;
  signals: Signal[];
}

export function ScoreRing({ score, label, tier, signals }: ScoreRingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div ref={ref} className="rounded-2xl border border-border bg-card p-6">
      {/* Ring */}
      <div className="flex items-center gap-6">
        <div className="relative shrink-0">
          <svg width="128" height="128" viewBox="0 0 128 128">
            {/* Background circle */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth="8"
            />
            {/* Progress arc */}
            <motion.circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={inView ? { strokeDashoffset: circumference - progress } : {}}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              transform="rotate(-90 64 64)"
            />
          </svg>
          {/* Score number */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="text-3xl font-black tracking-tight text-foreground"
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              {score}
            </motion.span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Score
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-lg font-bold text-foreground truncate">{label}</p>
          <span className="inline-flex mt-1 pill-badge">{tier}</span>
        </div>
      </div>

      {/* Signal bars */}
      <div className="mt-6 space-y-3">
        {signals.map((sig, i) => (
          <div key={sig.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">{sig.label}</span>
              <span className="text-xs font-bold text-foreground">{sig.value}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={inView ? { width: `${sig.value}%` } : {}}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 + i * 0.1 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
