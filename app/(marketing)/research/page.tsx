/**
 * `/research`, the product-learning story. Server component (exports metadata). Same aesthetic as
 * the homepage / company / careers pages: a full-bleed photographic hero under
 * dark scrims, then a research index of downloadable reports, in a forced-dark
 * wrapper.
 *
 * Publish quantitative research here only when methods and evidence are ready
 * for external review.
 */

import {
  Band,
  BlurRise,
  Eyebrow,
  PillGhost,
  PillPrimary,
  Serif,
} from '@/components/marketing/giga/primitives';

export const metadata = {
  title: 'Research · Chippi',
  description:
    'The product principles and real-estate workflows that shape Chippi.',
};

export default function ResearchPage() {
  return (
    <div className="dark bg-[#0a0a0a] text-white">
      {/* Hero — full-bleed photo under dark scrims, matching the rest of the
          redesign. */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/research-hero.jpg" alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/82 via-[#0a0a0a]/48 to-[#0a0a0a]" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_38%,transparent_35%,rgba(10,10,10,0.6)_100%)]" />
        </div>
        <Band className="pt-40 pb-24 text-center sm:pt-48 sm:pb-28">
          <BlurRise trigger="load" delay={0.08}>
            <Serif as="h1" className="mx-auto mt-7 max-w-4xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
              How we built Chippi.
            </Serif>
          </BlurRise>
          <BlurRise trigger="load" delay={0.16}>
            <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
              Chippi is shaped by the operational patterns real-estate teams work through every day.
              We will publish evidence-backed research here as it is ready for external review.
            </p>
          </BlurRise>
          <BlurRise trigger="load" delay={0.24}>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <PillPrimary href="#reports" withArrow>
                See what is next
              </PillPrimary>
              <PillGhost href="/demo">See a demo</PillGhost>
            </div>
          </BlurRise>
        </Band>
      </section>

      {/* Research publication state. */}
      <Band id="reports" className="scroll-mt-24 pb-28 pt-4 sm:pb-36">
        <BlurRise className="mx-auto max-w-2xl text-center">
          <Eyebrow className="justify-center">Research notes</Eyebrow>
          <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
            Publication in progress.
          </Serif>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
            Research briefs are being prepared for publication. We will not publish studies or
            metrics until their methods and evidence are ready for review.
          </p>
        </BlurRise>
      </Band>
    </div>
  );
}
