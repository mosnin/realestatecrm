'use client';

/**
 * Complexity — the "built to handle complexity" section (reference-matched).
 *
 * Eyebrow (mono + dot) → serif heading → three feature columns (icon + title +
 * desc). Thin hairline framing, generous air. Copy is Chippi/real-estate:
 * the agentic capabilities a real-estate floor actually needs.
 */

import { ShieldCheck, GitBranch, BarChart3 } from 'lucide-react';
import { BlurRise, Eyebrow, PillGhost, Serif, Band } from './primitives';

const COLUMNS = [
  {
    icon: GitBranch,
    title: 'Routing that thinks',
    desc: 'Leads land with the right agent by territory and load — or hand-pick and write the brief. Every assignment is logged with the reason.',
  },
  {
    icon: BarChart3,
    title: 'The whole floor, live',
    desc: 'Deals active, drafts pending, follow-ups due — per agent, read live from the work itself, not a Monday status meeting.',
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
      <div className="grid items-end gap-10 lg:grid-cols-2">
        <BlurRise>
          <Eyebrow>Custom agents</Eyebrow>
          <Serif className="mt-5 text-[2rem] leading-[1.06] text-white sm:text-[2.75rem]">
            Built to handle the
            <br className="hidden sm:block" /> complexity of a brokerage.
          </Serif>
        </BlurRise>
        <BlurRise delay={0.08}>
          <p className="max-w-md text-base leading-relaxed text-white/60 lg:ml-auto">
            One agent for the whole floor — leads routed, performance visible,
            bottlenecks surfaced, and every action reviewable. Scales from a solo
            desk to hundreds of agents without an enterprise maze.
          </p>
        </BlurRise>
      </div>

      <BlurRise delay={0.12}>
        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
          {COLUMNS.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="bg-[#0a0a0a] p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#ff9a6e]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-6 text-[17px] font-medium text-white">{c.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-white/55">{c.desc}</p>
              </div>
            );
          })}
        </div>
      </BlurRise>

      <BlurRise delay={0.16}>
        <div className="mt-12 flex justify-center">
          <PillGhost href="/brokerages" withArrow>
            See the brokerage story
          </PillGhost>
        </div>
      </BlurRise>
    </Band>
  );
}
