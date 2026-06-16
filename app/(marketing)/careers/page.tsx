/**
 * `/careers`, the join-us page (the Careers target in the Company nav menu).
 * Server component (exports metadata). Same cinematic layout as the rest of the
 * redesign: a sub-hero, then how-we-work and where-we-are-looking sections, and
 * a get-in-touch close, all in a forced-dark wrapper.
 *
 * Honest framing: we are a small team and do not list fabricated openings. We
 * describe how we work and the areas we are always looking in, and invite
 * people to reach out.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';
import { ArrowRight } from 'lucide-react';
import { Band, BlurRise, Eyebrow, Serif } from '@/components/marketing/giga/primitives';

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

/* Where we are looking, areas not fabricated openings. */
const AREAS = [
  {
    tag: 'Engineering',
    title: 'Full-stack & AI engineers',
    body: 'You like owning a surface end to end, from the data model to the pixels, and you are at home wiring up agentic systems that do real work.',
  },
  {
    tag: 'Design',
    title: 'Product designers',
    body: 'You have strong taste, a bias for motion and craft, and you can take a fuzzy problem all the way to a shipped, considered interface.',
  },
  {
    tag: 'Go-to-market',
    title: 'Founding GTM',
    body: 'You can sit across from a realtor, earn their trust, and bring what you learn back into the product. You sell by showing, not telling.',
  },
];

export default function CareersPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <SubHero
          label="Careers"
          labelIcon="Users"
          headline={
            <>
              Help build the future
              <br className="hidden sm:block" /> of real estate.
            </>
          }
          description="We are a small team building the operating system real estate has been missing. The surface is huge, the bar is high, and the work goes straight to people who feel it the same day."
          features={[
            { icon: 'Workflow', title: 'Small team, big surface', desc: 'Own whole areas, not tickets, from day one.' },
            { icon: 'ShieldCheck', title: 'Ship with taste', desc: 'Craft and trust are the product, not a polish pass.' },
            { icon: 'TrendingUp', title: 'Own real outcomes', desc: 'Your work reaches agents the week you ship it.' },
          ]}
          workflow="New buyer lead"
        />

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

        {/* Where we're looking */}
        <Band className="py-24 sm:py-28">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">Where we are looking</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              The people we are always glad to meet.
            </Serif>
          </BlurRise>
          <div className="mx-auto mt-14 grid max-w-5xl gap-5 lg:grid-cols-3">
            {AREAS.map((a, i) => (
              <BlurRise key={a.tag} delay={i * 0.08}>
                <div className="flex h-full flex-col rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8">
                  <p
                    style={{ fontFamily: 'var(--font-mono-display)' }}
                    className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#ff9a6e]"
                  >
                    {a.tag}
                  </p>
                  <h3 style={{ fontFamily: 'var(--font-sans)' }} className="mt-3 text-[17px] font-semibold text-white">
                    {a.title}
                  </h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-white/55">{a.body}</p>
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
