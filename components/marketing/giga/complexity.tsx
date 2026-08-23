'use client';

/**
 * Complexity, the brokerage-floor closer. Shares the showcases' frosted, premium
 * aesthetic (rounded cards, gradient-stroked icons) but a distinct layout: a
 * centered header over a three-up grid of frosted cards (no animated mockup).
 */

import { ShieldCheck, GitBranch, BarChart3 } from 'lucide-react';
import { BlurRise, Eyebrow, PillGhost, Serif, Band } from './primitives';

const COLUMNS = [
  {
    icon: GitBranch,
    title: 'Route every lead clearly',
    desc: 'Leads land with the right agent by territory and load, or hand-pick and write the brief. Every assignment is logged with the reason.',
  },
  {
    icon: BarChart3,
    title: 'The whole floor, live',
    desc: 'Deals active, drafts pending, follow-ups due, per agent, read live from the work itself, not a Monday status meeting.',
  },
  {
    icon: ShieldCheck,
    title: 'Every move has a receipt',
    desc: 'Every action Chippi takes is logged with the reason behind it, so the whole floor stays honest and reviewable.',
  },
];

export function Complexity() {
  return (
    <Band className="py-24 sm:py-32">
      <BlurRise>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Built for brokerages</Eyebrow>
          <Serif className="mt-5 text-[clamp(2.25rem,4vw,3.75rem)] leading-[1.04] text-white">
            Convert more leads
            <br className="hidden sm:block" /> without losing control.
          </Serif>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/60">
            Route the inquiry. See the next move. Review every send. Chippi gives each agent help
            while leaders keep a clear view of the floor.
          </p>
          <div className="mt-8 flex justify-center">
            <PillGhost href="/brokerages">See the brokerage story</PillGhost>
          </div>
        </div>
      </BlurRise>

      <BlurRise delay={0.1}>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {COLUMNS.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8 backdrop-blur-sm transition-colors hover:border-white/[0.14]"
              >
                <Icon className="h-7 w-7" stroke="url(#chippi-grad)" strokeWidth={1.6} />
                <h3
                  style={{ fontFamily: 'var(--font-sans)' }}
                  className="mt-6 text-[17px] font-medium text-white"
                >
                  {c.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-white/55">{c.desc}</p>
              </div>
            );
          })}
        </div>
      </BlurRise>
    </Band>
  );
}
