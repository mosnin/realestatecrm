/**
 * `/careers`, the join-us page (the Careers target in the Company nav menu).
 * Server component (exports metadata).
 *
 * Aesthetic: matches the homepage / company / research pages — a full-bleed
 * photographic hero under dark scrims (NOT the SubHero dashboard window, which
 * read as out-of-place product chrome on a hiring page), then how-we-work and
 * open-positions sections, and a get-in-touch close, all in a forced-dark
 * wrapper.
 *
 * Honest framing: we are a small team. The roles below are the areas we are
 * actively hiring in; apply by email.
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
    'Help build the operating system real estate has been missing. We are a small team shipping fast, with taste, on a huge surface. If that sounds like you, reach out.',
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
    title: 'Approval-first, by design.',
    body: 'We are building an agent people trust with their book. That trust is a feature: nothing leaves without a name on it, and we hold that line in the code.',
  },
  {
    title: 'One voice, everywhere.',
    body: 'A draft card, a toast, an activity row, the same signature carries through. Consistency and polish are not the last pass; they are how we build.',
  },
];

/* Open positions, illustrative roles for now. Apply by email. */
const OPEN_POSITIONS = [
  {
    team: 'Communications',
    role: 'Head of PR, Europe',
    loc: 'London / Remote',
    body: 'Own how Chippi shows up across European media and build our presence with brokerages and the press from the ground up.',
  },
  {
    team: 'Marketing',
    role: 'Head of Growth Marketing',
    loc: 'Remote',
    body: 'Build the growth engine: paid, lifecycle, and partnerships that put Chippi in front of every agent who needs it.',
  },
  {
    team: 'Marketing',
    role: 'Brand and Content Lead',
    loc: 'Remote',
    body: 'Shape how Chippi sounds and looks everywhere, from the site to the product to the campaigns that carry it.',
  },
  {
    team: 'Go-to-market',
    role: 'Partnerships Manager, Brokerages',
    loc: 'Remote / US',
    body: 'Bring brokerages onto Chippi, run the relationships, and turn happy floors into our best channel.',
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
                We are a small team building the operating system real estate has been missing. The
                surface is huge, the bar is high, and the work goes straight to people who feel it the
                same day.
              </p>
            </BlurRise>
            <BlurRise trigger="load" delay={0.24}>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <PillPrimary href="#open-positions" withArrow>
                  See open roles
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

        {/* Open positions */}
        <Band id="open-positions" className="scroll-mt-24 py-24 sm:py-28">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">Open positions</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              Roles we are hiring for now.
            </Serif>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
              Email{' '}
              <a href="mailto:careers@usechippi.com" className="text-[#ff9a6e] underline-offset-4 hover:underline">
                careers@usechippi.com
              </a>{' '}
              for more information on any role.
            </p>
          </BlurRise>
          <div className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-2">
            {OPEN_POSITIONS.map((p, i) => (
              <BlurRise key={p.role} delay={i * 0.06}>
                <div className="flex h-full flex-col rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8">
                  <div className="flex items-center justify-between gap-3">
                    <p
                      style={{ fontFamily: 'var(--font-mono-display)' }}
                      className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#ff9a6e]"
                    >
                      {p.team}
                    </p>
                    <p className="text-[11px] text-white/40">{p.loc}</p>
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-sans)' }} className="mt-3 text-[17px] font-semibold text-white">
                    {p.role}
                  </h3>
                  <p className="mt-3 flex-1 text-[14px] leading-relaxed text-white/55">{p.body}</p>
                  <a
                    href={`mailto:careers@usechippi.com?subject=${encodeURIComponent('Application: ' + p.role)}`}
                    className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-white transition-colors hover:text-[#ff9a6e]"
                  >
                    Apply via email
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </BlurRise>
            ))}
          </div>
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
