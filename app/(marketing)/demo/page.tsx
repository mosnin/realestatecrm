/**
 * `/demo`, book a demo. Dark cinematic hero (matching the rest of the redesign)
 * plus the Calendly inline scheduler in a light card.
 *
 * One focal element: the scheduler. A brokerage or team evaluating Chippi lands
 * here, reads one sentence about what they will see, and books a time.
 */

import { CalendlyEmbed } from '@/components/marketing/giga/calendly-embed';
import { Band, BlurRise, EyebrowPill, Serif } from '@/components/marketing/giga/primitives';
import { MARKETING_PAGE_DICTS } from '@/lib/i18n/dictionaries/marketing-pages';
import { getRequestLang } from '@/lib/i18n/request';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = MARKETING_PAGE_DICTS[await getRequestLang()].demo;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function DemoPage() {
  const t = MARKETING_PAGE_DICTS[await getRequestLang()].demo;
  return (
    <div className="dark bg-[#0a0a0a] text-white">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/hero-bg.jpg" alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/82 via-[#0a0a0a]/48 to-[#0a0a0a]" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_38%,transparent_35%,rgba(10,10,10,0.6)_100%)]" />
        </div>
        <Band className="pt-40 pb-10 text-center sm:pt-44">
          <BlurRise trigger="load">
            <EyebrowPill>{t.eyebrow}</EyebrowPill>
          </BlurRise>
          <BlurRise trigger="load" delay={0.08}>
            <Serif as="h1" className="mx-auto mt-7 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
              {t.headline}
            </Serif>
          </BlurRise>
          <BlurRise trigger="load" delay={0.16}>
            <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
              {t.body}
            </p>
          </BlurRise>
          <BlurRise trigger="load" delay={0.22}>
            <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-white/50">
              {t.points.map((p) => (
                <span key={p} className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#ff7a45]" />
                  {p}
                </span>
              ))}
            </div>
          </BlurRise>
        </Band>
      </section>

      {/* Scheduler */}
      <Band className="pb-28 pt-4 sm:pb-36">
        <BlurRise className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-black/40">
            <CalendlyEmbed />
          </div>
        </BlurRise>
      </Band>
    </div>
  );
}
