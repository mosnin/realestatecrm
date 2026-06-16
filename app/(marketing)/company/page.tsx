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
    'Real estate deserves to work the way the rest of the world already does. We built Chippi to close the gap between what is now possible and what agents actually get.',
};

/* The founders, real bios (no fabricated photos). */
const FOUNDERS = [
  {
    name: 'Orlando',
    role: 'Co-founder',
    bio: 'Spent a decade in the short-term rental space, running into the same wall: real-estate software and the workflows around it were built for a pre-AI world. The productivity that is possible now is not the productivity agents actually get.',
  },
  {
    name: 'Preston',
    role: 'Co-founder',
    bio: 'A decade building in e-commerce, software, and technology. Recently built groundbreaking AI agent-orchestration frameworks alongside several products of his own, the machinery that lets an agent do real work, not just answer questions.',
  },
];

/* Beliefs, the things we will not move on. */
const BELIEFS = [
  {
    title: 'Configuration is failure to decide.',
    body: 'Settings, toggles, customization layers, they are admissions the team could not pick. Picking is the work. We will not make your day harder so our spec was easier.',
  },
  {
    title: 'Nothing leaves without your name on it.',
    body: 'Chippi drafts, books, and updates, but by default every move is yours to approve. You can grant per-task autonomy when you trust it. The default is you in the loop, and that is where the trust lives.',
  },
  {
    title: 'Chippi has one voice.',
    body: 'Wherever Chippi shows up, a draft card, a toast, an activity row, the same signature carries through. Nothing else does. It is how you learn to trust the agent across every surface.',
  },
  {
    title: 'No numbers we cannot defend.',
    body: 'No 10x headline. No minutes-saved-per-day claim. The day we can prove a number against your own data, we will quote it, and footnote it. Until then, the agent does the talking.',
  },
];

export default function CompanyPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[80%]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/company-hero.jpg"
              alt=""
              className="h-full w-full object-cover opacity-20"
              style={{ filter: 'saturate(0.8) brightness(0.7)' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-[#0a0a0a]" />
          </div>
          <Band className="pt-40 pb-24 text-center sm:pt-48 sm:pb-28">
            <BlurRise trigger="load">
              <EyebrowPill>Our story</EyebrowPill>
            </BlurRise>
            <BlurRise trigger="load" delay={0.08}>
              <Serif as="h1" className="mx-auto mt-7 max-w-4xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
                Real estate deserves to work the way the world already does.
              </Serif>
            </BlurRise>
            <BlurRise trigger="load" delay={0.16}>
              <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
                We built Chippi because the tools agents and brokerages live in were drawn for a slower
                era. The work should not be the chrome. The work should be the deals.
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
                The work moved on.
                <br className="hidden sm:block" /> The software did not.
              </Serif>
            </BlurRise>
            <BlurRise delay={0.1}>
              <div className="space-y-6 text-[15px] leading-relaxed text-white/60 lg:pt-2">
                <p>
                  An agent&apos;s day is mostly attention management: email, calendar, replies,
                  follow-ups, pipeline updates. The actual selling, the listening and judging and
                  knowing, happens in maybe ten percent of it.
                </p>
                <p>
                  Everywhere else, that other ninety percent has started to run itself. In real estate
                  it still does not. The tools are stuck a generation behind what is now possible. That
                  distance, between what could happen and what actually does, is the whole reason Chippi
                  exists.
                </p>
              </div>
            </BlurRise>
          </div>
        </Band>

        {/* Founders */}
        <Band className="py-24 sm:py-28">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">The founders</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              Built by people who know the work.
            </Serif>
            <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-white/55">
              Orlando and Preston teamed up to solve the problem from both ends: the agent&apos;s day
              and the brokerage&apos;s floor.
            </p>
          </BlurRise>
          <div className="mx-auto mt-14 grid max-w-4xl gap-5 sm:grid-cols-2">
            {FOUNDERS.map((f, i) => (
              <BlurRise key={f.name} delay={i * 0.08}>
                <div className="h-full rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[17px] font-semibold text-black">
                    {f.name[0]}
                  </span>
                  <h3 style={{ fontFamily: 'var(--font-sans)' }} className="mt-6 text-[18px] font-semibold text-white">
                    {f.name}
                  </h3>
                  <p
                    style={{ fontFamily: 'var(--font-mono-display)' }}
                    className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#ff9a6e]"
                  >
                    {f.role}
                  </p>
                  <p className="mt-4 text-[14px] leading-relaxed text-white/55">{f.bio}</p>
                </div>
              </BlurRise>
            ))}
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
