/**
 * `/careers`, the join-us page (the Careers target in the Company nav menu).
 * Server component (exports metadata).
 *
 * Aesthetic: matches the homepage / company / research pages — a full-bleed
 * photographic hero under dark scrims (NOT the SubHero dashboard window, which
 * read as out-of-place product chrome on a hiring page), then how-we-work and
 * open-positions sections, and a get-in-touch close, all in a forced-dark
 * wrapper. The page must not list speculative roles as active openings.
 */

import { ArrowRight } from 'lucide-react';
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
  const t = MARKETING_PAGE_DICTS[await getRequestLang()].careers;
  return { title: t.metaTitle, description: t.metaDescription };
}

const CAREERS_EMAIL = 'careers@usechippi.com';

export default async function CareersPage() {
  const lang = await getRequestLang();
  const t = MARKETING_PAGE_DICTS[lang].careers;
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        {/* Hero — full-bleed photo under dark scrims, matching the homepage /
            company / research pages. */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/careers-hero.jpg" alt="" className="h-full w-full object-cover object-center" />
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
                <PillPrimary href={`mailto:${CAREERS_EMAIL}`} withArrow>
                  {t.contact}
                </PillPrimary>
                <PillGhost href="/company">{t.story}</PillGhost>
              </div>
            </BlurRise>
          </Band>
        </section>

        {/* How we work */}
        <Band className="py-24 sm:py-28">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">{t.workEyebrow}</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              {t.workHeadline}
            </Serif>
          </BlurRise>
          <div className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-2">
            {t.principles.map((p, i) => (
              <BlurRise key={p.title} delay={i * 0.06}>
                <div className="h-full rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8">
                  <h3 style={{ fontFamily: 'var(--font-sans)' }} className="text-[16px] font-semibold text-white">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-white/55">{p.body}</p>
                </div>
              </BlurRise>
            ))}
          </div>
        </Band>

        {/* Open positions. Keep this state factual until a real requisition is approved. */}
        <Band id="open-positions" className="scroll-mt-24 py-24 sm:py-28">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">{t.openingsEyebrow}</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              {t.openingsHeadline}
            </Serif>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
              {t.openingsBeforeEmail}{' '}
              <a href="mailto:careers@usechippi.com" className="text-[#ff9a6e] underline-offset-4 hover:underline">
                careers@usechippi.com
              </a>{' '}
              {t.openingsAfterEmail}
            </p>
          </BlurRise>
        </Band>

        {/* Get in touch */}
        <Band className="pb-28 pt-4 sm:pb-36">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Serif className="text-[clamp(1.9rem,3.8vw,3rem)] leading-[1.06] text-white">
              {t.closeHeadline}
            </Serif>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
              {t.closeBody}
            </p>
            <a
              href={`mailto:${CAREERS_EMAIL}`}
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-medium text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.98]"
            >
              {t.contact}
              <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-4 text-[12.5px] text-white/40">{CAREERS_EMAIL}</p>
          </BlurRise>
        </Band>
      </div>
    </>
  );
}
