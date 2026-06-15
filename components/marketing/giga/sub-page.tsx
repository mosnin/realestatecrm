'use client';

/**
 * Sub-page scaffolding for the dark marketing redesign — a styled hero + a
 * three-up feature section, shared by the Agents and Brokerages pages so the
 * nav targets work and read as one voice. Full content comes later; these are
 * high-fidelity placeholders in the reference aesthetic.
 */

import { BlurRise, Eyebrow, PillPrimary, PillGhost, Serif, Band } from './primitives';

export interface SubFeature {
  icon: React.ElementType;
  title: string;
  desc: string;
}

export function SubPageHero({
  eyebrow,
  title,
  titleTail,
  sub,
  image,
}: {
  eyebrow: string;
  title: string;
  /** Optional dimmed second clause of the headline. */
  titleTail?: string;
  sub: string;
  /** Full-bleed background photo (placeholder). */
  image: string;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-black">
      <div aria-hidden className="absolute inset-0 -z-10">
        {/* TODO: replace placeholder image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/55 to-[#0a0a0a]" />
      </div>

      <div className="mx-auto max-w-4xl px-5 pb-24 pt-40 text-center sm:px-8 sm:pb-28 sm:pt-48">
        <BlurRise trigger="load" delay={0.05}>
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 backdrop-blur-md">
            <Eyebrow>{eyebrow}</Eyebrow>
          </span>
        </BlurRise>
        <BlurRise trigger="load" delay={0.15}>
          <Serif
            as="h1"
            className="mt-7 text-balance text-[2.4rem] leading-[1.05] text-white sm:text-6xl"
          >
            {title}
            {titleTail ? <span className="block text-white/55">{titleTail}</span> : null}
          </Serif>
        </BlurRise>
        <BlurRise trigger="load" delay={0.28}>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-white/65 sm:text-lg">
            {sub}
          </p>
        </BlurRise>
        <BlurRise trigger="load" delay={0.4}>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <PillPrimary href="/demo" withArrow>
              See a demo
            </PillPrimary>
            <PillGhost href="/pricing">View pricing</PillGhost>
          </div>
        </BlurRise>
      </div>
    </section>
  );
}

export function SubPageFeatures({
  eyebrow,
  title,
  features,
}: {
  eyebrow: string;
  title: React.ReactNode;
  features: SubFeature[];
}) {
  return (
    <Band className="py-24 sm:py-32">
      <BlurRise>
        <div className="max-w-2xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Serif className="mt-5 text-[2rem] leading-[1.06] text-white sm:text-[2.75rem]">
            {title}
          </Serif>
        </div>
      </BlurRise>

      <BlurRise delay={0.1}>
        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-[#0a0a0a] p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#ff9a6e]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-6 text-[17px] font-medium text-white">{f.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-white/55">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </BlurRise>
    </Band>
  );
}
