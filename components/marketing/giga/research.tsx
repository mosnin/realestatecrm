'use client';

/**
 * ResearchSection, light/dark-adaptive "case study" block (reference-matched),
 * reframed as the research story. Contained width, image-left card with a stat
 * overlay, content-right with label / title / Learn more / body / attribution.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

export function ResearchSection() {
  return (
    <section className="px-5 pt-24 sm:px-8 sm:pt-32">
      <div className="mx-auto w-full max-w-6xl">
        <motion.div {...reveal} transition={{ duration: 0.7, ease: EASE_OUT }}>
          <span
            style={MONO}
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500 dark:text-white/55"
          >
            <span className="inline-block size-1.5 rounded-full bg-[#ff7a45]" />
            Research
          </span>
          <h2 className="mt-5 max-w-2xl text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-neutral-900 dark:text-white">
            We built Chippi by studying how agents actually work.
          </h2>
        </motion.div>

        <motion.div
          {...reveal}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 }}
          className="mt-10 overflow-hidden rounded-3xl border border-black/10 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.02]"
        >
          <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
            {/* Image + stat overlay */}
            <div className="relative min-h-[260px] lg:min-h-[420px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/research.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#ff7a45]/70 via-[#ff7a45]/10 to-transparent" />
              <div className="absolute bottom-6 left-6">
                <span style={MONO} className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/80">
                  Agents interviewed
                </span>
                <p className="text-[40px] font-semibold leading-none text-white">300+</p>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-col justify-center p-8 sm:p-10 lg:p-12">
              <span style={MONO} className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#ff7a45]">
                Chippi is built on data
              </span>
              <h3
                style={{ fontFamily: 'var(--font-sans)' }}
                className="mt-3 text-[20px] font-semibold leading-snug tracking-tight text-neutral-900 dark:text-white sm:text-[24px]"
              >
                Our Research
              </h3>
              <div className="mt-5">
                <Link
                  href="/research"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-white/90"
                >
                  Learn more
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <p className="mt-6 max-w-md text-[13.5px] leading-relaxed text-neutral-600 dark:text-white/55">
                We interviewed hundreds of agents and brokers, shadowed real deals from first lead to
                close, and mapped the busywork that eats a realtor&apos;s day. Every feature in Chippi
                traces back to a workflow we watched people struggle with, not a guess, so it works
                the way top producers already do, only faster.
              </p>
              <div className="mt-7 flex items-center gap-3 border-t border-black/10 pt-5 dark:border-white/10">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[11px] font-semibold text-black">
                  C
                </span>
                <span>
                  <span className="block text-[12px] font-medium text-neutral-900 dark:text-white">The Chippi team</span>
                  <span style={MONO} className="block text-[10px] uppercase tracking-[0.18em] text-neutral-400 dark:text-white/40">
                    Built on agent research
                  </span>
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
