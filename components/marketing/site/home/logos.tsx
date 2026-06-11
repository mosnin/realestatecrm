'use client';

/**
 * Integration logo strip — the "works with your stack" band under the hero.
 *
 * An auto-scrolling marquee of the tools Chippi genuinely connects to (drawn
 * from lib/integrations/catalog). The honest version of an enterprise logo
 * wall: real integrations, not fabricated customer logos. Each item is a slot
 * the owner drops a real brand mark into.
 *
 * Built on framer-motion (the repo's one animation library) — no carousel
 * dependency for what is a single linear translate. The track holds the list
 * twice and slides exactly one set width (-50%) on a seamless loop. Reduced
 * motion renders a calm centered wrap instead — no scroll, all logos visible.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { Reveal } from '../reveal';

// Real integrations from lib/integrations/catalog — the realtor-relevant ones
// lead (the CRMs and e-sign a realtor actually lives in), then the rest.
const INTEGRATIONS = [
  'Gmail',
  'Outlook',
  'Google Calendar',
  'Follow-up Boss',
  'DocuSign',
  'WhatsApp',
  'Slack',
  'HubSpot',
  'kvCORE',
  'Salesforce',
  'Notion',
  'Calendly',
  'Twilio',
  'Google Drive',
];

function LogoChip({ name }: { name: string }) {
  return (
    <div className="mx-2 flex h-12 shrink-0 items-center gap-2.5 rounded-xl border border-border/60 bg-card/50 px-5 text-sm font-medium text-muted-foreground">
      {/* slot for the real brand logo */}
      <span aria-hidden className="h-5 w-5 rounded-md bg-foreground/[0.06]" />
      {name}
    </div>
  );
}

export function Logos() {
  const reduce = useReducedMotion();
  return (
    <section className="border-b border-border/60 bg-background py-12">
      <Reveal className="mx-auto max-w-5xl px-4 sm:px-6">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Connects with the tools you already use
        </p>
      </Reveal>

      <div className="relative mt-8 overflow-hidden">
        {/* edge fades — the strip dissolves into the page on both sides */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-24" />

        {reduce ? (
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-3 px-4">
            {INTEGRATIONS.map((name) => (
              <LogoChip key={name} name={name} />
            ))}
          </div>
        ) : (
          <motion.div
            className="flex w-max"
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: 45, ease: 'linear', repeat: Infinity }}
          >
            {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
              <LogoChip key={`${name}-${i}`} name={name} />
            ))}
          </motion.div>
        )}
      </div>

      <p className="mt-6 px-4 text-center text-xs text-muted-foreground">
        …and <span className="text-foreground">50+ more</span> — two minutes to connect, no migration.
      </p>
    </section>
  );
}
