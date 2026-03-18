'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link2, FileText, UserCheck, ArrowRight } from 'lucide-react';

const steps = [
  {
    icon: Link2,
    title: 'Share your link',
    detail: 'chippi.io/apply/downtown',
    items: ['Bio', 'Email sig', 'Listing reply'],
  },
  {
    icon: FileText,
    title: 'Renter fills form',
    detail: 'Structured intake in < 2 min',
    items: ['Budget: $2,800', 'Move-in: Aug 1', 'Area: Midtown'],
  },
  {
    icon: UserCheck,
    title: 'Lead captured & scored',
    detail: 'Score: 92 · Priority: Hot',
    items: ['Auto-scored', 'Qualified', 'Ready to act'],
  },
];

export function IntakeFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="rounded-2xl border border-border bg-card p-6">
      <p className="text-sm font-bold text-foreground mb-6">How intake works</p>

      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={step.title}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-4"
            >
              {/* Step indicator */}
              <div className="flex flex-col items-center shrink-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <step.icon size={18} className="text-primary" />
                </div>
                {i < steps.length - 1 && (
                  <motion.div
                    className="w-px flex-1 bg-border mt-2 min-h-[16px]"
                    initial={{ scaleY: 0 }}
                    animate={inView ? { scaleY: 1 } : {}}
                    transition={{ duration: 0.4, delay: 0.3 + i * 0.15 }}
                    style={{ transformOrigin: 'top' }}
                  />
                )}
              </div>

              {/* Content */}
              <div className="pb-2 min-w-0">
                <p className="text-sm font-bold text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {step.items.map((item) => (
                    <span
                      key={item}
                      className="inline-flex px-2.5 py-1 rounded-md bg-muted text-[11px] font-medium text-muted-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  );
}
