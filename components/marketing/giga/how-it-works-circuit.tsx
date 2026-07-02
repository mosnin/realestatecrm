'use client';

/**
 * HowItWorksCircuit — the "see the machine" section.
 *
 * A quiet dark band with a one-line setup and the ChippiCircuit wiring diagram:
 * leads in, Chippi in the middle, actions out, you approving at the end. It
 * answers the visitor's real question — "what does it actually do?" — as a
 * picture instead of a paragraph. Matches the homepage's dark cinematic
 * sections and the blur-rise entrance language.
 */

import { motion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import { ChippiCircuit } from '@/components/experience/chippi-circuit';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

export function HowItWorksCircuit() {
  return (
    <section className="px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <motion.div {...reveal} transition={{ duration: 0.7, ease: EASE_OUT }}>
          <span
            style={MONO}
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55"
          >
            <span className="inline-block size-1.5 rounded-full bg-[#ff7a45]" />
            How it works
          </span>
          <h2 className="mt-5 max-w-2xl text-[clamp(1.75rem,3.2vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-white">
            Every lead flows through Chippi.
            <span className="text-white/55"> Nothing sends without you.</span>
          </h2>
        </motion.div>

        <motion.div
          {...reveal}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.12 }}
          className="mt-10 overflow-x-auto"
        >
          {/* min-w keeps the board legible on phones — it scrolls sideways
              rather than shrinking labels into confetti. */}
          <div className="min-w-[760px]">
            <ChippiCircuit variant="dark" className="mx-auto" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
