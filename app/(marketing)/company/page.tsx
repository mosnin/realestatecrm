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

export const metadata = {
  title: 'Our story · Chippi',
  description:
    'We built Chippi so real estate teams can work every lead without losing the human relationship that closes the deal.',
};

/* Beliefs, the things we will not move on. */
const BELIEFS = [
  {
    title: 'Configuration is failure to decide.',
    body: 'Settings, toggles, customization layers, they are admissions the team could not pick. Picking is the work. We will not make your day harder so our spec was easier.',
  },
  {
    title: 'Your rules control every send.',
    body: 'You choose what Chippi may send automatically. Everything else waits for approval. Every action keeps an owner, a reason, and a receipt.',
  },
  {
    title: 'Chippi has one voice.',
    body: 'Wherever Chippi shows up, a draft card, a toast, an activity row, the same signature carries through. Nothing else does. It is how you learn to trust the agent across every surface.',
  },
  {
    title: 'Proof before promises.',
    body: 'No made-up returns. No invented time savings. We show the work, log the result, and let your own data make the case.',
  },
];

export default function CompanyPage() {
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
              <EyebrowPill>Our story</EyebrowPill>
            </BlurRise>
            <BlurRise trigger="load" delay={0.08}>
              <Serif as="h1" className="mx-auto mt-7 max-w-4xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
                More leads should not mean less time with clients.
              </Serif>
            </BlurRise>
            <BlurRise trigger="load" delay={0.16}>
              <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
                We built Chippi to work the chase between an inquiry and a booked tour. Agents keep
                the judgment, trust, and relationship that move the deal.
              </p>
            </BlurRise>
            <BlurRise trigger="load" delay={0.24}>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <PillPrimary href="/demo" withArrow>
                  See a demo
                </PillPrimary>
                <PillGhost href="/chippi">Meet Chippi</PillGhost>
              </div>
            </BlurRise>
          </Band>
        </section>

        {/* The gap */}
        <Band className="py-24 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
            <BlurRise>
              <Eyebrow>The gap</Eyebrow>
              <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
                The leads kept coming.
                <br className="hidden sm:block" /> The follow-up did not keep up.
              </Serif>
            </BlurRise>
            <BlurRise delay={0.1}>
              <div className="space-y-6 text-[15px] leading-relaxed text-white/60 lg:pt-2">
                <p>
                  An agent&apos;s day jumps between email, calendar, replies, follow-ups, and deal
                  updates. The selling happens in the moments that need judgment and trust.
                </p>
                <p>
                  The coordination around those moments should not depend on memory. Chippi exists to
                  read the inquiry, prepare the next move, book the tour, and leave a clear record.
                </p>
              </div>
            </BlurRise>
          </div>
        </Band>

        {/* Beliefs */}
        <Band className="py-24 sm:py-28">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">What we believe</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              A few things we will not move on.
            </Serif>
          </BlurRise>
          <div className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-2">
            {BELIEFS.map((b, i) => (
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
      <CtaSection />
    </>
  );
}
