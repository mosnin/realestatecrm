'use client';

/**
 * Hero — the NexusSci composition, Chippi-branded.
 *
 * One giant rounded card on the lavender canvas, filled with the owner's
 * GrainGradient shader. The headline is the sticker treatment: each line a
 * white pill, with an inline avatar cluster in line one and the vermillion
 * CTA pill inline in the last line. Award line bottom-right. No scrim —
 * the type sits on its own stickers, so the gradient stays loud.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Plus, ShieldCheck } from 'lucide-react';
import { GradientBackground } from '@/components/ui/paper-design-shader-background';
import { EASE_OUT } from '@/lib/motion';

const AVATARS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=160&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=160&auto=format&fit=crop',
];

function Enter({
  delay,
  children,
  className,
}: {
  delay: number;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** One white sticker line of the headline. */
function Sticker({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-3 rounded-[2.25rem] bg-white px-6 py-2 shadow-[0_2px_16px_rgba(20,16,12,0.08)] dark:bg-[#17171a] sm:gap-4 sm:px-8 sm:py-3">
      {children}
    </span>
  );
}

export function Hero() {
  // Avoid hydration mismatch on the avatar cluster's random-free render.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <section className="px-2.5 pb-2.5 pt-20 sm:px-4 sm:pb-4 sm:pt-24">
      <div className="relative isolate mx-auto flex min-h-[82vh] max-w-[1400px] flex-col overflow-hidden rounded-[2rem] sm:rounded-[2.75rem]">
        <GradientBackground />

        {/* Headline block — centered */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
          <Enter delay={0.05}>
            <h1 className="font-display flex flex-col items-center gap-2 text-[2rem] font-bold leading-none tracking-[-0.03em] text-[#16161a] dark:text-white sm:gap-2.5 sm:text-[3.4rem] lg:text-[4.2rem]">
              <Sticker>
                Your
                {ready ? (
                  <span className="inline-flex items-center">
                    {AVATARS.map((src, i) => (
                      <span
                        key={src}
                        className={`relative inline-block h-9 w-9 overflow-hidden rounded-full ring-2 ring-white dark:ring-[#17171a] sm:h-14 sm:w-14 ${i > 0 ? '-ml-3 sm:-ml-4' : ''}`}
                      >
                        <Image src={src} alt="" fill sizes="56px" className="object-cover" />
                      </span>
                    ))}
                    <span className="-ml-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#16161a] text-white ring-2 ring-white dark:ring-[#17171a] sm:-ml-4 sm:h-14 sm:w-14">
                      <Plus className="h-4 w-4 sm:h-6 sm:w-6" />
                    </span>
                  </span>
                ) : null}
                AI partner
              </Sticker>
              <Sticker>for every lead, tour</Sticker>
              <Sticker>
                and deal
                <Link
                  href="/login/realtor?intent=signup"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#ff4b29] px-5 py-2.5 text-base font-semibold tracking-normal text-white transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98] sm:px-7 sm:py-3.5 sm:text-xl"
                >
                  Get started
                  <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5" />
                </Link>
              </Sticker>
            </h1>
          </Enter>

          <Enter delay={0.25}>
            <p className="mx-auto mt-8 max-w-md text-balance text-[15px] font-medium leading-relaxed text-[#16161a]/75 dark:text-white/75 sm:text-base">
              Chippi reads every inbound, drafts in your voice, books the tours,
              and keeps the pipeline current — approval-first, always.
            </p>
          </Enter>
        </div>

        {/* Bottom row — trust line, NexusSci style */}
        <Enter delay={0.4} className="flex items-end justify-between px-6 pb-6 sm:px-9 sm:pb-8">
          <p className="rounded-full bg-white/70 px-4 py-2 text-[12px] font-semibold text-[#16161a] backdrop-blur-sm dark:bg-black/40 dark:text-white">
            7 days free, then $97/mo
          </p>
          <p className="flex items-center gap-2.5 text-right text-[13px] font-semibold leading-tight text-[#16161a]/80 dark:text-white/80">
            The agentic OS
            <br />
            for real estate
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#16161a] text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </p>
        </Enter>
      </div>
    </section>
  );
}
