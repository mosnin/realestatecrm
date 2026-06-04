'use client';

/**
 * HomeHero — rebuilt to live inside the shader, not hide it.
 *
 * The Chippi-orange grain-gradient is the hero's atmosphere. Instead of a flat
 * mute, a radial keeps the headline zone calm while the warm glow blooms
 * around the edges and floor — so it reads as "an intelligence is present."
 * The product floats below in the same app-window language as the cards, with
 * scroll parallax and annotation callouts that focus into place.
 */

import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Play } from 'lucide-react';
import { Parallax } from './home-kit';
import { AsciiBlob } from './ascii-blob';

const EASE = [0.22, 1, 0.36, 1] as const;

export function HomeHero() {
  const reduce = useReducedMotion();

  const rise: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 26, filter: 'blur(8px)' },
        show: { opacity: 1, y: 0, filter: 'blur(0px)' },
      };
  const container: Variants = {
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.06 } },
  };

  return (
    <section className="relative overflow-hidden bg-background">
      {/* Animated orange ASCII gradient blob drifting behind the hero. */}
      <AsciiBlob />
      {/* Center-protect radial: a clean reading zone behind the headline so
          the ASCII field stays legible-but-quiet there. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 32%, var(--background) 32%, transparent 78%)',
        }}
      />
      {/* Settle into the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-muted"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-24 pb-14 md:px-8 md:pt-36 md:pb-24">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-4xl text-center"
        >
          <motion.div variants={rise} transition={{ duration: 0.7, ease: EASE }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-card/80 px-3.5 py-1.5 text-[12px] font-medium text-foreground/70 ring-1 ring-border/70 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              The agentic OS for real estate
            </span>
          </motion.div>

          <motion.h1
            variants={rise}
            transition={{ duration: 0.9, ease: EASE }}
            className="mt-7 font-heading text-[clamp(3rem,7.6vw,6rem)] font-semibold leading-[0.96] tracking-[-0.04em] text-foreground"
          >
            You close the deals.
            <br />
            <span className="text-brand">Chippi does the rest.</span>
          </motion.h1>

          <motion.p
            variants={rise}
            transition={{ duration: 0.9, ease: EASE }}
            className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-foreground/60 md:text-xl"
          >
            Chippi reads your inbox, drafts replies in your voice, books the
            tours, and keeps every deal current — the busywork runs itself, and
            nothing leaves without your name on it.
          </motion.p>

          <motion.div
            variants={rise}
            transition={{ duration: 0.9, ease: EASE }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-7 text-[15px] font-medium text-background transition-transform duration-150 active:scale-[0.98]"
            >
              Start free
            </Link>
            <Link
              href="/features/chippi"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-card/80 px-6 text-[15px] font-medium text-foreground ring-1 ring-border/70 backdrop-blur transition-colors hover:bg-card"
            >
              <Play size={15} className="fill-current" /> Watch demo
            </Link>
          </motion.div>
        </motion.div>

        {/* Product — framed in the same window language as the cards, drifting
            on scroll, callouts focusing in after it lands. */}
        <Parallax distance={48} className="relative mx-auto mt-16 max-w-5xl md:mt-24">
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: EASE, delay: reduce ? 0 : 0.5 }}
            className="overflow-hidden rounded-[1.75rem] bg-card ring-1 ring-border/70 shadow-[0_40px_120px_-32px_rgba(0,0,0,0.28)]"
          >
            <div className="flex h-9 items-center gap-1.5 border-b border-border/60 px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" aria-hidden />
              <span className="h-2.5 w-2.5 rounded-full bg-foreground/12" aria-hidden />
              <span className="mx-auto select-none rounded-md bg-foreground/[0.04] px-3 py-1 text-[11px] text-muted-foreground/80">
                app.chippi.ai
              </span>
              <span aria-hidden className="w-[42px]" />
            </div>
            {/* Hero product video. Source provided later; blank placeholder
                for now — drop the <source> in and it autoplays muted/looped. */}
            <div className="relative aspect-[16/9] w-full bg-muted">
              <video
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="none"
              >
                {/* <source src="" type="video/mp4" /> */}
              </video>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-foreground/[0.05] ring-1 ring-border/70">
                  <Play size={22} className="ml-0.5 fill-foreground/30 text-foreground/30" />
                </span>
              </div>
            </div>
          </motion.div>
        </Parallax>
      </div>
    </section>
  );
}
