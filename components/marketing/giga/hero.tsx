'use client';

/**
 * Hero, the full-bleed, cinematic opener (reference-matched).
 *
 * A full-bleed photographic background (real-estate / architecture placeholder)
 * under dark gradient scrims. Centered: a simple gradient introduction, a HUGE two-line
 * thin serif headline (clamped ~40→92px, light weight, tight leading), a
 * one-line muted subhead, and a white rounded-full pill CTA. A small glassy
 * capability band fades in along the very bottom. Every element blur-rises in
 * on load (the redesign's
 * entrance language); respects prefers-reduced-motion via BlurRise.
 */

import { BlurRise, Mono } from './primitives';
import { LogosCarousel } from '@/components/ui/logos-carousel';
import { HeroChat } from './hero-chat';
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import type { Lang } from '@/lib/i18n/markets';

export function Hero({ lang = 'en' }: { lang?: Lang }) {
  const t = HOME_DICTS[lang];
  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-black">
      {/* Full-bleed background photo + scrims */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {/* TODO: replace placeholder image, final cinematic hero shot. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marketing/hero-bg.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
        {/* Cinematic darkening: top (for the header), bottom (for the cards),
            and a soft center vignette so the headline always reads. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/90" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_30%,transparent_30%,rgba(0,0,0,0.5)_100%)]" />
      </div>

      {/* Centered headline stack */}
      <div className="mx-auto flex min-h-[100svh] max-w-4xl flex-col items-center justify-center px-5 pb-32 pt-28 text-center sm:px-8">
        <BlurRise trigger="load" delay={0.05}>
          <p className="bg-gradient-to-r from-[#ff7a45] via-[#d878f2] to-[#a96df5] bg-clip-text text-xl font-semibold tracking-tight text-transparent sm:text-2xl">
            {t.hero.intro}
          </p>
        </BlurRise>

        <BlurRise trigger="load" delay={0.15}>
          <h1
            style={{
              fontFamily: 'var(--font-serif-display), "Times New Roman", Times, serif',
              fontSize: 'clamp(2.5rem, 7vw, 5.75rem)',
            }}
            className="mt-7 text-balance font-light leading-[1.04] tracking-[-0.025em] text-white"
          >
            {t.hero.line1}
            <span className="block">{t.hero.line2}</span>
          </h1>
        </BlurRise>

        <BlurRise trigger="load" delay={0.28}>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-white/65 sm:text-lg">
            {t.hero.sub}
          </p>
        </BlurRise>

        {/* Ask-Chippi box — the hero's interactive centerpiece (replaces the
            old video/testimonial card). Frosted glass on the photo; branded
            with the real Chippi mark. */}
        <BlurRise trigger="load" delay={0.4} className="mt-10 w-full">
          <HeroChat lang={lang} />
        </BlurRise>
      </div>

      {/* Product capabilities, fading in along the bottom. Do not present
          brokerage names here unless a public customer approval exists. */}
      <BlurRise
        trigger="load"
        delay={0.7}
        y={12}
        className="absolute inset-x-0 bottom-0 z-10 border-t border-white/[0.08] bg-gradient-to-t from-black/80 to-transparent"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-6 sm:px-8">
          <Mono className="text-[10px] text-white/40">{t.hero.band}</Mono>
          {/* Staggered-wave capability carousel: items cycle column by column
              in a ripple. Handles reduced
              motion internally (renders static). */}
          <LogosCarousel
            columnCount={3}
            className="w-full max-w-3xl place-items-center gap-x-10"
          >
            {t.hero.capabilities.map((capability) => (
              <span
                key={capability}
                className="whitespace-nowrap text-[17px] font-semibold tracking-tight text-white/40"
              >
                {capability}
              </span>
            ))}
          </LogosCarousel>
        </div>
      </BlurRise>
    </section>
  );
}
