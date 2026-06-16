'use client';

/**
 * Complexity, the "built to handle complexity" closer (reference-matched).
 *
 * A mono + dot eyebrow (colored dot) and a huge two-line thin serif heading on
 * the LEFT, with three feature columns on the RIGHT (icon + title + muted
 * desc). Thin hairline framing, generous air. Copy is Chippi/real-estate: the
 * agentic capabilities a real-estate floor actually needs.
 */

import { ShieldCheck, GitBranch, BarChart3 } from 'lucide-react';
import { BlurRise, Eyebrow, PillGhost, Serif, Band } from './primitives';

const COLUMNS = [
  {
    icon: GitBranch,
    title: 'Routing that thinks',
    desc: 'Leads land with the right agent by territory and load, or hand-pick and write the brief. Every assignment is logged with the reason.',
  },
  {
    icon: BarChart3,
    title: 'The whole floor, live',
    desc: 'Deals active, drafts pending, follow-ups due, per agent, read live from the work itself, not a Monday status meeting.',
  },
  {
    icon: ShieldCheck,
    title: 'Approval-first by design',
    desc: 'Chippi drafts and proposes; every send goes through a human. An audit log keeps the whole floor honest and reviewable.',
  },
];

export function Complexity() {
  return (
    <Band className="py-24 sm:py-32">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        {/* Left: eyebrow + heading */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <BlurRise>
            <Eyebrow>Built for complexity</Eyebrow>
            <Serif className="mt-5 text-[clamp(2.25rem,4vw,3.75rem)] leading-[1.04] text-white">
              Built to handle the
              <br className="hidden sm:block" /> complexity of a brokerage.
            </Serif>
          </BlurRise>
          <BlurRise delay={0.08}>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">
              One agent for the whole floor, leads routed, performance visible,
              bottlenecks surfaced, every action reviewable. Scales from a solo
              desk to hundreds of agents without an enterprise maze.
            </p>
            <div className="mt-8">
              <PillGhost href="/brokerages" withArrow>
                See the brokerage story
              </PillGhost>
            </div>
          </BlurRise>
        </div>

        {/* Right: three feature columns */}
        <BlurRise delay={0.12}>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-1">
            {COLUMNS.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="flex items-start gap-5 bg-[#0a0a0a] p-7 sm:p-8">
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#ff9a6e]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-[17px] font-medium text-white">{c.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">{c.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </BlurRise>
      </div>
    </Band>
  );
}
