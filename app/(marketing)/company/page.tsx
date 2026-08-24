/**
 * `/company`, Chippi's founding story, on the dark cinematic redesign system
 * (the "Our story" target in the Company nav menu).
 *
 * One idea: the world moved to AI; real estate didn't, so two people who'd
 * lived the gap built Chippi to close it. Hero -> the gap -> the founders ->
 * beliefs -> the adaptive closing CTA. Cinematic sections live in a forced-dark
 * wrapper; the CTA stays light/dark-adaptive like the rest of the redesign.
 */

import { CtaSection } from '@/components/marketing/giga/cta';
import {
  Band,
  BlurRise,
  Eyebrow,
  EyebrowPill,
  Serif,
  PillPrimary,
  PillGhost,
} from '@/components/marketing/giga/primitives';
import { MARKETING_PAGE_DICTS } from '@/lib/i18n/dictionaries/marketing-pages';
import { getRequestLang } from '@/lib/i18n/request';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = MARKETING_PAGE_DICTS[await getRequestLang()].company;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function CompanyPage() {
  const lang = await getRequestLang();
  const t = MARKETING_PAGE_DICTS[lang].company;
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/company-hero.jpg" alt="" className="h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/82 via-[#0a0a0a]/48 to-[#0a0a0a]" />
            <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_38%,transparent_35%,rgba(10,10,10,0.6)_100%)]" />
          </div>
          <Band className="pt-40 pb-24 text-center sm:pt-48 sm:pb-28">
            <BlurRise trigger="load">
              <EyebrowPill>{t.heroEyebrow}</EyebrowPill>
            </BlurRise>
            <BlurRise trigger="load" delay={0.08}>
              <Serif as="h1" className="mx-auto mt-7 max-w-4xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
                {t.heroHeadline}
              </Serif>
            </BlurRise>
            <BlurRise trigger="load" delay={0.16}>
              <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
                {t.heroBody}
              </p>
            </BlurRise>
            <BlurRise trigger="load" delay={0.24}>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <PillPrimary href="/demo" withArrow>
                  {t.demo}
                </PillPrimary>
                <PillGhost href="/chippi">{t.meet}</PillGhost>
              </div>
            </BlurRise>
          </Band>
        </section>

        {/* The gap */}
        <Band className="py-24 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <BlurRise>
              <Eyebrow>{t.gapEyebrow}</Eyebrow>
              <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
                {t.gapHeadline[0]}
                <br className="hidden sm:block" /> {t.gapHeadline[1]}
              </Serif>
            </BlurRise>
            <BlurRise delay={0.1}>
              <div className="space-y-6 text-[15px] leading-relaxed text-white/60 lg:pt-2">
                {t.gapBody.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </BlurRise>
          </div>
        </Band>

        {/* Beliefs */}
        <Band className="py-24 sm:py-28">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">{t.beliefsEyebrow}</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              {t.beliefsHeadline}
            </Serif>
          </BlurRise>
          <div className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-2">
            {t.beliefs.map((b, i) => (
              <BlurRise key={b.title} delay={i * 0.06}>
                <div className="h-full rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8">
                  <h3 style={{ fontFamily: 'var(--font-sans)' }} className="text-[16px] font-semibold text-white">
                    {b.title}
                  </h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-white/55">{b.body}</p>
                </div>
              </BlurRise>
            ))}
          </div>
        </Band>
      </div>
      <CtaSection lang={lang} />
    </>
  );
}
