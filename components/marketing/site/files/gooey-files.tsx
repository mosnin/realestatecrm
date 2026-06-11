'use client';

/**
 * GooeyFiles — the "every file in one place" showcase. The source gooey-tab
 * demo, recolored to the calm system (muted blob instead of #efefef, brand
 * for the active label) and filled with the documents a realtor actually
 * keeps. The SVG goo filter merges the sliding active pill into the panel so
 * the categories feel like one liquid surface. Reduced motion still works —
 * the tab just snaps instead of morphing.
 */

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const TABS = [
  {
    title: 'Contracts',
    files: ['Listing agreement — 14 Oak St.pdf', 'Buyer rep — Maya Patel.pdf', 'Counteroffer — 88 Pine Ave.pdf', 'Closing disclosure — 5 Birch Ln.pdf'],
  },
  {
    title: 'Listings',
    files: ['Front exterior — 220 Marina.jpg', 'MLS sheet — 14 Oak St.pdf', 'Floor plan — 31 Harbor Way.png', 'Just-listed flyer — 5 Birch.pdf'],
  },
  {
    title: 'Clients',
    files: ['Pre-approval — Tom Reyes.pdf', 'ID verification — Maya Patel.pdf', 'Wishlist — Dana Lee.md', 'Referral note — Sara Voss.pdf'],
  },
  {
    title: 'Marketing',
    files: ['Open-house post — Saturday.png', 'Email — November market.pdf', 'Story — Just sold.mp4', 'Postcard — farm area.pdf'],
  },
];

function GooeyFilter({ id, strength = 12 }: { id: string; strength?: number }) {
  return (
    <svg className="absolute hidden" aria-hidden>
      <defs>
        <filter id={id}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={strength} result="blur" />
          <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

export function GooeyFiles() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <GooeyFilter id="gooey-files" strength={12} />

      {/* Filtered layer: the sliding pill + the panel merge into one blob */}
      <div className="absolute inset-0" style={{ filter: 'url(#gooey-files)' }}>
        <div className="flex w-full">
          {TABS.map((_, i) => (
            <div key={i} className="relative h-11 flex-1">
              {active === i && (
                <motion.div
                  layoutId="gooey-file-tab"
                  className="absolute inset-0 bg-muted"
                  transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.4 }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="h-[260px] w-full bg-muted" />
      </div>

      {/* Tab labels (crisp, above the filter) */}
      <div className="relative flex w-full">
        {TABS.map((tab, i) => (
          <button
            key={tab.title}
            type="button"
            onClick={() => setActive(i)}
            className="h-11 flex-1 text-sm font-medium"
            aria-pressed={active === i}
          >
            <span className={active === i ? 'text-brand' : 'text-muted-foreground'}>{tab.title}</span>
          </button>
        ))}
      </div>

      {/* File list (crisp, above the filter) */}
      <div className="relative h-[260px] w-full overflow-hidden px-6 py-5 sm:px-10">
        <AnimatePresence mode="popLayout">
          <motion.ul
            key={active}
            initial={reduce ? false : { opacity: 0, y: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -24, filter: 'blur(8px)' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-1"
          >
            {TABS[active].files.map((file) => (
              <li key={file} className="border-b border-foreground/10 py-2.5 text-sm text-foreground">
                {file}
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </div>
    </div>
  );
}
