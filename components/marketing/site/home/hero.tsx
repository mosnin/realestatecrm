'use client';

/**
 * Hero — the Supermi composition, exact.
 *
 * One big rounded pastel card: soft white-to-peach/pink gradient with a
 * faint grid, a BLACK pill nav inside the card's top (brand + links + white
 * Login pill), then the centered stack — white uppercase badge pill, giant
 * near-black display headline, two-line gray sub, single white "Get Started"
 * pill — and the app window slot at the bottom, clipped by the card edge.
 *
 * The window is the ARCADE DEMO SLOT. To wire the real demo, replace the
 * contents of <ArcadeSlot/> with the arcade.so embed:
 *
 *   <iframe
 *     src="https://demo.arcade.software/<your-demo-id>?embed"
 *     title="Chippi demo"
 *     loading="lazy"
 *     allowFullScreen
 *     className="absolute inset-0 h-full w-full"
 *   />
 *
 * The global SiteNav hides itself on `/` so this card's black pill nav is
 * the homepage's only navigation (per the reference image).
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Play } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';

const NAV_LINKS = [
  { label: 'Product', href: '/chippi' },
  { label: 'Realtors', href: '/realtors' },
  { label: 'Brokerages', href: '/brokerages' },
  { label: 'Pricing', href: '/pricing' },
];

/* The card's pastel backdrop: white top melting into pink (bottom-left) and
 * peach (bottom-right), plus a faint 64px grid — per the reference image. */
const CARD_BG: React.CSSProperties = {
  backgroundColor: '#f6f4f5',
  backgroundImage: [
    'linear-gradient(rgba(20,16,24,0.035) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(20,16,24,0.035) 1px, transparent 1px)',
    'radial-gradient(120% 90% at 88% 102%, #ffd2a8 0%, rgba(255,210,168,0) 55%)',
    'radial-gradient(120% 90% at 10% 102%, #ffc4dd 0%, rgba(255,196,221,0) 55%)',
    'radial-gradient(100% 75% at 50% 0%, #ffffff 0%, rgba(255,255,255,0) 70%)',
  ].join(', '),
  backgroundSize: '64px 64px, 64px 64px, 100% 100%, 100% 100%, 100% 100%',
};

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
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** The dashboard-window slot — swap its contents for the arcade.so iframe. */
function ArcadeSlot() {
  return (
    <div
      id="arcade-demo-slot"
      className="relative mx-auto -mb-px h-[380px] max-w-5xl overflow-hidden rounded-t-[22px] bg-white/95 shadow-[0_30px_80px_-24px_rgba(90,45,20,0.28)] ring-1 ring-black/5 sm:h-[500px]"
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#15131a]/[0.05] ring-1 ring-black/5">
          <Play className="ml-0.5 h-6 w-6 text-[#15131a]/70" />
        </span>
        <div>
          <p className="font-display text-lg font-semibold tracking-tight text-[#15131a]">
            Product demo
          </p>
          <p className="mt-1 text-sm text-[#15131a]/50">Arcade walkthrough embeds here.</p>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
      <div
        className="relative isolate mx-auto max-w-[1400px] overflow-hidden rounded-[2rem] sm:rounded-[2.5rem]"
        style={CARD_BG}
      >
        {/* Black pill nav — inside the card, per the reference */}
        <Enter delay={0} className="flex justify-center px-4 pt-5">
          <nav className="flex w-fit items-center gap-2 rounded-full bg-[#0d0c0e] py-1.5 pl-5 pr-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
            <Link href="/" className="mr-2 flex items-center gap-2" aria-label="Chippi home">
              <span aria-hidden className="text-base leading-none text-[#ff7a47]">✦</span>
              <span className="font-display text-[17px] font-semibold tracking-tight text-white">
                Chippi
              </span>
            </Link>
            <div className="hidden items-center md:flex">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-full px-3 py-2 text-sm text-white/85 transition-colors hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <Link
              href="/login/realtor"
              className="ml-1 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#111113] transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
            >
              Log in
            </Link>
          </nav>
        </Enter>

        {/* Centered stack */}
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pt-14 text-center sm:pt-16">
          <Enter delay={0.05}>
            <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#1c1720] shadow-[0_2px_12px_rgba(40,20,10,0.08)]">
              Your AI teammate for real estate
            </span>
          </Enter>

          <Enter delay={0.12}>
            <h1 className="font-display mt-7 text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[#1d1922] sm:text-6xl lg:text-[4.5rem]">
              Empower Your
              <span className="block">Deals with a Next-Gen</span>
              <span className="block">AI Teammate</span>
            </h1>
          </Enter>

          <Enter delay={0.2}>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#6f6a73] sm:text-lg">
              Unlock seamless follow-up and streamline your whole pipeline with
              an agent that drafts, books, and logs the work for you
            </p>
          </Enter>

          <Enter delay={0.28}>
            <Link
              href="/login/realtor?intent=signup"
              className="mt-9 inline-flex items-center rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-[#15131a] shadow-[0_10px_28px_rgba(40,20,10,0.12)] transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
            >
              Get Started
            </Link>
          </Enter>
        </div>

        {/* App window — the arcade.so demo slot, clipped by the card bottom */}
        <Enter delay={0.4} className="mt-12 px-4 sm:mt-16 sm:px-10">
          <ArcadeSlot />
        </Enter>
      </div>
    </section>
  );
}
