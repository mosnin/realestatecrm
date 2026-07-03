'use client';

/**
 * IntegrationsDrift — the integration catalog as a living rail.
 *
 * ScrollDirectionCarousel fed from the REAL integration catalog
 * (lib/integrations/catalog.ts — same icons the in-app directory renders), so
 * marketing never drifts from what the product actually connects. The rail
 * drifts gently, follows the visitor's scroll direction, and speeds up with
 * scroll velocity — the catalog feels alive without a single click.
 */

import { motion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import { ScrollDirectionCarousel } from '@/components/ui/scroll-direction-carousel';
import { INTEGRATIONS } from '@/lib/integrations/catalog';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

// Promoted entries with real icon files — the marks a visitor recognizes.
const TILES = INTEGRATIONS.filter((i) => i.promoted && i.iconUrl);

export function IntegrationsDrift() {
  return (
    <section className="overflow-hidden py-16 sm:py-20">
      <motion.div
        {...reveal}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        className="mx-auto w-full max-w-6xl px-5 sm:px-8"
      >
        <span
          style={MONO}
          className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55"
        >
          <span className="inline-block size-1.5 rounded-full bg-[#ff7a45]" />
          The catalog
        </span>
        <h2 className="mt-5 max-w-2xl text-[clamp(1.75rem,3.2vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-white">
          Your whole stack, one teammate.
        </h2>
      </motion.div>

      <motion.div
        {...reveal}
        transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.12 }}
        className="mt-10"
      >
        <ScrollDirectionCarousel speed={45}>
          {TILES.map((t) => (
            <div
              key={t.toolkit}
              className="mr-4 w-[240px] shrink-0 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.iconUrl} alt="" className="h-full w-full object-contain" />
              </div>
              <p className="mt-4 text-[15px] font-medium text-white">{t.name}</p>
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-white/50">
                {t.blurb}
              </p>
            </div>
          ))}
        </ScrollDirectionCarousel>
      </motion.div>
    </section>
  );
}
