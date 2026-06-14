/**
 * Founders, two white soft-shadow cards on the bold-canvas system. Each
 * founder gets a square headshot slot (an owner image slot, same vocabulary
 * as the home bento, swap real media in), a name, a role, and a short bio.
 * No fabricated photo files.
 */

import { ImagePlus } from 'lucide-react';
import { Reveal } from '@/components/marketing/site/reveal';

const FOUNDERS = [
  {
    name: 'Orlando',
    role: 'Co-founder',
    bio: 'Spent a decade in the short-term rental space, running into the same wall: real-estate software and the workflows around it were built for a pre-AI world. The productivity that’s possible now isn’t the productivity agents actually get.',
  },
  {
    name: 'Preston',
    role: 'Co-founder',
    bio: 'A decade building in e-commerce, software, and technology. Recently built groundbreaking AI agent-orchestration frameworks alongside several products of his own, the machinery that lets an agent do real work, not just answer questions.',
  },
];

export function Founders() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
      {FOUNDERS.map((f, i) => (
        <Reveal key={f.name} delay={i * 0.06}>
          <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
            <div
              data-slot={`founder-${f.name.toLowerCase()}`}
              className="flex aspect-square items-center justify-center rounded-2xl bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5"
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <ImagePlus className="h-5 w-5 text-neutral-300" />
                <p className="text-xs text-neutral-400">
                  Image placeholder, {' '}
                  <span className="font-medium text-neutral-500">{f.name} · headshot</span>
                </p>
              </div>
            </div>
            <h3 className="mt-6 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
              {f.name}
            </h3>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
              {f.role}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600">{f.bio}</p>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
