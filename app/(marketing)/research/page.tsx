/**
 * `/research`, placeholder for the research story (how Chippi was built on
 * comprehensive real-estate research). Intentionally a stub for now; linked from
 * the homepage research section and the Company nav menu. Dark cinematic hero,
 * matching the rest of the redesign.
 */

import { Band, BlurRise, EyebrowPill, Serif } from '@/components/marketing/giga/primitives';

export const metadata = {
  title: 'Research · Chippi',
  description: 'How we built Chippi on comprehensive research into how real-estate agents actually work.',
};

export default function ResearchPage() {
  return (
    <div className="dark bg-[#0a0a0a] text-white">
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/research-hero.jpg" alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/82 via-[#0a0a0a]/48 to-[#0a0a0a]" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_38%,transparent_35%,rgba(10,10,10,0.6)_100%)]" />
        </div>
        <Band className="flex min-h-[80vh] flex-col items-center justify-center py-40 text-center">
          <BlurRise trigger="load">
            <EyebrowPill>Research</EyebrowPill>
          </BlurRise>
          <BlurRise trigger="load" delay={0.08}>
            <Serif as="h1" className="mt-7 text-[clamp(2.5rem,6vw,4rem)] leading-[1.04] text-white">
              How we built Chippi.
            </Serif>
          </BlurRise>
          <BlurRise trigger="load" delay={0.16}>
            <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-white/55">
              The full story, hundreds of agent interviews, shadowed deals, and the workflows that
              shaped every feature, is on the way.
            </p>
          </BlurRise>
        </Band>
      </section>
    </div>
  );
}
