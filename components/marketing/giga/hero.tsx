'use client';

/**
 * Hero — the full-bleed, cinematic opener (reference-matched).
 *
 * A full-bleed photographic background (real-estate / architecture placeholder)
 * under dark gradient scrims. Centered: a glassy eyebrow pill, a HUGE two-line
 * thin serif headline (clamped ~40→92px, light weight, tight leading), a
 * one-line muted subhead, and a white rounded-full pill CTA. A small glassy
 * video/testimonial card sits bottom-left; a grayscale logo cloud fades in
 * along the very bottom. Every element blur-rises in on load (the redesign's
 * entrance language); respects prefers-reduced-motion via BlurRise.
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Play } from 'lucide-react';
import { BlurRise, EyebrowPill, Mono, PillPrimary } from './primitives';

/* Placeholder logo cloud — reuses the brokerage logos already in /public.
 * TODO: replace placeholder logos with real partner / brokerage marks. */
const LOGOS = [
  { src: '/marketing/logos/compass.png', alt: 'Compass' },
  { src: '/marketing/logos/remax.png', alt: 'RE/MAX' },
  { src: '/marketing/logos/exit.svg', alt: 'EXIT Realty' },
  { src: '/marketing/logos/lpt.png', alt: 'LPT Realty' },
  { src: '/marketing/logos/source.png', alt: 'Source' },
];

const DEMO = '/demo';

export function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-black">
      {/* Full-bleed background photo + scrims */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {/* TODO: replace placeholder image — final cinematic hero shot. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marketing/home-hero.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
        {/* Cinematic darkening: top (for the header), bottom (for the cards),
            and a soft center vignette so the headline always reads. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/90" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_30%,transparent_30%,rgba(0,0,0,0.5)_100%)]" />
      </div>

      {/* Centered headline stack */}
      <div className="mx-auto flex min-h-[100svh] max-w-4xl flex-col items-center justify-center px-5 pb-44 pt-28 text-center sm:px-8">
        <BlurRise trigger="load" delay={0.05}>
          <EyebrowPill>Natural voice · Real-estate AI</EyebrowPill>
        </BlurRise>

        <BlurRise trigger="load" delay={0.15}>
          <h1
            style={{
              fontFamily: 'var(--font-serif-display), Georgia, serif',
              fontVariationSettings: '"opsz" 144',
              fontSize: 'clamp(2.5rem, 7vw, 5.75rem)',
            }}
            className="mt-7 text-balance font-light leading-[1.04] tracking-[-0.025em] text-white"
          >
            The AI cowork that runs
            <span className="block">your entire pipeline.</span>
          </h1>
        </BlurRise>

        <BlurRise trigger="load" delay={0.28}>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-white/65 sm:text-lg">
            Chippi reads every lead, drafts in your voice, books the tour, and keeps the
            deal current — the cowork built for real-estate agents and brokerages.
          </p>
        </BlurRise>

        <BlurRise trigger="load" delay={0.4}>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <PillPrimary href={DEMO} withArrow>
              See a demo
            </PillPrimary>
          </div>
        </BlurRise>
      </div>

      {/* Bottom-left video / testimonial card */}
      <BlurRise
        trigger="load"
        delay={0.55}
        className="pointer-events-none absolute bottom-28 left-5 z-10 hidden sm:left-8 lg:block"
      >
        <Link
          href={DEMO}
          className="pointer-events-auto group flex w-[300px] items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur-xl transition-colors hover:bg-black/55"
        >
          <span className="relative flex h-14 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
            {/* TODO: replace placeholder image — testimonial/clip thumbnail. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/product/realtors.jpg"
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-70"
            />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-transform duration-200 group-hover:scale-105">
              <Play className="ml-0.5 h-3.5 w-3.5" />
            </span>
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[13px] font-medium text-white">See Chippi run a floor</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-white/55">
              A 90-second walkthrough on real numbers
            </span>
          </span>
        </Link>
      </BlurRise>

      {/* Logo cloud, fading in along the bottom */}
      <BlurRise
        trigger="load"
        delay={0.7}
        y={12}
        className="absolute inset-x-0 bottom-0 z-10 border-t border-white/[0.08] bg-gradient-to-t from-black/80 to-transparent"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-6 sm:px-8">
          <Mono className="text-[10px] text-white/40">Trusted across modern brokerages</Mono>
          {/* Marquee: a w-max track holding two copies of the logos, animated
              x: 0 → -50% (exactly one copy) for a seamless infinite scroll. */}
          <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
            <motion.div
              className="flex w-max items-center gap-x-12 sm:gap-x-16"
              animate={reduce ? undefined : { x: ['0%', '-50%'] }}
              transition={reduce ? undefined : { duration: 28, ease: 'linear', repeat: Infinity }}
            >
              {[...LOGOS, ...LOGOS].map((logo, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${logo.alt}-${i}`}
                  src={logo.src}
                  alt={logo.alt}
                  className="h-5 w-auto shrink-0 opacity-50 grayscale invert sm:h-6"
                />
              ))}
            </motion.div>
          </div>
        </div>
      </BlurRise>
    </section>
  );
}
