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

export const metadata = {
  title: 'Careers · Chippi',
  description:
    'Help build the AI lead conversion teammate for real estate. We are a small team shipping close to customers, with a high bar for craft and trust.',
};

const CAREERS_EMAIL = 'careers@usechippi.com';

/* How we work, the things that shape every day here. */
const PRINCIPLES = [
  {
    title: 'Taste is the spec.',
    body: 'We pick instead of ship a settings page. Small team, strong opinions, decisions made and owned. The craft is the work, not the chrome around it.',
  },
  {
    title: 'Ship close to the user.',
    body: 'We sit with agents and brokers, watch the real day, and turn what we hear into product the same week. Short loops, real feedback, no theater.',
  },
  {
    title: 'Accountable, by design.',
    body: 'We are building an agent people trust with their book. That trust is a feature: every action has an owner, an outcome, and a receipt, and we hold that line in the code.',
  },
  {
    title: 'One voice, everywhere.',
    body: 'An action card, a toast, an activity row, the same signature carries through. Consistency and polish are not the last pass; they are how we build.',
  },
];

export default function CareersPage() {
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
              <EyebrowPill>Careers</EyebrowPill>
            </BlurRise>
            <BlurRise trigger="load" delay={0.08}>
              <Serif as="h1" className="mx-auto mt-7 max-w-4xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
                Help build the future of real estate.
              </Serif>
            </BlurRise>
            <BlurRise trigger="load" delay={0.16}>
              <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
                We are a small team building the lead conversion teammate real estate has been
                missing. The surface is huge, the bar is high, and the work reaches customers fast.
              </p>
            </BlurRise>
            <BlurRise trigger="load" delay={0.24}>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <PillPrimary href={`mailto:${CAREERS_EMAIL}`} withArrow>
                  Get in touch
                </PillPrimary>
                <PillGhost href="/company">Our story</PillGhost>
              </div>
            </BlurRise>
          </Band>
        </section>

        {/* How we work */}
        <Band className="py-24 sm:py-28">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">How we work</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              A few things that shape every day.
            </Serif>
          </BlurRise>
          <div className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
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
            <Eyebrow className="justify-center">Open positions</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              No open roles right now.
            </Serif>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
              We are still happy to meet thoughtful builders. Email{' '}
              <a href="mailto:careers@usechippi.com" className="text-[#ff9a6e] underline-offset-4 hover:underline">
                careers@usechippi.com
              </a>{' '}
              and tell us what you would want to own.
            </p>
          </BlurRise>
        </Band>

        {/* Get in touch */}
        <Band className="pb-28 pt-4 sm:pb-36">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Serif className="text-[clamp(1.9rem,3.8vw,3rem)] leading-[1.06] text-white">
              Do not see your role?
            </Serif>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
              We are always meeting great people. Tell us what you would want to build, and the surface
              you would want to own.
            </p>
            <a
              href={`mailto:${CAREERS_EMAIL}`}
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-medium text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.98]"
            >
              Get in touch
              <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-4 text-[12.5px] text-white/40">{CAREERS_EMAIL}</p>
          </BlurRise>
        </Band>
      </div>
    </>
  );
}
